# call-grokbot

讓 **Codex** 和 **Claude Code** 呼叫你現有的 **Grok Bot**。本機 stdio MCP 伺服器會傳送一次包含完整背景的任務、增量讀取回覆，並可中斷已聯絡 Bot 的工作。Bot 會保留原有的對話、記憶與已連接的工具。

**非官方專案，與 Cursor / Anysphere、xAI / Grok、OpenAI、Anthropic 無隸屬關係，也未獲其背書或支援。** Grok Bot RPC 的規格尚未公開，可能隨服務更新而改變。本專案不提供公開的模型推論端點。

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md)

[驗證與登入詳細說明（英文）](docs/authentication.md)

## 開始前的準備

- 安裝 Node.js **22.13 以上版本**、npm 和 Git。
- 安裝並登入你要使用的 **Codex** 或 **Claude Code**。程式碼助理的帳號與下方 Cursor 登入是兩套不同的驗證。
- 另外安裝 [Cursor 官方 CLI](https://cursor.com/docs/cli/installation)。
- 準備可使用 Grok Bot 的帳號，以及至少一個現有 Bot。呼叫時請使用應用程式中顯示的完整名稱；本工具不會建立 Bot。

選擇下方的 Codex 或 Claude Code 外掛程式安裝流程。兩者都內建 `consult` 技能（skill），透過 `npx` 啟動固定版本的 MCP 程式。不需要全域安裝 `call-grokbot`、複製原始碼、登入 npm 或申請個人 API 金鑰。

macOS 使用官方 CLI 儲存在鑰匙圈的登入資料，Linux 與 Windows 則使用官方 CLI 的驗證檔案。不要將權杖複製到 MCP 設定中。真實帳號的外掛流程已在 macOS 驗證；Linux 與 Windows 有 CI 測試，但尚未以真實帳號測試登入。

目前**外掛版本為 0.1.2**，使用的 **npm 執行程式版本為 0.1.1**。啟動命令固定使用 npm 官方 tarball 網址，避免 npm 誤用目前同名的原始碼目錄，修復本儲存庫內的 `command not found` 與 MCP `CONNECTION_CLOSED`，也支援快取為空時的首次啟動，不需要全域安裝套件。

## Codex 外掛：安裝、登入與呼叫

### 1. 在終端機安裝外掛

```sh
codex plugin marketplace add ZensHQ/call-grokbot --ref plugin-v0.1.2
codex plugin add call-grokbot@call-grokbot
codex plugin list
```

確認 `call-grokbot@call-grokbot` 已安裝並啟用。這些命令要在終端機執行。若 Codex 無法辨識 `plugin`，請先更新至支援外掛命令的版本；可參閱 [Codex 官方外掛文件](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)。

### 2. 在終端機登入 Bot 所屬帳號

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

`login` 會執行官方 Cursor CLI 的 `agent login`。在瀏覽器中選擇擁有該 Bot 的帳號，完成可能出現的安全檢查。`doctor` 應顯示 `"authenticated": true`、`"authMode": "browser"` 與 `"cursorCliFound": true`，不會輸出憑證內容。

### 3. 開啟新 Codex 工作階段並呼叫技能

在要工作的專案目錄中啟動：

```sh
codex
```

在 **Codex 對話框**輸入以下提示，不要當作終端機命令執行：

```text
$call-grokbot:consult 列出我現有的 Bot，不要傳送訊息。
```

從回傳清單選擇 Bot 的完整名稱。將下方 `Research Bot` 換成你的 Bot 名稱：

```text
$call-grokbot:consult 請讓現有 Bot「Research Bot」只回覆 PONG。
任務只傳送一次；若仍為 running，請繼續用 check 等到 finished，不要重新傳送。
```

這會在 Bot 的既有對話中留下真實訊息。請同時確認收到 `PONG` 且狀態為 `finished`；最初的「已收到」不代表任務完成。日常使用時，請將測試內容換成完整任務說明，寫明相關背景、限制、允許的操作與預期結果。

## Claude Code 外掛：安裝、登入與呼叫

### 1. 在終端機安裝外掛

```sh
claude plugin marketplace add ZensHQ/call-grokbot
claude plugin install call-grokbot@call-grokbot --scope user
claude plugin list
```

確認 `call-grokbot@call-grokbot` 已啟用。`user` 範圍可供這台電腦上你的 Claude Code 專案使用。若已在 Claude Code 對話中，也可以執行：

```text
/plugin marketplace add ZensHQ/call-grokbot
/plugin install call-grokbot@call-grokbot
```

在互動安裝面板選擇 **Install for you（user scope）**。其他安裝範圍請參閱 [Claude Code 官方外掛文件](https://code.claude.com/docs/zh-TW/discover-plugins)。

### 2. 在終端機登入 Bot 所屬帳號

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

在官方 Cursor CLI 的瀏覽器登入流程中，選擇 Bot 所屬帳號。確認 `doctor` 回傳 `"authenticated": true`、`"authMode": "browser"` 與 `"cursorCliFound": true`。若同一台電腦已為 Codex 外掛完成登入，兩種外掛會共用該官方 CLI 工作階段，執行上方的 `doctor` 命令確認即可，不必重複登入。

### 3. 檢查連線，開啟新 Claude Code 工作階段

在終端機執行：

```sh
claude mcp list
claude
```

連線檢查應顯示 `plugin:call-grokbot:call-grokbot` 已連線。請等 MCP 完成連線再提出第一個請求。若工作階段在安裝前就已開啟，請重新開啟，讓它載入外掛與技能。

在 **Claude Code 對話框**輸入：

```text
/call-grokbot:consult 列出我現有的 Bot，不要傳送訊息。
```

把 `Research Bot` 換成清單中現有 Bot 的完整名稱：

```text
/call-grokbot:consult 請讓現有 Bot「Research Bot」只回覆 PONG。
任務只傳送一次；若仍為 running，請繼續用 check 等到 finished，不要重新傳送。
```

這也會傳送真實訊息。請確認收到 `PONG` 且任務狀態為 `finished`。實際工作時，請把需要的內容寫進任務說明；Bot 不會自動看到 Claude Code 對話或本機專案檔案。

## 安裝與連線疑難排解

| 狀況 | 處理方式 |
| --- | --- |
| `call-grokbot: command not found` | 外掛不會安裝全域執行命令。請使用上方固定官方 tarball 網址的 `npx` 命令，執行 `login` 或 `doctor`。 |
| 在 call-grokbot 原始碼目錄出現 `command not found` 或 `CONNECTION_CLOSED` | 更新至外掛 0.1.2 並使用固定的 npm tarball 網址。只修正終端機命令不會更新已安裝外掛的啟動設定；舊的 `--global` 暫時方案在空快取下仍可能失敗。 |
| `CLI_MISSING` | 透過上方連結安裝 Cursor 官方 CLI。若位於非標準路徑，請用 `CALL_GROKBOT_CURSOR_CLI` 指定執行檔的絕對路徑。 |
| `AUTH_REQUIRED` 或 `AUTH_EXPIRED` | 重新執行固定版本的 `npx` 登入命令，完成瀏覽器登入後再執行 `doctor`。MCP 啟動時不會自行開啟瀏覽器。 |
| 看不到技能或 MCP 工具 | 用 `codex plugin list` 或 `claude plugin list` 確認已安裝並啟用，再開啟新工作階段。僅設定 MCP 時不會附帶技能。 |
| Claude Code 顯示工具不可用或仍在連線 | 等待 MCP 啟動，用 `claude mcp list` 檢查。若確認已連線但原工作階段仍沒有工具，請開啟新工作階段。對於可能已傳送的任務，不要重新傳送。 |
| 找不到 Bot 或回傳 403 | 核對 Bot 完整名稱與瀏覽器登入的帳號。登入有效並不保證能存取未公開 RPC；請參閱下方「復原方式與限制」。 |

## 更新已安裝的外掛

Codex 市集若固定在舊標籤，不會自動切換至新標籤。在終端機執行以下命令，切換到本次外掛版本：

```sh
codex plugin remove call-grokbot@call-grokbot
codex plugin marketplace remove call-grokbot
codex plugin marketplace add ZensHQ/call-grokbot --ref plugin-v0.1.2
codex plugin add call-grokbot@call-grokbot
```

Claude Code 的 user 範圍安裝使用：

```sh
claude plugin marketplace update call-grokbot
claude plugin update call-grokbot@call-grokbot --scope user
```

更新後請開啟新工作階段。官方 Cursor CLI 登入獨立於外掛安裝，有效期間內不必重新登入。

## 選用：只設定 MCP

若只需要四個 MCP 工具，可用此方式取代外掛安裝。同一用戶端請擇一使用，以免工具重複。這種方式不包含 `consult` 技能；用一般提示要求程式碼助理呼叫 call-grokbot 工具即可。

先在終端機完成相同的登入檢查：

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

在終端機為 Codex 註冊伺服器：

```sh
codex mcp add call-grokbot -- npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz
```

若需要 Bot 允許清單或較長的逾時設定，可在 `~/.codex/config.toml` 設定同一個項目：

```toml
[mcp_servers.call-grokbot]
command = "npx"
args = ["--yes", "https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz"]
startup_timeout_sec = 30
tool_timeout_sec = 660
env = { CALL_GROKBOT_AGENTS = "Research Bot" }
```

在終端機為 Claude Code 註冊伺服器：

```sh
claude mcp add --transport stdio --scope user call-grokbot -- npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz
```

也可在信任的專案中使用以下 `.mcp.json`，取代 user 範圍的設定：

```json
{
  "mcpServers": {
    "call-grokbot": {
      "command": "npx",
      "args": ["--yes", "https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz"],
      "env": {
        "CALL_GROKBOT_AUTH_MODE": "browser",
        "CALL_GROKBOT_AGENTS": "Research Bot"
      }
    }
  }
}
```

將 `Research Bot` 換成現有 Bot 的完整名稱。修改 MCP 設定後請開啟新工作階段。

## 選用：全域安裝或從原始碼執行

若想直接使用全域命令，先執行 `npm install --global call-grokbot@0.1.1`。之後即可用 `call-grokbot login`、`call-grokbot doctor` 等子命令，取代固定網址的 `npx` 寫法。

從原始碼執行：

```sh
git clone https://github.com/ZensHQ/call-grokbot.git
cd call-grokbot
npm ci
npm run build
node dist/cli.js login
node dist/cli.js doctor
```

在其他目錄請使用 `node /absolute/path/to/call-grokbot/dist/cli.js`。JSON/TOML MCP 設定中的 `command` 改為 `node`，`args` 改為 `["/absolute/path/to/call-grokbot/dist/cli.js"]`。

## 四個工具

| 工具 | 用途 |
| --- | --- |
| `list()` | 列出帳號可見的現有 Bot、設定的允許清單及本機聯絡記錄，不傳送訊息。 |
| `ask({agent, message, wait_seconds})` | 向名稱完全符合的現有 Bot 傳送一次任務。名稱不存在或不唯一時拒絕執行，不建立 Bot。 |
| `check({agent, wait_seconds})` | 讀取未讀回覆，並等待現有任務，不重新傳送訊息。 |
| `interrupt({agent})` | 中斷已聯絡 Bot 的目前工作，可能包括在應用程式中開始的工作；無法復原已完成的操作。 |

只有允許清單中恰有一個 Bot 時，才能省略 `agent`。`wait_seconds` 預設 **45**，範圍為 **0–600**；0 代表讀取初始狀態後立即回傳。結果包含 `status: "running" | "finished"`，也可能有 `reply`。`running` 時應使用 `check`，不要再次 `ask`。`finished` 必須有實際執行狀態與回合完成的依據，不能只憑第一則確認訊息判斷。遭中斷的回合可能在沒有回覆的情況下結束。

`ask` 可能回傳 `earlierReplies`，代表較早的未讀回覆，請與本次任務的答案分開。`check` 會推進本機游標，因此再次檢查不會重複回傳已讀回覆。游標一律保留為十進位字串，即使數值超過 JavaScript 安全整數範圍也不例外。內部工具步驟不會當成回覆輸出。

任務提示範例：

> 請 Research Bot 比較貼在這裡的兩種部署方案，包含本次對話中的延遲測量與預算限制。請列出三項取捨並推薦一個方案。僅調查分析，不進行任何變更。

## 到期、重新登入與登出

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz auth status
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz auth refresh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz logout
```

預設驗證方式是 `browser`，即使設有 `CURSOR_API_KEY` 也不會改變。若瀏覽器位於另一台電腦，可設定 `NO_OPEN_BROWSER=1` 執行登入，讓官方 CLI 印出登入網址。

`auth refresh` 會重新走一次官方瀏覽器登入。已安裝的官方 CLI 瀏覽器工作階段有固定有效期限，實測約為 60 天。其 `refreshToken` 欄位並非經過驗證的靜默更新機制。本專案不會自行假設 OAuth 更新端點，也不承諾瀏覽器驗證可無限期自動延長。

每次需要驗證的請求都會重新讀取最新官方憑證。重新登入後不用重啟 MCP。憑證到期、遭撤銷或遺失時會停止呼叫並提示登入。`doctor` 會顯示到期資訊而不輸出權杖；ask/check 也會在到期前五分鐘提醒。

**登出會結束共用的官方 Cursor CLI 登入工作階段**，其他使用同一份登入的程式也須重新登入。本機聯絡記錄會保留，方便從各帳號原有游標接續讀取。登出不會停止雲端 Bot 工作，也不會復原已完成的操作。

若需要無人值守執行，可明確設定 `CALL_GROKBOT_AUTH_MODE=api-key`。此模式依序讀取 `CALL_GROKBOT_API_KEY`、`CURSOR_API_KEY`、指定的 `CURSOR_API_KEY_FILE`，最後是 `CURSOR_SERVICE_ACCOUNT_KEY`。程式將金鑰交換成短期工作階段、合併同時發生的交換，並在到期前更新；僅在取得新權杖後，才會將需要驗證的讀取請求重試一次。實測個人金鑰具備 **Sign in to the Cursor CLI and SDK** 及 **Run agents** 兩項權限，最小必要權限仍未確定；服務帳號能否存取個人 Bot 也尚未驗證。本套件不儲存金鑰。

## 設定

| 環境變數 | 預設值 | 說明 |
| --- | --- | --- |
| `CALL_GROKBOT_AUTH_MODE` | `browser` | `browser`，或明確選用 `api-key` |
| `CALL_GROKBOT_CURSOR_CLI` | 自動偵測 | 官方 `agent` 執行檔的絕對路徑 |
| `CALL_GROKBOT_AGENTS` | 所有現有 Bot | 以逗號分隔的名稱、名稱 JSON 陣列，或 `{name,description}` 物件陣列 |
| `CALL_GROKBOT_DEFAULT_WAIT_SECONDS` | `45` | 工具預設等待秒數，受最大值限制 |
| `CALL_GROKBOT_MAX_WAIT_SECONDS` | `600` | 允許的等待時間上限 |
| `CALL_GROKBOT_REQUEST_TIMEOUT_MS` | `20000` | 每次單一 HTTP 請求的逾時時間 |
| `CALL_GROKBOT_SETTLE_MS` | `1500` | 確認完成後的靜默等待間隔 |
| `CALL_GROKBOT_DISABLED_TOOLS` | 空值 | 以逗號分隔要停用的工具名稱 |
| `CALL_GROKBOT_STATE_DIR` | 作業系統狀態目錄 | 本機聯絡記錄與跨處理程序鎖定 |
| `CALL_GROKBOT_API_BASE_URL` | `https://api2.cursor.sh` | 官方來源或 loopback 測試伺服器；其他主機一律拒絕 |

預設狀態目錄為 `$XDG_STATE_HOME/call-grokbot` 或 `~/.local/state/call-grokbot`，Windows 為 `%LOCALAPPDATA%/call-grokbot`。僅儲存 Bot 識別碼、游標、時間與待確認的訊息收據，並依驗證主體與來源隔離。POSIX 檔案權限為 0600、目錄為 0700；Windows 依使用者設定檔的 ACL 控制存取。不會在此儲存權杖、金鑰、對話原文或瀏覽器 Cookie。

## 復原方式與限制

- **送出結果尚未確認：** 傳送前會先儲存訊息 ID。請用 `check` 確認送達狀態與回覆。即使逾時或發生 HTTP 5xx，也不會自動重試訊息傳送與中斷操作；請勿未經確認就重新傳送。
- **取消或串流錯誤：** 保留未讀游標。若已送出訊息，待確認收據也會保留，讓 `check` 可以接續處理。
- **任務尚未完成：** 在 `check` 確認完成前，第二次 `ask` 會遭拒。每個 Bot 的檔案鎖也會防止多個本機用戶端交錯傳送任務。
- **狀態損壞或對話記錄重設：** 安全停止，不繼續操作。請先備份 `state.json`，核對實際對話後，才處理受影響的聯絡記錄。
- **權限錯誤 403：** 有效登入不保證可存取未公開 RPC。程式不會自動改用其他帳號、建立 Bot 或擴大權限。

工具操作的是真實帳號中的 Bot 對話。Bot 無法自行取得 IDE 背景資訊；你放進任務的程式碼與文字會離開本機，傳給服務端。Bot 回覆可能包含不可信任的外部資料。允許清單僅限制這個用戶端，不會縮小登入帳號本身的權限。本工具不使用瀏覽器偵錯連接埠、擷取既存瀏覽器 Cookie、HTTP/SSE 監聽服務、繞過核准機制，或代理 Grok 模型訂閱。

## 開發與測試

```sh
npm ci
npm run check
npm test
npm run typecheck
npm run test:plugins
npm pack --dry-run
```

`test:plugins` 每次都會建立全新的匿名 npm 快取，下載固定版本的公開執行程式。它會從原始碼目錄、其他專案，以及同名同版本的測試目錄啟動兩種外掛，確認四個工具可被發現；不讀取帳號，也不傳送 Bot 訊息。測試需要網路，也會在 CI 執行。

測試涵蓋憑證更換、到期與登出、API 金鑰並行更新、帳號隔離、大數值游標、分段 Connect 訊框、讀取重試、寫入不重試、待確認傳送的復原、取消、跨處理程序狀態寫入、等待中的 ask 遭中斷，以及 MCP 探索、結構描述與呼叫。

若要用專用的現有 Bot 執行真實帳號測試：

```sh
CALL_GROKBOT_LIVE_AGENT="Your Test Bot" npm run test:live
```

將 `Your Test Bot` 換成測試 Bot 的完整名稱。這會傳送真實 PONG 訊息，驗證增量讀取及完成狀態，並在完成後呼叫 interrupt；不修改 Bot 個人資料。測試產物已列入 Git 忽略範圍，不含憑證。詳細測試範圍請參閱[驗證說明（英文）](docs/verification.md)。

作者：[Zens AI](https://zens.ai)。授權條款：MIT。獨立實作與參考資料請參閱 [NOTICE.md（英文）](NOTICE.md)。
