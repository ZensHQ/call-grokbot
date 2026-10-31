import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AuthProvider, Identity } from './auth.js';
import { RELOGIN } from './auth.js';
import type { Config } from './config.js';
import { AppError, type Redactor, sleep } from './errors.js';

const uint = z
  .union([z.string().regex(/^\d+$/), z.number().int().nonnegative().safe()])
  .transform(String);
export const entrySchema = z.object({
  seq: uint,
  updatedSeq: uint.optional(),
  entryKind: z.string(),
  body: z.string().optional(),
  bodyOmitted: z.boolean().optional(),
});
export type Entry = z.infer<typeof entrySchema>;
export const agentSchema = z.object({
  name: z.string(),
  agentId: z.string().min(1),
  viewerIsOwner: z.boolean().optional(),
  harness: z.union([z.string(), z.number()]).optional(),
});
export type Bot = z.infer<typeof agentSchema>;
const liveSchema = z.object({
  agentId: z.string(),
  sessionId: z.string().default(''),
  isRunning: z.boolean().default(false),
  isComposingMessage: z.boolean().default(false),
  isRetrying: z.boolean().default(false),
  hasRunningSubagents: z.boolean().default(false),
  lastTurnSettlement: z
    .object({ turnId: z.string().optional(), outcome: z.string().optional() })
    .optional(),
});
export type Live = z.infer<typeof liveSchema>;
const frameSchema = z.object({
  connected: z.object({}).optional(),
  agentState: z
    .object({
      snapshot: z.boolean().optional(),
      live: z.array(liveSchema).default([]),
    })
    .optional(),
  rows: z
    .object({
      agentId: z.string(),
      sessionId: z.string().default(''),
      generation: z.number().int().nonnegative().default(0),
      entries: z.array(entrySchema).default([]),
    })
    .optional(),
  cursorTooOld: z
    .object({ agentId: z.string(), sessionId: z.string().default('') })
    .optional(),
  cleared: z
    .object({ agentId: z.string(), sessionId: z.string().default('') })
    .optional(),
  turnFailed: z
    .object({
      agentId: z.string(),
      sessionId: z.string().default(''),
      code: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
});
export type Frame = z.infer<typeof frameSchema>;
export const SERVICE = '/aiserver.v1.GrokBotService/';

export class Backend {
  constructor(
    readonly config: Config,
    readonly auth: AuthProvider,
    readonly redactor: Redactor,
    readonly fetcher: typeof fetch = fetch,
  ) {}
  private async response(
    method: string,
    payload: unknown,
    identity: Identity,
    signal?: AbortSignal,
    streaming = false,
  ): Promise<Response> {
    const readonly = [
      'ListGrokBotAgents',
      'ListGrokBotAgentSessions',
      'ListGrokBotTranscriptEntries',
      'GetGrokBotSendStatus',
      'WatchGrokBotTranscripts',
    ].includes(method);
    let current = identity;
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      // Observe logout, account switches and token rotation even in a long-running stdio process.
      current = await this.auth.identity(false, signal);
      if (current.subject !== identity.subject)
        throw new AppError(
          'ACCOUNT_CHANGED',
          'The signed-in account changed during this call. Start a new tool call.',
        );
      let body: string | Uint8Array = JSON.stringify(payload);
      if (streaming) {
        const bytes = Buffer.from(body);
        const frame = Buffer.alloc(5 + bytes.length);
        frame.writeUInt32BE(bytes.length, 1);
        bytes.copy(frame, 5);
        body = frame;
      }
      let response: Response;
      try {
        response = await this.fetcher(
          `${this.config.baseUrl}${SERVICE}${method}`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${current.token}`,
              'content-type': streaming
                ? 'application/connect+json'
                : 'application/json',
              'connect-protocol-version': '1',
              'x-request-id': randomUUID(),
            },
            body: body as BodyInit,
            redirect: 'error',
            signal: streaming
              ? signal
              : AbortSignal.any([
                  AbortSignal.timeout(this.config.requestTimeout),
                  ...(signal ? [signal] : []),
                ]),
          },
        );
      } catch {
        if (signal?.aborted) throw signal.reason;
        if (readonly && attempt < 2) {
          await sleep(500 * (attempt + 1), signal);
          continue;
        }
        throw new AppError(
          readonly ? 'NETWORK_ERROR' : 'SEND_UNCONFIRMED',
          readonly
            ? 'The Grok Bot service could not be reached.'
            : 'The request outcome is unconfirmed. Do not resend; use check to inspect the existing message.',
        );
      }
      if (response.ok) return response;
      const status = response.status;
      await response.body?.cancel();
      if (status === 401 && readonly && attempt === 0) {
        const refreshed = await this.auth.identity(true, signal);
        if (refreshed.subject !== identity.subject)
          throw new AppError(
            'ACCOUNT_CHANGED',
            'The account changed while renewing authentication.',
          );
        if (refreshed.token !== current.token) continue;
      }
      if ((status === 429 || status >= 500) && readonly && attempt < 2) {
        const retry = Number(response.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retry) && retry > 0
            ? Math.min(retry * 1000, 10000)
            : 500 * (attempt + 1),
          signal,
        );
        continue;
      }
      if (status === 401)
        throw new AppError(
          'AUTH_REJECTED',
          `The login was rejected. ${RELOGIN}`,
          status,
        );
      if (!readonly && (status >= 500 || status === 429))
        throw new AppError(
          'SEND_UNCONFIRMED',
          'The message outcome is unconfirmed. Use check; do not resend.',
          status,
        );
      throw new AppError(
        'API_ERROR',
        `${method} was refused (HTTP ${status}). ${status === 403 ? 'The account may lack access to this undocumented RPC.' : 'The service contract may have changed.'}`,
        status,
      );
    }
  }
  async rpc<T>(
    method: string,
    payload: unknown,
    schema: z.ZodType<T>,
    identity: Identity,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.response(method, payload, identity, signal);
    try {
      return schema.parse(await response.json());
    } catch {
      throw new AppError(
        'UNEXPECTED_RESPONSE',
        `${method} returned an unsupported response. Do not repeat a send automatically.`,
      );
    }
  }
  bots(id: Identity, signal?: AbortSignal) {
    return this.rpc(
      'ListGrokBotAgents',
      {},
      z.object({ agents: z.array(agentSchema).default([]) }),
      id,
      signal,
    );
  }
  sessions(agentId: string, id: Identity, signal?: AbortSignal) {
    return this.rpc(
      'ListGrokBotAgentSessions',
      { agentId },
      z.object({
        sessions: z
          .array(
            z.object({
              sessionId: z.string(),
              kind: z.union([z.string(), z.number()]).optional(),
            }),
          )
          .default([]),
      }),
      id,
      signal,
    );
  }
  history(
    agentId: string,
    sessionId: string,
    id: Identity,
    signal?: AbortSignal,
  ) {
    return this.rpc(
      'ListGrokBotTranscriptEntries',
      { agentId, sessionId, limit: 1 },
      z.object({
        generation: z.number().int().nonnegative().default(0),
        entries: z.array(entrySchema).default([]),
      }),
      id,
      signal,
    );
  }
  send(
    agentId: string,
    sessionId: string,
    messageId: string,
    text: string,
    id: Identity,
    signal?: AbortSignal,
  ) {
    return this.rpc(
      'SendGrokBotUserMessage',
      {
        agentId,
        sessionId,
        messageId,
        text,
        sentAtMs: String(Date.now()),
        source: 'GROK_BOT_CLIENT_SURFACE_DESKTOP',
      },
      z.object({
        delivery: z.union([z.string(), z.number()]),
        dispatched: z.boolean().optional(),
        refusal: z.object({ failureCode: z.string().optional() }).optional(),
      }),
      id,
      signal,
    );
  }
  sendStatus(
    agentId: string,
    sessionId: string,
    messageId: string,
    id: Identity,
    signal?: AbortSignal,
  ) {
    return this.rpc(
      'GetGrokBotSendStatus',
      { agentId, sessionId, messageId },
      z.object({ status: z.union([z.string(), z.number()]).default(0) }),
      id,
      signal,
    );
  }
  interrupt(
    agentId: string,
    sessionId: string,
    id: Identity,
    signal?: AbortSignal,
  ) {
    return this.rpc(
      'InterruptGrokBotAgentRun',
      { agentId, sessionId, reason: 'Stopped through call-grokbot.' },
      z.object({ hadActiveRun: z.boolean().default(false) }),
      id,
      signal,
    );
  }
  async *watch(
    cursor: {
      agentId: string;
      sessionId: string;
      cursor: string;
      generation: number;
    },
    id: Identity,
    signal: AbortSignal,
  ): AsyncGenerator<Frame> {
    const response = await this.response(
      'WatchGrokBotTranscripts',
      {
        cursors: [
          {
            agentId: cursor.agentId,
            sessionId: cursor.sessionId,
            generation: cursor.generation,
            afterUpdatedSeq: cursor.cursor,
          },
        ],
        inlineBodyMaxBytes: 262144,
      },
      id,
      signal,
      true,
    );
    if (!response.body)
      throw new AppError(
        'UNEXPECTED_RESPONSE',
        'The transcript stream has no body.',
      );
    const reader = response.body.getReader();
    let buffer: Buffer = Buffer.alloc(0);
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer = Buffer.concat([buffer, chunk.value]);
        while (buffer.length >= 5) {
          const flags = buffer[0];
          const size = buffer.readUInt32BE(1);
          if (size > 8 * 1024 * 1024)
            throw new AppError(
              'UNEXPECTED_RESPONSE',
              'Transcript frame exceeds the supported limit.',
            );
          if (buffer.length < size + 5) break;
          const data: unknown = JSON.parse(
            buffer.subarray(5, size + 5).toString('utf8'),
          );
          buffer = buffer.subarray(size + 5);
          if (flags === 2) {
            if (z.object({ error: z.unknown().optional() }).parse(data).error)
              throw new AppError(
                'STREAM_ERROR',
                'The transcript stream ended with an error. Use check to resume.',
              );
            return;
          }
          if (flags !== 0)
            throw new AppError(
              'UNEXPECTED_RESPONSE',
              'Unsupported transcript frame encoding.',
            );
          yield frameSchema.parse(data);
        }
      }
      throw new AppError(
        'STREAM_ENDED',
        'The transcript stream disconnected. Use check to resume.',
      );
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}

export function replyText(entry: Entry): string | undefined {
  if (!['send-message', 'send-message/text'].includes(entry.entryKind))
    return undefined;
  if (entry.bodyOmitted || !entry.body)
    throw new AppError(
      'BODY_UNAVAILABLE',
      'A bot reply body was omitted by the service. Read it in the Grok Bot app; the local read position was preserved.',
    );
  let text = Buffer.from(entry.body, 'base64').toString('utf8');
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const value: unknown = JSON.parse(text);
      const parsed = z
        .object({
          text: z.string().optional(),
          message: z
            .union([
              z.string(),
              z.object({ type: z.literal('text'), content: z.string() }),
            ])
            .optional(),
        })
        .safeParse(value);
      if (
        !parsed.success ||
        (parsed.data.text === undefined && parsed.data.message === undefined)
      )
        throw new Error();
      text =
        parsed.data.text ??
        (typeof parsed.data.message === 'string'
          ? parsed.data.message
          : parsed.data.message?.content) ??
        '';
    } catch {
      throw new AppError(
        'BODY_UNAVAILABLE',
        'The bot reply uses an unsupported body format. The read position was preserved.',
      );
    }
  }
  return text;
}
