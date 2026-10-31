# call-grokbot

Ask your existing **Grok Bots** from **Codex** and **Claude Code**. A local
stdio MCP server sends one self-contained task, reads incremental replies, and
can interrupt a contacted bot. Your bot keeps its existing conversation,
memory, and connected tools.

**Unofficial. Not affiliated with, endorsed by, or supported by Cursor /
Anysphere, xAI / Grok, OpenAI, or Anthropic.** The Grok Bot RPC is undocumented
and may change. No public model-inference endpoint is provided.

[简体中文](README.zh-CN.md) · [Authentication details](docs/authentication.md)

## Requirements

- Node.js **22.13+** and npm.
- An account that can use Grok Bot, with an existing bot.
- The separately installed [official Cursor CLI](https://cursor.com/docs/cli/installation).

macOS browser authentication uses the official CLI's login Keychain entries.
Linux and Windows use the official CLI's auth file. Do not copy a token into
MCP configuration. Platform-independent behavior is tested in CI; a real
Grok Bot account was exercised on macOS only.

## Sign in once

Install the version-pinned npm package:

```sh
npm install --global call-grokbot@0.1.1
call-grokbot login
call-grokbot doctor
```

`login` delegates to **the official `agent login` command**. Complete the
account selection and any security check in your browser. No password or API
key is collected by this project. If the browser is on another computer, the
official CLI also supports `NO_OPEN_BROWSER=1` and prints its login URL.

Default authentication is always `browser`, even if `CURSOR_API_KEY` happens
to be set. MCP startup never launches a browser: sign in from a terminal first.

To run from source:

```sh
git clone https://github.com/ZensHQ/call-grokbot.git
cd call-grokbot
npm ci
npm run build
node dist/cli.js login
```

When running from source, replace `call-grokbot` with
`node /absolute/path/to/call-grokbot/dist/cli.js` when using a source checkout.
For JSON/TOML MCP configuration, set `command` to `node` and `args` to
`["/absolute/path/to/call-grokbot/dist/cli.js"]`.

## Connect Codex

```sh
codex mcp add call-grokbot -- call-grokbot
```

For a bot allowlist and longer tasks, use this in `~/.codex/config.toml`:

```toml
[mcp_servers.call-grokbot]
command = "npx"
args = ["--yes", "call-grokbot@0.1.1"]
startup_timeout_sec = 30
tool_timeout_sec = 660
env = { CALL_GROKBOT_AGENTS = "Research Bot" }
```

`Research Bot` is an example: enter a name that already exists in your app.
Restart the client or open a new session after changing MCP configuration.
For the bundled consultation skill and plugin:

```sh
codex plugin marketplace add ZensHQ/call-grokbot --ref v0.1.1
codex plugin add call-grokbot@call-grokbot
```

Plugin-only users do not need a global npm install. After installing either
plugin, sign in from a terminal:

```sh
npx --yes call-grokbot@0.1.1 login
npx --yes call-grokbot@0.1.1 doctor
```

Open a new client session. In Codex, invoke `$call-grokbot:consult` and name
your existing bot; in Claude Code, invoke `/call-grokbot:consult`.
Install either the direct server or the plugin to avoid duplicate tools.

## Connect Claude Code

```sh
claude mcp add --transport stdio --scope user call-grokbot -- call-grokbot
```

Or add this `.mcp.json` to a trusted project:

```json
{
  "mcpServers": {
    "call-grokbot": {
      "command": "npx",
      "args": ["--yes", "call-grokbot@0.1.1"],
      "env": {
        "CALL_GROKBOT_AUTH_MODE": "browser",
        "CALL_GROKBOT_AGENTS": "Research Bot"
      }
    }
  }
}
```

The Claude Code plugin includes the same server and a consultation skill:

```text
/plugin marketplace add ZensHQ/call-grokbot
/plugin install call-grokbot@call-grokbot
```

## Four tools

| Tool | Purpose |
| --- | --- |
| `list()` | List existing bots visible to the account, the optional allowlist, and local contacts. Sends no message. |
| `ask({agent, message, wait_seconds})` | Send once to an exact existing bot. A nonexistent or ambiguous name is refused; **no bot is created**. |
| `check({agent, wait_seconds})` | Read unread replies and wait for an existing task. Never resends a message. |
| `interrupt({agent})` | Stop a contacted bot's current turn. It may include work started in the app; completed actions are not undone. |

`agent` may be omitted only when the allowlist contains one bot.
`wait_seconds` defaults to **45**, accepts **0–600**, and returns an initial
snapshot at zero. A result contains `status: "running" | "finished"` and an
optional `reply`. `running` means call `check`; do not repeat `ask`.
`finished` requires the live bot state and turn completion evidence, not just
the first acknowledgement. An interrupted turn may finish without a reply.

An `ask` result may include `earlierReplies` from prior unread messages; keep
them separate from the answer to the new task. `check` advances the local
cursor, so a second check does not repeat already consumed replies. Cursor
values remain decimal strings, including values beyond JavaScript's safe integer
range. Internal tool steps are not returned as replies.

Example prompt:

> Ask Research Bot to compare the two attached deployment approaches. Include
> the latency measurements and budget constraints from this conversation.
> Request three tradeoffs and one recommendation. Research only; make no changes.

## Authentication expiry and logout

```sh
call-grokbot auth status
call-grokbot auth refresh
call-grokbot logout
```

Use `node /absolute/path/to/call-grokbot/dist/cli.js` for a source checkout.
`auth refresh` opens another **official browser sign-in**. The
installed official CLI's browser session has a fixed lifetime (the session
observed in testing was about 60 days); its `refreshToken` field is **not** a
verified silent-refresh mechanism. This project does not invent an OAuth
refresh endpoint or promise endless unattended browser authentication.

