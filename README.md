# セラ地理アース（Cela Geo Earth）

<div align="center">
  <img src="public/sera-geo-earth-logo.png" alt="セラ地理アース" width="500">
  
  **宇宙から地球を学ぶ - 地理学習ゲーム**
  
  [![Deploy](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue)](https://rukerukerukke-star.github.io/CELAGEOGAME/)
</div>

## 🌍 概要

セラ地理アースは、3D地球儀を使った地理学習ゲームです。制限時間内に世界中の国、都市、湖沼、河川、山脈などの位置を当てて、地理の知識を深めましょう！

### ✨ 主な機能

- 🎮 **8つのゲームモード**: オールイン、レギュラー、国・都市、湖沼、大河、山脈・高原、平野・盆地、その他
- 📊 **詳細統計**: プレイ履歴、正解率、モード別統計を記録
- 🏆 **バッジシステム**: 13種類の実績バッジをコンプリート
- ❌ **復習機能**: 間違えた問題を記録して後で確認
- 🎨 **美しいUI**: 宇宙をテーマにしたモダンなデザイン
- 🔊 **サウンド**: BGMと効果音で臨場感アップ

## 🚀 クイックスタート

### ローカル環境での実行

```bash
# リポジトリをクローン
git clone https://github.com/rukerukerukke-star/CELAGEOGAME.git
cd CELAGEOGAME

# 依存関係をインストール
npm install

# 開発サーバーを起動
npm run dev
```

ブラウザで `http://localhost:5173` を開く

## 🌐 GitHub Pagesへのデプロイ

### 方法1: 自動デプロイ（推奨）

1. **GitHub Pagesを有効化**
   - GitHubリポジトリの `Settings` → `Pages` を開く
   - Source を `GitHub Actions` に変更

2. **ワークフローファイルをプッシュ**
   ```bash
   git add .github/workflows/deploy.yml
   git commit -m "Add GitHub Actions deploy workflow"
   git push origin main
   ```

3. **自動デプロイ完了！**
   - mainブランチにプッシュするたびに自動デプロイ
   - 数分後に `https://あなたのユーザー名.github.io/CELAGEOGAME/` でアクセス可能

### 方法2: 手動デプロイ

```bash
# ビルド
npm run build

# distフォルダをgh-pagesブランチにデプロイ
npm install -g gh-pages
gh-pages -d dist
```

## 🎮 遊び方

1. **モード選択**: 8つのモードから好きなものを選択
2. **ゲームスタート**: 制限時間60秒（デフォルト）
3. **位置を当てる**: 地球儀をクリックして問題の場所を回答
4. **スコアアップ**: 正確に答えるほど高得点
5. **統計を確認**: 📊ボタンから詳細統計とバッジをチェック

## 🏆 バッジ一覧

- 🎮 初めての一歩
- 💯 パーフェクト
- 📚 百戦錬磨
- 🌍 地理マニア
- ✨ 正解の達人
- 🎓 地理博士
- ⭐ スコアマスター
- 🏆 スコアレジェンド
- 🎯 高精度
- 🌟 全モード制覇
- ⚡ スピードスター
- 🎪 常連プレイヤー
- 🔥 ヘビープレイヤー

## 🛠️ 技術スタック

- **フレームワーク**: React 18 + Vite
- **3D地球儀**: react-globe.gl + Three.js
- **スタイリング**: インラインCSS + カスタムアニメーション
- **データ永続化**: localStorage
- **デプロイ**: GitHub Pages / Netlify / Vercel

## 📁 プロジェクト構造

```
CELAGEOGAME/
├── public/               # 静的ファイル
│   ├── sera-geo-earth-logo.png
│   ├── sera-geo.mp3     # BGM
│   ├── correct.mp3      # 正解音
│   ├── wrong.mp3        # 不正解音
│   └── button.mp3       # ボタン音
├── src/
│   ├── App.jsx          # メインアプリケーション
│   └── main.jsx         # エントリーポイント
├── .github/
│   └── workflows/
│       └── deploy.yml   # GitHub Actions設定
├── vite.config.js       # Vite設定
└── package.json

```

## 🎵 音源について

以下の音源ファイルを `public/` フォルダに配置してください：
- `sera-geo.mp3` - BGM
- `correct.mp3` - 正解時の効果音
- `wrong.mp3` - 不正解時の効果音  
- `button.mp3` - ボタンクリック音

## 🤝 コントリビューション

プルリクエストを歓迎します！バグ報告や機能提案は Issue でお願いします。

## 📜 ライセンス

MIT License

## 👨‍💻 作者

Created with ❤️ by rukerukerukke-star

---

**楽しく地理を学ぼう！🌏✨**
