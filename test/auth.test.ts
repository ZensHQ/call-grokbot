import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiKeyAuth,
  BrowserAuth,
  cursorEnvironment,
  tokenInfo,
} from '../src/auth.js';
import { readConfig, resolveName } from '../src/config.js';
import { Redactor } from '../src/errors.js';

function jwt(subject = 'test-owner', expires = Date.now() + 3600000) {
  return `eyJ0eXAiOiJKV1QifQ.${Buffer.from(JSON.stringify({ sub: subject, exp: Math.floor(expires / 1000) })).toString('base64url')}.synthetic-signature`;
}
afterEach(() => vi.restoreAllMocks());

describe('official browser session', () => {
  it('re-reads tokens, observes account switches, and never exchanges a manual key', async () => {
    let token = jwt();
    const read = vi.fn(async () => token);
    const auth = new BrowserAuth(new Redactor(), read);
    expect((await auth.identity()).subject).toBe('test-owner');
    token = jwt('new-owner');
    expect((await auth.identity()).subject).toBe('new-owner');
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('observes logout immediately in an already-running process', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(jwt())
      .mockRejectedValueOnce(new Error('signed out'));
    const auth = new BrowserAuth(new Redactor(), read);
    await auth.identity();
    await expect(auth.identity()).rejects.toThrow('signed out');
  });
  it('does not claim browser sessions can silently refresh', async () => {
    const auth = new BrowserAuth(new Redactor(), async () =>
      jwt('test-owner', Date.now() - 1000),
    );
    await expect(auth.identity()).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    });
  });
  it('rejects malformed or subject-less tokens', () => {
    expect(() => tokenInfo('not-a-token')).toThrow();
    expect(() =>
      tokenInfo(
        `x.${Buffer.from('{"exp":9999999999}').toString('base64url')}.x`,
      ),
    ).toThrow();
  });
  it('removes all credential overrides when delegating to official login/logout', () => {
    const env = cursorEnvironment({
      PATH: '/bin',
      CURSOR_API_KEY: 'secret',
      CALL_GROKBOT_API_KEY: 'secret2',
      CURSOR_AUTH_TOKEN: 'secret3',
    });
    expect(env).toEqual({ PATH: '/bin' });
  });
});

describe('optional API key renewal', () => {
  it('shares concurrent exchanges and refreshes within five minutes of expiry', async () => {
    let now = 2000000000000;
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ accessToken: jwt('same-owner', now + 3600000) }),
        ),
    );
    const auth = new ApiKeyAuth(
      readConfig({}),
      new Redactor(),
      async () => 'synthetic-key',
      fetcher,
      () => now,
    );
    const identities = await Promise.all([
      auth.identity(),
      auth.identity(),
      auth.identity(),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(identities[0]?.token).toBe(identities[2]?.token);
    now += 3301000;
    await auth.identity();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://api2.cursor.sh/auth/exchange_user_api_key',
    );
  });
  it('does not reuse the previous account token after rotating a key', async () => {
    let key = 'account-a';
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const value = new Headers(init?.headers).get('authorization')?.slice(7);
      return new Response(JSON.stringify({ accessToken: jwt(value) }));
    });
    const auth = new ApiKeyAuth(
      readConfig({}),
      new Redactor(),
      async () => key,
      fetcher,
    );
    expect((await auth.identity()).subject).toBe('account-a');
    key = 'account-b';
    expect((await auth.identity()).subject).toBe('account-b');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('cannot mix concurrent exchanges from different keys', async () => {
    let key = 'account-a';
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const value = new Headers(init?.headers).get('authorization')?.slice(7);
      await new Promise((r) => setTimeout(r, value === 'account-a' ? 20 : 1));
      return new Response(JSON.stringify({ accessToken: jwt(value) }));
    });
    const auth = new ApiKeyAuth(
      readConfig({}),
      new Redactor(),
      async () => key,
      fetcher,
    );
    const first = auth.identity();
    await new Promise((r) => setTimeout(r, 1));
    key = 'account-b';
    const second = auth.identity();
    expect((await second).subject).toBe('account-b');
    expect((await first).subject).toBe('account-a');
    expect((await auth.identity()).subject).toBe('account-b');
  });
  it('redacts exchanged tokens and keys even when a server echoes them', async () => {
    const redactor = new Redactor();
    const token = jwt();
    const auth = new ApiKeyAuth(
      readConfig({}),
      redactor,
      async () => 'synthetic-secret-key',
      async () => new Response(JSON.stringify({ accessToken: token })),
    );
    await auth.identity();
    expect(redactor.clean(new Error(`synthetic-secret-key ${token}`))).toBe(
      '[redacted] [redacted]',
    );
  });
});

describe('configuration', () => {
  it('defaults to browser auth even if a manual key is set', () => {
    expect(readConfig({ CURSOR_API_KEY: 'unused' }).authMode).toBe('browser');
  });
  it.each([
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com?key=secret',
    'https://untrusted.example',
  ])('rejects insecure or ambiguous base origin %s', (base) => {
    expect(() => readConfig({ CALL_GROKBOT_API_BASE_URL: base })).toThrow();
  });
  it('accepts HTTP loopback only for a fake backend', () => {
    expect(
      readConfig({ CALL_GROKBOT_API_BASE_URL: 'http://127.0.0.1:3000' })
        .baseUrl,
    ).toBe('http://127.0.0.1:3000');
  });
  it('validates allowlists, matching configured spelling and single defaults', () => {
    const c = readConfig({
      CALL_GROKBOT_AGENTS: '[{"name":"Free","description":"Research"}]',
    });
    expect(resolveName('free', c.agents)).toBe('Free');
    expect(resolveName(undefined, c.agents)).toBe('Free');
    expect(() => resolveName('another', c.agents)).toThrow();
    expect(() => readConfig({ CALL_GROKBOT_AGENTS: 'free,FREE' })).toThrow();
    expect(() => readConfig({ CALL_GROKBOT_AGENTS: 'free,' })).toThrow();
    expect(() =>
      readConfig({ CALL_GROKBOT_DISABLED_TOOLS: 'delete' }),
    ).toThrow();
  });
});
