/**
 * Clean Amazon Search - 定数定義
 * @fileoverview アプリケーション全体で使用する定数を定義
 * @module constants
 */

'use strict';

/**
 * フィルタープリセット定義
 * config/filters.json と同期が必要
 * @constant {Object}
 */
const FILTER_PRESETS = {
  standard: {
    id: 'standard',
    name: 'スタンダード',
    description: 'Prime対象（Amazon配送）',
    params: {
      'p_85': '2322926051'
    }
  },
  premium: {
    id: 'premium',
    name: 'プレミアム',
    description: 'Prime対象 + 評価★4以上',
    params: {
      'p_85': '2322926051',
      'p_72': '83461051'
    }
  },
  strict: {
    id: 'strict',
    name: 'ストリクト',
    description: 'Amazon公式販売のみ',
    params: {
      'p_6': 'AN1VRQENFRJN5'
    }
  }
};

/**
 * フィルターオプション定義
 * @constant {Object}
 */
const FILTER_OPTIONS = {
  fulfilledByAmazon: {
    param: 'p_n_fulfilled_by_amazon',
    value: 'true'
  },
  domesticShipping: {
    param: 'p_n_shipping_option-bin',
    value: '3242090051'
  },
  primeOnly: {
    param: 'p_85',
    value: '2322926051'
  },
  amazonSellerOnly: {
    param: 'p_6',
    value: 'AN1VRQENFRJN5'
  }
};

/**
 * レーティングオプション定義
 * @constant {Object}
 */
const RATING_OPTIONS = {
  '4_and_up': {
    param: 'p_72',
    value: '83461051'
  },
  '3_and_up': {
    param: 'p_72',
    value: '83460951'
  }
};

/**
 * Amazon.co.jp公式セラーID
 * @constant {string}
 */
const AMAZON_JP_SELLER_ID = 'AN1VRQENFRJN5';

/**
 * Amazon.co.jpホスト名
 * @constant {string}
 */
const AMAZON_JP_HOST = 'www.amazon.co.jp';

/**
 * デフォルト設定
 * @constant {Object}
 */
const DEFAULT_SETTINGS = {
  filterPreset: 'standard',
  customFilters: {
    fulfilledByAmazon: true,
    domesticShipping: true,
    primeOnly: false,
    amazonSellerOnly: false,
    minRating: null
  },
  autoApply: false,
  showPageButton: true,
  // セラーチェック機能
  sellerCheck: true,           // セラー住所チェックを有効化
  hideOverseasSellers: true,   // 海外セラーを非表示
  showJapaneseBadge: false,    // 日本セラーにバッジ表示
  onboardingCompleted: false,
  stats: {
    domesticFilter: 0,
    fbaFilter: 0,
    ratingFilter: 0,
    overseasHidden: 0,         // 海外セラー非表示回数
    lastResetDate: null
  },
  dismissedBanners: []
};

/**
 * アイコンバッジ設定
 * @constant {Object}
 */
const BADGE_CONFIG = {
  autoApply: {
    text: 'A',
    color: '#4CAF50'
  },
  off: {
    text: ''
  }
};

/**
 * アイコンパス設定
 * @constant {Object}
 */
const ICON_PATHS = {
  active: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png'
  },
  inactive: {
    '16': 'icons/icon16-gray.png',
    '48': 'icons/icon48-gray.png',
    '128': 'icons/icon128-gray.png'
  }
};

/**
 * 海外発送を示すキーワード
 * @constant {string[]}
 */
const OVERSEAS_SHIPPING_KEYWORDS = [
  '海外',
  'China',
  '中国',
  '2-4週間',
  '3-4週間'
];

// グローバルに公開（content script/service workerで使用）
if (typeof globalThis !== 'undefined') {
  globalThis.FILTER_PRESETS = FILTER_PRESETS;
  globalThis.FILTER_OPTIONS = FILTER_OPTIONS;
  globalThis.RATING_OPTIONS = RATING_OPTIONS;
  globalThis.AMAZON_JP_SELLER_ID = AMAZON_JP_SELLER_ID;
  globalThis.AMAZON_JP_HOST = AMAZON_JP_HOST;
  globalThis.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  globalThis.BADGE_CONFIG = BADGE_CONFIG;
  globalThis.ICON_PATHS = ICON_PATHS;
  globalThis.OVERSEAS_SHIPPING_KEYWORDS = OVERSEAS_SHIPPING_KEYWORDS;
}
