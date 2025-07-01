import axios from 'axios';

class DeepSeekAPI {
  constructor() {
    this.baseURL = '/api/deepseek'; // ローカルプロキシ経由
  }

  async chat(prompt) {
    try {
      console.log('Sending request to backend proxy...');
      
      const response = await axios.post(
        `${this.baseURL}/chat`,
        { prompt },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 35000 // 35秒タイムアウト（バックエンドより少し長く）
        }
      );

      if (response.data && response.data.content) {
        console.log('Received response from backend proxy');
        return response.data.content;
      } else {
        throw new Error('バックエンドからの応答が不正です');
      }
    } catch (error) {
      console.error('Backend Proxy Error:', error);
      
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        
        // バックエンドからのエラーメッセージを使用
        const errorMessage = error.response.data?.error || 'バックエンドAPIでエラーが発生しました';
        const errorCode = error.response.data?.code || 'UNKNOWN_ERROR';
        
        const enhancedError = new Error(errorMessage);
        enhancedError.code = errorCode;
        enhancedError.status = error.response.status;
        enhancedError.details = error.response.data?.details;
        
        throw enhancedError;
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('リクエストがタイムアウトしました。しばらく時間をおいて再試行してください。');
      } else if (error.code === 'ERR_NETWORK') {
        throw new Error('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。');
      } else {
        throw new Error(`ネットワークエラーが発生しました: ${error.message}`);
      }
    }
  }

  // 互換性のために complete メソッドも用意
  async complete(prompt) {
    return this.chat(prompt);
  }
}

// シングルトンインスタンスをエクスポート
const deepseekApi = new DeepSeekAPI();
export default deepseekApi;