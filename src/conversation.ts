import { randomUUID } from 'node:crypto';
import type { Identity } from './auth.js';
import { type Backend, type Entry, type Live, replyText } from './backend.js';
import { type Config, resolveName } from './config.js';
import { AppError, sleep } from './errors.js';
import { type Contact, type Contacts, fingerprint } from './state.js';

export interface CallContext {
  signal?: AbortSignal;
  progress?: () => Promise<void>;
}
export interface Result {
  agent: string;
  sessionId: string;
  status: 'running' | 'finished';
  reply?: string;
  earlierReplies?: string[];
  messageSent?: boolean;
  messageId?: string;
  note?: string;
}
class Monitor {
  ready = false;
  busy = false;
  sawBusy = false;
  settlement?: string;
  outcome?: string;
  error?: unknown;
  entries = new Map<string, Entry>();
  cursor = '0';
  lastActivity = Date.now();
  idleSince = Date.now();
  private readonly controller = new AbortController();
  private readonly task: Promise<void>;
  constructor(
    readonly contact: Contact,
    backend: Backend,
    id: Identity,
    signal?: AbortSignal,
  ) {
    this.cursor = contact.cursor;
    this.sawBusy = !!contact.sawBusy;
    const combined = AbortSignal.any([
      this.controller.signal,
      ...(signal ? [signal] : []),
    ]);
    this.task = (async () => {
      try {
        for await (const frame of backend.watch(contact, id, combined)) {
          if (frame.agentState) {
            const live = frame.agentState.live.find(
              (s) =>
                s.agentId === contact.agentId &&
                s.sessionId === contact.sessionId,
            );
            if (live) this.updateLive(live);
            if (frame.agentState.snapshot) {
              if (!live)
                throw new AppError(
                  'BOT_STATE_UNAVAILABLE',
                  'The service did not include this bot in its state snapshot. Nothing was sent.',
                );
              this.ready = true;
            }
          }
          for (const reset of [frame.cursorTooOld, frame.cleared]) {
            if (
              reset?.agentId === contact.agentId &&
              reset.sessionId === contact.sessionId
            )
              throw new AppError(
                'TRANSCRIPT_RESET',
                'The server reset this transcript cursor. Read the conversation in the app and reset this contact state before continuing.',
              );
          }
          if (
            frame.turnFailed?.agentId === contact.agentId &&
            frame.turnFailed.sessionId === contact.sessionId
          ) {
            throw new AppError(
              'BOT_TURN_FAILED',
              `The bot reported a turn failure (${frame.turnFailed.code ?? 'unknown'}). Read its conversation before sending more work.`,
            );
          }
          if (
            frame.rows?.agentId !== contact.agentId ||
            frame.rows.sessionId !== contact.sessionId
          )
            continue;
          if (frame.rows.generation !== contact.generation)
            throw new AppError(
              'TRANSCRIPT_RESET',
              'The transcript generation changed. The read position was preserved.',
            );
          for (const entry of frame.rows.entries) {
            const updated = entry.updatedSeq ?? entry.seq;
            if (BigInt(updated) <= BigInt(contact.cursor)) continue;
            // Validate reply bodies before advancing a cursor; a missing body is never silently consumed.
            replyText(entry);
            this.entries.set(entry.seq, entry);
            if (BigInt(updated) > BigInt(this.cursor)) this.cursor = updated;
            this.lastActivity = Date.now();
          }
        }
        if (!combined.aborted)
          this.error = new AppError(
            'STREAM_ENDED',
            'The transcript stream ended. Use check to resume.',
          );
      } catch (error) {
        if (!combined.aborted) this.error = error;
      }
    })();
  }
  private updateLive(live: Live) {
    const busy =
      live.isRunning ||
      live.isComposingMessage ||
      live.isRetrying ||
      live.hasRunningSubagents;
    if (this.busy && !busy) this.idleSince = Date.now();
    if (busy) {
      this.sawBusy = true;
      this.idleSince = Date.now();
    }
    this.busy = busy;
    this.settlement = live.lastTurnSettlement?.turnId;
    this.outcome = live.lastTurnSettlement?.outcome;
  }
  async initialized(signal?: AbortSignal) {
    const end = Date.now() + 10000;
    while (!this.ready) {
      if (this.error) throw this.error;
      if (Date.now() >= end)
        throw new AppError(
          'STREAM_NOT_READY',
          'The service did not confirm the bot state. Nothing was sent.',
        );
      await sleep(25, signal);
    }
  }
  replies() {
    return [...this.entries.values()]
      .sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1))
      .flatMap((e) => {
        const text = replyText(e);
        return text === undefined ? [] : [{ seq: e.seq, text }];
      });
  }
  finished(contact: Contact, settleMs: number) {
    const changedSettlement =
      !!this.settlement && this.settlement !== contact.baselineSettlement;
    const evidence =
      !contact.pending ||
      changedSettlement ||
      this.sawBusy ||
      this.replies().length > 0 ||
      contact.interrupted;
    if (!this.ready || this.busy || !evidence) return false;
    if (!contact.pending) return true;
    const quiet = Date.now() - Math.max(this.idleSince, this.lastActivity);
    // A reply can be an acknowledgement. Prefer the server's actual turn settlement.
    if (contact.pending && !changedSettlement && !contact.interrupted)
      return false;
    return quiet >= settleMs;
  }
  async close() {
    this.controller.abort();
    await this.task;
  }
}

