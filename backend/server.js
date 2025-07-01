const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS設定
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// JSONパースミドルウェア
app.use(express.json({ limit: '10mb' }));

// DeepSeek API プロキシエンドポイント
app.post('/api/deepseek/chat', async (req, res) => {
  try {
    console.log('DeepSeek API request received:', {
      hasApiKey: !!process.env.DEEPSEEK_API_KEY,
      apiKeyPrefix: process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.substring(0, 10) + '...' : 'NOT SET',
      bodySize: JSON.stringify(req.body).length,
      prompt: req.body.prompt ? req.body.prompt.substring(0, 100) + '...' : 'NO PROMPT'
    });

    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ 
        error: 'プロンプトが提供されていません',
        code: 'MISSING_PROMPT'
      });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return res.status(500).json({ 
        error: 'DeepSeek APIキーが設定されていません',
        code: 'MISSING_API_KEY'
      });
    }

    // DeepSeek APIへのリクエスト
    const deepseekResponse = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: '補助金検索の専門アシスタントとして、必ずJSON形式のみで応答してください。他の説明テキストは含めないでください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
        // response_formatパラメータを一時的に削除
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        timeout: 30000 // 30秒タイムアウト
      }
    );

    console.log('DeepSeek API response received:', {
      status: deepseekResponse.status,
      hasChoices: !!deepseekResponse.data.choices,
      choicesLength: deepseekResponse.data.choices?.length || 0
    });

    if (deepseekResponse.data && deepseekResponse.data.choices && deepseekResponse.data.choices[0]) {
      const content = deepseekResponse.data.choices[0].message.content;
      res.json({ content });
    } else {
      throw new Error('DeepSeek APIからの応答が不正です');
    }

  } catch (error) {
    console.error('DeepSeek API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      requestConfig: {
        url: error.config?.url,
        headers: error.config?.headers ? Object.keys(error.config.headers) : null,
        data: error.config?.data ? JSON.stringify(error.config.data).substring(0, 200) + '...' : null
      }
    });

    // エラーレスポンス
    if (error.response) {
      // DeepSeek APIからのエラーレスポンス
      res.status(error.response.status).json({
        error: `DeepSeek API エラー: ${error.response.statusText}`,
        details: error.response.data,
        code: 'DEEPSEEK_API_ERROR'
      });
    } else if (error.code === 'ECONNABORTED') {
      // タイムアウトエラー
      res.status(408).json({
        error: 'DeepSeek APIへのリクエストがタイムアウトしました',
        code: 'TIMEOUT_ERROR'
      });
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      // ネットワークエラー
      res.status(503).json({
        error: 'DeepSeek APIに接続できませんでした',
        code: 'NETWORK_ERROR'
      });
    } else {
      // その他のエラー
      res.status(500).json({
        error: 'サーバー内部エラーが発生しました',
        details: error.message,
        code: 'INTERNAL_ERROR'
      });
    }
  }
});

// jGrants API プロキシエンドポイント
app.get('/api/jgrants/subsidies', async (req, res) => {
  try {
    console.log('jGrants API request received:', req.query);

    const apiUrl = new URL('https://api.jgrants-portal.go.jp/exp/v1/public/subsidies');
    
    // クエリパラメータをコピー
    Object.keys(req.query).forEach(key => {
      if (req.query[key]) {
        apiUrl.searchParams.append(key, req.query[key]);
      }
    });

    console.log('Proxying to jGrants API:', apiUrl.toString());

    const response = await axios.get(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15秒タイムアウト
    });

    console.log('jGrants API response received:', {
      status: response.status,
      resultCount: response.data?.result?.length || 0
    });

    res.json(response.data);

  } catch (error) {
    console.error('jGrants API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText
    });

    if (error.response) {
      res.status(error.response.status).json({
        error: `jGrants API エラー: ${error.response.statusText}`,
        details: error.response.data,
        code: 'JGRANTS_API_ERROR'
      });
    } else if (error.code === 'ECONNABORTED') {
      res.status(408).json({
        error: 'jGrants APIへのリクエストがタイムアウトしました',
        code: 'TIMEOUT_ERROR'
      });
    } else {
      res.status(500).json({
        error: 'jGrants APIプロキシでエラーが発生しました',
        details: error.message,
        code: 'PROXY_ERROR'
      });
    }
  }
});

// jGrants 詳細API プロキシエンドポイント
app.get('/api/jgrants/subsidies/id/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('jGrants detail API request received for ID:', id);

    const apiUrl = `https://api.jgrants-portal.go.jp/exp/v1/public/subsidies/id/${id}`;
    
    const response = await axios.get(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('jGrants detail API response received:', {
      status: response.status,
      hasResult: !!response.data?.result
    });

    res.json(response.data);

  } catch (error) {
    console.error('jGrants detail API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText
    });

    if (error.response) {
      res.status(error.response.status).json({
        error: `jGrants 詳細API エラー: ${error.response.statusText}`,
        details: error.response.data,
        code: 'JGRANTS_DETAIL_API_ERROR'
      });
    } else {
      res.status(500).json({
        error: 'jGrants 詳細APIプロキシでエラーが発生しました',
        details: error.message,
        code: 'PROXY_ERROR'
      });
    }
  }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    deepseekApiKeyConfigured: !!process.env.DEEPSEEK_API_KEY,
    deepseekApiKeyLength: process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.length : 0
  });
});

// DeepSeek API テストエンドポイント
app.get('/test-deepseek', async (req, res) => {
  try {
    console.log('Testing DeepSeek API...');
    
    const testPrompt = 'こんにちは。これはテストメッセージです。JSONで「{"test": "成功"}」と返してください。';
    
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'Return JSON response only.'
          },
          {
            role: 'user',
            content: testPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 100
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        timeout: 10000
      }
    );
    
    res.json({
      success: true,
      response: response.data,
      apiKeyUsed: process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.substring(0, 10) + '...' : 'NOT SET'
    });
    
  } catch (error) {
    console.error('DeepSeek API Test Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      headers: error.response?.headers
    });
    
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.response?.status,
      details: error.response?.data,
      apiKeyPresent: !!process.env.DEEPSEEK_API_KEY
    });
  }
});

// 404ハンドラー
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'エンドポイントが見つかりません',
    path: req.originalUrl,
    code: 'NOT_FOUND'
  });
});

// グローバルエラーハンドラー
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'サーバー内部エラーが発生しました',
    details: err.message,
    code: 'INTERNAL_ERROR'
  });
});

app.listen(PORT, () => {
  console.log(`✅ Backend proxy server is running on http://localhost:${PORT}`);
  console.log(`🔑 DeepSeek API Key configured: ${!!process.env.DEEPSEEK_API_KEY}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL}`);
});

module.exports = app;