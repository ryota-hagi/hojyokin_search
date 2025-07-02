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
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
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
        
        // 強化された初期質問フロー
        data = {
          response: '🎯 **補助金検索AI コンサルタント**へようこそ！\n\n私は、あなたのビジネス課題を深く理解し、最適な補助金を見つける専門アシスタントです。\n\n**まず、現在のビジネス状況について教えてください：**\n\n📋 どのような課題を解決したいですか？具体的な状況を選択いただければ、あなたに最適化された質問と補助金をご提案します。',
          quickOptions: [
            { label: '💰 事業資金・運転資金の確保が課題', value: '事業の成長のために資金調達や運転資金の確保が課題となっています' },
            { label: '🏭 生産設備・機械の更新・導入', value: '生産効率向上のため設備の更新や新しい機械の導入を検討しています' },
            { label: '💻 業務のデジタル化・IT化推進', value: '業務効率化や競争力向上のためDXやIT化を進めたいと考えています' },
            { label: '👥 人材確保・スキルアップ・組織強化', value: '人材不足の解決や既存社員のスキルアップ、組織体制の強化が必要です' },
            { label: '🔬 新商品・新技術の研究開発', value: '競争力向上のため新商品開発や技術革新に取り組みたいです' },
            { label: '🌍 新市場開拓・販路拡大・海外展開', value: '売上拡大のため新しい市場開拓や販路拡大を目指しています' },
            { label: '🌱 環境対策・省エネ・持続可能経営', value: '環境負荷削減や省エネ、持続可能な経営への転換を考えています' },
            { label: '🏢 事業承継・新規創業・第二創業', value: '事業承継の準備や新規創業、既存事業からの転換を検討しています' },
            { label: '💭 複数の課題があり相談したい', value: '複数の課題を抱えており、どこから手をつけるべきか相談したいです' }
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

  // 強化されたユーザー回答から検索条件を抽出する関数
  const updateCollectedInfo = (input) => {
    const newInfo = { ...collectedInfo };
    const lowerInput = input.toLowerCase();
    
    // 具体的なニーズを保存
    if (!newInfo.specific_needs) {
      newInfo.specific_needs = input;
    }
    
    // 課題から利用目的を高精度で推定（複数キーワード、文脈を考慮）
    if (!newInfo.use_purpose) {
      const purposePatterns = {
        '新たな事業を行いたい': [
          '新規事業', '事業拡大', '事業転換', '多角化', 'スタートアップ', '起業', 
          '新分野', '新市場', '事業承継', '第二創業', '資金繰り', '運転資金',
          '人材採用', '人材確保', '組織強化', '体制構築'
        ],
        '設備整備・IT導入をしたい': [
          '設備更新', '設備導入', '機械導入', '工場', '生産設備', '製造設備',
          'IT導入', 'DX', 'デジタル', 'システム', 'ソフトウェア', '自動化',
          '効率化', 'ICT', 'AI', 'IoT', 'クラウド', '省エネ', '環境対策'
        ],
        '研究開発・実証事業を行いたい': [
          '研究開発', '技術開発', '商品開発', 'R&D', '新技術', '特許',
          'イノベーション', '実証実験', 'プロトタイプ', '試作', '新製品'
        ],
        '販路拡大・海外展開をしたい': [
          '販路拡大', '市場開拓', '新市場', '海外展開', '輸出', '国際化',
          'マーケティング', '営業強化', 'ブランディング', 'EC', 'オンライン'
        ]
      };
      
      for (const [purpose, keywords] of Object.entries(purposePatterns)) {
        if (keywords.some(keyword => lowerInput.includes(keyword))) {
          newInfo.use_purpose = purpose;
          break;
        }
      }
    }
    
    // 業種の高精度判定（業界特有の用語も含める）
    if (!newInfo.industry) {
      const industryPatterns = {
        '製造業': [
          '製造', '工場', '生産', '加工', '組立', '部品', '材料', '金属',
          '機械', '電子', '自動車', '化学', '食品', '繊維', '印刷'
        ],
        '情報通信業': [
          'IT', 'システム', 'ソフトウェア', 'Web', 'アプリ', 'プログラム',
          '通信', 'データ', 'AI', 'DX', 'クラウド', 'サーバー'
        ],
        '卸売業，小売業': [
          '小売', '卸売', '販売', '店舗', 'EC', '通販', 'ネットショップ',
          '商品', '仕入れ', '在庫', '流通', 'POS'
        ],
        '建設業': [
          '建設', '工事', '建築', '土木', '設計', '施工', '住宅',
          'リフォーム', '改修', '解体', '造成'
        ],
        '宿泊業，飲食サービス業': [
          '飲食', 'レストラン', 'カフェ', '宿泊', 'ホテル', '旅館',
          '観光', '料理', '接客', 'サービス業'
        ],
        '医療，福祉': [
          '医療', '介護', '福祉', '病院', 'クリニック', 'ケア',
          '看護', 'リハビリ', '健康', '薬局'
        ],
        '教育，学習支援業': [
          '教育', '学習', '研修', '塾', 'スクール', '講座',
          '人材育成', 'eラーニング', 'セミナー'
        ],
        '運輸業，郵便業': [
          '運送', '物流', '配送', '輸送', '倉庫', '宅配',
          'ロジスティクス', 'トラック', '海運', '航空'
        ],
        'サービス業（他に分類されないもの）': [
          'サービス', 'コンサル', '専門', '技術サービス', '清掃',
          '警備', 'メンテナンス', '修理', '相談'
        ]
      };
      
      for (const [industry, keywords] of Object.entries(industryPatterns)) {
        if (keywords.some(keyword => lowerInput.includes(keyword))) {
          newInfo.industry = industry;
          break;
        }
      }
    }
    
    // 従業員数の詳細判定（数値表現も考慮）
    if (!newInfo.target_number_of_employees) {
      const employeePatterns = [
        { range: '5名以下', keywords: ['5名以下', '5人以下', '個人事業', 'フリーランス', '1人', '2人', '3人', '4人', '5人'] },
        { range: '20名以下', keywords: ['20名以下', '20人以下', '小規模', '10人', '15人', '20人'] },
        { range: '50名以下', keywords: ['50名以下', '50人以下', '30人', '40人', '50人'] },
        { range: '100名以下', keywords: ['100名以下', '100人以下', '中小企業', '60人', '80人', '100人'] },
        { range: '300名以下', keywords: ['300名以下', '300人以下', '200人', '250人', '300人'] }
      ];
      
      for (const pattern of employeePatterns) {
        if (pattern.keywords.some(keyword => input.includes(keyword))) {
          newInfo.target_number_of_employees = pattern.range;
          break;
        }
      }
      
      // 数値パターンのマッチング
      const numberMatch = input.match(/(\d+)名?人?/);
      if (numberMatch && !newInfo.target_number_of_employees) {
        const num = parseInt(numberMatch[1]);
        if (num <= 5) newInfo.target_number_of_employees = '5名以下';
        else if (num <= 20) newInfo.target_number_of_employees = '20名以下';
        else if (num <= 50) newInfo.target_number_of_employees = '50名以下';
        else if (num <= 100) newInfo.target_number_of_employees = '100名以下';
        else if (num <= 300) newInfo.target_number_of_employees = '300名以下';
      }
    }
    
    // 地域の判定（都道府県マッピング + 地域ブロック対応）
    if (!newInfo.target_area_search) {
      const prefectureMap = {
        '北海道': '北海道',
        '青森': '青森県', '岩手': '岩手県', '宮城': '宮城県', '秋田': '秋田県', '山形': '山形県', '福島': '福島県',
        '茨城': '茨城県', '栃木': '栃木県', '群馬': '群馬県', '埼玉': '埼玉県', '千葉': '千葉県', '東京': '東京都', '神奈川': '神奈川県',
        '新潟': '新潟県', '富山': '富山県', '石川': '石川県', '福井': '福井県', '山梨': '山梨県', '長野': '長野県', '岐阜': '岐阜県',
        '静岡': '静岡県', '愛知': '愛知県', '三重': '三重県', '滋賀': '滋賀県', '京都': '京都府', '大阪': '大阪府', '兵庫': '兵庫県',
        '奈良': '奈良県', '和歌山': '和歌山県', '鳥取': '鳥取県', '島根': '島根県', '岡山': '岡山県', '広島': '広島県', '山口': '山口県',
        '徳島': '徳島県', '香川': '香川県', '愛媛': '愛媛県', '高知': '高知県', '福岡': '福岡県', '佐賀': '佐賀県', '長崎': '長崎県',
        '熊本': '熊本県', '大分': '大分県', '宮崎': '宮崎県', '鹿児島': '鹿児島県', '沖縄': '沖縄県'
      };
      
      // 直接的な都道府県名のマッチング
      for (const [key, value] of Object.entries(prefectureMap)) {
        if (input.includes(key)) {
          newInfo.target_area_search = value;
          break;
        }
      }
      
      // 地域ブロック名のマッチング（関東、関西など）
      if (!newInfo.target_area_search) {
        const regionMap = {
          '関東': '東京都',
          '関西': '大阪府', 
          '近畿': '大阪府',
          '九州': '福岡県',
          '東北': '宮城県',
          '中部': '愛知県',
          '北陸': '石川県',
          '中国': '広島県',
          '四国': '香川県'
        };
        
        for (const [region, defaultPref] of Object.entries(regionMap)) {
          if (input.includes(region)) {
            newInfo.target_area_search = defaultPref;
            break;
          }
        }
      }
    }
    
    // 予算情報の抽出
    if (!newInfo.budget_range) {
      const budgetMatch = input.match(/(\d+)(万円?|千万円?|億円?)/);
      if (budgetMatch) {
        newInfo.budget_range = budgetMatch[0];
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

    // 動的な質問生成プロンプト - より洞察的で適応的
    const prompt = `
あなたは補助金検索の専門コンサルタントです。ユーザーとの対話から深い洞察を得て、最適な補助金をピンポイントで見つける使命があります。

【現在の状況分析】
ユーザーの最新回答: "${input}"
質問ラウンド: ${questionCount}/3

【収集済み情報】
- 利用目的: ${updatedInfo.use_purpose || '未特定'}
- 業種: ${updatedInfo.industry || '未特定'} 
- 地域: ${updatedInfo.target_area_search || '未特定'}
- 従業員数: ${updatedInfo.target_number_of_employees || '未特定'}
- 具体的課題: ${updatedInfo.specific_needs || '未特定'}

【会話の流れ】
${conversationContext.slice(-4).map((ctx, i) => `${i+1}. ${ctx.role}: ${ctx.content.substring(0, 100)}...`).join('\n')}

【あなたの使命】
1. ユーザーの回答から「本当の課題」を見抜く
2. その課題を解決する最適な補助金を特定するための戦略的質問を設計
3. 業界特有の課題や地域性を考慮した深い質問をする

【質問戦略】
現在の回答「${input}」を深く分析し、以下の観点で次の質問を設計：

◆ 課題の具体化戦略
- 設備投資なら→どんな課題を解決したい設備か？生産性？品質？環境？
- デジタル化なら→現在の業務のどこにボトルネックがあるか？
- 人材育成なら→どんなスキルギャップが事業成長を阻んでいるか？
- 新事業なら→既存事業との関連性は？技術的優位性は？

◆ 予算・規模感の把握
- 投資予算レンジの確認（数十万〜数千万レベル）
- 緊急度・実施時期の確認
- 投資対効果への期待値

◆ 地域・競合環境の理解
- 地域特有の課題や機会
- 同業他社との差別化ポイント
- 地方創生との関連性

【重要】以下の条件で次の行動を決定：

IF 質問回数 >= 3 OR 十分な情報収集完了
→ shouldSearch: true, 最適な検索パラメータ生成

ELSE 
→ ユーザーの回答に基づく戦略的な次の質問を1つ設計
→ その課題領域に特化した洞察的な選択肢を4-6個提供

【応答フォーマット】JSON形式で回答：
{
  "response": "ユーザーの回答への共感的反応 + 次の戦略的質問（なぜその質問が重要かも説明）",
  "quickOptions": [
    {
      "label": "🎯 具体的で実用的な選択肢（絵文字付き）",
      "value": "選択時の詳細な回答内容"
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
  "shouldSearch": ${questionCount >= 3 ? 'true' : 'false'},
  "userNeeds": "ユーザーの本質的なニーズの洞察",
  "currentStage": "${questionCount >= 3 ? 'execute_search' : 'deep_discovery'}"
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
    addMessage('bot', '🔍 ユーザーのニーズに最適な補助金を検索しています...\n\n複数の検索戦略で幅広く調査中です。');
    
    let allResults = [];
    const resultsMap = new Map();

    // 強化された検索戦略 - 複数のアプローチで補助金を発見
    const enhancedSearchParams = generateSearchStrategies(searchParamsList);

    // 複数の検索パターンで検索を実行
    for (const [strategyName, params] of enhancedSearchParams) {
      console.log(`Executing search strategy: ${strategyName}`, params);
      
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
        
        console.log(`API Request URL (${strategyName}):`, apiUrl.toString());
        
        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          console.warn(`API Error for strategy ${strategyName}: ${response.status} ${response.statusText}`);
          continue; // 他の戦略を試す
        }
        
        const apiData = await response.json();
        console.log(`API Response for ${strategyName}:`, apiData?.result?.length || 0, 'results');
        
        const apiResults = apiData.result || [];
        
        // 各補助金の詳細情報を取得
        for (const subsidy of apiResults.slice(0, 20)) { // 詳細取得は20件まで
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
                searchStrategy: strategyName,
                relevanceScore: calculateAdvancedRelevanceScore(subsidy, userNeeds, params, strategyName)
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
                // 複数の戦略でヒットした補助金は重要度アップ
                existing.relevanceScore += 5;
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
                searchStrategy: strategyName,
                relevanceScore: calculateAdvancedRelevanceScore(subsidy, userNeeds, params, strategyName)
              });
            }
          }
        }
        
      } catch (error) {
        console.error(`Failed to fetch subsidies for strategy ${strategyName}:`, error);
        // エラーは記録するが、他の戦略を続行
      }
    }

    // 関連度でソート（高度なスコアリング）
    allResults = Array.from(resultsMap.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 15); // より多くの結果を保持

    if (allResults.length === 0) {
      addMessage('bot', '💡 申し訳ございません。現在の条件では補助金が見つかりませんでした。\n\n以下のような理由が考えられます：\n- 検索条件が限定的すぎる\n- 該当する補助金の募集期間外\n- 地域や業種の制約\n\n条件を調整して再検索しましょう。');
      
      const retryOptions = [
        { label: '🔄 条件を緩和して再検索', value: '検索条件を緩和して再検索したいです' },
        { label: '🏢 業種を変更して検索', value: '業種を変更して検索したいです' },
        { label: '📍 地域を広げて検索', value: '地域を広げて検索したいです' },
        { label: '💰 予算規模を変更して検索', value: '予算規模を変更して検索したいです' },
        { label: '❓ 補助金の探し方を教えて', value: '効果的な補助金の探し方について教えてください' }
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

  // 複数の検索戦略を生成する関数
  const generateSearchStrategies = (searchParamsList) => {
    const strategies = [];
    const baseParams = searchParamsList[0] || {};
    
    // 戦略1: 基本検索（提供されたパラメータをそのまま使用）
    strategies.push(['基本検索', baseParams]);
    
    // 戦略2: キーワード重視検索
    if (baseParams.use_purpose) {
      const keywordVariations = {
        '設備整備・IT導入をしたい': ['設備', 'IT', 'DX', 'デジタル', '機械'],
        '新たな事業を行いたい': ['創業', '事業', '起業', '新規'],
        '研究開発・実証事業を行いたい': ['研究', '開発', 'R&D', '技術'],
        '販路拡大・海外展開をしたい': ['販路', '市場', '海外', '輸出']
      };
      
      const keywords = keywordVariations[baseParams.use_purpose] || ['補助金'];
      keywords.forEach((keyword) => {
        strategies.push([`キーワード戦略_${keyword}`, {
          ...baseParams,
          keyword: keyword
        }]);
      });
    }
    
    // 戦略3: 地域緩和検索（全国対象も含める）
    if (baseParams.target_area_search) {
      strategies.push(['地域拡張検索', {
        ...baseParams,
        target_area_search: '' // 地域制限を外す
      }]);
    }
    
    // 戦略4: 従業員数緩和検索
    if (baseParams.target_number_of_employees) {
      const relaxedEmployeeOptions = {
        '5名以下': ['20名以下', '50名以下'],
        '20名以下': ['50名以下', '100名以下'],
        '50名以下': ['100名以下', '300名以下']
      };
      
      const options = relaxedEmployeeOptions[baseParams.target_number_of_employees];
      if (options) {
        options.forEach(option => {
          strategies.push([`従業員数拡張_${option}`, {
            ...baseParams,
            target_number_of_employees: option
          }]);
        });
      }
    }
    
    // 戦略5: 業種拡張検索
    if (baseParams.industry) {
      const relatedIndustries = {
        '製造業': ['建設業', '卸売業，小売業'],
        '情報通信業': ['サービス業（他に分類されないもの）', '卸売業，小売業'],
        '卸売業，小売業': ['製造業', 'サービス業（他に分類されないもの）']
      };
      
      const related = relatedIndustries[baseParams.industry];
      if (related) {
        related.forEach(industry => {
          strategies.push([`業種拡張_${industry}`, {
            ...baseParams,
            industry: industry
          }]);
        });
      }
    }
    
    // 戦略6: 汎用検索（制約を最小限に）
    strategies.push(['汎用検索', {
      keyword: '補助金',
      use_purpose: baseParams.use_purpose || '',
      industry: '',
      target_area_search: '',
      target_number_of_employees: ''
    }]);
    
    return strategies;
  };

  // 高度な関連度スコア計算関数
  const calculateAdvancedRelevanceScore = (subsidy, userNeeds, searchParams, strategyName) => {
    let score = 0;
    
    // 基本スコア計算
    score += calculateRelevanceScore(subsidy, userNeeds, searchParams);
    
    // 戦略別ボーナス
    const strategyBonus = {
      '基本検索': 20,
      'キーワード戦略': 15,
      '地域拡張検索': 5,
      '従業員数拡張': 5,
      '業種拡張': 8,
      '汎用検索': 2
    };
    
    for (const [strategy, bonus] of Object.entries(strategyBonus)) {
      if (strategyName.includes(strategy)) {
        score += bonus;
        break;
      }
    }
    
    // 補助金額によるスコア調整
    if (subsidy.subsidy_max_limit) {
      const amount = subsidy.subsidy_max_limit;
      if (amount >= 1000000) score += 10; // 100万円以上
      if (amount >= 5000000) score += 5;  // 500万円以上
      if (amount >= 10000000) score += 5; // 1000万円以上
    }
    
    // タイトルとユーザーニーズの関連性
    if (subsidy.title && userNeeds) {
      const titleLower = subsidy.title.toLowerCase();
      const needsLower = userNeeds.toLowerCase();
      
      const keyPhrases = ['効率化', '省エネ', '生産性', 'DX', 'デジタル', '人材', '設備', '技術'];
      keyPhrases.forEach(phrase => {
        if (titleLower.includes(phrase) && needsLower.includes(phrase)) {
          score += 8;
        }
      });
    }
    
    return score;
  };

  // 基本の関連度スコア計算関数（互換性維持）
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
    
    // 募集期間の考慮
    if (subsidy.acceptance_end_datetime) {
      const daysUntilEnd = Math.floor(
        (new Date(subsidy.acceptance_end_datetime) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilEnd > 30 && daysUntilEnd < 180) {
        score += 5;
      } else if (daysUntilEnd <= 30) {
        score -= 5;
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