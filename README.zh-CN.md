# call-grokbot

让 **Codex** 和 **Claude Code** 调用你已有的 **Grok Bot**：发送任务、增量读取回复、继续等待，以及停止当前任务。Bot 保留原来的对话、记忆和已连接工具。

**非官方项目**，与 Cursor / Anysphere、xAI / Grok、OpenAI、Anthropic 没有隶属、背书或官方支持关系。Grok Bot RPC 尚未公开，可能随服务更新而变化。

[English](README.md) · [认证细节](docs/authentication.md)

## 安装与登录

需要 Node.js **22.13+**、npm、已有 Grok Bot，以及单独安装的 [Cursor 官方 CLI](https://cursor.com/docs/cli/installation)。

使用 npm 安装固定版本：

```sh
npm install --global call-grokbot@0.1.0
call-grokbot login
call-grokbot doctor
```

登录命令调用官方 `agent login`。在浏览器选择 Bot 所属账号并完成安全检查，不需要手工申请或复制 API key。macOS 读取官方 CLI 的钥匙串；Linux / Windows 读取官方 CLI 的认证文件。MCP 服务不会在后台突然打开登录页。

源码安装：克隆本仓库后运行 `npm ci`、`npm run build`，然后执行 `node dist/cli.js login`。下面命令中的 `call-grokbot` 可替换为 `node /绝对路径/call-grokbot/dist/cli.js`；JSON/TOML 中将 `command` 改成 `node`，`args` 改成 `["/绝对路径/call-grokbot/dist/cli.js"]`。

## Codex 接入

```sh
codex mcp add call-grokbot -- call-grokbot
```

推荐在 `~/.codex/config.toml` 中显式设置超时和 Bot 白名单：

```toml
[mcp_servers.call-grokbot]
command = "npx"
args = ["--yes", "call-grokbot@0.1.0"]
startup_timeout_sec = 30
tool_timeout_sec = 660
env = { CALL_GROKBOT_AGENTS = "你的 Bot 精确名称" }
```

也可安装带咨询 skill 的插件，避免与直接 MCP 配置重复安装：

```sh
codex plugin marketplace add ZensHQ/call-grokbot --ref v0.1.0
codex plugin add call-grokbot@call-grokbot
```

## Claude Code 接入

```sh
claude mcp add --transport stdio --scope user call-grokbot -- call-grokbot
```

或者使用仓库中的 Claude Code 插件：

```text
/plugin marketplace add ZensHQ/call-grokbot
/plugin install call-grokbot@call-grokbot
```

修改 MCP 配置后打开新会话。项目 `.mcp.json`、完整环境变量和源码接入示例见英文文档。

## 四个工具

| 工具 | 功能 |
| --- | --- |
| `list` | 列出账号可见的已有 Bot、配置白名单和本机联系人；不发消息 |
| `ask` | 向精确匹配的已有 Bot 发送一次自包含任务；名称不存在或重复时拒绝，绝不新建 Bot |
| `check` | 继续等待并读取尚未消费的回复；绝不重发消息 |
| `interrupt` | 停止已联系 Bot 的当前任务；不能撤销已执行的操作 |

`wait_seconds` 默认 45，范围 0–600；0 表示读取初始快照后返回。`running` 要继续调用 `check`，不能再次 `ask`。`finished` 需要实际运行状态与完成证据，不能把一句“收到”当成任务结束。`earlierReplies` 是以前的未读回复，必须和本次答案分开。

Bot 看不到 IDE 会话、文件或前面的工具结果。消息中应包含必要事实、限制、允许的行为和期望输出；不要发送凭据或无关私密信息。

## 到期、续期与退出

```sh
call-grokbot auth status
call-grokbot auth refresh
call-grokbot logout
```

源码运行时，使用 `node /绝对路径/call-grokbot/dist/cli.js` 执行这些子命令。

当前官方浏览器会话有固定有效期，本次实测约 60 天。CLI 保存的 `refreshToken` 不是已验证的静默刷新能力。程序每次请求都会重读最新凭据，重新登录后无需重启 MCP；ask/check 在到期前五分钟提示续期，过期或被撤销时停止调用并提示登录。`auth refresh` 会重新走官方浏览器授权，不能宣称无限自动续期。

`logout` 退出的是**共享的官方 Cursor CLI 登录**；其他复用该登录的程序也需要重新登录。退出不会取消云端 Bot 已经开始的任务，本地联系人和游标保留，但按账号隔离，不会给另一个账号读取。

如果确实需要无人值守，可显式选择 `CALL_GROKBOT_AUTH_MODE=api-key`。该模式会在短期令牌到期前自动重新交换，并合并并发刷新；密钥只从环境变量或明确指定的文件读取，不由本工具保存。默认浏览器模式不会因为环境里有 API key 就悄悄切换。

## 并发与恢复

- 同一 Bot 在本机多个 IDE 之间使用文件锁，避免同时发送；本地状态原子写入。
- 发送前先记录 message ID。网络中断或结果不确定时保留待确认记录，不自动重试写操作。
- 取消或读取失败不会推进未交付回复的游标；用 `check` 恢复。
- 状态损坏、游标重置或权限错误时明确报错，不静默清空待确认任务、不绕过权限。
- Bot 白名单只约束本工具，不会把账号登录权限缩小到单个 Bot。

默认状态目录为 `~/.local/state/call-grokbot`（或 `$XDG_STATE_HOME/call-grokbot`），Windows 为 `%LOCALAPPDATA%/call-grokbot`。只保存联系人、游标、时间和待确认回执，不保存会话正文或令牌。POSIX 文件 0600、目录 0700；Windows 使用用户目录 ACL。

## 功能测试

```sh
npm ci
npm run check
npm test
npm run typecheck
npm pack --dry-run
```

对专用测试 Bot 做真实调用：

```sh
CALL_GROKBOT_LIVE_AGENT="测试 Bot 名称" npm run test:live
```

这会向真实对话发送一条 PONG 消息，验证 stdio MCP、续读、完成判断和完成后的 interrupt。主动中断等待中的任务、取消、账号切换、并发写入和认证异常由自动化夹具测试覆盖。真实账号验证平台为 macOS；其他系统的账号登录尚未实测。

作者：[Zens AI](https://zens.ai)。更多边界见 [验证说明](docs/verification.md)。许可证 MIT。