Each authenticated request reads the latest official credentials. A successful
re-login is picked up without restarting the MCP server. Expired, revoked or
missing credentials stop the tool and tell you to sign in again. `doctor`
reports expiry without displaying tokens; ask/check also warn within five
minutes of browser-session expiry. **Logout signs out the shared
official Cursor CLI session**; other programs using that login must also sign
in again. Local contacts remain, so account-specific read cursors can resume.
Logout does not stop cloud bot work or undo completed actions.

An optional explicit `CALL_GROKBOT_AUTH_MODE=api-key` mode supports unattended
short-token renewal. It reads `CALL_GROKBOT_API_KEY`, `CURSOR_API_KEY`, an explicit
`CURSOR_API_KEY_FILE`, then `CURSOR_SERVICE_ACCOUNT_KEY`. It exchanges the key
for a short-lived session, shares concurrent exchanges, renews before expiry,
and retries an authenticated **read** once when a new token is obtained.
The tested personal key had both **Sign in to the Cursor CLI and SDK** and
**Run agents** enabled; the minimal grant set is not established. Service-account
access to personal bots is not verified. No key is stored by this package.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `CALL_GROKBOT_AUTH_MODE` | `browser` | `browser` or explicit `api-key` |
| `CALL_GROKBOT_CURSOR_CLI` | auto-detect | Absolute path to the official `agent` executable |
| `CALL_GROKBOT_AGENTS` | all existing bots | Comma-separated names, or a JSON array of names / `{name,description}` objects |
| `CALL_GROKBOT_DEFAULT_WAIT_SECONDS` | `45` | Default tool wait, capped by the maximum |
| `CALL_GROKBOT_MAX_WAIT_SECONDS` | `600` | Maximum allowed tool wait |
| `CALL_GROKBOT_REQUEST_TIMEOUT_MS` | `20000` | Timeout per unary HTTP request |
| `CALL_GROKBOT_SETTLE_MS` | `1500` | Quiet interval after confirmed completion |
| `CALL_GROKBOT_DISABLED_TOOLS` | empty | Comma-separated tool names to omit |
| `CALL_GROKBOT_STATE_DIR` | OS state directory | Local contacts and cross-process locks |
| `CALL_GROKBOT_API_BASE_URL` | `https://api2.cursor.sh` | Official origin or a loopback test server; other hosts are refused |

Default state is `$XDG_STATE_HOME/call-grokbot` or
`~/.local/state/call-grokbot`, and `%LOCALAPPDATA%/call-grokbot` on Windows.
State contains only bot identifiers, cursors, timestamps, and pending message
receipts. It is partitioned by the authenticated subject and origin. POSIX
files use 0600 and directories 0700; Windows access follows the user profile ACL.
Raw tokens, keys, conversation text, and browser cookies are never saved here.

## Recovery and boundaries

- **Unconfirmed send:** the message ID is saved before dispatch. Use `check` to
  inspect delivery and replies. Messages and interrupts are never retried
  automatically, even after timeouts or HTTP 5xx. Do not resend blindly.
- **Cancellation / stream error:** the unread cursor is preserved. If a message
  was sent, its pending receipt survives and `check` can resume it.
- **Pending task:** a second `ask` is refused until `check` observes completion.
  Per-bot file locks also prevent two local clients interleaving sends.
- **Corrupt state or transcript reset:** fail closed. Back up `state.json` and
  resolve the affected contact only after checking the real conversation.
- **Permission 403:** a valid login does not guarantee access to this undocumented
  RPC. No alternate account, bot creation or permission expansion is attempted.

These tools operate on the account's real bot conversations. A bot cannot see
your IDE context unless you include it; included code and text leave your
machine for the service. Bot replies may contain untrusted external material.
An allowlist limits this client, **not** the account permissions of the login.
No browser debugging port, saved browser-cookie extraction, HTTP/SSE listener,
approval bypass, or Grok model subscription proxy is used.

## Development and tests

```sh
npm ci
npm run check
npm test
npm run typecheck
npm pack --dry-run
```

Tests cover credential rotation, expiry/logout, API-key renewal concurrency,
account isolation, large cursors, fragmented Connect frames, read retries,
non-retried writes, pending-send recovery, cancellation, cross-process state
writes, interrupts during a waiting ask, and MCP discovery / schemas / calls.

For an opt-in real test against a dedicated existing bot:

```sh
CALL_GROKBOT_LIVE_AGENT="Your Test Bot" npm run test:live
```

It sends a real PONG message, verifies incremental read and confirmed completion,
and invokes interrupt after completion. It never modifies a bot profile. Live
artifacts are gitignored and contain no credentials. See
[verification notes](docs/verification.md) for the exact tested boundaries.

By [Zens AI](https://zens.ai). MIT. See [NOTICE.md](NOTICE.md) for independent implementation and references.
