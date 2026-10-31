# Independent, unofficial implementation

call-grokbot is not affiliated with, endorsed by, or supported by Cursor,
Anysphere, xAI, Grok, OpenAI, or Anthropic. Product names identify compatible
clients and services; their trademarks belong to their owners.

This repository implements a small Connect-RPC JSON client independently.
It contains no Cursor BDK distribution, proprietary implementation, bundled
protobuf descriptors, credentials, or third-party skill text. The official
Cursor CLI remains a separately installed authentication dependency.

Research references: the user-supplied 0.2.28 behavior specification;
https://cursor.com/docs/cli/reference/authentication;
https://github.com/Kenzim/grokbot-client (protocol behavior);
https://github.com/modelcontextprotocol/typescript-sdk (MCP SDK).

Grok Bot RPCs are undocumented and may change. A working login is not an
endorsement of this client or a guarantee of future API availability.
