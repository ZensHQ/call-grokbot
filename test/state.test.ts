import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { atomicRename, Contacts } from '../src/state.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'call-grokbot-state-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
function contact(name: string) {
  return {
    name,
    agentId: name,
    sessionId: '',
    cursor: '9007199254740999',
    generation: 0,
    pending: false,
    firstContactAt: '2026-01-01',
    lastContactAt: '2026-01-01',
  };
}
it('isolates accounts and preserves large cursors as strings', async () => {
  const c = new Contacts(dir);
  await c.save('account-a', contact('one'));
  await c.save('account-b', contact('two'));
  expect((await c.list('account-a')).map((x) => x.name)).toEqual(['one']);
  expect((await c.list('account-b'))[0]?.cursor).toBe('9007199254740999');
  if (process.platform !== 'win32') {
    expect((await stat(join(dir, 'state.json'))).mode & 0o777).toBe(0o600);
  }
  expect(await readFile(join(dir, 'state.json'), 'utf8')).not.toContain(
    'Bearer',
  );
});
it('serializes concurrent writes in separate Node processes without losing accounts', async () => {
  const worker = async (name: string) => {
    const code = `import { Contacts } from './dist/state.js'; const c=new Contacts(process.argv[1]); await c.save(process.argv[2],JSON.parse(process.argv[3]));`;
    await promisify(execFile)(process.execPath, [
      '--input-type=module',
      '-e',
      code,
      dir,
      name,
      JSON.stringify(contact(name)),
    ]);
  };
  await Promise.all([worker('a'), worker('b'), worker('c')]);
  expect(Object.keys((await new Contacts(dir).read()).accounts).sort()).toEqual(
    ['a', 'b', 'c'],
  );
});
it('fails closed on corrupt state instead of forgetting pending sends', async () => {
  await writeFile(join(dir, 'state.json'), '{broken');
  await expect(new Contacts(dir).read()).rejects.toMatchObject({
    code: 'STATE_INVALID',
  });
});
it('retries a Windows sharing violation without removing the destination', async () => {
  const denied = Object.assign(new Error('file temporarily held'), {
    code: 'EPERM',
  });
  const replace = vi
    .fn()
    .mockRejectedValueOnce(denied)
    .mockResolvedValue(undefined);
  await atomicRename('temporary', 'existing-state', replace, 'win32');
  expect(replace.mock.calls).toEqual([
    ['temporary', 'existing-state'],
    ['temporary', 'existing-state'],
  ]);
});
it('does not retry unrelated filesystem errors or POSIX permission failures', async () => {
  for (const [code, platform] of [
    ['ENOSPC', 'win32'],
    ['EPERM', 'darwin'],
  ] as const) {
    const denied = Object.assign(new Error('state cannot be replaced'), {
      code,
    });
    const replace = vi.fn().mockRejectedValue(denied);
    await expect(
      atomicRename('temporary', 'existing-state', replace, platform),
    ).rejects.toBe(denied);
    expect(replace).toHaveBeenCalledTimes(1);
  }
});
