import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { createServer } from '../src/server.js';
import { fixture } from './fixture.js';

it('discovers schemas, executes all tools, and returns controlled errors through MCP', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'call-grokbot-mcp-'));
  const f = fixture(dir);
  const server = createServer(f.config, f);
  const client = new Client({ name: 'protocol-test', version: '1' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      'ask',
      'check',
      'interrupt',
      'list',
    ]);
    expect(tools.tools.every((t) => !!t.outputSchema)).toBe(true);
    const bad = await client.callTool({
      name: 'check',
      arguments: { wait_seconds: 0 },
    });
    expect(bad.isError).toBe(true);
    const list = await client.callTool({ name: 'list', arguments: {} });
    expect(list.structuredContent?.available).toEqual([
      { name: 'free', agentId: 'fixture-bot' },
    ]);
    const ask = await client.callTool({
      name: 'ask',
      arguments: { message: 'task', wait_seconds: 1 },
    });
    expect(ask.structuredContent).toMatchObject({
      status: 'finished',
      reply: 'fixture-reply',
    });
    const check = await client.callTool({
      name: 'check',
      arguments: { wait_seconds: 0 },
    });
    expect(check.isError).not.toBe(true);
    const stop = await client.callTool({ name: 'interrupt', arguments: {} });
    expect(stop.structuredContent?.interrupted).toBe(false);
    const prompt = await client.getPrompt({ name: 'consult' });
    expect(prompt.messages).toHaveLength(1);
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
it('removes disabled tools from discovery and dispatch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'call-grokbot-disabled-'));
  const f = fixture(dir, { CALL_GROKBOT_DISABLED_TOOLS: 'interrupt,ask' });
  const server = createServer(f.config, f);
  const client = new Client({ name: 'test', version: '1' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  try {
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([
      'check',
      'list',
    ]);
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
