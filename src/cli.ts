#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { cursorCommand, findCursorCli, RELOGIN } from './auth.js';
import { readConfig } from './config.js';
import { AppError, Redactor } from './errors.js';
import { createApp, createServer } from './server.js';
import { VERSION } from './version.js';

const help = `call-grokbot ${VERSION} — unofficial local MCP bridge

call-grokbot                 Start MCP over stdio (no browser or login prompts)
call-grokbot login           Official Cursor CLI browser sign-in
call-grokbot auth refresh    Renew a browser session by signing in again
call-grokbot logout          Official Cursor CLI logout (shared login)
call-grokbot auth status     Sanitized authentication status; no token output
call-grokbot doctor          Check authentication and CLI availability
call-grokbot --version

Install the official CLI from https://cursor.com/docs/cli/installation.
Default: official browser login. Configure CALL_GROKBOT_AGENTS for a bot allowlist.
Browser sessions cannot silently renew indefinitely; expired sessions need login.
Optional CALL_GROKBOT_AUTH_MODE=api-key enables automatic short-token exchanges.
`;
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(help);
    return;
  }
  const config = readConfig();
  const authCommand = args[0] === 'auth' ? args[1] : args[0];
  if (authCommand === 'login' || authCommand === 'refresh') {
    await cursorCommand(config, 'login');
    return;
  }
  if (authCommand === 'logout') {
    await cursorCommand(config, 'logout');
    process.stdout.write(
      'Logged out of the shared official Cursor CLI browser session. Running bot tasks are not undone.\n',
    );
    if (config.authMode === 'api-key')
      process.stdout.write(
        'API-key mode is separate: remove its environment variable or private key file to disable it.\n',
      );
    return;
  }
  const app = createApp(config);
  if (authCommand === 'status' || authCommand === 'doctor') {
    let cli: string | undefined;
    try {
      cli = await findCursorCli(config);
    } catch {
      /* report missing CLI */
    }
    try {
      const id = await app.auth.identity();
      process.stdout.write(
        `${JSON.stringify({ authenticated: true, authMode: config.authMode, cursorCliFound: !!cli, expiresAt: new Date(id.expiresAt).toISOString(), expiringSoon: id.expiresAt - Date.now() < 300000, renewal: config.authMode === 'browser' ? 'official-browser-sign-in-required-at-expiry' : 'automatic-api-key-exchange', credentialStorage: config.authMode === 'browser' ? (process.platform === 'darwin' ? 'official-cli-macos-keychain' : 'official-cli-auth-file') : 'environment-or-explicit-key-file' })}\n`,
      );
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ authenticated: false, authMode: config.authMode, cursorCliFound: !!cli, error: app.redactor.clean(error), next: RELOGIN })}\n`,
      );
      process.exitCode = 1;
    }
    return;
  }
  if (args.length && args[0] !== 'serve')
    throw new AppError(
      'INVALID_COMMAND',
      'Unknown command. Run call-grokbot --help.',
    );
  const server = createServer(config, app);
  await server.connect(new StdioServerTransport());
  const shutdown = async () => {
    await server.close();
    process.exitCode = 0;
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
main().catch((error) => {
  process.stderr.write(`${new Redactor().clean(error)}\n`);
  process.exitCode = 1;
});
