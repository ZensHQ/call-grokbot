import { BrowserAuth } from '../src/auth.js';
import { Backend, type Entry, type Frame } from '../src/backend.js';
import { readConfig } from '../src/config.js';
import { Conversations } from '../src/conversation.js';
import { Redactor, sleep } from '../src/errors.js';
import { Contacts } from '../src/state.js';

export class FakeBackend extends Backend {
  sends: string[] = [];
  interrupts = 0;
  botCalls = 0;
  busy = false;
  settlement = 'before-turn';
  entries: Entry[] = [];
  failSend = false;
  neverFinish = false;
  replyOnly = false;
  failTurn = false;
  foreignFrames = false;
  missingState = false;
  noSettlement = false;
  delay = 20;
  private listeners = new Set<(frame: Frame) => void>();
  override async bots() {
    this.botCalls++;
    return { agents: [{ name: 'free', agentId: 'fixture-bot' }] };
  }
  override async sessions() {
    return { sessions: [] };
  }
  override async history() {
    return { generation: 0, entries: this.entries.slice(-1) };
  }
  private emit(frame: Frame) {
    for (const fn of this.listeners) fn(frame);
  }
  private live() {
    return {
      agentId: 'fixture-bot',
      sessionId: '',
      isRunning: this.busy,
      isComposingMessage: false,
      isRetrying: false,
      hasRunningSubagents: false,
      lastTurnSettlement: { turnId: this.settlement, outcome: 'success' },
    };
  }
  override async *watch(
    contact: { cursor: string },
    _id: unknown,
    signal: AbortSignal,
  ): AsyncGenerator<Frame> {
    const queue: Frame[] = [];
    const listener = (frame: Frame) => queue.push(frame);
    this.listeners.add(listener);
    try {
      yield {
        rows: {
          agentId: 'fixture-bot',
          sessionId: '',
          generation: 0,
          entries: this.entries.filter(
            (e) => BigInt(e.updatedSeq ?? e.seq) > BigInt(contact.cursor),
          ),
        },
      };
      yield {
        agentState: {
          snapshot: true,
          live: this.missingState ? [] : [this.live()],
        },
      };
      while (!signal.aborted) {
        const frame = queue.shift();
        if (frame) yield frame;
        else await sleep(2, signal);
      }
    } finally {
      this.listeners.delete(listener);
    }
  }
  override async send(_agent: string, _session: string, id: string) {
    this.sends.push(id);
    if (this.failSend) throw new Error('network interrupted after dispatch');
    this.busy = true;
    this.emit({ agentState: { live: [this.live()] } });
    if (!this.neverFinish)
      setTimeout(() => {
        const n = String(this.entries.length + 1);
        const entry = {
          seq: n,
          updatedSeq: n,
          entryKind: 'send-message',
          body: Buffer.from(JSON.stringify({ text: 'fixture-reply' })).toString(
            'base64',
          ),
        };
        this.entries.push(entry);
        if (this.foreignFrames)
          this.emit({
            rows: {
              agentId: 'foreign-bot',
              sessionId: '',
              generation: 0,
              entries: [
                {
                  ...entry,
                  body: Buffer.from('must not leak').toString('base64'),
                },
              ],
            },
          });
        this.emit({
          rows: {
            agentId: 'fixture-bot',
            sessionId: '',
            generation: 0,
            entries: [entry],
          },
        });
        if (this.failTurn)
          this.emit({
            turnFailed: {
              agentId: 'fixture-bot',
              sessionId: '',
              code: 'FIXTURE_FAILURE',
            },
          });
        if (!this.replyOnly) {
          this.busy = false;
          if (!this.noSettlement) this.settlement = id;
          this.emit({ agentState: { live: [this.live()] } });
        }
      }, this.delay);
    return {
      delivery: 'GROK_BOT_USER_MESSAGE_DELIVERY_ACCEPTED_TEMPORAL',
      dispatched: true,
    };
  }
  override async sendStatus() {
    return { status: 'GROK_BOT_SEND_STATUS_ACCEPTED' };
  }
  override async interrupt() {
    this.interrupts++;
    const active = this.busy;
    this.busy = false;
    this.settlement = 'interrupted';
    this.emit({ agentState: { live: [this.live()] } });
    return { hadActiveRun: active };
  }
}
export function fixture(dir: string, extra: Record<string, string> = {}) {
  const config = readConfig({
    CALL_GROKBOT_STATE_DIR: dir,
    CALL_GROKBOT_AGENTS: 'free',
    CALL_GROKBOT_SETTLE_MS: '100',
    ...extra,
  });
  const redactor = new Redactor();
  let signedIn = true;
  const token = `eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({ sub: 'fixture-owner', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
  const auth = new BrowserAuth(redactor, async () => {
    if (!signedIn) throw new Error('signed out');
    return token;
  });
  const backend = new FakeBackend(config, auth, redactor);
  const contacts = new Contacts(dir);
  const conversations = new Conversations(config, backend, contacts);
  return {
    config,
    redactor,
    auth,
    backend,
    contacts,
    conversations,
    logout: () => {
      signedIn = false;
    },
  };
}
