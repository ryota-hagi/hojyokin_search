import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // エラーが発生したときにstateを更新
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // エラーログを記録
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // LocalStorageの問題の場合は自動クリーンアップを試行
    if (error.name === 'QuotaExceededError' || error.message.includes('localStorage')) {
      this.handleStorageCleanup();
    }
  }

  handleStorageCleanup = () => {
    try {
      console.log('Attempting to clean up localStorage...');
      
      // 補助金チャット関連のセッションをクリーンアップ
      const keys = Object.keys(localStorage);
      const sessionKeys = keys.filter(key => key.startsWith('subsidyDeepSeekChat_'));
      
      // 最新1個を残して削除
      if (sessionKeys.length > 1) {
        sessionKeys.slice(0, -1).forEach(key => {
          localStorage.removeItem(key);
          console.log('Removed session:', key);
        });
      }
      
      console.log('Storage cleanup completed');
    } catch (cleanupError) {
      console.error('Failed to cleanup storage:', cleanupError);
      
      // 最後の手段：全てのセッションデータを削除
      try {
        const keys = Object.keys(localStorage);
        keys.filter(key => key.startsWith('subsidyDeepSeekChat_')).forEach(key => {
          localStorage.removeItem(key);
        });
        console.log('Emergency: Removed all session data');
      } catch (emergencyError) {
        console.error('Emergency cleanup also failed:', emergencyError);
      }
    }
  };

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;
    
    // 3回以上リトライしたらページリロードを提案
    if (newRetryCount >= 3) {
      if (window.confirm('エラーが続いています。ページを再読み込みしますか？')) {
        window.location.reload();
        return;
      }
    }
    
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: newRetryCount
    });
  };

  handleReset = () => {
    // 完全リセット：LocalStorageをクリアしてページリロード
    if (window.confirm('全ての会話履歴を削除してアプリをリセットしますか？')) {
      try {
        const keys = Object.keys(localStorage);
        keys.filter(key => key.startsWith('subsidyDeepSeekChat_') || key.startsWith('subsidyClaudeSessionId')).forEach(key => {
          localStorage.removeItem(key);
        });
      } catch (error) {
        console.error('Failed to clear localStorage:', error);
      }
      
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      const isStorageError = error?.name === 'QuotaExceededError' || error?.message?.includes('localStorage');
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <h1 className="text-xl font-semibold text-gray-800">
                エラーが発生しました
              </h1>
            </div>
            
            <div className="mb-6">
              {isStorageError ? (
                <div className="space-y-3">
                  <p className="text-gray-600">
                    データ保存時にエラーが発生しました。ブラウザの容量制限に達した可能性があります。
                  </p>
                  <p className="text-sm text-gray-500">
                    古い会話履歴を自動削除してアプリを復旧しています...
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-gray-600">
                    アプリケーションで予期しないエラーが発生しました。
                  </p>
                  {retryCount > 0 && (
                    <p className="text-sm text-gray-500">
                      リトライ回数: {retryCount}/3
                    </p>
                  )}
                </div>
              )}
              
              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4 p-3 bg-gray-100 rounded text-xs">
                  <summary className="cursor-pointer font-medium">
                    エラー詳細 (開発用)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words">
                    {error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </div>
            
            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>再試行</span>
              </button>
              
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>アプリをリセット</span>
              </button>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                ページをリロード
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                問題が解決しない場合は、ブラウザを再起動するか、別のブラウザでお試しください。
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;