export class Conversations {
  constructor(
    readonly config: Config,
    readonly backend: Backend,
    readonly contacts: Contacts,
  ) {}
  private account(id: Identity) {
    return fingerprint(`${this.config.baseUrl}\n${id.subject}`);
  }
  private async known(agent: string | undefined, id: Identity) {
    const name = resolveName(agent, this.config.agents);
    const contacts = await this.contacts.list(this.account(id));
    const exact = contacts.find((c) => c.name === name);
    const matches = contacts.filter(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (!exact && matches.length > 1)
      throw new AppError(
        'CONTACT_AMBIGUOUS',
        'Several contacted bots differ only by case. Supply the exact bot name.',
      );
    const contact = exact ?? matches[0];
    if (!contact)
      throw new AppError(
        'CONTACT_REQUIRED',
        'This machine has not asked that bot yet. Use ask first.',
      );
    return contact;
  }
  async list(ctx: CallContext = {}) {
    const id = await this.backend.auth.identity(false, ctx.signal);
    const { agents } = await this.backend.bots(id, ctx.signal);
    const allow = this.config.agents;
    const visible = agents.filter(
      (a) =>
        !allow ||
        allow.some((v) => v.name.toLowerCase() === a.name.toLowerCase()),
    );
    return {
      configured: allow || [],
      available: visible.map((a) => ({ name: a.name, agentId: a.agentId })),
      contacted: (await this.contacts.list(this.account(id)))
        .filter(
          (c) =>
            !allow ||
            allow.some((a) => a.name.toLowerCase() === c.name.toLowerCase()),
        )
        .map((c) => ({
          name: c.name,
          sessionId: c.sessionId,
          firstContactAt: c.firstContactAt,
          lastContactAt: c.lastContactAt,
        })),
    };
  }
  async ask(
    input: { agent?: string; message: string; wait_seconds: number },
    ctx: CallContext = {},
  ): Promise<Result> {
    const name = resolveName(input.agent, this.config.agents);
    if (!input.message.trim())
      throw new AppError('INVALID_INPUT', 'The message must contain text.');
    const id = await this.backend.auth.identity(false, ctx.signal);
    const account = this.account(id);
    const agents = (await this.backend.bots(id, ctx.signal)).agents.filter(
      (a) => a.name === name,
    );
    if (agents.length !== 1)
      throw new AppError(
        'BOT_NOT_UNIQUE',
        'No unique existing bot has this exact name. Use list and copy its name. No bot was created and no message was sent.',
      );
    const bot = agents[0];
    if (!bot) throw new AppError('BOT_NOT_UNIQUE', 'Bot not found.');
    return this.contacts.locked(
      account,
      bot.agentId,
      async () => {
        const sessions = (
          await this.backend.sessions(bot.agentId, id, ctx.signal)
        ).sessions;
        const main = sessions.filter(
          (s) => s.kind === 1 || s.kind === 'GROK_BOT_AGENT_SESSION_KIND_MAIN',
        );
        if (sessions.length && main.length !== 1)
          throw new AppError(
            'SESSION_AMBIGUOUS',
            'The bot has sessions but no unique MAIN session. Nothing was sent.',
          );
        const sessionId = main[0]?.sessionId ?? '';
        let contact = (await this.contacts.list(account)).find(
          (c) => c.agentId === bot.agentId && c.sessionId === sessionId,
        );
        if (contact?.pending)
          throw new AppError(
            'BOT_PENDING',
            'A prior message is still pending or unconfirmed. Use check; no new message was sent.',
          );
        const tail = await this.backend.history(
          bot.agentId,
          sessionId,
          id,
          ctx.signal,
        );
        const tailCursor = tail.entries.reduce(
          (a, e) =>
            BigInt(e.updatedSeq ?? e.seq) > BigInt(a)
              ? (e.updatedSeq ?? e.seq)
              : a,
          '0',
        );
        const boundary = tail.entries.reduce(
          (a, e) => (BigInt(e.seq) > BigInt(a) ? e.seq : a),
          '0',
        );
        const now = new Date().toISOString();
        contact ??= {
          name: bot.name,
          agentId: bot.agentId,
          sessionId,
          cursor: tailCursor,
          generation: tail.generation,
          pending: false,
          firstContactAt: now,
          lastContactAt: now,
        };
        const monitor = new Monitor(contact, this.backend, id, ctx.signal);
        try {
          await monitor.initialized(ctx.signal);
          if (monitor.busy)
            throw new AppError(
              'BOT_BUSY',
              'The bot is working on another task. Nothing was sent. Wait in the app or use check for a previously contacted bot.',
            );
          const messageId = randomUUID();
          const pending: Contact = {
            ...contact,
            pending: true,
            messageId,
            baselineSettlement: monitor.settlement,
            sawBusy: false,
            interrupted: false,
            uncertain: true,
            lastContactAt: now,
          };
          // Persist the message id BEFORE send, so cancellation or an ambiguous response remains recoverable.
          await this.contacts.save(account, pending);
          let sent: Awaited<ReturnType<Backend['send']>>;
          try {
            sent = await this.backend.send(
              bot.agentId,
              sessionId,
              messageId,
              input.message,
              id,
              ctx.signal,
            );
          } catch (error) {
            if (
              error instanceof AppError &&
              error.status &&
              error.status < 500 &&
              error.status !== 429
            ) {
              await this.contacts.save(account, {
                ...pending,
                pending: false,
                uncertain: false,
              });
            }
            throw error;
          }
          if (
            sent.refusal ||
            ![
              1,
              2,
              3,
              'GROK_BOT_USER_MESSAGE_DELIVERY_ACCEPTED_BOX',
              'GROK_BOT_USER_MESSAGE_DELIVERY_ACCEPTED_TEMPORAL',
              'GROK_BOT_USER_MESSAGE_DELIVERY_DUPLICATE',
            ].includes(sent.delivery)
          ) {
            await this.contacts.save(account, {
              ...pending,
              pending: false,
              uncertain: false,
            });
            throw new AppError(
              'SEND_REFUSED',
              'The bot did not accept this message. No automatic retry was attempted.',
            );
          }
          pending.uncertain = false;
          // Keep the original cursor until results can actually be returned to the caller.
          await this.contacts.save(account, pending);
          return await this.collect(
            monitor,
            pending,
            id,
            input.wait_seconds,
            ctx,
            boundary,
          );
        } finally {
          await monitor.close();
        }
      },
      ctx.signal,
    );
  }
  async check(
    input: { agent?: string; wait_seconds: number },
    ctx: CallContext = {},
  ): Promise<Result> {
    const id = await this.backend.auth.identity(false, ctx.signal);
    const account = this.account(id);
    const known = await this.known(input.agent, id);
    return this.contacts.locked(
      account,
      known.agentId,
      async () => {
        const contact =
          (await this.contacts.list(account)).find(
            (c) =>
              c.agentId === known.agentId && c.sessionId === known.sessionId,
          ) ?? known;
        if (contact.uncertain && contact.messageId) {
          const delivery = await this.backend.sendStatus(
            contact.agentId,
            contact.sessionId,
            contact.messageId,
            id,
            ctx.signal,
          );
          if (![2, 'GROK_BOT_SEND_STATUS_ACCEPTED'].includes(delivery.status)) {
            // NOT_FOUND is not proof that a delayed write can never arrive. Keep the pending guard.
            throw new AppError(
              'SEND_UNCONFIRMED',
              'The server cannot confirm the prior send. No message was resent. Verify the conversation in the app before resolving this pending contact.',
            );
          }
          contact.uncertain = false;
        }
        const monitor = new Monitor(contact, this.backend, id, ctx.signal);
        try {
          await monitor.initialized(ctx.signal);
          return await this.collect(
            monitor,
            contact,
            id,
            input.wait_seconds,
            ctx,
          );
        } finally {
          await monitor.close();
        }
      },
      ctx.signal,
    );
  }
  private async collect(
    monitor: Monitor,
    contact: Contact,
    id: Identity,
    seconds: number,
    ctx: CallContext,
    boundary?: string,
  ): Promise<Result> {
    const end = Date.now() + seconds * 1000;
    let progressAt = Date.now();
    let finished = false;
    while (true) {
      ctx.signal?.throwIfAborted();
      if (monitor.error) throw monitor.error;
      if (monitor.finished(contact, this.config.settleMs)) {
        finished = true;
        break;
      }
      if (Date.now() >= end) break;
      if (Date.now() - progressAt >= 10000) {
        await ctx.progress?.();
        progressAt = Date.now();
      }
      await sleep(Math.min(100, Math.max(1, end - Date.now())), ctx.signal);
    }
    const current = await this.backend.auth.identity(false, ctx.signal);
    if (current.subject !== id.subject)
      throw new AppError(
        'ACCOUNT_CHANGED',
        'The signed-in account changed. Results and read positions were preserved.',
      );
    ctx.signal?.throwIfAborted();
    const replies = monitor.replies();
    const earlier =
      boundary === undefined
        ? []
        : replies
            .filter((r) => BigInt(r.seq) <= BigInt(boundary))
            .map((r) => r.text);
    const latest = replies
      .filter((r) => boundary === undefined || BigInt(r.seq) > BigInt(boundary))
      .map((r) => r.text);
    await this.contacts.save(this.account(id), {
      ...contact,
      cursor: monitor.cursor,
      sawBusy: monitor.sawBusy,
      pending: finished ? false : contact.pending,
    });
    if (ctx.signal?.aborted) {
      // Cancellation can arrive while the atomic state write is in progress.
      // Restore unread positions before releasing the per-agent lock.
      await this.contacts.save(this.account(id), contact);
      ctx.signal.throwIfAborted();
    }
    const notes = [
      ...(!finished
        ? [
            'The turn is not confirmed finished. Use check with the same bot; do not resend the task.',
          ]
        : []),
      ...(this.config.authMode === 'browser' &&
      current.expiresAt - Date.now() < 300000
        ? [
            'The official browser login expires within five minutes. Run `call-grokbot auth refresh` in a terminal.',
          ]
        : []),
    ];
    return {
      agent: contact.name,
      sessionId: contact.sessionId,
      status: finished ? 'finished' : 'running',
      ...(latest.length ? { reply: latest.join('\n\n') } : {}),
      ...(earlier.length ? { earlierReplies: earlier } : {}),
      ...(boundary !== undefined
        ? { messageSent: true, messageId: contact.messageId }
        : {}),
      ...(notes.length ? { note: notes.join(' ') } : {}),
    };
  }
  async interrupt(agent: string | undefined, ctx: CallContext = {}) {
    const id = await this.backend.auth.identity(false, ctx.signal);
    const contact = await this.known(agent, id);
    const result = await this.backend.interrupt(
      contact.agentId,
      contact.sessionId,
      id,
      ctx.signal,
    );
    // Do not take the agent lock: this must be able to interrupt an ask currently waiting.
    // The cursor stays unchanged. The running collector observes the actual stream state.
    return {
      agent: contact.name,
      sessionId: contact.sessionId,
      interrupted: result.hadActiveRun,
    };
  }
}
