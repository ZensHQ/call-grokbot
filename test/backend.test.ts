import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Backend, replyText } from '../src/backend.js';
import { readConfig } from '../src/config.js';
import { Redactor } from '../src/errors.js';

const id = {
  token: 'synthetic-access-token',
  subject: 'owner',
  expiresAt: Date.now() + 3600000,
};
const auth = { identity: async () => id };
function frame(data: unknown, flags = 0) {
  const json = Buffer.from(JSON.stringify(data));
  const bytes = Buffer.alloc(json.length + 5);
  bytes[0] = flags;
  bytes.writeUInt32BE(json.length, 1);
  json.copy(bytes, 5);
  return bytes;
}
describe('RPC transport', () => {
  it('sends exact origin, bearer header, proto-JSON content type and unique request ids', async () => {
    const f = vi.fn(async () => new Response('{}'));
    const b = new Backend(readConfig({}), auth, new Redactor(), f);
    await b.rpc('ListGrokBotAgents', {}, z.object({}), id);
    await b.rpc('ListGrokBotAgents', {}, z.object({}), id);
    const first = f.mock.calls[0] as unknown as [string, RequestInit];
    const second = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(first[0]).toBe(
      'https://api2.cursor.sh/aiserver.v1.GrokBotService/ListGrokBotAgents',
    );
    expect(new Headers(first[1].headers).get('authorization')).toBe(
      `Bearer ${id.token}`,
    );
    expect(new Headers(first[1].headers).get('x-request-id')).not.toBe(
      new Headers(second[1].headers).get('x-request-id'),
    );
    expect(first[1].redirect).toBe('error');
  });
  it('retries only reads after transient failure', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"agents":[]}'));
    const b = new Backend(readConfig({}), auth, new Redactor(), f);
    expect((await b.bots(id)).agents).toEqual([]);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it.each([429, 503])(
    'never automatically resends a message on HTTP %i',
    async (status) => {
      const f = vi.fn(async () => new Response('{}', { status }));
      const b = new Backend(readConfig({}), auth, new Redactor(), f);
      await expect(
        b.send('a', '', 'fixed-message-id', 'task', id),
      ).rejects.toMatchObject({ code: 'SEND_UNCONFIRMED' });
      expect(f).toHaveBeenCalledTimes(1);
    },
  );
  it('never automatically resends after a network failure or a malformed success', async () => {
    const f = vi
      .fn()
      .mockRejectedValue(new Error(`request leaked ${id.token}`));
    const b = new Backend(readConfig({}), auth, new Redactor(), f);
    await expect(b.send('a', '', 'm', 'task', id)).rejects.not.toThrow(
      id.token,
    );
    expect(f).toHaveBeenCalledTimes(1);
    f.mockReset().mockResolvedValue(new Response('not-json'));
    await expect(b.send('a', '', 'm', 'task', id)).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('reloads a rotated token once on a read-only 401', async () => {
    let token = id.token;
    const provider = {
      identity: vi.fn(async (force?: boolean) => {
        if (force) token = 'renewed';
        return { ...id, token };
      }),
    };
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"agents":[]}'));
    const b = new Backend(readConfig({}), provider, new Redactor(), f);
    await b.bots(id);
    expect(provider.identity).toHaveBeenCalledWith(true, undefined);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('rejects a mid-call account switch before sending', async () => {
    const f = vi.fn();
    const b = new Backend(
      readConfig({}),
      { identity: async () => ({ ...id, subject: 'another-owner' }) },
      new Redactor(),
      f,
    );
    await expect(b.send('a', '', 'm', 'task', id)).rejects.toMatchObject({
      code: 'ACCOUNT_CHANGED',
    });
    expect(f).not.toHaveBeenCalled();
  });
  it('parses split and coalesced Connect frames without leaking other protocol content', async () => {
    const bytes = Buffer.concat([
      frame({ connected: {} }),
      frame({ agentState: { snapshot: true, live: [] } }),
      frame({}, 2),
    ]);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(bytes.subarray(0, 3));
        c.enqueue(bytes.subarray(3, 17));
        c.enqueue(bytes.subarray(17));
        c.close();
      },
    });
    const b = new Backend(
      readConfig({}),
      auth,
      new Redactor(),
      async () => new Response(stream),
    );
    const results = [];
    for await (const value of b.watch(
      {
        agentId: 'a',
        sessionId: '',
        cursor: '9007199254740993',
        generation: 0,
      },
      id,
      new AbortController().signal,
    ))
      results.push(value);
    expect(results).toHaveLength(2);
    expect(results[1]?.agentState?.snapshot).toBe(true);
  });
  it('fails closed on oversized stream frames', async () => {
    const bytes = Buffer.alloc(5);
    bytes.writeUInt32BE(9 * 1024 * 1024, 1);
    const b = new Backend(
      readConfig({}),
      auth,
      new Redactor(),
      async () => new Response(bytes),
    );
    await expect(async () => {
      for await (const _frame of b.watch(
        { agentId: 'a', sessionId: '', cursor: '0', generation: 0 },
        id,
        new AbortController().signal,
      )) {
        /* consume */
      }
    }).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
});
describe('delivered replies', () => {
  it('ignores internal steps and decodes only delivered message text', () => {
    expect(
      replyText({
        seq: '1',
        entryKind: 'tool-result',
        body: Buffer.from('private steps').toString('base64'),
      }),
    ).toBeUndefined();
    expect(
      replyText({
        seq: '2',
        entryKind: 'send-message',
        body: Buffer.from('{"text":"PONG"}').toString('base64'),
      }),
    ).toBe('PONG');
  });
  it('decodes the current typed text envelope without exposing internal fields', () => {
    expect(
      replyText({
        seq: '4',
        entryKind: 'send-message',
        body: Buffer.from(
          JSON.stringify({
            kind: 'send-message',
            id: 'synthetic',
            message: { type: 'text', content: 'PONG' },
            timestampMs: 1,
          }),
        ).toString('base64'),
      }),
    ).toBe('PONG');
  });
  it('does not silently consume an omitted or unknown message body', () => {
    expect(() =>
      replyText({ seq: '1', entryKind: 'send-message', bodyOmitted: true }),
    ).toThrow();
    expect(() =>
      replyText({
        seq: '2',
        entryKind: 'send-message',
        body: Buffer.from('{"unknown":true}').toString('base64'),
      }),
    ).toThrow();
  });
});
