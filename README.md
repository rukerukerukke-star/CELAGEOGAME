# セラ地理（React + Vite）
作成日: 2025-08-09

## セットアップ
1. Node.js をインストール（18 以上推奨）
2. ターミナル:
```bash
cd sera-geo-game
npm install
npm run dev
```
3. ブラウザで表示されたローカルURLを開く

## 音源の置き場所
- `public/sera-geo.mp3` にMP3を置いてください（ファイル名は固定）。
- 別URLを使う場合は、起動URLに `?song=フルURL` を付けます。

## ビルド（配布用）
```bash
npm run build
# dist フォルダの中身をNetlify/Vercel/GitHub Pagesなどにアップロード
```
