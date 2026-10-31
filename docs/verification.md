# Verification

## Automated checks

The initial 0.1.0 source passed 61 tests, lint/format checks, a strict TypeScript
check, production build, npm packing, and installation of the resulting tarball
into a separate temporary directory on macOS.

The test suite uses synthetic identities, response fixtures and local temporary
directories; it requires no account. It exercises auth expiry/rotation/logout,
explicit API-key renewal, RPC wire format, fragmented streams, retry boundaries,
per-account cursor isolation, concurrent subprocess writes, ambiguous sends,
client cancellation and concurrent interrupt. The MCP SDK's linked transports
verify tool discovery, input/output schemas, controlled errors and all four calls.

CI targets Node 22 and 24 on Linux, macOS and Windows. A green CI run does not
establish that a real account can authenticate on every platform.

## Real-account evidence

On 2026-10-31 the official Cursor CLI `2026.10.22-27dcf5f` browser login on
macOS authenticated a read-only bot listing and sent a test to an existing bot.
The bot returned an exact PONG marker. The manual API-key sources were disabled.
Credentials remained in macOS Keychain and were not copied to this repository.

The opt-in `test:live` script launches the built stdio server, discovers all four
MCP tools, lists the selected bot, sends one uniquely marked PONG task with zero
initial wait, resumes with check, requires a confirmed finished state, checks
that the next read does not repeat the reply, and calls interrupt after the
completed task. Its detailed report is written to gitignored `artifacts/`.

An interrupt after completion may report false because no task is active.
A separate release-package test installed the real tarball into a temporary
directory, launched its stdio entry point, sent a PONG task and immediately
interrupted it. The real service returned `hadActiveRun: true`, and check
subsequently confirmed the interrupted turn had finished. Concurrent interrupt
during a waiting ask is also covered by deterministic fixtures.

Both Claude Code's real CLI and Codex CLI `0.165.0-alpha.1.2` completed
list → ask with zero wait → check against the existing test bot and returned
their exact PONG markers with finished status. Codex's app-server runtime also
discovered all four tools and completed a real round trip through
`mcpServer/tool/call` in an ephemeral test session. Those calls used the default
browser login; no API key was supplied. The CLI tests used temporary MCP
configuration and did not install or overwrite the user's global server list.

Real logout used the official CLI, after which doctor reported unauthenticated.
`auth refresh` then completed another official browser sign-in, doctor reported
authenticated with a new expiry, and the stdio live test passed again. The
user's official CLI login was restored after testing.

## Known limits

- Browser sessions need an interactive login at fixed expiry. There is no live
  test proving a silent refresh after 60 days, and the implementation does not
  claim one.
- RPC schemas are undocumented. Explicit failures preserve pending message
  receipts and unread positions; there is no public API availability guarantee.
- A bot can be used concurrently in the app. Local locks coordinate this
  package's clients, not unrelated remote callers or human app users.
- Real Windows/Linux login, keychain-denial UI, and external network failures
  are not established by synthetic tests.
- A public npm publication or plugin-directory listing is separate from local
  source tests and must be checked in its registry/host after publishing.
  The plugin uses npx with a pinned npm package version. Release verification
  must include registry metadata and installation of that published version.
