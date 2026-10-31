import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const agent = process.env.CALL_GROKBOT_LIVE_AGENT;
if (!agent)
  throw new Error(
    'Set CALL_GROKBOT_LIVE_AGENT to a dedicated existing test bot. This test sends a real message.',
  );
const dir = resolve('artifacts/live-state');
await mkdir(dir, { recursive: true, mode: 0o700 });
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => typeof value === 'string'),
);
for (const key of [
  'CURSOR_API_KEY',
  'CURSOR_API_KEY_FILE',
  'CALL_GROKBOT_API_KEY',
  'CURSOR_SERVICE_ACCOUNT_KEY',
  'CURSOR_AUTH_TOKEN',
])
  delete env[key];
Object.assign(env, {
  CALL_GROKBOT_AUTH_MODE: 'browser',
  CALL_GROKBOT_AGENTS: agent,
  CALL_GROKBOT_STATE_DIR: dir,
});
const client = new Client({ name: 'call-grokbot-live-test', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/cli.js'],
  env,
  stderr: 'pipe',
});
let stderr = '';
transport.stderr?.on('data', (data) => {
  stderr += data.toString();
});
const report = {
  startedAt: new Date().toISOString(),
  authMode: 'browser',
  steps: [],
};
async function call(name, args) {
  const result = await client.callTool({ name, arguments: args }, undefined, {
    timeout: 70000,
  });
  report.steps.push({
    tool: name,
    isError: !!result.isError,
    status: result.structuredContent?.status,
  });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  return result.structuredContent;
}
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 4);
  const bots = await call('list', {});
  assert.equal(bots.available.filter((bot) => bot.name === agent).length, 1);
  if (bots.contacted.some((bot) => bot.name === agent)) {
    const prior = await call('check', { agent, wait_seconds: 15 });
    assert.equal(
      prior.status,
      'finished',
      'Do not send another test while a prior test is still running.',
    );
  }
  const marker = `PONG MCP-${randomUUID().slice(0, 8)}`;
  const first = await call('ask', {
    agent,
    message: `call-grokbot MCP functional test. Reply with exactly ${marker}. Do not use tools or perform any other action.`,
    wait_seconds: 0,
  });
  assert.equal(first.messageSent, true);
  let text = first.reply || '';
  let status = first.status;
  for (let i = 0; i < 4 && status !== 'finished'; i++) {
    const result = await call('check', { agent, wait_seconds: 15 });
    text += result.reply || '';
    status = result.status;
  }
  assert.ok(
    text.includes(marker),
    'The exact bot reply must arrive through the stdio MCP connection.',
  );
  assert.equal(
    status,
    'finished',
    'The actual turn must settle, not just acknowledge.',
  );
  const again = await call('check', { agent, wait_seconds: 0 });
  assert.equal(again.reply, undefined, 'Consumed replies must not repeat.');
  const stop = await call('interrupt', { agent });
  assert.equal(typeof stop.interrupted, 'boolean');
  report.pongReceived = true;
  report.incrementalReadPassed = true;
  report.interruptHadActiveRun = stop.interrupted;
  report.passed = true;
  assert.equal(
    stderr.trim(),
    '',
    'Successful stdio sessions must not emit secret/debug noise.',
  );
} catch (error) {
  report.passed = false;
  report.failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  await client.close();
  await transport.close();
  report.completedAt = new Date().toISOString();
  await writeFile(
    'artifacts/live-smoke.json',
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
