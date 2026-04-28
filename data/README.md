# data/ — 実行時に GitHub から取得する設定

このディレクトリのファイルは GitHub Pages の deploy バンドルではなく、
`https://raw.githubusercontent.com/takedia/koutei/main/data/...` から
ブラウザが直接 fetch します。**編集 → コミット するだけで即反映**されます
（GitHub raw の CDN キャッシュで 1〜5 分遅れる場合あり）。

## auth.json — アプリのログインパスワード

```json
{
  "passwordHash": "b34c887aea7910ac49db53cf2745cd1187e38fb51f70c097abe4d0124e969d5b"
}
```

`passwordHash` は新パスワードの **SHA-256 hex（小文字）** を入れる。

**初期値**: `現場2026`（必ず変更してください）

### ハッシュ生成方法

#### A. ブラウザの開発者ツール（推奨）
1. このアプリを開いた状態で `F12`（PC）/ Chrome の「︙→その他のツール→デベロッパーツール」
2. Console タブを開いて以下を貼り付け、`'YOUR_PASSWORD'` を新パスワードに書き換え

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PASSWORD'))
  .then(h => console.log(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2,'0')).join('')))
```

3. 出力された 64 文字の hex をコピー

#### B. PowerShell（Windows）
```powershell
$pw = '新パスワード'
[System.BitConverter]::ToString(
  [System.Security.Cryptography.SHA256]::Create().ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($pw)
  )
) -replace '-','' | ForEach-Object { $_.ToLower() }
```

#### C. Node.js
```bash
node -e "console.log(require('crypto').createHash('sha256').update('新パスワード').digest('hex'))"
```

### 反映手順

1. github.com で `data/auth.json` を開く
2. 鉛筆アイコン → `passwordHash` を新しい hex に書き換え
3. `Commit changes`
4. 1〜5 分以内に全ユーザーで新パスワードが有効になる
   - 既にログイン済みのセッションはそのまま使える（次回起動時から新パスワード必須）

### セキュリティ上の注意

- 静的 SPA のパスワードゲートはカジュアルなアクセス防止程度です
- 開発者ツールに詳しい人は理論上バイパス可能です
- 守りたい情報は別途暗号化を検討してください
