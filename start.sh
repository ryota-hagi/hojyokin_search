#!/bin/bash

echo "🚀 補助金検索アプリケーションを起動します..."
echo ""

# バックエンドサーバー起動
echo "📦 バックエンドサーバーを起動中..."
cd backend
npm run dev &
BACKEND_PID=$!
echo "✅ バックエンドサーバー起動 (PID: $BACKEND_PID)"
echo ""

# 少し待機
sleep 3

# ヘルスチェック
echo "🔍 バックエンドサーバーの状態を確認中..."
curl -s http://localhost:3001/health | jq . || echo "❌ バックエンドサーバーが応答しません"
echo ""

# DeepSeek APIテスト
echo "🔍 DeepSeek APIの接続をテスト中..."
curl -s http://localhost:3001/test-deepseek | jq . || echo "❌ DeepSeek APIテストが失敗しました"
echo ""

# フロントエンドサーバー起動
echo "🎨 フロントエンドサーバーを起動中..."
cd ..
npm run dev &
FRONTEND_PID=$!
echo "✅ フロントエンドサーバー起動 (PID: $FRONTEND_PID)"
echo ""

echo "🎉 アプリケーションが起動しました！"
echo "📱 ブラウザで http://localhost:5173 にアクセスしてください"
echo ""
echo "終了するには Ctrl+C を押してください"

# 終了処理
trap "echo '🛑 アプリケーションを終了します...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT

# プロセスを待機
wait