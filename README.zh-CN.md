# call-grokbot

让 **Codex** 和 **Claude Code** 调用你已有的 **Grok Bot**：发送任务、增量读取回复、继续等待，以及停止当前任务。Bot 保留原来的对话、记忆和已连接工具。

**非官方项目**，与 Cursor / Anysphere、xAI / Grok、OpenAI、Anthropic 没有隶属、背书或官方支持关系。Grok Bot RPC 尚未公开，可能随服务更新而变化。

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md)

[认证细节（英文）](docs/authentication.md)

## 开始前准备

- 安装 Node.js **22.13+**、npm 和 Git。
- 安装并登录你要使用的 **Codex** 或 **Claude Code**。客户端账号与下面的 Cursor 登录是两套独立认证。
- 单独安装 [Cursor 官方 CLI](https://cursor.com/docs/cli/installation)。
- 准备能使用 Grok Bot 的账号，以及至少一个已有 Bot。调用时使用 App 中显示的精确名称，本工具不会新建 Bot。

选择下面的 **Codex 插件流程**或 **Claude Code 插件流程**。两种插件都自带 `consult` skill，并通过固定版本的 `npx` 启动 MCP；不需要全局安装 `call-grokbot`、克隆源码、登录 npm 或申请个人 API key。

macOS 读取官方 CLI 的钥匙串，Linux / Windows 读取官方 CLI 的认证文件；不要把 token 复制进 MCP 配置。真实账号插件流程已在 macOS 验证，Linux / Windows 有 CI 覆盖，但真实账号登录尚未实测。

当前**插件版本为 0.1.2**，使用的 **npm 程序版本仍为 0.1.1**。启动命令固定使用 npm 官方 tarball 地址，避免 npm 误用当前同名源码仓库，修复 `command not found` 和 MCP `CONNECTION_CLOSED`，同时兼容空缓存首次启动；不需要全局安装 npm 包。

## Codex 插件：安装、登录与调用

### 1. 在终端安装插件

```sh
codex plugin marketplace add ZensHQ/call-grokbot --ref plugin-v0.1.2
codex plugin add call-grokbot@call-grokbot
codex plugin list
```

确认列表中的 `call-grokbot@call-grokbot` 已安装并启用。这些命令在**终端**运行。如果 Codex 不识别 `plugin`，先更新到支持插件命令的版本；见 [Codex 官方插件文档](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)。

### 2. 在终端登录 Bot 所属账号

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

`login` 调用官方 `agent login`。在浏览器中选择 **Bot 所属账号**，完成可能出现的安全检查。随后 `doctor` 应显示 `"authenticated": true`、`"authMode": "browser"` 和 `"cursorCliFound": true`，不会输出凭据。

### 3. 打开新 Codex 会话并调用 skill

在你要工作的项目目录中启动：

```sh
codex
```

在 **Codex 对话框**中输入下面的提示词，不要当作终端命令运行：

```text
$call-grokbot:consult 列出我已有的 Bot，不要发送消息。
```

从返回结果中选择一个精确名称，再发送测试请求。把下面的 `研究助手` 换成你自己的 Bot 名称：

```text
$call-grokbot:consult 请让已有 Bot「研究助手」只回复 PONG。
只发送一次任务；如果仍在 running，继续用 check 等到 finished，不要重新发送。
```

这会在该 Bot 的真实对话中留下一条消息。验收时同时确认收到 `PONG` 和状态 `finished`，不能把“收到任务”当成完成。日常使用时，把测试请求换成完整任务说明，写明相关事实、限制、允许的操作和期望结果。

## Claude Code 插件：安装、登录与调用

### 1. 在终端安装插件

```sh
claude plugin marketplace add ZensHQ/call-grokbot
claude plugin install call-grokbot@call-grokbot --scope user
claude plugin list
```

确认 `call-grokbot@call-grokbot` 已启用。`user` 范围表示当前电脑上你的 Claude Code 项目都可以使用。如果已经在 Claude Code 对话中，也可以运行：

```text
/plugin marketplace add ZensHQ/call-grokbot
/plugin install call-grokbot@call-grokbot
```

在交互安装面板中选择 **Install for you（user scope）**。其他安装范围见 [Claude Code 官方插件文档](https://code.claude.com/docs/en/discover-plugins)。

### 2. 在终端登录 Bot 所属账号

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

在官方浏览器登录流程中选择 Bot 所属账号。检查 `doctor` 返回的 `"authenticated": true`、`"authMode": "browser"` 和 `"cursorCliFound": true`。如果同一台电脑已经为 Codex 插件完成登录，两种插件共用官方 CLI 会话，运行 `npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor` 确认即可，不必重复登录。

### 3. 检查连接，打开新 Claude Code 会话

在终端运行：

```sh
claude mcp list
claude
```

健康检查中应能看到 `plugin:call-grokbot:call-grokbot` 已连接。等 MCP 连接完成再发起第一次请求；如果安装前已有会话，重新打开会话，让它加载插件和 skill。

在 **Claude Code 对话框**中输入：

```text
/call-grokbot:consult 列出我已有的 Bot，不要发送消息。
```

把 `研究助手` 换成列表中已有 Bot 的精确名称，再发送：

```text
/call-grokbot:consult 请让已有 Bot「研究助手」只回复 PONG。
只发送一次任务；如果仍在 running，继续用 check 等到 finished，不要重新发送。
```

这同样会发送真实消息。确认收到 `PONG` 且任务状态为 `finished`。实际工作时，应把相关内容写进任务说明；Bot 不会自动看到 Claude Code 对话和本地项目文件。

## 安装与连接排查

| 现象 | 处理方法 |
| --- | --- |
| `call-grokbot: command not found` | 插件不会安装全局命令。在终端使用 `npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login` 或 `npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor`。 |
| 在 call-grokbot 源码目录报 `command not found` 或 `CONNECTION_CLOSED` | 更新到插件 0.1.2，使用固定的 npm tarball 地址。只修改终端命令不会自动更新已安装插件的启动配置；旧的 `--global` 临时方案在空缓存下仍可能失败。 |
| `CLI_MISSING` | 安装上面链接中的 Cursor 官方 CLI。若安装在非标准位置，用 `CALL_GROKBOT_CURSOR_CLI` 指定可执行文件的绝对路径。 |
| `AUTH_REQUIRED` / `AUTH_EXPIRED` | 重新运行固定版本的 `npx` 登录命令，完成浏览器登录后运行 `npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor`。MCP 启动不会自动打开登录页。 |
| 看不到 skill 或 MCP 工具 | 用 `codex plugin list` 或 `claude plugin list` 确认插件已安装并启用，再打开新会话。只有 MCP 配置时不会带有 skill。 |
| Claude Code 提示工具不可用或仍在连接 | 等待 MCP 启动，用 `claude mcp list` 检查；确认已连接后，若原会话仍看不到工具，再开新会话。对可能已经发送的任务不要重发。 |
| 找不到 Bot 或返回 403 | 核对 Bot 精确名称及浏览器登录账号。登录有效不等于拥有未公开 RPC 的访问权限；参见下方“并发与恢复”。 |

## 更新已安装的插件

Codex marketplace 若固定在旧 tag，不会自动跳到新 tag。在终端执行以下命令，切换到本次插件版本：

```sh
codex plugin remove call-grokbot@call-grokbot
codex plugin marketplace remove call-grokbot
codex plugin marketplace add ZensHQ/call-grokbot --ref plugin-v0.1.2
codex plugin add call-grokbot@call-grokbot
```

Claude Code 的 user 范围安装使用：

```sh
claude plugin marketplace update call-grokbot
claude plugin update call-grokbot@call-grokbot --scope user
```

更新后打开新会话。官方 Cursor CLI 登录独立于插件安装，有效期内无需重新登录。

## 可选：只配置 MCP

仅需要四个工具时，可以用下面的方式**代替插件安装**；同一客户端不要同时安装两套，以免出现重复工具。直接 MCP 配置不包含 `consult` skill，使用普通提示词要求客户端调用 call-grokbot 工具即可。

先在终端完成相同的登录检查：

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

Codex 在终端注册：

```sh
codex mcp add call-grokbot -- npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz
```

若需要 Bot 白名单和更长超时，在 `~/.codex/config.toml` 中配置同一个条目：

```toml
[mcp_servers.call-grokbot]
command = "npx"
args = ["--yes", "https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz"]
startup_timeout_sec = 30
tool_timeout_sec = 660
env = { CALL_GROKBOT_AGENTS = "研究助手" }
```

Claude Code 在终端注册：

```sh
claude mcp add --transport stdio --scope user call-grokbot -- npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz
```

也可以在可信项目中使用下面的 `.mcp.json`，代替 user 范围的配置：

```json
{
  "mcpServers": {
    "call-grokbot": {
      "command": "npx",
      "args": ["--yes", "https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz"],
      "env": {
        "CALL_GROKBOT_AUTH_MODE": "browser",
        "CALL_GROKBOT_AGENTS": "研究助手"
      }
    }
  }
}
```

把 `研究助手` 换成已有 Bot 的精确名称。修改 MCP 配置后打开新会话。

## 可选：全局安装或源码运行

若希望直接使用 `call-grokbot` 命令，可以先运行 `npm install --global call-grokbot@0.1.1`，然后用 `call-grokbot login`、`doctor` 等子命令代替固定版本的 `npx` 写法。

源码运行：

```sh
git clone https://github.com/ZensHQ/call-grokbot.git
cd call-grokbot
npm ci
npm run build
node dist/cli.js login
node dist/cli.js doctor
```

在其他目录使用 `node /绝对路径/call-grokbot/dist/cli.js` 执行命令。MCP 配置中将 `command` 改成 `node`，`args` 改成 `["/绝对路径/call-grokbot/dist/cli.js"]`。

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
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz auth status
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz auth refresh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz logout
```

默认认证为 `browser`，即使环境中存在 `CURSOR_API_KEY` 也不会自动切换。浏览器位于另一台电脑时，可以设置 `NO_OPEN_BROWSER=1` 运行登录，让官方 CLI 输出登录链接。源码运行时，使用 `node /绝对路径/call-grokbot/dist/cli.js` 执行这些子命令。

当前官方浏览器会话有固定有效期，本次实测约 60 天。CLI 保存的 `refreshToken` 不是已验证的静默刷新能力。程序每次请求都会重读最新凭据，重新登录后无需重启 MCP；ask/check 在到期前五分钟提示续期，过期或被撤销时停止调用并提示登录。`auth refresh` 会重新走官方浏览器授权，不能宣称无限自动续期。

`logout` 退出的是**共享的官方 Cursor CLI 登录**；其他复用该登录的程序也需要重新登录。退出不会取消云端 Bot 已经开始的任务，本地联系人和游标保留，但按账号隔离，不会给另一个账号读取。

如果确实需要无人值守，可显式选择 `CALL_GROKBOT_AUTH_MODE=api-key`。该模式会在短期令牌到期前自动重新交换，并合并并发刷新；密钥只从环境变量或明确指定的文件读取，不由本工具保存。默认浏览器模式不会因为环境里有 API key 就悄悄切换。

## 并发与恢复

- 同一 Bot 在本机多个 IDE 之间使用文件锁，避免同时发送；本地状态原子写入。
- 发送前先记录 message ID。网络中断或结果不确定时保留待确认记录，不自动重试写操作。
- 取消或读取失败不会推进未交付回复的游标；用 `check` 恢复。
- 状态损坏、游标重置或权限错误时明确报错，不静默清空待确认任务、不绕过权限。登录有效但返回 403 时停止调用，不自动扩权或新建 Bot 绕过。
- Bot 白名单只约束本工具，不会把账号登录权限缩小到单个 Bot。

默认状态目录为 `~/.local/state/call-grokbot`（或 `$XDG_STATE_HOME/call-grokbot`），Windows 为 `%LOCALAPPDATA%/call-grokbot`。只保存联系人、游标、时间和待确认回执，不保存会话正文或令牌。POSIX 文件 0600、目录 0700；Windows 使用用户目录 ACL。

## 功能测试

```sh
npm ci
npm run check
npm test
npm run typecheck
npm run test:plugins
npm pack --dry-run
```

`test:plugins` 每次使用全新的匿名 npm 缓存，下载固定版本的公开 npm 程序，分别从源码仓库、其他项目和同名同版本的测试目录启动两端插件，验证四个工具可被发现；不读取账号、不发送 Bot 消息。它需要网络访问，也在 CI 中运行。

对专用测试 Bot 做真实调用：

```sh
CALL_GROKBOT_LIVE_AGENT="测试 Bot 名称" npm run test:live
```

这会向真实对话发送一条 PONG 消息，验证 stdio MCP、续读、完成判断和完成后的 interrupt。主动中断等待中的任务、取消、账号切换、并发写入和认证异常由自动化夹具测试覆盖。真实账号验证平台为 macOS；其他系统的账号登录尚未实测。

作者：[Zens AI](https://zens.ai)。更多边界见 [验证说明](docs/verification.md)。许可证 MIT。
