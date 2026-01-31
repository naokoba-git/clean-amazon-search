/**
 * Clean Amazon Search - フィルターユーティリティ
 * @fileoverview URLフィルタリングとフィルター適用チェックの共通ロジック
 * @module filter-utils
 * @requires constants.js
 */

'use strict';

/**
 * フィルターユーティリティオブジェクト
 * background.jsとcontent.jsの両方で使用される共通ロジックを提供
 * @namespace FilterUtils
 */
const FilterUtils = {
  /**
   * フィルタープリセットへの参照
   * constants.jsから読み込み
   * @type {Object}
   */
  get PRESETS() {
    return typeof FILTER_PRESETS !== 'undefined' ? FILTER_PRESETS : {};
  },

  /**
   * URLにフィルターパラメータを適用
   * @param {string} url - フィルターを適用するURL
   * @param {string} [preset='standard'] - 使用するプリセット名
   * @param {Object|null} [customParams=null] - カスタムパラメータ（プリセットの代わりに使用）
   * @returns {string} フィルターが適用されたURL
   * @throws {Error} 無効なURLの場合
   * @example
   * const filteredUrl = FilterUtils.applyFilter('https://www.amazon.co.jp/s?k=test', 'standard');
   */
  applyFilter(url, preset = 'standard', customParams = null) {
    try {
      const urlObj = new URL(url);
      const params = customParams || this.PRESETS[preset]?.params;

      if (!params) {
        console.warn(`[FilterUtils] Unknown preset: ${preset}`);
        return url;
      }

      // 既存のrhパラメータを取得
      let existingRh = urlObj.searchParams.get('rh') || '';

      // 新しいパラメータを構築
      const newParams = [];
      for (const [key, value] of Object.entries(params)) {
        const paramStr = `${key}:${value}`;
        // 既に含まれていなければ追加
        if (!existingRh.includes(paramStr)) {
          newParams.push(paramStr);
        }
      }

      if (newParams.length > 0) {
        const newRh = existingRh
          ? `${existingRh},${newParams.join(',')}`
          : newParams.join(',');
        urlObj.searchParams.set('rh', newRh);
      }

      return urlObj.toString();
    } catch (error) {
      console.error('[FilterUtils] Error applying filter:', error);
      return url;
    }
  },

  /**
   * URLがフィルター適用済みかチェック
   * background.jsとcontent.jsで共通使用
   * @param {string} url - チェック対象のURL
   * @param {string} [preset='standard'] - チェックするプリセット名
   * @returns {boolean} フィルターが適用されている場合true
   * @example
   * if (FilterUtils.isFilterApplied(window.location.href, 'standard')) {
   *   console.log('Filter is already applied');
   * }
   */
  isFilterApplied(url, preset = 'standard') {
    const params = this.PRESETS[preset]?.params;
    if (!params) {
      console.warn(`[FilterUtils] Unknown preset for check: ${preset}`);
      return false;
    }

    try {
      const urlObj = new URL(url);
      const rh = urlObj.searchParams.get('rh') || '';

      return Object.entries(params).every(([key, value]) => {
        return rh.includes(`${key}:${value}`);
      });
    } catch (error) {
      console.error('[FilterUtils] Error checking filter:', error);
      return false;
    }
  },

  /**
   * Amazon.co.jpの検索ページかチェック
   * @param {string} url - チェック対象のURL
   * @returns {boolean} Amazon検索ページの場合true
   * @example
   * if (FilterUtils.isAmazonSearchPage(window.location.href)) {
   *   // 検索ページ固有の処理
   * }
   */
  isAmazonSearchPage(url) {
    try {
      const urlObj = new URL(url);
      const host = typeof AMAZON_JP_HOST !== 'undefined' ? AMAZON_JP_HOST : 'www.amazon.co.jp';
      return urlObj.hostname === host &&
             (urlObj.pathname.startsWith('/s') || urlObj.pathname.includes('/s?'));
    } catch (error) {
      console.error('[FilterUtils] Error checking search page:', error);
      return false;
    }
  },

  /**
   * Amazon.co.jpの商品詳細ページかチェック
   * @param {string} url - チェック対象のURL
   * @returns {boolean} Amazon商品詳細ページの場合true
   * @example
   * if (FilterUtils.isAmazonProductPage(window.location.href)) {
   *   // 商品ページ固有の処理
   * }
   */
  isAmazonProductPage(url) {
    try {
      const urlObj = new URL(url);
      const host = typeof AMAZON_JP_HOST !== 'undefined' ? AMAZON_JP_HOST : 'www.amazon.co.jp';
      return urlObj.hostname === host &&
             (urlObj.pathname.includes('/dp/') || urlObj.pathname.includes('/gp/product/'));
    } catch (error) {
      console.error('[FilterUtils] Error checking product page:', error);
      return false;
    }
  },

  /**
   * カスタムフィルターパラメータを構築
   * @param {Object} options - フィルターオプション
   * @param {boolean} [options.fulfilledByAmazon] - Amazon配送のみ
   * @param {boolean} [options.domesticShipping] - 国内発送のみ
   * @param {boolean} [options.primeOnly] - Prime対象のみ
   * @param {boolean} [options.amazonSellerOnly] - Amazon公式販売のみ
   * @param {string|null} [options.minRating] - 最低レーティング ('4_and_up' | '3_and_up' | null)
   * @returns {Object} フィルターパラメータオブジェクト
   * @example
   * const params = FilterUtils.buildCustomParams({
   *   fulfilledByAmazon: true,
   *   domesticShipping: true,
   *   minRating: '4_and_up'
   * });
   */
  buildCustomParams(options) {
    const params = {};
    const filterOptions = typeof FILTER_OPTIONS !== 'undefined' ? FILTER_OPTIONS : {
      fulfilledByAmazon: { param: 'p_n_fulfilled_by_amazon', value: 'true' },
      domesticShipping: { param: 'p_n_shipping_option-bin', value: '3242090051' },
      primeOnly: { param: 'p_85', value: '2322926051' },
      amazonSellerOnly: { param: 'p_6', value: 'AN1VRQENFRJN5' }
    };
    const ratingOptions = typeof RATING_OPTIONS !== 'undefined' ? RATING_OPTIONS : {
      '4_and_up': { param: 'p_72', value: '83461051' },
      '3_and_up': { param: 'p_72', value: '83460951' }
    };

    if (options.fulfilledByAmazon) {
      params[filterOptions.fulfilledByAmazon.param] = filterOptions.fulfilledByAmazon.value;
    }
    if (options.domesticShipping) {
      params[filterOptions.domesticShipping.param] = filterOptions.domesticShipping.value;
    }
    if (options.primeOnly) {
      params[filterOptions.primeOnly.param] = filterOptions.primeOnly.value;
    }
    if (options.amazonSellerOnly) {
      params[filterOptions.amazonSellerOnly.param] = filterOptions.amazonSellerOnly.value;
    }
    if (options.minRating && ratingOptions[options.minRating]) {
      const rating = ratingOptions[options.minRating];
      params[rating.param] = rating.value;
    }

    return params;
  },

  /**
   * デフォルト設定を取得
   * @returns {Object} デフォルト設定オブジェクト
   * @example
   * const settings = FilterUtils.getDefaultSettings();
   * await chrome.storage.local.set(settings);
   */
  getDefaultSettings() {
    if (typeof DEFAULT_SETTINGS !== 'undefined') {
      // 日付を現在の日付で更新したコピーを返す
      return {
        ...DEFAULT_SETTINGS,
        stats: {
          ...DEFAULT_SETTINGS.stats,
          lastResetDate: new Date().toISOString().split('T')[0]
        }
      };
    }

    // フォールバック
    return {
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
      onboardingCompleted: false,
      stats: {
        domesticFilter: 0,
        fbaFilter: 0,
        ratingFilter: 0,
        lastResetDate: new Date().toISOString().split('T')[0]
      },
      dismissedBanners: []
    };
  }
};

// グローバルに公開（content scriptとbackground両方で使用）
if (typeof globalThis !== 'undefined') {
  globalThis.FilterUtils = FilterUtils;
}
if (typeof window !== 'undefined') {
  window.FilterUtils = FilterUtils;
}
