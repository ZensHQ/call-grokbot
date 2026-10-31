import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sleep } from '../src/errors.js';
import { fixture } from './fixture.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'call-grokbot-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
describe('conversation lifecycle', () => {
  it('asks an existing bot, waits for a real settlement and advances unread state', async () => {
    const f = fixture(dir);
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 2,
    });
    expect(result).toMatchObject({
      agent: 'free',
      status: 'finished',
      reply: 'fixture-reply',
      messageSent: true,
    });
    const next = await f.conversations.check({ wait_seconds: 1 });
    expect(next.status).toBe('finished');
    expect(next.reply).toBeUndefined();
    expect(f.backend.sends).toHaveLength(1);
  });
  it('does not mistake a quick acknowledgement for completion', async () => {
    const f = fixture(dir);
    f.backend.replyOnly = true;
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 1,
    });
    expect(result.status).toBe('running');
    expect(result.reply).toBe('fixture-reply');
  });
  it('does not report completion after busy becomes idle without a new settlement', async () => {
    const f = fixture(dir);
    f.backend.noSettlement = true;
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 1,
    });
    expect(result.status).toBe('running');
    expect(result.reply).toBe('fixture-reply');
  });
  it('warns before browser expiry while returning the completed result', async () => {
    const f = fixture(dir);
    const identity = await f.auth.identity();
    vi.spyOn(f.auth, 'identity').mockResolvedValue({
      ...identity,
      expiresAt: Date.now() + 240000,
    });
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 1,
    });
    expect(result.status).toBe('finished');
    expect(result.note).toContain('auth refresh');
    expect(result.note).not.toContain('do not resend');
  });
  it('refuses to send if the state snapshot does not identify the requested bot', async () => {
    const f = fixture(dir);
    f.backend.missingState = true;
    await expect(
      f.conversations.ask({ message: 'task', wait_seconds: 0 }),
    ).rejects.toMatchObject({ code: 'BOT_STATE_UNAVAILABLE' });
    expect(f.backend.sends).toHaveLength(0);
  });
  it('wait_seconds=0 returns and check resumes without another send', async () => {
    const f = fixture(dir);
    f.backend.delay = 80;
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 0,
    });
    expect(result.status).toBe('running');
    await sleep(100);
    const next = await f.conversations.check({ wait_seconds: 1 });
    expect(next).toMatchObject({ status: 'finished', reply: 'fixture-reply' });
    expect(f.backend.sends).toHaveLength(1);
  });
  it('never creates or sends to missing or ambiguous names', async () => {
    const f = fixture(dir, { CALL_GROKBOT_AGENTS: 'typo' });
    await expect(
      f.conversations.ask({ message: 'task', wait_seconds: 0 }),
    ).rejects.toMatchObject({ code: 'BOT_NOT_UNIQUE' });
    expect(f.backend.sends).toHaveLength(0);
  });
  it('does not read old history on the first contact', async () => {
    const f = fixture(dir);
    f.backend.entries.push({
      seq: '10',
      updatedSeq: '10',
      entryKind: 'send-message',
      body: Buffer.from('old private reply').toString('base64'),
    });
    // The fixture's new sequence must be greater than its existing history.
    f.backend.neverFinish = true;
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 0,
    });
    expect(result.reply).toBeUndefined();
  });
  it('does not leak frames belonging to a different bot', async () => {
    const f = fixture(dir);
    f.backend.foreignFrames = true;
    const result = await f.conversations.ask({
      message: 'task',
      wait_seconds: 2,
    });
    expect(result.reply).toBe('fixture-reply');
    expect(JSON.stringify(result)).not.toContain('must not leak');
  });
  it('separates prior unread replies from the answer to the new task', async () => {
    const f = fixture(dir);
    await f.conversations.ask({ message: 'first', wait_seconds: 1 });
    f.backend.entries.push({
      seq: '2',
      updatedSeq: '2',
      entryKind: 'send-message',
      body: Buffer.from('prior unread reply').toString('base64'),
    });
    const result = await f.conversations.ask({
      message: 'second',
      wait_seconds: 1,
    });
    expect(result.earlierReplies).toEqual(['prior unread reply']);
    expect(result.reply).toBe('fixture-reply');
  });
  it('filters local contact metadata through the configured allowlist', async () => {
    const f = fixture(dir);
    await f.conversations.ask({ message: 'first', wait_seconds: 1 });
    const first = Object.entries((await f.contacts.read()).accounts)[0];
    if (!first?.[1][0]) throw new Error('Missing fixture contact');
    const [account, contacts] = first;
    await f.contacts.save(account, {
      ...contacts[0],
      name: 'private-other',
      agentId: 'other',
    });
    expect((await f.conversations.list()).contacted.map((c) => c.name)).toEqual(
      ['free'],
    );
  });
  it('prefers the exact contact name and rejects an ambiguous case-only match', async () => {
    const f = fixture(dir);
    f.config.agents = undefined;
    await f.conversations.ask({
      agent: 'free',
      message: 'first',
      wait_seconds: 1,
    });
    const first = Object.entries((await f.contacts.read()).accounts)[0];
    if (!first?.[1][0]) throw new Error('Missing fixture contact');
    const [account, contacts] = first;
    await f.contacts.save(account, {
      ...contacts[0],
      name: 'Free',
      agentId: 'other',
    });
    const interrupt = vi.spyOn(f.backend, 'interrupt');
    await f.conversations.interrupt('free');
    expect(interrupt.mock.calls[0]?.[0]).toBe('fixture-bot');
    await expect(f.conversations.interrupt('FREE')).rejects.toMatchObject({
      code: 'CONTACT_AMBIGUOUS',
    });
  });
  it('rejects an app-busy bot before sending', async () => {
    const f = fixture(dir);
    f.backend.busy = true;
    await expect(
      f.conversations.ask({ message: 'task', wait_seconds: 0 }),
    ).rejects.toMatchObject({ code: 'BOT_BUSY' });
    expect(f.backend.sends).toHaveLength(0);
  });
  it('blocks duplicate asks while an earlier message is pending', async () => {
    const f = fixture(dir);
    f.backend.neverFinish = true;
    await f.conversations.ask({ message: 'first', wait_seconds: 0 });
    await expect(
      f.conversations.ask({ message: 'second', wait_seconds: 0 }),
    ).rejects.toMatchObject({ code: 'BOT_PENDING' });
    expect(f.backend.sends).toHaveLength(1);
  });
  it('preserves the message id and unread cursor after an ambiguous send', async () => {
    const f = fixture(dir);
    f.backend.failSend = true;
    await expect(
      f.conversations.ask({ message: 'task', wait_seconds: 0 }),
    ).rejects.toThrow();
    const state = await f.contacts.read();
    const contact = Object.values(state.accounts)[0]?.[0];
    expect(contact).toMatchObject({
      uncertain: true,
      pending: true,
      cursor: '0',
    });
    expect(contact?.messageId).toBe(f.backend.sends[0]);
    await f.conversations.check({ wait_seconds: 0 });
    expect(f.backend.sends).toHaveLength(1);
  });
  it('preserves unread replies if a client cancels after send', async () => {
    const f = fixture(dir);
    f.backend.delay = 80;
    const controller = new AbortController();
    const pending = f.conversations.ask(
      { message: 'task', wait_seconds: 2 },
      { signal: controller.signal },
    );
    while (!f.backend.sends.length) await sleep(2);
    controller.abort();
    await expect(pending).rejects.toThrow();
    await sleep(110);
    const result = await f.conversations.check({ wait_seconds: 1 });
    expect(result.reply).toBe('fixture-reply');
    expect(f.backend.sends).toHaveLength(1);
  });
  it('restores unread positions when cancellation arrives during the state commit', async () => {
    const f = fixture(dir);
    const controller = new AbortController();
    const save = f.contacts.save.bind(f.contacts);
    vi.spyOn(f.contacts, 'save').mockImplementation(
      async (account, contact) => {
        await save(account, contact);
        if (contact.cursor !== '0') controller.abort();
      },
    );
    await expect(
      f.conversations.ask(
        { message: 'task', wait_seconds: 1 },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
    expect(
      Object.values((await f.contacts.read()).accounts)[0]?.[0]?.cursor,
    ).toBe('0');
    expect((await f.conversations.check({ wait_seconds: 1 })).reply).toBe(
      'fixture-reply',
    );
  });
  it('keeps the pending guard when send status is unknown', async () => {
    const f = fixture(dir);
    f.backend.failSend = true;
    await expect(
      f.conversations.ask({ message: 'task', wait_seconds: 0 }),
    ).rejects.toThrow();
    vi.spyOn(f.backend, 'sendStatus').mockResolvedValue({
      status: 'GROK_BOT_SEND_STATUS_UNSPECIFIED',
    });
    await expect(
      f.conversations.check({ wait_seconds: 0 }),
    ).rejects.toMatchObject({ code: 'SEND_UNCONFIRMED' });
    expect(f.backend.sends).toHaveLength(1);
    expect(
      Object.values((await f.contacts.read()).accounts)[0]?.[0]?.pending,
    ).toBe(true);
  });
  it('interrupt runs while ask is waiting, without waiting for the agent lock', async () => {
    const f = fixture(dir);
    f.backend.neverFinish = true;
    const pending = f.conversations.ask({ message: 'task', wait_seconds: 2 });
    while (!f.backend.sends.length) await sleep(2);
    expect((await f.conversations.interrupt(undefined)).interrupted).toBe(true);
    expect((await pending).status).toBe('finished');
    expect(f.backend.interrupts).toBe(1);
  });
  it('check and interrupt cannot accidentally contact a new bot', async () => {
    const f = fixture(dir);
    await expect(
      f.conversations.check({ wait_seconds: 0 }),
    ).rejects.toMatchObject({ code: 'CONTACT_REQUIRED' });
    await expect(f.conversations.interrupt(undefined)).rejects.toMatchObject({
      code: 'CONTACT_REQUIRED',
    });
    expect(f.backend.botCalls).toBe(0);
  });
  it('returns a failed bot turn without consuming its cursor', async () => {
    const f = fixture(dir);
    f.backend.failTurn = true;
    await expect(
      f.conversations.ask({ message: 'task', wait_seconds: 1 }),
    ).rejects.toMatchObject({ code: 'BOT_TURN_FAILED' });
    expect(
      Object.values((await f.contacts.read()).accounts)[0]?.[0]?.cursor,
    ).toBe('0');
  });
  it('observes logout during a wait before returning data', async () => {
    const f = fixture(dir);
    const pending = f.conversations.ask({ message: 'task', wait_seconds: 1 });
    while (!f.backend.sends.length) await sleep(2);
    f.logout();
    await expect(pending).rejects.toThrow('signed out');
    expect(
      Object.values((await f.contacts.read()).accounts)[0]?.[0]?.cursor,
    ).toBe('0');
  });
});
