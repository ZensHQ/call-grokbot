import { execFile, spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Config } from './config.js';
import { AppError, type Redactor } from './errors.js';
import { LOGIN_COMMAND } from './version.js';

const exec = promisify(execFile);
export const RELOGIN = `Run \`${LOGIN_COMMAND}\` to sign in with the official Cursor CLI.`;
export interface Identity {
  token: string;
  subject: string;
  expiresAt: number;
}
export interface AuthProvider {
  identity(force?: boolean, signal?: AbortSignal): Promise<Identity>;
}
export function tokenInfo(token: string): {
  subject: string;
  expiresAt: number;
} {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] || '', 'base64url').toString(),
    );
    if (
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      !Number.isFinite(claims.exp)
    )
      throw new Error();
    return { subject: claims.sub, expiresAt: claims.exp * 1000 };
  } catch {
    throw new AppError(
      'AUTH_INVALID',
      `The saved access token has an unsupported shape. ${RELOGIN}`,
    );
  }
}
export function cursorEnvironment(env = process.env) {
  const clean = { ...env };
  for (const name of [
    'CURSOR_API_KEY',
    'CURSOR_API_KEY_FILE',
    'CURSOR_SERVICE_ACCOUNT_KEY',
    'CALL_GROKBOT_API_KEY',
    'CURSOR_AUTH_TOKEN',
  ])
    delete clean[name];
  return clean;
}
export async function findCursorCli(
  config: Pick<Config, 'cli'>,
): Promise<string> {
  if (config.cli) {
    if (!isAbsolute(config.cli))
      throw new AppError(
        'INVALID_CONFIG',
        'CALL_GROKBOT_CURSOR_CLI must be an absolute path.',
      );
    await access(config.cli).catch(() => {
      throw new AppError(
        'CLI_MISSING',
        'The configured Cursor CLI does not exist.',
      );
    });
    return config.cli;
  }
  for (const candidate of [
    join(homedir(), '.local', 'bin', 'agent'),
    join(homedir(), '.local', 'bin', 'cursor-agent'),
    ...(process.env.PATH || '')
      .split(delimiter)
      .filter(Boolean)
      .flatMap((p) => ['cursor-agent', 'agent'].map((name) => join(p, name))),
  ]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* next candidate */
    }
  }
  throw new AppError(
    'CLI_MISSING',
    `Install the official Cursor CLI from https://cursor.com/docs/cli/installation. ${RELOGIN}`,
  );
}
export async function cursorCommand(
  config: Pick<Config, 'cli'>,
  command: 'login' | 'logout',
) {
  const cli = await findCursorCli(config);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cli, [command], {
      env: cursorEnvironment(),
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', () =>
      reject(
        new AppError(
          'CLI_FAILED',
          `Could not start the official Cursor CLI ${command}.`,
        ),
      ),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new AppError(
              'CLI_FAILED',
              `Official Cursor CLI ${command} did not complete successfully.`,
            ),
          ),
    );
  });
}

export class BrowserAuth implements AuthProvider {
  constructor(
    private readonly redactor: Redactor,
    private readonly readToken: () => Promise<string> = readBrowserToken,
    private readonly now = Date.now,
  ) {}
  async identity(): Promise<Identity> {
    const token = await this.readToken();
    this.redactor.add(token);
    const info = tokenInfo(token);
    if (info.expiresAt <= this.now())
      throw new AppError(
        'AUTH_EXPIRED',
        `The official browser session has expired. It cannot silently renew without another browser sign-in. ${RELOGIN}`,
      );
    // Re-read on every request: an official login/logout in another process takes effect immediately.
    return { token, ...info };
  }
}
export async function readBrowserToken(): Promise<string> {
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await exec(
        '/usr/bin/security',
        [
          'find-generic-password',
          '-a',
          'cursor-user',
          '-s',
          'cursor-access-token',
          '-w',
        ],
        { timeout: 30000, maxBuffer: 65536, encoding: 'utf8' },
      );
      if (stdout.trim()) return stdout.trim();
    } catch {
      throw new AppError(
        'AUTH_REQUIRED',
        `The official Cursor CLI login is missing, or macOS Keychain denied access. ${RELOGIN}`,
      );
    }
  } else {
    const file =
      process.platform === 'win32'
        ? join(
            process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
            'Cursor',
            'auth.json',
          )
        : join(
            process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
            'cursor',
            'auth.json',
          );
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (typeof data.accessToken === 'string' && data.accessToken.trim())
        return data.accessToken.trim();
    } catch {
      /* controlled message below */
    }
  }
  throw new AppError('AUTH_REQUIRED', RELOGIN);
}

export class ApiKeyAuth implements AuthProvider {
  private cached?: { key: string; identity: Identity };
  private readonly exchanging = new Map<string, Promise<Identity>>();
  constructor(
    private readonly config: Config,
    private readonly redactor: Redactor,
    private readonly readKey: () => Promise<string> = readApiKey,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {}
  async identity(force = false, signal?: AbortSignal): Promise<Identity> {
    const key = await this.readKey();
    this.redactor.add(key);
    if (
      !force &&
      this.cached?.key === key &&
      this.cached.identity.expiresAt > this.now() + 300000
    )
      return this.cached.identity;
    // All callers share one refresh. A caller's cancellation does not cancel other callers' refresh.
    if (!this.exchanging.has(key)) {
      this.exchanging.set(
        key,
        this.exchange(key).finally(() => {
          this.exchanging.delete(key);
        }),
      );
    }
    const identity = await this.exchanging.get(key);
    if (!identity)
      throw new AppError(
        'AUTH_REQUIRED',
        'The authentication exchange did not complete.',
      );
    this.cached = { key, identity };
    signal?.throwIfAborted();
    return identity;
  }
  private async exchange(key: string): Promise<Identity> {
    const response = await this.fetcher(
      `${this.config.baseUrl}/auth/exchange_user_api_key`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
        },
        body: '{}',
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.requestTimeout),
      },
    );
    if (!response.ok)
      throw new AppError(
        'AUTH_REJECTED',
        'The API key could not be exchanged for a session. Check its validity and CLI/SDK permission.',
        response.status,
      );
    const data = z
      .object({ accessToken: z.string().min(1) })
      .parse(await response.json());
    this.redactor.add(data.accessToken);
    const info = tokenInfo(data.accessToken);
    if (info.expiresAt <= this.now())
      throw new AppError(
        'AUTH_EXPIRED',
        'The exchange returned an expired token.',
      );
    return { token: data.accessToken, ...info };
  }
}
export async function readApiKey() {
  const explicit =
    process.env.CALL_GROKBOT_API_KEY?.trim() ||
    process.env.CURSOR_API_KEY?.trim();
  if (explicit) return explicit;
  if (process.env.CURSOR_API_KEY_FILE?.trim()) {
    try {
      const key = (
        await readFile(process.env.CURSOR_API_KEY_FILE.trim(), 'utf8')
      ).trim();
      if (key) return key;
    } catch {
      /* fallback */
    }
  }
  const service = process.env.CURSOR_SERVICE_ACCOUNT_KEY?.trim();
  if (service) return service;
  throw new AppError(
    'AUTH_REQUIRED',
    'API key mode requires CALL_GROKBOT_API_KEY, CURSOR_API_KEY or CURSOR_API_KEY_FILE.',
  );
}
