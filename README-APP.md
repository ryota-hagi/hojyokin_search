# 補助金検索アプリケーション（DeepSeek API版）

補助金検索のための対話型チャットアプリケーションです。DeepSeek APIを使用して、ユーザーの状況に最適な補助金を検索・提案します。

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. DeepSeek APIキーの設定

`.env.local`ファイルを編集し、DeepSeek APIキーを設定してください：

```env
VITE_DEEPSEEK_API_KEY=your-actual-deepseek-api-key
```

### 3. アプリケーションの起動

```bash
npm run dev
```

ブラウザで http://localhost:5173 にアクセスしてください。

## 機能

- 対話型の補助金検索インターフェース
- DeepSeek APIによる自然な会話
- jGrants APIとの連携（プロキシ経由）
- 選択式の質問による効率的な情報収集
- 複数の検索パターンによる包括的な検索
- 検索結果の関連度による並び替え

## 技術スタック

- React + Vite
- Tailwind CSS
- Lucide React（アイコン）
- Axios（HTTP通信）
- DeepSeek API（AI対話）

## トラブルシューティング

### DeepSeek APIエラー
- `.env.local`ファイルにAPIキーが正しく設定されているか確認
- APIキーが有効であることを確認

### jGrants API接続エラー
- Viteのプロキシが正しく動作しているか確認
- 開発サーバーを再起動してみる

## 注意事項

- `.env.local`ファイルは必ず`.gitignore`に含まれていることを確認してください
- APIキーは絶対に公開リポジトリにコミットしないでください