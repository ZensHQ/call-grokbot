# call-grokbot

**Codex** と **Claude Code** から、既存の **Grok Bot** に相談できます。ローカルで動作する stdio MCP サーバーを介して、必要な情報を含むタスクを一度だけ送信し、返信を差分で読み取り、必要に応じて処理を中断します。Bot は元の会話、記憶、接続済みツールをそのまま使います。

**非公式プロジェクトです。Cursor / Anysphere、xAI / Grok、OpenAI、Anthropic との提携関係はなく、各社による承認やサポートも受けていません。** Grok Bot RPC の仕様は公開されておらず、変更される可能性があります。公開のモデル推論エンドポイントを提供するものではありません。

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md)

[認証の詳細（英語）](docs/authentication.md)

## 利用前の準備

- Node.js **22.13 以降**、npm、Git をインストールしてください。
- 使用する **Codex** または **Claude Code** をインストールし、ログインしてください。このアカウントと、後述する Cursor のログインは別です。
- [Cursor 公式 CLI](https://cursor.com/docs/cli/installation) を別途インストールしてください。
- Grok Bot を利用できるアカウントと、作成済みの Bot が一つ以上必要です。アプリに表示される正確な名前を使ってください。このツールが Bot を作成することはありません。

以下の Codex または Claude Code のプラグイン手順を選んでください。どちらも `consult` スキルを同梱し、バージョンを固定した npm パッケージを `npx` で起動します。`call-grokbot` のグローバルインストール、ソースの取得、npm アカウント、個人用 API キーは不要です。

macOS では公式 CLI のキーチェーン項目、Linux と Windows では公式 CLI の認証ファイルを読み取ります。トークンを MCP 設定にコピーしないでください。実アカウントでのプラグイン検証は macOS で実施しています。Linux と Windows は CI で検証していますが、実アカウントでのログインは未検証です。

**プラグイン 0.1.2** は **npm 実行パッケージ 0.1.1** を使います。npm 公式 tarball の URL を固定することで、現在の同名ソースディレクトリが実行対象として誤って使われるのを防ぎます。本リポジトリ内の `command not found` と MCP の `CONNECTION_CLOSED` を解消し、キャッシュが空の初回起動にも対応します。グローバルインストールは不要です。

## Codex プラグインの導入

### 1. ターミナルでプラグインをインストール

```sh
codex plugin marketplace add ZensHQ/call-grokbot --ref plugin-v0.1.2
codex plugin add call-grokbot@call-grokbot
codex plugin list
```

`call-grokbot@call-grokbot` がインストール済みで、有効になっていることを確認してください。これはターミナル用のコマンドです。`plugin` が認識されない場合は、プラグインコマンドに対応した Codex に更新してください。[Codex 公式プラグインドキュメント](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)も参照できます。

### 2. ターミナルから Bot のアカウントにログイン

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

`login` は公式 Cursor CLI の `agent login` を呼び出します。ブラウザーで Bot を所有するアカウントを選択し、必要なセキュリティ確認を完了してください。`doctor` が `"authenticated": true`、`"authMode": "browser"`、`"cursorCliFound": true` を返せば準備完了です。認証情報は表示されません。

### 3. 新しい Codex セッションでスキルを呼び出す

作業するプロジェクトのディレクトリで起動します。

```sh
codex
```

次の文章を **Codex の会話欄**に入力してください。ターミナルでは実行しません。

```text
$call-grokbot:consult 既存の Bot を一覧表示してください。メッセージは送信しないでください。
```

一覧から正確な Bot 名を選びます。次の `Research Bot` は、実際の Bot 名に置き換えてください。

```text
$call-grokbot:consult 既存の Bot「Research Bot」に PONG とだけ返信するよう依頼してください。
タスクは一度だけ送信し、running の間は check で finished になるまで待ってください。再送しないでください。
```

この操作は Bot の既存の会話に実際のメッセージを送信します。`PONG` の返信と `finished` 状態の両方を確認してください。最初の受領メッセージだけでは完了を意味しません。通常のタスクでは、PONG の依頼を、関連情報、制約、許可する操作、求める出力を含む指示に置き換えてください。

## Claude Code プラグインの導入

### 1. ターミナルでプラグインをインストール

```sh
claude plugin marketplace add ZensHQ/call-grokbot
claude plugin install call-grokbot@call-grokbot --scope user
claude plugin list
```

`call-grokbot@call-grokbot` が有効になっていることを確認してください。`user` スコープでは、このマシン上の自分の Claude Code プロジェクトで利用できます。すでに Claude Code を開いている場合は、会話内で次のコマンドも使えます。

```text
/plugin marketplace add ZensHQ/call-grokbot
/plugin install call-grokbot@call-grokbot
```

インストール画面では **Install for you（user スコープ）** を選んでください。他のスコープについては [Claude Code 公式ドキュメント](https://code.claude.com/docs/ja/discover-plugins)を参照してください。

### 2. ターミナルから Bot のアカウントにログイン

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

公式 Cursor CLI のブラウザーログインで Bot を所有するアカウントを選びます。`doctor` の結果で `"authenticated": true`、`"authMode": "browser"`、`"cursorCliFound": true` を確認してください。同じマシンで Codex プラグイン用にログイン済みなら、その公式 CLI セッションを共有できます。上記の `doctor` コマンドで確認すれば、再ログインは不要です。

### 3. 接続を確認して新しい Claude Code セッションを開く

ターミナルで実行します。

```sh
claude mcp list
claude
```

接続確認で `plugin:call-grokbot:call-grokbot` が接続済みになっていることを確認し、接続が完了してから依頼してください。インストール前から開いていたセッションは、新しく開き直してプラグインとスキルを読み込ませます。

**Claude Code の会話欄**で入力します。

```text
/call-grokbot:consult 既存の Bot を一覧表示してください。メッセージは送信しないでください。
```

次の `Research Bot` を、一覧にある正確な名前に置き換えてください。

```text
/call-grokbot:consult 既存の Bot「Research Bot」に PONG とだけ返信するよう依頼してください。
タスクは一度だけ送信し、running の間は check で finished になるまで待ってください。再送しないでください。
```

これも実際のメッセージ送信です。`PONG` と `finished` の両方を確認してください。実作業の依頼には必要な内容を明記してください。Bot が Claude Code の会話やローカルファイルを自動で参照することはありません。

## 導入時のトラブルシューティング

| 症状 | 対処方法 |
| --- | --- |
| `call-grokbot: command not found` | プラグインはグローバルの実行コマンドを追加しません。上記の公式 tarball URL を使う `npx` コマンドで `login` または `doctor` を実行してください。 |
| ソースディレクトリ内で `command not found` または `CONNECTION_CLOSED` | プラグイン 0.1.2 に更新し、固定した npm tarball URL を使ってください。ターミナルのコマンドを直すだけでは、インストール済みプラグインの設定は変わりません。以前の `--global` 回避策は空のキャッシュで失敗する場合があります。 |
| `CLI_MISSING` | 上記リンクから Cursor 公式 CLI をインストールしてください。標準以外の場所なら、`CALL_GROKBOT_CURSOR_CLI` に実行ファイルの絶対パスを指定します。 |
| `AUTH_REQUIRED` または `AUTH_EXPIRED` | バージョン固定の `npx` ログインコマンドを再実行し、ブラウザーログイン後に `doctor` を実行してください。MCP 起動時にブラウザーが自動で開くことはありません。 |
| スキルや MCP ツールが表示されない | `codex plugin list` または `claude plugin list` でインストールと有効化を確認し、新しいセッションを開いてください。MCP だけの設定にはスキルは含まれません。 |
| Claude Code でツールを利用できない、または接続中と表示される | 起動を待ち、`claude mcp list` で確認します。接続済みでも表示されない場合は新しいセッションを開いてください。送信済みの可能性があるタスクを再送しないでください。 |
| Bot が見つからない、または 403 が返る | 正確な Bot 名とログインしたアカウントを確認してください。有効なログインがあっても、非公開 RPC へのアクセスが保証されるわけではありません。下記の復旧と制約を参照してください。 |

## インストール済みプラグインの更新

Codex のマーケットプレイスを古いタグに固定している場合、自動で新しいタグには移りません。ターミナルで次を実行して、このプラグイン版に切り替えてください。

```sh
codex plugin remove call-grokbot@call-grokbot
codex plugin marketplace remove call-grokbot
codex plugin marketplace add ZensHQ/call-grokbot --ref plugin-v0.1.2
codex plugin add call-grokbot@call-grokbot
```

Claude Code の user スコープでは次を実行します。

```sh
claude plugin marketplace update call-grokbot
claude plugin update call-grokbot@call-grokbot --scope user
```

更新後は新しいセッションを開いてください。公式 Cursor CLI のログインはプラグインと独立しており、有効期限内なら再ログインは不要です。

## 任意：MCP だけを設定する

四つの MCP ツールだけが必要な場合は、プラグインの代わりにこの方法を使えます。同じクライアントで両方を導入するとツールが重複するため、どちらかを選んでください。この方法には `consult` スキルは含まれません。通常の文章で call-grokbot のツールを使うよう依頼します。

最初に、同じログイン確認をターミナルで実行します。

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz login
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz doctor
```

Codex のサーバー登録：

```sh
codex mcp add call-grokbot -- npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz
```

Bot の許可リストや長めのタイムアウトが必要なら、同じエントリーを `~/.codex/config.toml` で設定します。

```toml
[mcp_servers.call-grokbot]
command = "npx"
args = ["--yes", "https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz"]
startup_timeout_sec = 30
tool_timeout_sec = 660
env = { CALL_GROKBOT_AGENTS = "Research Bot" }
```

Claude Code のサーバー登録：

```sh
claude mcp add --transport stdio --scope user call-grokbot -- npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz
```

user スコープの登録の代わりに、信頼するプロジェクトの `.mcp.json` に設定することもできます。

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

`Research Bot` を既存の正確な名前に置き換えてください。MCP 設定の変更後は新しいセッションを開きます。

## 任意：グローバルインストールまたはソースからの実行

グローバルのコマンドを使いたい場合は `npm install --global call-grokbot@0.1.1` を実行してください。その後は固定 URL の `npx` に代えて、`call-grokbot login`、`call-grokbot doctor` などを直接実行できます。

ソースから実行する場合：

```sh
git clone https://github.com/ZensHQ/call-grokbot.git
cd call-grokbot
npm ci
npm run build
node dist/cli.js login
node dist/cli.js doctor
```

他のディレクトリからは `node /absolute/path/to/call-grokbot/dist/cli.js` を使います。JSON/TOML の MCP 設定では、`command` を `node`、`args` を `["/absolute/path/to/call-grokbot/dist/cli.js"]` にしてください。

## 四つのツール

| ツール | 用途 |
| --- | --- |
| `list()` | アカウントから利用できる既存の Bot、許可リスト、ローカルの連絡履歴を一覧表示します。メッセージは送信しません。 |
| `ask({agent, message, wait_seconds})` | 正確な名前の既存 Bot に一度だけ送信します。名前が存在しない場合や一意でない場合は拒否し、Bot は作成しません。 |
| `check({agent, wait_seconds})` | 未読の返信を取得し、既存のタスクの続きを待ちます。メッセージは再送しません。 |
| `interrupt({agent})` | 連絡済み Bot の現在の処理を停止します。アプリで開始した処理が含まれる場合があります。完了済みの操作は取り消せません。 |

`agent` を省略できるのは、許可リストに Bot が一つだけある場合です。`wait_seconds` の既定値は **45**、範囲は **0～600** です。0 は初期状態を確認してすぐ返します。結果には `status: "running" | "finished"` と、必要に応じて `reply` が含まれます。`running` なら `check` を使い、`ask` を繰り返さないでください。`finished` は最初の受領返信ではなく、稼働状態とターン終了の証拠で判断します。中断したターンは返信なしで完了する場合があります。

`ask` の `earlierReplies` は以前の未読返信です。新しいタスクへの回答と区別してください。`check` はローカルの既読位置を進めるため、次の確認で同じ返信を繰り返し返しません。カーソルは JavaScript の安全な整数範囲を超える場合も十進数文字列のまま保持されます。内部ツールの処理内容は返信として返しません。

依頼例：

> Research Bot に、ここに貼り付けた二つのデプロイ案を比較してもらってください。この会話の遅延測定値と予算条件を含め、三つのトレードオフと推奨案を一つ求めてください。調査のみ行い、変更はしないでください。

## 有効期限・再ログイン・ログアウト

```sh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz auth status
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz auth refresh
npx --yes https://registry.npmjs.org/call-grokbot/-/call-grokbot-0.1.1.tgz logout
```

既定の認証方式は `browser` で、`CURSOR_API_KEY` が設定されていても変わりません。別のマシンのブラウザーを使う場合は、`NO_OPEN_BROWSER=1` を設定してログインし、公式 CLI が表示する URL を開いてください。

`auth refresh` は公式ブラウザーログインをやり直します。インストール済み公式 CLI のブラウザーセッションには固定の有効期限があります。検証時は約 60 日でした。保存される `refreshToken` は、無操作で自動更新できることが確認された仕組みではありません。未確認の OAuth 更新エンドポイントを作ったり、ブラウザー認証が無期限に続くと約束したりはしません。

認証が必要な各リクエストは最新の公式認証情報を読み直します。再ログイン後は MCP を再起動せずに反映されます。期限切れ、失効、認証情報の欠落時は処理を止め、再ログインを案内します。`doctor` はトークンを表示せず期限を確認でき、ask/check は期限の 5 分前から警告します。

**ログアウトは共有の公式 Cursor CLI セッションからのログアウトです。** 同じログインを使う他のプログラムも再ログインが必要になります。ローカルの連絡履歴は残るため、アカウント別の既読位置から再開できます。ログアウトでクラウドの処理が止まったり、完了済みの操作が取り消されたりはしません。

無人実行には `CALL_GROKBOT_AUTH_MODE=api-key` を明示して選べます。`CALL_GROKBOT_API_KEY`、`CURSOR_API_KEY`、指定した `CURSOR_API_KEY_FILE`、`CURSOR_SERVICE_ACCOUNT_KEY` の順でキーを読み取ります。短期セッションに交換し、同時の交換をまとめ、期限前に更新します。新しいトークンを取得した場合に限り、認証付きの読み取りを一度だけ再試行します。検証した個人用キーには **Sign in to the Cursor CLI and SDK** と **Run agents** の両権限がありましたが、最小権限は未確定です。サービスアカウントから個人 Bot へのアクセスは未検証です。本パッケージはキーを保存しません。

## 設定

| 環境変数 | 既定値 | 意味 |
| --- | --- | --- |
| `CALL_GROKBOT_AUTH_MODE` | `browser` | `browser` または明示指定の `api-key` |
| `CALL_GROKBOT_CURSOR_CLI` | 自動検出 | 公式 `agent` 実行ファイルの絶対パス |
| `CALL_GROKBOT_AGENTS` | 既存の全 Bot | 名前のカンマ区切り、名前の JSON 配列、または `{name,description}` の配列 |
| `CALL_GROKBOT_DEFAULT_WAIT_SECONDS` | `45` | 既定の待機秒数。最大値を超える設定は不可 |
| `CALL_GROKBOT_MAX_WAIT_SECONDS` | `600` | 待機時間の上限 |
| `CALL_GROKBOT_REQUEST_TIMEOUT_MS` | `20000` | 単一の HTTP リクエストごとのタイムアウト |
| `CALL_GROKBOT_SETTLE_MS` | `1500` | 完了確認後に待つ無通信時間 |
| `CALL_GROKBOT_DISABLED_TOOLS` | 空 | 公開しないツール名のカンマ区切り |
| `CALL_GROKBOT_STATE_DIR` | OS の状態保存ディレクトリ | ローカルの連絡履歴とプロセス間ロック |
| `CALL_GROKBOT_API_BASE_URL` | `https://api2.cursor.sh` | 公式オリジン、またはループバックのテストサーバー。他のホストは拒否 |

既定の状態保存先は `$XDG_STATE_HOME/call-grokbot` または `~/.local/state/call-grokbot`、Windows では `%LOCALAPPDATA%/call-grokbot` です。Bot ID、カーソル、時刻、送信確認待ちの記録だけを保存し、認証主体とオリジンごとに分離します。POSIX ではファイル 0600、ディレクトリ 0700、Windows ではユーザープロファイルの ACL に従います。トークン、キー、会話本文、ブラウザーの Cookie は保存しません。

## 復旧方法と制約

- **送信結果が未確認：** 送信前にメッセージ ID を保存します。`check` で配信と返信を確認してください。タイムアウトや HTTP 5xx が起きても、メッセージ送信と中断は自動再試行しません。確認せず再送しないでください。
- **キャンセルやストリームエラー：** 未読カーソルを保持します。送信済みなら確認待ちの記録も残り、`check` で再開できます。
- **タスク実行中：** `check` が完了を確認するまで次の `ask` を拒否します。Bot ごとのファイルロックでも、複数のローカルクライアントによる送信の割り込みを防ぎます。
- **状態破損や会話履歴のリセット：** 安全のため停止します。`state.json` をバックアップし、実際の会話を確認してから対象の連絡記録を修復してください。
- **権限エラー 403：** ログインが有効でも、この非公開 RPC を使えるとは限りません。別アカウントへの切り替え、Bot 作成、権限拡張は自動で行いません。

これらのツールは実アカウントの Bot の会話を操作します。Bot が IDE の情報を知るには、依頼に含める必要があります。含めたコードや文章はサービスに送信されます。返信には信頼できない外部情報が含まれる場合があります。許可リストはこのクライアントだけを制限し、ログインアカウント自体の権限は狭めません。ブラウザーのデバッグポート、保存済み Cookie の抽出、HTTP/SSE リスナー、承認の回避、Grok モデル契約のプロキシは使用しません。

## 開発とテスト

```sh
npm ci
npm run check
npm test
npm run typecheck
npm run test:plugins
npm pack --dry-run
```

`test:plugins` は毎回、新しい匿名の npm キャッシュで固定版の公開パッケージを取得します。ソースディレクトリ、別プロジェクト、同名同バージョンのテストディレクトリで両方のプラグインを起動し、四つのツールを検出します。認証も Bot への送信も行いません。ネットワークが必要で、CI でも実行します。

テストには、認証情報の切り替え、有効期限とログアウト、API キー更新の同時実行、アカウント分離、大きなカーソル値、Connect フレームの分割、読み取りの再試行、書き込みの非再試行、送信確認待ちからの復旧、キャンセル、プロセス間の状態保存、待機中の ask に対する中断、MCP の検出・スキーマ・呼び出しを含みます。

専用の既存 Bot で実アカウントのテストを行う場合：

```sh
CALL_GROKBOT_LIVE_AGENT="Your Test Bot" npm run test:live
```

`Your Test Bot` はテスト用 Bot の正確な名前に置き換えてください。実際の PONG メッセージを送信し、差分読み取りと完了判定を検証して、完了後に interrupt を呼びます。Bot のプロフィールは変更しません。実アカウントのテスト成果物は Git 管理対象外で、認証情報を含みません。検証範囲は[検証内容（英語）](docs/verification.md)を参照してください。

開発：[Zens AI](https://zens.ai)。ライセンス：MIT。独立実装と参考資料については [NOTICE.md（英語）](NOTICE.md)を参照してください。
