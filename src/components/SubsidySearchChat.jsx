import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Search, RefreshCw, Loader2 } from 'lucide-react';
import deepseekApi from '../services/deepseekApi';

const SubsidySearchChat = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [conversationContext, setConversationContext] = useState([]);
  const [quickOptions, setQuickOptions] = useState([]);
  const [collectedInfo, setCollectedInfo] = useState({
    use_purpose: null,
    industry: null,
    target_area_search: null,
    target_number_of_employees: null,
    specific_needs: null
  });
  const [questionCount, setQuestionCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [allowMultiSelect, setAllowMultiSelect] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // API仕様の要約情報
  const apiSpec = `
補助金検索API仕様:
- エンドポイント: https://api.jgrants-portal.go.jp/exp/v1/public/subsidies
- 必須パラメータ: keyword(2文字以上), sort, order, acceptance
- 検索条件:
  - use_purpose: 利用目的（新たな事業を行いたい、設備整備・IT導入をしたい等）
  - industry: 業種（製造業、情報通信業等）
  - target_area_search: 地域（都道府県名）
  - target_number_of_employees: 従業員数（5名以下、20名以下等）
`;

  useEffect(() => {
    const storedSessionId = localStorage.getItem('subsidyDeepSeekSessionId');
    if (storedSessionId) {
      setSessionId(storedSessionId);
      loadConversation(storedSessionId);
    } else {
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      localStorage.setItem('subsidyDeepSeekSessionId', newSessionId);
      if (!isInitialized) {
        initializeConversation();
        setIsInitialized(true);
      }
    }
  }, []);

  // メッセージや会話コンテキストが変更されたら自動保存
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      saveConversation();
    }
  }, [messages, conversationContext, sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // テキストエリアの高さを自動調整
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputMessage]);

  const generateSessionId = () => {
    return 'deepseek_session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  const loadConversation = (sessionId) => {
    const stored = localStorage.getItem(`subsidyDeepSeekChat_${sessionId}`);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setMessages(data.messages || []);
        setConversationContext(data.context || []);
        setCollectedInfo(data.collectedInfo || {
          use_purpose: null,
          industry: null,
          target_area_search: null,
          target_number_of_employees: null,
          specific_needs: null
        });
        setQuestionCount(data.questionCount || 0);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to load conversation:', error);
        if (!isInitialized) {
          initializeConversation();
          setIsInitialized(true);
        }
      }
    } else {
      if (!isInitialized) {
        initializeConversation();
        setIsInitialized(true);
      }
    }
  };

  // LocalStorage容量管理のヘルパー関数
  const getStorageSize = () => {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  };

  const cleanupOldSessions = () => {
    try {
      const keys = Object.keys(localStorage);
      const sessionKeys = keys.filter(key => key.startsWith('subsidyDeepSeekChat_'));
      
      if (sessionKeys.length > 5) {
        // セッションを日時でソートして古い物から削除
        const sessionsWithTime = sessionKeys.map(key => {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            return { key, lastUpdated: data.lastUpdated || '1970-01-01' };
          } catch {
            return { key, lastUpdated: '1970-01-01' };
          }
        }).sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated));
        
        // 最新5個を残して削除
        sessionsWithTime.slice(0, -5).forEach(session => {
          localStorage.removeItem(session.key);
          console.log('Removed old session:', session.key);
        });
      }
    } catch (error) {
      console.error('Failed to cleanup old sessions:', error);
    }
  };

  const compressConversationData = (data) => {
    // メッセージを最新15個に制限
    const limitedMessages = data.messages.slice(-15);
    
    // 会話コンテキストを最新10個に制限
    const limitedContext = data.context.slice(-10);
    
    // 不要な情報を削除してサイズを削減
    const compressedMessages = limitedMessages.map(msg => ({
      id: msg.id,
      sender: msg.sender,
      content: msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...' : msg.content,
      timestamp: msg.timestamp
      // data フィールドは削除（大きいため）
    }));
    
    return {
      messages: compressedMessages,
      context: limitedContext,
      collectedInfo: data.collectedInfo,
      questionCount: data.questionCount,
      lastUpdated: data.lastUpdated
    };
  };

  const saveConversation = () => {
    try {
      // 現在のストレージサイズをチェック
      const currentSize = getStorageSize();
      const maxSize = 4 * 1024 * 1024; // 4MB制限
      
      if (currentSize > maxSize) {
        console.warn('LocalStorage approaching limit, cleaning up old sessions...');
        cleanupOldSessions();
      }
      
      const data = {
        messages,
        context: conversationContext,
        collectedInfo,
        questionCount,
        lastUpdated: new Date().toISOString()
      };
      
      // データ圧縮
      const compressedData = compressConversationData(data);
      const jsonString = JSON.stringify(compressedData);
      
      // サイズチェック（個別セッション1MB制限）
      if (jsonString.length > 1024 * 1024) {
        console.warn('Session data too large, applying aggressive compression...');
        // さらに制限を厳しくする
        compressedData.messages = compressedData.messages.slice(-10);
        compressedData.context = compressedData.context.slice(-6);
      }
      
      localStorage.setItem(`subsidyDeepSeekChat_${sessionId}`, JSON.stringify(compressedData));
      
    } catch (error) {
      console.error('Failed to save conversation:', error);
      
      if (error.name === 'QuotaExceededError') {
        // 容量オーバーの場合はより積極的にクリーンアップ
        console.warn('Storage quota exceeded, performing emergency cleanup...');
        try {
          cleanupOldSessions();
          
          // 最小限のデータで再試行
          const minimalData = {
            messages: messages.slice(-5),
            context: conversationContext.slice(-3),
            collectedInfo,
            questionCount,
            lastUpdated: new Date().toISOString()
          };
          
          localStorage.setItem(`subsidyDeepSeekChat_${sessionId}`, JSON.stringify(minimalData));
          console.log('Emergency save successful with minimal data');
          
        } catch (emergencyError) {
          console.error('Emergency save also failed:', emergencyError);
          // 最後の手段：現在のセッションデータを削除
          try {
            localStorage.removeItem(`subsidyDeepSeekChat_${sessionId}`);
            console.warn('Removed current session data to prevent app crash');
          } catch {
            // 何もできない
          }
        }
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const cleanJsonResponse = (response) => {
    // より堅牢なJSON抽出
    // 1. まず ```json ``` タグを除去
    let cleaned = response;
    if (response.includes('```json')) {
      cleaned = response.replace(/```json\s*/g, '').replace(/```/g, '');
    } else if (response.includes('```')) {
      cleaned = response.replace(/```\s*/g, '');
    }
    
    // 2. JSON部分を正規表現で抽出
    const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return jsonMatch[0].trim();
    }
    
    // 3. それでも見つからない場合は元の文字列を返す
    return cleaned.trim();
  };

  const checkAPIAvailability = () => {
    if (!deepseekApi) {
      const errorMessage = 'エラー：DeepSeek APIが利用できません。';
      console.error(errorMessage);
      addMessage('bot', errorMessage);
      setIsLoading(false);
      return false;
    }
    return true;
  };

  const initializeConversation = async () => {
    if (!checkAPIAvailability()) return;

    const initialPrompt = `
あなたは補助金検索の専門アシスタントです。ユーザーとの対話を通じて、最適な補助金を見つけるお手伝いをします。

${apiSpec}

重要な指示：
1. ユーザーの具体的な課題や状況を深く理解することを最優先にしてください
2. 画一的な質問ではなく、ユーザーの回答に基づいて次の質問を動的に生成してください
3. ユーザーの業界や規模に特化した質問をしてください
4. 2-3回の質問で核心的な情報を引き出し、適切な補助金を絞り込んでください

例：
- 製造業で設備更新→「どのような設備ですか？生産設備？検査機器？省エネ設備？」
- IT化を進めたい→「どんな業務を効率化したいですか？顧客管理？在庫管理？業務自動化？」
- 人材育成→「どんなスキルの人材が必要ですか？技術者？営業？デジタル人材？」

最初の質問でユーザーの大まかな課題を把握し、次の質問で具体的な状況を深掘りしてください。

応答は必ず以下のJSON形式のみを返してください。他の文字は一切含めないでください：
{
  "response": "ユーザーへの返答",
  "quickOptions": [
    {
      "label": "選択肢のラベル",
      "value": "選択肢の値"
    }
  ],
  "searchParams": null,
  "shouldSearch": false,
  "currentStage": "introduction"
}`;

    try {
      console.log('Initializing conversation...');
      const response = await deepseekApi.complete(initialPrompt);
      console.log('Initial response:', response);
      
      const cleanedResponse = cleanJsonResponse(response);
      
      let data;
      try {
        data = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('Initial JSON Parse Error:', parseError);
        console.error('Original response:', response);
        console.error('Cleaned response:', cleanedResponse);
        
        // フォールバック - より洞察的な質問フロー
        data = {
          response: 'こんにちは！補助金検索のお手伝いをします😊\n\n**今、あなたのビジネスで一番解決したい課題は何ですか？**\n\n具体的な状況を教えていただければ、最適な補助金をご提案します：',
          quickOptions: [
            { label: '💰 資金繰りが厳しく、運転資金が必要', value: '資金繰りが厳しく運転資金が必要です' },
            { label: '🏭 設備が古くなり、更新・導入が必要', value: '設備の老朽化で更新が必要です' },
            { label: '👥 人手不足で、採用・育成に投資したい', value: '人材不足で採用や育成に投資が必要です' },
            { label: '💻 業務効率化のためデジタル化したい', value: '業務効率化のためにデジタル化を進めたいです' },
            { label: '📈 新商品・サービスを開発したい', value: '新しい商品やサービスの開発を考えています' },
            { label: '🌍 新しい販路・市場を開拓したい', value: '新しい販路や市場の開拓を検討しています' },
            { label: '🔬 技術開発・研究開発を行いたい', value: '技術開発や研究開発に取り組みたいです' },
            { label: '🌱 環境・エネルギー対策を進めたい', value: '環境対策やエネルギー効率化を進めたいです' },
            { label: '💭 その他の課題がある', value: 'その他の具体的な課題があります' }
          ]
        };
      }
      
      addMessage('bot', data.response);
      if (data.quickOptions) {
        setQuickOptions(data.quickOptions);
        setAllowMultiSelect(data.allowMultiSelect || false);
      }
      updateContext('assistant', data.response);
    } catch (error) {
      console.error('Init Error:', error);
      let errorMessage = 'エラーが発生しました。';
      
      if (error.code === 'ERR_NETWORK') {
        errorMessage = 'バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。';
      } else if (error.status === 401) {
        errorMessage = 'DeepSeek APIキーが無効です。正しいAPIキーを設定してください。';
      } else if (error.status === 429) {
        errorMessage = 'API利用制限に達しました。しばらく待ってから再試行してください。';
      } else if (error.status === 500) {
        errorMessage = `サーバーエラー: ${error.message}`;
      } else if (error.details) {
        errorMessage = `エラー: ${error.message}\n詳細: ${JSON.stringify(error.details)}`;
      }
      
      addMessage('bot', errorMessage);
    }
  };

  const addMessage = (sender, content, data = null) => {
    const newMessage = {
      id: Date.now() + Math.random(), // ユニークIDを生成
      sender,
      content,
      timestamp: new Date().toISOString(),
      data
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const updateContext = (role, content) => {
    setConversationContext(prev => [...prev, { role, content }]);
  };

  // 収集した情報を更新する関数
  const updateCollectedInfo = (input) => {
    const newInfo = { ...collectedInfo };
    
    // 利用目的の判定
    if (!newInfo.use_purpose) {
      if (input.includes('新たな事業') || input.includes('創業') || input.includes('起業')) {
        newInfo.use_purpose = '新たな事業を行いたい';
      } else if (input.includes('設備') || input.includes('IT') || input.includes('DX')) {
        newInfo.use_purpose = '設備整備・IT導入をしたい';
      } else if (input.includes('販路') || input.includes('海外')) {
        newInfo.use_purpose = '販路拡大・海外展開をしたい';
      } else if (input.includes('研究') || input.includes('開発')) {
        newInfo.use_purpose = '研究開発・実証事業を行いたい';
      }
    }
    
    // 業種の判定
    if (!newInfo.industry) {
      if (input.includes('製造業') || input.includes('製造')) {
        newInfo.industry = '製造業';
      } else if (input.includes('情報通信') || input.includes('IT') || input.includes('システム')) {
        newInfo.industry = '情報通信業';
      } else if (input.includes('卸売') || input.includes('小売') || input.includes('販売')) {
        newInfo.industry = '卸売業，小売業';
      } else if (input.includes('建設')) {
        newInfo.industry = '建設業';
      } else if (input.includes('サービス')) {
        newInfo.industry = 'サービス業（他に分類されないもの）';
      }
    }
    
    // 従業員数の判定
    if (!newInfo.target_number_of_employees) {
      if (input.includes('5名以下') || input.includes('5人以下')) {
        newInfo.target_number_of_employees = '5名以下';
      } else if (input.includes('20名以下') || input.includes('20人以下')) {
        newInfo.target_number_of_employees = '20名以下';
      } else if (input.includes('50名以下') || input.includes('50人以下')) {
        newInfo.target_number_of_employees = '50名以下';
      } else if (input.includes('100名以下') || input.includes('100人以下')) {
        newInfo.target_number_of_employees = '100名以下';
      } else if (input.includes('300名以下') || input.includes('300人以下')) {
        newInfo.target_number_of_employees = '300名以下';
      }
    }
    
    // 地域の判定
    if (!newInfo.target_area_search) {
      const prefectures = [
        '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
        '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
        '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
        '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
        '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
        '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
      ];
      
      for (const pref of prefectures) {
        if (input.includes(pref)) {
          newInfo.target_area_search = pref;
          break;
        }
      }
    }
    
    setCollectedInfo(newInfo);
    return newInfo;
  };

  // 検索実行可能かを判定する関数
  const canExecuteSearch = (info) => {
    return info.use_purpose && info.industry && info.target_area_search && info.target_number_of_employees;
  };

  // 自動検索実行
  const checkAndExecuteSearch = async (info) => {
    if (canExecuteSearch(info)) {
      const searchParams = {
        keyword: info.specific_needs || '補助金',
        use_purpose: info.use_purpose,
        industry: info.industry,
        target_area_search: info.target_area_search,
        target_number_of_employees: info.target_number_of_employees
      };
      
      await performMultipleSearches([searchParams], `${info.use_purpose}を目的とした${info.industry}の事業者（${info.target_number_of_employees}、${info.target_area_search}）`);
      return true;
    }
    return false;
  };

  const processUserInput = async (input) => {
    if (!checkAPIAvailability()) return;
    
    setIsLoading(true);
    updateContext('user', input);
    setQuickOptions([]); // 一旦クリア
    
    // 情報を更新
    const updatedInfo = updateCollectedInfo(input);
    setQuestionCount(prev => prev + 1);
    
    // 検索実行可能かチェック
    if (await checkAndExecuteSearch(updatedInfo)) {
      setIsLoading(false);
      return;
    }

    const prompt = `
ユーザーの最新の回答: "${input}"

現在までの会話コンテキスト:
${conversationContext.slice(-3).map(ctx => `${ctx.role}: ${ctx.content}`).join('\n')}

現在収集済みの情報:
- 利用目的: ${updatedInfo.use_purpose || '未収集'}
- 業種: ${updatedInfo.industry || '未収集'}
- 地域: ${updatedInfo.target_area_search || '未収集'}
- 従業員数: ${updatedInfo.target_number_of_employees || '未収集'}
- 具体的なニーズ: ${updatedInfo.specific_needs || '未収集'}

重要：ユーザーの回答から以下を分析してください：
1. ユーザーの本質的な課題は何か
2. どんな補助金が最も役立つか
3. 次に聞くべき最も重要な質問は何か

質問回数: ${questionCount}/3（3回以内で必要な情報を収集してください）

会話履歴:
${JSON.stringify(conversationContext.slice(-4))} // 最新4回分のみ

補助金検索APIの仕様:
${apiSpec}

ユーザーの最新の入力: 「${input}」

【重要なルール】
1. ユーザーの課題に基づいて、最も関連性の高い補助金を見つけるための質問をする
2. 画一的な質問ではなく、前の回答を踏まえた具体的な質問をする
3. 最大3つの質問で必要な情報を収集し、検索に移行する
4. ユーザーの業界や状況に特化した選択肢を提供する

次のステップを決定してください:

【情報収集フェーズ】
- ユーザーの課題や状況を深掘りする質問を1つ作成
- その課題に関連する具体的な選択肢を提供
- 例：
  - 設備更新なら→具体的な設備の種類、予算規模、省エネ要件など
  - IT化なら→導入したいシステム、解決したい業務課題、予算規模など
  - 人材育成なら→必要なスキル、対象人数、研修内容など

【検索実行フェーズ】（3回質問後、または十分な情報が集まったら）
- shouldSearch: trueにして、収集した情報から最適な検索条件を生成
- multipleSearchParamsに複数の検索パターンを設定（幅広い結果を得るため）

JSONのみを返してください:
{
  "response": "ユーザーへの返答（進捗も含める）",
  "quickOptions": [
    {
      "label": "選択肢のラベル（絵文字付き）",
      "value": "選択した場合の返答文"
    }
  ],
  "multipleSearchParams": [
    {
      "keyword": "検索キーワード（2文字以上）",
      "use_purpose": "${updatedInfo.use_purpose || ''}",
      "industry": "${updatedInfo.industry || ''}",
      "target_area_search": "${updatedInfo.target_area_search || ''}",
      "target_number_of_employees": "${updatedInfo.target_number_of_employees || ''}"
    }
  ],
  "shouldSearch": false,
  "userNeeds": "ユーザーのニーズの要約",
  "currentStage": "${questionCount >= 3 ? 'force_search' : 'collecting_info'}"
}`;

    try {
      console.log('Sending prompt to DeepSeek:', prompt);
      const response = await deepseekApi.complete(prompt);
      console.log('DeepSeek response:', response);
      
      const cleanedResponse = cleanJsonResponse(response);
      
      let data;
      try {
        data = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Original response:', response);
        console.error('Cleaned response:', cleanedResponse);
        
        // ユーザーにエラーを伝え、やり直すよう促す
        addMessage('bot', 'AIからの応答を正しく解析できませんでした。申し訳ありませんが、もう一度試していただくか、違う聞き方をしてみてください。');
        setIsLoading(false);
        return;
      }
      
      addMessage('bot', data.response);
      updateContext('assistant', data.response);

      if (data.quickOptions && data.quickOptions.length > 0) {
        setQuickOptions(data.quickOptions);
        setAllowMultiSelect(data.allowMultiSelect || false);
      }

      if (data.shouldSearch === true && data.multipleSearchParams && data.multipleSearchParams.length > 0) {
        await performMultipleSearches(data.multipleSearchParams, data.userNeeds || '');
      } else if (data.currentStage === 'force_search' || questionCount >= 3) {
        // 3回質問したら強制的に検索実行
        const forceSearchParams = {
          keyword: '補助金',
          use_purpose: updatedInfo.use_purpose || '',
          industry: updatedInfo.industry || '',
          target_area_search: updatedInfo.target_area_search || '',
          target_number_of_employees: updatedInfo.target_number_of_employees || ''
        };
        await performMultipleSearches([forceSearchParams], '収集された情報に基づく補助金検索');
      }
    } catch (error) {
      console.error('Process Error:', error);
      addMessage('bot', '申し訳ございません。エラーが発生しました。もう一度お試しください。\n\nエラー詳細: ' + error.message);
    }

    setIsLoading(false);
  };

  const handleQuickOption = (option) => {
    if (isLoading) return;

    // 即座に検索する場合
    if (option.value === 'search_now') {
      if (selectedOptions.length > 0) {
        const combinedValue = selectedOptions.map(opt => opt.value).join('、');
        addMessage('user', `選択した条件：${combinedValue}`);
        processUserInput(combinedValue);
      } else {
        addMessage('user', '今すぐ検索したいです');
        processUserInput('今すぐ検索したいです');
      }
      setSelectedOptions([]);
      setAllowMultiSelect(false);
      return;
    }

    // 複数選択モードの場合
    if (allowMultiSelect) {
      const isSelected = selectedOptions.some(selected => selected.value === option.value);
      
      if (isSelected) {
        // 選択解除
        setSelectedOptions(prev => prev.filter(selected => selected.value !== option.value));
      } else {
        // 選択追加
        setSelectedOptions(prev => [...prev, option]);
      }
    } else {
      // 単一選択モード
      addMessage('user', option.value);
      processUserInput(option.value);
      setSelectedOptions([]);
    }
  };

  const performMultipleSearches = async (searchParamsList, userNeeds) => {
    addMessage('bot', '条件に合う補助金を検索しています...');
    
    let allResults = [];
    const resultsMap = new Map();

    // 複数の検索パターンで検索を実行
    for (const params of searchParamsList) {
      const searchParams = {
        keyword: params.keyword || '',
        sort: 'acceptance_end_datetime',
        order: 'ASC',
        acceptance: '1',
        ...params
      };

      try {
        // 実際のAPI呼び出し
        const apiUrl = new URL('/api/jgrants/subsidies', window.location.origin);
        
        // パラメータの設定
        Object.keys(searchParams).forEach(key => {
          if (searchParams[key]) {
            apiUrl.searchParams.append(key, searchParams[key]);
          }
        });
        
        console.log('API Request URL:', apiUrl.toString());
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const apiData = await response.json();
        console.log('API Response:', apiData);
        
        const apiResults = apiData.result || [];
        
        // 各補助金の詳細情報を取得
        for (const subsidy of apiResults) {
          // 詳細APIを呼び出して front_subsidy_detail_page_url を取得
          try {
            const detailUrl = new URL(`/api/jgrants/subsidies/id/${subsidy.id}`, window.location.origin);
            const detailResponse = await fetch(detailUrl.toString(), {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              }
            });
            
            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              const detailResult = detailData.result?.[0] || {};
              
              const enrichedSubsidy = {
                ...subsidy,
                ...detailResult,
                detailUrl: detailResult.front_subsidy_detail_page_url || `https://jgrants.go.jp/`,
                matchedKeywords: [params.keyword],
                relevanceScore: calculateRelevanceScore(subsidy, userNeeds, params)
              };
              
              if (!resultsMap.has(subsidy.id)) {
                resultsMap.set(subsidy.id, enrichedSubsidy);
              } else {
                const existing = resultsMap.get(subsidy.id);
                existing.matchedKeywords.push(params.keyword);
                existing.relevanceScore = Math.max(
                  existing.relevanceScore,
                  enrichedSubsidy.relevanceScore
                );
              }
            }
          } catch (detailError) {
            console.error(`Failed to fetch detail for subsidy ${subsidy.id}:`, detailError);
            // 詳細が取得できない場合でも基本情報は保持
            if (!resultsMap.has(subsidy.id)) {
              resultsMap.set(subsidy.id, {
                ...subsidy,
                detailUrl: 'https://jgrants.go.jp/',
                matchedKeywords: [params.keyword],
                relevanceScore: calculateRelevanceScore(subsidy, userNeeds, params)
              });
            }
          }
        }
        
      } catch (error) {
        console.error('Failed to fetch subsidies:', error);
        
        // エラーハンドリング
        addMessage('bot', `補助金の検索中にエラーが発生しました：${error.message}\n\nプロキシサーバーが正しく設定されているか確認してください。`);
      }
    }

    // 関連度でソート
    allResults = Array.from(resultsMap.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 10);

    if (allResults.length === 0) {
      addMessage('bot', '申し訳ございません。条件に合う補助金が見つかりませんでした。\n\n条件を変更して再検索することをお勧めします。');
      
      const retryOptions = [
        { label: '🔄 条件を変更して再検索', value: '条件を変更して再検索したいです' },
        { label: '💡 他の補助金を提案して', value: '他の補助金の提案をお願いします' },
        { label: '❓ 補助金の探し方を教えて', value: '補助金の探し方について教えてください' },
        { label: '📋 申請要件を確認したい', value: '補助金の申請要件について確認したいです' },
        { label: '🏠 地域限定の補助金を探したい', value: '地域限定の補助金を探したいです' }
      ];
      setQuickOptions(retryOptions);
      return;
    }

    // DeepSeekに結果を分析してもらう
    // 必要な情報のみを抽出してデータサイズを削減
    const simplifiedResults = allResults.map(s => ({
      id: s.id,
      title: s.title,
      subsidy_max_limit: s.subsidy_max_limit,
      use_purpose: s.use_purpose,
      industry: s.industry,
      target_area_search: s.target_area_search,
      target_number_of_employees: s.target_number_of_employees,
      description: s.description ? s.description.substring(0, 200) : ''
    }));
    
    const analysisPrompt = `
以下の補助金検索結果とユーザーのニーズを踏まえて、最適な補助金を5-8件程度選んで提案してください。多様な選択肢を提供してください：

ユーザーのニーズ：${userNeeds}
検索結果（${allResults.length}件）：${JSON.stringify(simplifiedResults.slice(0, 20))}

JSONのみを返してください：
{
  "response": "ユーザーのニーズに最も適した補助金の提案（各補助金について、なぜ適しているか具体的に説明）",
  "recommendedSubsidies": [
    {
      "id": "補助金ID",
      "title": "補助金名",
      "reason": "推奨理由",
      "priority": 1
    }
  ]
}`;

    try {
      const analysisResponse = await deepseekApi.complete(analysisPrompt);
      const cleanedAnalysisResponse = cleanJsonResponse(analysisResponse);
      const analysisData = JSON.parse(cleanedAnalysisResponse);
      
      let detailedMessage = analysisData.response + '\n\n';
      
      // 推奨された補助金を最初に表示
      analysisData.recommendedSubsidies.forEach((rec, index) => {
        const subsidy = allResults.find(s => s.id === rec.id);
        if (subsidy) {
          detailedMessage += `\n【推奨${index + 1}】${subsidy.title}\n`;
          detailedMessage += `📍 ${rec.reason}\n`;
          detailedMessage += `💰 補助額上限：${subsidy.subsidy_max_limit ? subsidy.subsidy_max_limit.toLocaleString() + '円' : '要確認'}\n`;
          detailedMessage += `📅 募集期間：${subsidy.acceptance_start_datetime ? new Date(subsidy.acceptance_start_datetime).toLocaleDateString('ja-JP') : '要確認'} ～ ${subsidy.acceptance_end_datetime ? new Date(subsidy.acceptance_end_datetime).toLocaleDateString('ja-JP') : '要確認'}\n`;
          detailedMessage += `🏢 対象：${subsidy.target_number_of_employees || '要確認'}\n`;
          detailedMessage += `🔗 詳細：${subsidy.detailUrl}\n`;
        }
      });

      // 推奨以外の関連補助金も表示（最大8件まで）
      const recommendedIds = analysisData.recommendedSubsidies.map(r => r.id);
      const otherSubsidies = allResults.filter(s => !recommendedIds.includes(s.id)).slice(0, 8);
      
      if (otherSubsidies.length > 0) {
        detailedMessage += `\n\n【その他の関連補助金】\n`;
        otherSubsidies.forEach((subsidy, index) => {
          detailedMessage += `\n${index + 1}. ${subsidy.title}\n`;
          detailedMessage += `💰 補助額上限：${subsidy.subsidy_max_limit ? subsidy.subsidy_max_limit.toLocaleString() + '円' : '要確認'}\n`;
          detailedMessage += `📅 募集期間：${subsidy.acceptance_start_datetime ? new Date(subsidy.acceptance_start_datetime).toLocaleDateString('ja-JP') : '要確認'} ～ ${subsidy.acceptance_end_datetime ? new Date(subsidy.acceptance_end_datetime).toLocaleDateString('ja-JP') : '要確認'}\n`;
          detailedMessage += `🔗 詳細：${subsidy.detailUrl}\n`;
        });
      }

      addMessage('bot', detailedMessage, { 
        results: allResults,
        recommendations: analysisData.recommendedSubsidies 
      });
      updateContext('assistant', detailedMessage);
      
      const nextActionOptions = [
        { label: '📋 申請方法を詳しく知りたい', value: '推奨された補助金の申請方法について教えてください' },
        { label: '💰 他の補助金も探したい', value: '他の補助金も探してください' },
        { label: '📊 補助金の比較をしたい', value: '提案された補助金を比較して説明してください' },
        { label: '❓ 補助金について質問がある', value: '補助金について質問があります' },
        { label: '📅 申請スケジュールを確認したい', value: '申請スケジュールについて教えてください' }
      ];
      setQuickOptions(nextActionOptions);
    } catch (error) {
      console.error('Analysis error:', error);
      const simpleMessage = `
${allResults.length}件の補助金が見つかりました。

${allResults.slice(0, 5).map((subsidy, index) => `
【${index + 1}】${subsidy.title}
💰 補助額上限：${subsidy.subsidy_max_limit ? subsidy.subsidy_max_limit.toLocaleString() + '円' : '要確認'}
📅 募集期間：${subsidy.acceptance_start_datetime ? new Date(subsidy.acceptance_start_datetime).toLocaleDateString('ja-JP') : '要確認'} ～ ${subsidy.acceptance_end_datetime ? new Date(subsidy.acceptance_end_datetime).toLocaleDateString('ja-JP') : '要確認'}
🏢 対象：${subsidy.target_number_of_employees || '要確認'}
🔗 詳細：${subsidy.detailUrl}
`).join('\n')}`;

      addMessage('bot', simpleMessage, { results: allResults });
    }
  };

  // 関連度スコア計算関数
  const calculateRelevanceScore = (subsidy, userNeeds, searchParams) => {
    let score = 0;
    
    // キーワードマッチング
    if (searchParams.keyword && subsidy.title) {
      const keyword = searchParams.keyword.toLowerCase();
      const title = subsidy.title.toLowerCase();
      if (title.includes(keyword)) {
        score += 30;
      }
    }
    
    // 利用目的マッチング
    if (searchParams.use_purpose && subsidy.use_purpose) {
      if (subsidy.use_purpose.includes(searchParams.use_purpose)) {
        score += 25;
      }
    }
    
    // 業種マッチング
    if (searchParams.industry && subsidy.industry) {
      if (subsidy.industry.includes(searchParams.industry)) {
        score += 20;
      }
    }
    
    // 従業員数マッチング
    if (searchParams.target_number_of_employees && subsidy.target_number_of_employees) {
      if (searchParams.target_number_of_employees === subsidy.target_number_of_employees) {
        score += 15;
      }
    }
    
    // 地域マッチング
    if (searchParams.target_area_search && subsidy.target_area_search) {
      if (subsidy.target_area_search.includes(searchParams.target_area_search) || 
          subsidy.target_area_search === '全国') {
        score += 10;
      }
    }
    
    // 募集期間の考慮（締切が近いものは優先度を下げる）
    if (subsidy.acceptance_end_datetime) {
      const daysUntilEnd = Math.floor(
        (new Date(subsidy.acceptance_end_datetime) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilEnd > 30 && daysUntilEnd < 180) {
        score += 5; // 適切な期間内
      } else if (daysUntilEnd <= 30) {
        score -= 5; // 締切が近すぎる
      }
    }
    
    return score;
  };

  const handleSendMessage = () => {
    if (inputMessage.trim() && !isLoading) {
      addMessage('user', inputMessage);
      processUserInput(inputMessage);
      setInputMessage('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const startNewConversation = () => {
    const newSessionId = generateSessionId();
    setSessionId(newSessionId);
    localStorage.setItem('subsidyDeepSeekSessionId', newSessionId);
    setMessages([]);
    setConversationContext([]);
    setQuickOptions([]);
    setCollectedInfo({
      use_purpose: null,
      industry: null,
      target_area_search: null,
      target_number_of_employees: null,
      specific_needs: null
    });
    setQuestionCount(0);
    setInputMessage('');
    setIsLoading(false);
    setIsInitialized(false);
    initializeConversation();
    setIsInitialized(true);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Search className="w-6 h-6 text-indigo-600" />
            <div>
              <h1 className="text-xl font-semibold text-gray-800">補助金検索アシスタント (DeepSeek)</h1>
              {questionCount > 0 && questionCount < 5 && (
                <div className="text-sm text-gray-600 mt-1">
                  進捗: {questionCount}/5 質問完了 
                  {canExecuteSearch(collectedInfo) && <span className="text-green-600 ml-2">✓ 検索可能</span>}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={startNewConversation}
            className="flex items-center space-x-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>新しい会話</span>
          </button>
        </div>
      </div>

      {/* チャットエリア */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`mb-4 flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-start max-w-3xl ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.sender === 'user' ? 'bg-indigo-600 ml-3' : 'bg-gray-600 mr-3'
                }`}>
                  {message.sender === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className={`rounded-lg px-4 py-3 ${
                  message.sender === 'user' 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                }`}>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className={`text-xs mt-2 ${
                    message.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString('ja-JP', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start mb-4">
              <div className="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg px-4 py-3 shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="text-sm text-gray-600">考えています...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* クイック選択オプション */}
      {quickOptions.length > 0 && !isLoading && (
        <div className="bg-gray-50 border-t">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="text-sm text-gray-600 mb-3">
              {allowMultiSelect ? '複数選択可能です（選択後「今すぐ検索する」を押してください）：' : '以下から選択してください：'}
            </div>
            
            {/* 選択済みのオプションを表示 */}
            {allowMultiSelect && selectedOptions.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">選択済み：</div>
                <div className="flex flex-wrap gap-2">
                  {selectedOptions.map((selected, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-800">
                      {selected.label}
                      <button
                        onClick={() => handleQuickOption(selected)}
                        className="ml-1 text-indigo-600 hover:text-indigo-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {quickOptions.map((option, index) => {
                const isSelected = selectedOptions.some(selected => selected.value === option.value);
                const isActionButton = option.category === 'action';
                
                return (
                  <button
                    key={index}
                    onClick={() => handleQuickOption(option)}
                    className={`text-left px-4 py-3 border rounded-lg transition-colors duration-200 ${
                      isActionButton
                        ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                        : isSelected
                        ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                        : 'bg-white border-gray-300 text-gray-800 hover:bg-indigo-50 hover:border-indigo-300'
                    }`}
                  >
                    <span className={isActionButton ? 'text-white' : ''}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 入力エリア */}
      <div className="bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={quickOptions.length > 0 ? "選択肢から選ぶか、自由に入力してください..." : "メッセージを入力してください..."}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent overflow-hidden"
                disabled={isLoading}
                style={{ minHeight: '48px' }}
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !inputMessage.trim()}
              className={`px-4 py-3 rounded-lg transition-colors flex items-center justify-center ${
                isLoading || !inputMessage.trim()
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubsidySearchChat;