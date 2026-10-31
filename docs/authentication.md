# Authentication contract

The default provider consumes the official Cursor CLI login. `login` and
`auth refresh` invoke its supported browser command; `logout` invokes its
supported logout command. This project does not implement a separate OAuth app,
request a user's password, read web cookies, or copy an official credential into
its state directory. It never starts a login flow from an MCP tool handler.

On macOS the access token is read from `cursor-access-token` / `cursor-user`
using `/usr/bin/security`, the same mechanism used by the inspected official
CLI. On Linux the source is `$XDG_CONFIG_HOME/cursor/auth.json` or
`~/.config/cursor/auth.json`; on Windows it is `%APPDATA%/Cursor/auth.json`.
Only the access token is consumed in browser mode. The official refresh token
is not extracted. If the OS denies access, the tool fails with login guidance.

Before each request, credentials are read again. This observes re-login,
rotation and logout across processes. A tool binds to one JWT subject: a change
of account mid-call is rejected before further requests and before returning
results. Contacts are keyed by SHA-256 of origin and subject, not by the token
itself, so a rotated session for the same account keeps its cursor.

## What renewal actually means

Inspection and testing of official CLI `2026.10.22-27dcf5f` established:

- Browser login stores an access token and a refresh token, but no API key.
- The observed browser access token lasts about 60 days.
- The CLI's automatic renewal path exchanges a saved or environment API key.
  It does not send the saved browser refresh token to a refresh endpoint.

Consequently browser mode **cannot silently extend a session indefinitely**.
The honest recovery is another official browser login. `auth status`/`doctor`
shows expiry and an `expiringSoon` flag. An expired session produces
`AUTH_EXPIRED`; a revoked one produces `AUTH_REJECTED`; both provide the login
command. Re-login is read automatically by running MCP processes.

The optional explicit API-key provider uses
`POST /auth/exchange_user_api_key` on the configured origin. It caches only the
short access token in memory, refreshes five minutes before its expiry, merges
concurrent exchanges for the same key, and isolates overlapping key rotations.
An authenticated read may retry once with a newly obtained token after 401.
Write requests are never automatically retried, including after 401.

No refresh endpoint is guessed, no browser protection is disabled, and no
additional scope is requested automatically. A personal key with both CLI/SDK
sign-in and Run agents grants worked during research; minimal permissions and
service-account access to personal bots remain unverified.

Browser login is more convenient than manually managing a key, but it is not a
single-bot permission grant. Keep the MCP connection local and configure a bot
allowlist when appropriate. Logout affects the shared official CLI login and
does not revoke an API key managed separately in a client configuration.

References: [official CLI authentication](https://cursor.com/docs/cli/reference/authentication),
[official CLI installation](https://cursor.com/docs/cli/installation).
