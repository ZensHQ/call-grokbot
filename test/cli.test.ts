import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: spawnMock };
});

import { cursorCommand } from '../src/auth.js';

describe('official CLI delegation', () => {
  it.each(['login', 'logout'] as const)(
    'delegates %s without a shell or manual key overrides',
    async (command) => {
      spawnMock.mockImplementation(() => {
        const child = new EventEmitter();
        setTimeout(() => child.emit('exit', 0), 1);
        return child;
      });
      await cursorCommand({ cli: process.execPath }, command);
      const call = spawnMock.mock.calls.at(-1);
      expect(call?.[0]).toBe(process.execPath);
      expect(call?.[1]).toEqual([command]);
      expect(call?.[2].shell).toBe(false);
      expect(call?.[2].stdio).toBe('inherit');
      expect(call?.[2].env.CURSOR_API_KEY).toBeUndefined();
      expect(call?.[2].env.CURSOR_AUTH_TOKEN).toBeUndefined();
    },
  );
  it('does not report logout success when the official CLI failed', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      setTimeout(() => child.emit('exit', 1), 1);
      return child;
    });
    await expect(
      cursorCommand({ cli: process.execPath }, 'logout'),
    ).rejects.toMatchObject({ code: 'CLI_FAILED' });
  });
});
