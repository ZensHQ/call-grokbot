import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const codex = (await readJson('../plugins/codex/mcp.json')).mcpServers[
  'call-grokbot'
];
const legacy = (await readJson('../plugins/codex/.mcp.json')).mcpServers[
  'call-grokbot'
];
const claude = (await readJson('../plugins/claude/.mcp.json')).mcpServers[
  'call-grokbot'
];
assert.deepEqual(codex.args, legacy.args);
const runtime = codex.args.find((arg) => arg.startsWith('https://'));
assert.ok(runtime, 'Plugin must pin the official npm tarball URL');
assert.equal(new URL(runtime).origin, 'https://registry.npmjs.org');
const version = /call-grokbot-(\d+\.\d+\.\d+)\.tgz$/.exec(runtime)?.[1];
assert.ok(version, 'Runtime URL must pin an exact version');
const temporary = await mkdtemp(join(tmpdir(), 'call-grokbot-plugin-smoke-'));
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key, value]) =>
      typeof value === 'string' &&
      !key.startsWith('CALL_GROKBOT_') &&
      !/^npm_config_/i.test(key) &&
      !['NPM_TOKEN', 'NODE_AUTH_TOKEN'].includes(key) &&
      ![
        'CURSOR_API_KEY',
        'CURSOR_API_KEY_FILE',
        'CURSOR_SERVICE_ACCOUNT_KEY',
        'CURSOR_AUTH_TOKEN',
      ].includes(key),
  ),
);

env.NPM_CONFIG_CACHE = join(temporary, 'npm-cache');
env.NPM_CONFIG_USERCONFIG = join(temporary, 'user.npmrc');
env.NPM_CONFIG_GLOBALCONFIG = join(temporary, 'global.npmrc');

try {
  await writeFile(env.NPM_CONFIG_USERCONFIG, '');
  await writeFile(env.NPM_CONFIG_GLOBALCONFIG, '');
  for (const [label, cwd, manifest] of [
    ['source-checkout', root, null],
    ['unrelated-project', temporary, { name: 'unrelated', version: '1.0.0' }],
    [
      'same-name-and-version',
      temporary,
      {
        name: 'call-grokbot',
        version,
        bin: { 'call-grokbot': 'missing-local-entry.js' },
      },
    ],
  ]) {
    if (manifest)
      await writeFile(join(cwd, 'package.json'), JSON.stringify(manifest));
    for (const [host, config] of [
      ['codex', codex],
      ['claude', claude],
    ]) {
      const client = new Client({
        name: 'plugin-launch-smoke',
        version: '1.0.0',
      });
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd,
        env: { ...env, ...config.env },
        stderr: 'pipe',
      });
      let startupStderr = '';
      transport.stderr?.on('data', (chunk) => {
        startupStderr = (startupStderr + chunk.toString()).slice(-8192);
      });
      try {
        await client.connect(transport, { timeout: 90000 });
        assert.equal(client.getServerVersion()?.version, version);
        const tools = (await client.listTools()).tools.map((tool) => tool.name);
        assert.deepEqual(tools.sort(), ['ask', 'check', 'interrupt', 'list']);
        console.log(JSON.stringify({ host, cwd: label, passed: true }));
      } catch (error) {
        console.error(
          JSON.stringify({
            host,
            cwd: label,
            npmErrorCodes: [
              ...startupStderr.matchAll(/npm (?:error|ERR!) code (\w+)/g),
            ].map((match) => match[1]),
          }),
        );
        throw error;
      } finally {
        await client.close();
        await transport.close();
      }
    }
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
