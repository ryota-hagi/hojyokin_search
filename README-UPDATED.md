# 補助金検索アプリケーション（改善版）

DeepSeek APIを使用した対話型補助金検索アプリケーションです。

## 主な改善点

### 🔧 CORS問題の解決
- **バックエンドプロキシサーバー**を実装
- Express.jsサーバーがDeepSeek APIとjGrants APIをプロキシ
- フロントエンドからの直接API呼び出しを回避

### 💾 LocalStorage容量問題の解決
- **自動データ圧縮**：メッセージと会話履歴を制限
- **古いセッション削除**：最新5セッションのみ保持
- **緊急時対応**：容量オーバー時の自動復旧

### 🛡️ エラーハンドリング強化
- **Error Boundary**実装：アプリクラッシュを防止
- **段階的復旧**：リトライ → リセット → リロード
- **開発者向け詳細表示**：デバッグ情報の表示

### 🚀 質問ループ問題の解決
- **自動検索実行**：基本情報収集後すぐに検索
- **重複質問防止**：収集済み情報の管理
- **最大5質問制限**：効率的なヒアリング

## プロジェクト構造

```
hojyokin-app/
├── src/                          # フロントエンド
│   ├── components/
│   │   ├── SubsidySearchChat.jsx  # メインチャット
│   │   └── ErrorBoundary.jsx      # エラー境界
│   ├── services/
│   │   └── deepseekApi.js         # API通信（プロキシ経由）
│   └── App.jsx
├── backend/                       # バックエンド
│   ├── server.js                 # Express プロキシサーバー
│   ├── package.json
│   └── .env                      # APIキー設定
├── package.json
└── vite.config.js                # プロキシ設定
```

## セットアップ

### 1. 依存関係のインストール

```bash
# フロントエンド
npm install

# バックエンド
cd backend && npm install
```

### 2. 環境変数の設定

`backend/.env`ファイルのDeepSeek APIキーが正しく設定されていることを確認：

```env
DEEPSEEK_API_KEY=sk-89cee15328c74bb0b1657840f67adbcf
PORT=3001
FRONTEND_URL=http://localhost:5173
```

### 3. アプリケーションの起動

**推奨：フロントエンド + バックエンド同時起動**
```bash
npm run dev:full
```

**個別起動**
```bash
# バックエンド（ポート 3001）
npm run dev:backend

# フロントエンド（ポート 5173）
npm run dev
```

### 4. アクセス

ブラウザで http://localhost:5173 にアクセス

## API エンドポイント

### バックエンドプロキシ

- `POST /api/deepseek/chat` - DeepSeek API プロキシ
- `GET /api/jgrants/subsidies` - jGrants 検索API プロキシ
- `GET /api/jgrants/subsidies/id/:id` - jGrants 詳細API プロキシ
- `GET /health` - ヘルスチェック

### フロントエンド → バックエンド通信

```
Frontend (5173) → Vite Proxy → Backend (3001) → External APIs
```

## トラブルシューティング

### 🔍 よくある問題

#### 1. 画面がホワイトアウトする
- **原因**: LocalStorage容量オーバー
- **解決**: Error Boundaryが自動復旧を実行
- **手動対応**: 「アプリをリセット」ボタンで解決

#### 2. DeepSeek APIエラー
- **原因**: バックエンドサーバー未起動、APIキー不正
- **解決**: 
  ```bash
  # バックエンドサーバーの起動確認
  npm run dev:backend
  
  # APIキーの確認
  cat backend/.env
  ```

#### 3. 質問がループする
- **解決済み**: 改善版では5質問で自動的に検索実行

### 🔧 デバッグ

#### ログの確認
```bash
# バックエンドログ
# ターミナル1でバックエンドのログを確認

# フロントエンドログ
# ブラウザの開発者ツール > Console
```

#### ヘルスチェック
```bash
curl http://localhost:3001/health
```

## 技術スタック

### フロントエンド
- **React 19** - UIライブラリ
- **Vite** - ビルドツール
- **Tailwind CSS** - スタイリング
- **Lucide React** - アイコン
- **Axios** - HTTP通信

### バックエンド
- **Node.js** - ランタイム
- **Express.js** - Webフレームワーク
- **CORS** - CORS対応
- **Axios** - HTTP通信
- **dotenv** - 環境変数管理

### 外部API
- **DeepSeek API** - AI対話
- **jGrants API** - 補助金検索

## 本番環境

```bash
# ビルド
npm run build

# 本番起動（バックエンドが静的ファイルも配信）
cd backend && npm start
```

---

**注意**: APIキーは本番環境では適切にセキュアに管理してください。