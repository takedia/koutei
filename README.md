# 現場工程表 (koutei)

土木現場の簡易工程表（バーチャート型）をスマホで作成・提出するためのWebアプリ。

- ホスティング: GitHub Pages（静的SPA）
- データ保存: 端末ローカル（IndexedDB）+ 任意で自分の private リポにバックアップ
- 出力: Excel (.xlsx) / PNG / PDF
- 送信: Web Share API でメーラーに添付付き共有

## 開発

```sh
npm install
npm run dev      # http://localhost:5173/koutei/
npm run build    # ./dist に生成
npm run preview  # ビルド成果のローカル確認
```

## デプロイ

`main` ブランチに push すると GitHub Actions が自動で GitHub Pages に配信します。

Pages URL: https://takedia.github.io/koutei/

## ライセンス

私的プロジェクト（社内利用想定）。
