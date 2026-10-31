import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { AppError, sleep } from './errors.js';

const contactSchema = z.object({
  name: z.string(),
  agentId: z.string(),
  sessionId: z.string(),
  cursor: z.string().regex(/^\d+$/),
  generation: z.number().int().nonnegative(),
  firstContactAt: z.string(),
  lastContactAt: z.string(),
  pending: z.boolean().default(false),
  messageId: z.string().optional(),
  baselineSettlement: z.string().optional(),
  sawBusy: z.boolean().optional(),
  interrupted: z.boolean().optional(),
  uncertain: z.boolean().optional(),
});
export type Contact = z.infer<typeof contactSchema>;
const stateSchema = z.object({
  version: z.literal(1),
  accounts: z.record(z.string(), z.array(contactSchema)),
});
type State = z.infer<typeof stateSchema>;
export function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export async function atomicRename(
  source: string,
  destination: string,
  renameFile = rename,
  platform = process.platform,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        platform !== 'win32' ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(code || '') ||
        attempt >= 19
      )
        throw error;
      // Windows readers and virus scanners can briefly deny replacement.
      // Retry the same atomic rename; never unlink the existing state first.
      await sleep(Math.min(10 * (attempt + 1), 100));
    }
  }
}
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
export async function fileLock<T>(
  dir: string,
  key: string,
  run: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${fingerprint(key)}.lock`);
  const id = randomUUID();
  const deadline = Date.now() + 5000;
  while (true) {
    signal?.throwIfAborted();
    try {
      const handle = await open(path, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, id }));
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Reclaim only a dead owner's lock, never a long-running active tool.
      try {
        const owner = JSON.parse(await readFile(path, 'utf8'));
        if (Number.isSafeInteger(owner.pid) && !alive(owner.pid)) {
          const guard = await open(`${path}.reap`, 'wx', 0o600).catch(
            () => undefined,
          );
          if (guard) {
            try {
              const current = JSON.parse(await readFile(path, 'utf8'));
              if (current.id === owner.id && !alive(current.pid))
                await unlink(path);
            } finally {
              await guard.close();
              await unlink(`${path}.reap`).catch(() => {});
            }
          }
        }
      } catch {
        /* owner may still be writing, or another process acquired the lock */
      }
      if (Date.now() >= deadline)
        throw new AppError(
          'LOCAL_BUSY',
          'Another local client is using this bot or state file. Retry after it finishes.',
        );
      await sleep(50, signal);
    }
  }
  try {
    return await run();
  } finally {
    try {
      if (JSON.parse(await readFile(path, 'utf8')).id === id)
        await unlink(path);
    } catch {
      /* never remove a different owner's lock */
    }
  }
}

export class Contacts {
  constructor(readonly dir: string) {}
  async read(): Promise<State> {
    try {
      return stateSchema.parse(
        JSON.parse(await readFile(join(this.dir, 'state.json'), 'utf8')),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, accounts: {} };
      throw new AppError(
        'STATE_INVALID',
        'The contact state is unreadable or damaged. Restore state.json from a backup before sending another task; pending sends must not be silently forgotten.',
      );
    }
  }
  async list(account: string): Promise<Contact[]> {
    return (await this.read()).accounts[account] || [];
  }
  async save(account: string, contact: Contact) {
    await fileLock(this.dir, 'state', async () => {
      const state = await this.read();
      state.accounts[account] = [
        contactSchema.parse(contact),
        ...(state.accounts[account] || []).filter(
          (c) =>
            c.agentId !== contact.agentId || c.sessionId !== contact.sessionId,
        ),
      ];
      const temp = join(this.dir, `state.${randomUUID()}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(state)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await atomicRename(temp, join(this.dir, 'state.json'));
      } finally {
        await unlink(temp).catch(() => {});
      }
    });
  }
  async locked<T>(
    account: string,
    agentId: string,
    action: () => Promise<T>,
    signal?: AbortSignal,
  ) {
    return fileLock(this.dir, `agent:${account}:${agentId}`, action, signal);
  }
}
