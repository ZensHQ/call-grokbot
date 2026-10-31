import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { AppError } from './errors.js';

const agentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).optional(),
});
export type AgentConfig = z.infer<typeof agentSchema>;
export interface Config {
  authMode: 'browser' | 'api-key';
  baseUrl: string;
  stateDir: string;
  cli?: string;
  agents?: AgentConfig[];
  disabledTools: string[];
  defaultWait: number;
  maxWait: number;
  requestTimeout: number;
  settleMs: number;
}
export function readConfig(env = process.env): Config {
  const authMode = z
    .enum(['browser', 'api-key'])
    .parse(env.CALL_GROKBOT_AUTH_MODE || 'browser');
  const base = new URL(
    env.CALL_GROKBOT_API_BASE_URL || 'https://api2.cursor.sh',
  );
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/' ||
    (base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback))
  )
    throw new AppError(
      'INVALID_CONFIG',
      'Use an HTTPS API origin, or HTTP loopback for local tests.',
    );
  if (!loopback && base.origin !== 'https://api2.cursor.sh') {
    throw new AppError(
      'INVALID_CONFIG',
      'Authentication may only be sent to api2.cursor.sh or a loopback test server.',
    );
  }
  const number = (name: string, fallback: number, min: number, max: number) =>
    z.coerce
      .number()
      .int()
      .min(min)
      .max(max)
      .parse(env[name] || fallback);
  let agents: AgentConfig[] | undefined;
  const raw = env.CALL_GROKBOT_AGENTS?.trim();
  if (raw) {
    const parsed: unknown = raw.startsWith('[')
      ? JSON.parse(raw)
      : raw.split(',');
    agents = z
      .array(z.union([z.string(), agentSchema]))
      .min(1)
      .parse(parsed)
      .map((a) => agentSchema.parse(typeof a === 'string' ? { name: a } : a));
    if (
      new Set(agents.map((a) => a.name.toLowerCase())).size !== agents.length
    ) {
      throw new AppError(
        'INVALID_CONFIG',
        'Agent names must be unique, ignoring case.',
      );
    }
  }
  const disabledTools = (env.CALL_GROKBOT_DISABLED_TOOLS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    disabledTools.some(
      (s) => !['ask', 'check', 'interrupt', 'list'].includes(s),
    )
  ) {
    throw new AppError(
      'INVALID_CONFIG',
      'Unknown disabled tool. Choose ask, check, interrupt or list.',
    );
  }
  const maxWait = number('CALL_GROKBOT_MAX_WAIT_SECONDS', 600, 0, 600);
  return {
    authMode,
    baseUrl: base.origin,
    stateDir:
      env.CALL_GROKBOT_STATE_DIR ||
      (process.platform === 'win32'
        ? join(env.LOCALAPPDATA || homedir(), 'call-grokbot')
        : join(
            env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
            'call-grokbot',
          )),
    cli: env.CALL_GROKBOT_CURSOR_CLI || undefined,
    agents,
    disabledTools,
    maxWait,
    defaultWait: number(
      'CALL_GROKBOT_DEFAULT_WAIT_SECONDS',
      Math.min(45, maxWait),
      0,
      maxWait,
    ),
    requestTimeout: number(
      'CALL_GROKBOT_REQUEST_TIMEOUT_MS',
      20000,
      100,
      60000,
    ),
    settleMs: number('CALL_GROKBOT_SETTLE_MS', 1500, 100, 10000),
  };
}

export function resolveName(
  requested: string | undefined,
  agents?: AgentConfig[],
): string {
  const name =
    requested?.trim() || (agents?.length === 1 ? agents[0]?.name : undefined);
  if (!name || name.length > 255)
    throw new AppError(
      'AGENT_REQUIRED',
      'Supply the exact existing bot name (1–255 characters).',
    );
  if (!agents) return name;
  const match = agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
  if (!match)
    throw new AppError(
      'AGENT_NOT_ALLOWED',
      'This bot is outside CALL_GROKBOT_AGENTS.',
    );
  return match.name;
}
