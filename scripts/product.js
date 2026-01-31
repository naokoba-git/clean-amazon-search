/**
 * Clean Amazon Search - 商品詳細ページ用 Content Script
 * @fileoverview 商品詳細ページで出品者情報を解析しバナーを表示
 * @module product
 * @requires constants.js
 * @requires filter-utils.js
 */

(function() {
  'use strict';

  /** @constant {string} ログプレフィックス */
  const LOG_PREFIX = '[CAS-Product]';

  /** @constant {string} バナーID */
  const BANNER_ID = 'cas-info-banner';

  /** @constant {number} DOM解析までの待機時間（ミリ秒） */
  const DOM_PARSE_DELAY = 1000;

  /**
   * ログ出力ヘルパー
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {*} [data] - 追加データ
   */
  function log(level, message, data = null) {
    const fn = console[level] || console.log;
    if (data !== null) {
      fn(`${LOG_PREFIX} ${message}`, data);
    } else {
      fn(`${LOG_PREFIX} ${message}`);
    }
  }

  /**
   * 設定を取得
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async function getSettings() {
    try {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      log('error', 'Failed to get settings:', error);
      return typeof DEFAULT_SETTINGS !== 'undefined' ? DEFAULT_SETTINGS : {};
    }
  }

  /**
   * ASINを取得
   * @returns {string|null} ASIN、見つからない場合はnull
   */
  function getASIN() {
    try {
      // URLから取得
      const match = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
                    window.location.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      if (match) return match[1];

      // ページ内から取得
      const asinInput = document.querySelector('input[name="ASIN"]');
      if (asinInput) return asinInput.value;

      return null;
    } catch (error) {
      log('error', 'Error getting ASIN:', error);
      return null;
    }
  }

  /**
   * 出品者情報を解析
   * @returns {Object} 出品者情報オブジェクト
   */
  function analyzeSellerInfo() {
    const result = {
      isAmazonSold: false,
      isAmazonFulfilled: false,
      isDomesticShipping: true,
      sellerName: '',
      sellerUrl: null,
      shippingInfo: ''
    };

    try {
      // 「この商品は、○○が販売し、Amazon.co.jp が発送します。」のパターン
      const merchantInfo = document.querySelector('#merchantInfoFeature_feature_div') ||
                           document.querySelector('#tabular-buybox') ||
                           document.querySelector('.tabular-buybox-container');

      if (merchantInfo) {
        const text = merchantInfo.textContent || '';

        // Amazon.co.jpが販売
        if (text.includes('Amazon.co.jp') && text.includes('販売')) {
          result.isAmazonSold = true;
        }

        // Amazon.co.jpが発送（FBA）
        if (text.includes('Amazon.co.jp') && (text.includes('発送') || text.includes('配送'))) {
          result.isAmazonFulfilled = true;
        }

        // 出品者名とリンクを取得
        const sellerLink = merchantInfo.querySelector('#sellerProfileTriggerId') ||
                           merchantInfo.querySelector('a[href*="seller="]');
        if (sellerLink) {
          result.sellerName = sellerLink.textContent.trim();
          result.sellerUrl = sellerLink.getAttribute('href');
        }
      }

      // ページ全体からセラーリンクを探す（バックアップ）
      if (!result.sellerUrl) {
        const globalSellerLink = document.querySelector('#sellerProfileTriggerId');
        if (globalSellerLink) {
          result.sellerName = globalSellerLink.textContent.trim();
          result.sellerUrl = globalSellerLink.getAttribute('href');
        }
      }

      // 配送情報を確認
      const deliveryInfo = document.querySelector('#deliveryBlockMessage') ||
                           document.querySelector('.delivery-message');

      if (deliveryInfo) {
        const text = deliveryInfo.textContent || '';
        result.shippingInfo = text;

        // 海外発送キーワードをチェック
        const keywords = typeof OVERSEAS_SHIPPING_KEYWORDS !== 'undefined'
          ? OVERSEAS_SHIPPING_KEYWORDS
          : ['海外', 'China', '中国', '2-4週間', '3-4週間'];

        for (const keyword of keywords) {
          if (text.includes(keyword)) {
            result.isDomesticShipping = false;
            break;
          }
        }
      }

      // Prime対応チェック
      const primeIcon = document.querySelector('.a-icon-prime') ||
                        document.querySelector('[data-a-badge-type="prime"]');
      if (primeIcon) {
        result.isAmazonFulfilled = true;
        result.isDomesticShipping = true;
      }
    } catch (error) {
      log('error', 'Error analyzing seller info:', error);
    }

    return result;
  }

  /**
   * セラーの住所をチェック
   * @param {string} sellerUrl - セラーページのURL
   * @returns {Promise<{isJapanese: boolean, address: string}>}
   */
  async function checkSellerAddress(sellerUrl) {
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'checkSellerAddress',
        sellerUrl: sellerUrl
      });
      return result;
    } catch (error) {
      log('error', 'Error checking seller address:', error);
      return { isJapanese: false, address: '確認失敗', error: error.message };
    }
  }

  /**
   * バナーのスタイルを取得
   * @param {boolean} isWarning - 警告バナーかどうか
   * @returns {string} CSSスタイル文字列
   */
  function getBannerStyles(isWarning) {
    return `
      background: ${isWarning ? '#FFF3CD' : '#E7F3FF'};
      border: 1px solid ${isWarning ? '#FFECB5' : '#B6D4FE'};
      border-left: 4px solid ${isWarning ? '#FFC107' : '#0D6EFD'};
      padding: 12px 16px;
      border-radius: 4px;
      margin: 10px 0 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      color: ${isWarning ? '#856404' : '#084298'};
    `;
  }

  /**
   * バナーを表示
   * @param {'warning'|'info'} type - バナータイプ
   * @param {string} message - 表示メッセージ
   * @returns {Promise<void>}
   */
  async function showBanner(type, message) {
    try {
      const settings = await getSettings();
      const asin = getASIN();

      // 既に非表示にしたバナーはスキップ
      if (settings.dismissedBanners && asin && settings.dismissedBanners.includes(asin)) {
        log('log', 'Banner dismissed for this product');
        return;
      }

      // 既存のバナーがあれば削除
      const existingBanner = document.getElementById(BANNER_ID);
      if (existingBanner) {
        existingBanner.remove();
      }

      const isWarning = type === 'warning';
      const icon = isWarning ? '⚠️' : 'ℹ️';

      // バナー要素を作成
      const banner = document.createElement('div');
      banner.id = BANNER_ID;
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'polite');
      banner.style.cssText = getBannerStyles(isWarning);

      banner.innerHTML = `
        <span>${icon} ${message}</span>
        <button id="cas-banner-close"
                aria-label="バナーを閉じる"
                style="
                  background: none;
                  border: none;
                  font-size: 18px;
                  cursor: pointer;
                  color: ${isWarning ? '#856404' : '#084298'};
                  padding: 0 0 0 10px;
                ">×</button>
      `;

      // 閉じるボタンのイベント
      const closeBtn = banner.querySelector('#cas-banner-close');
      closeBtn.addEventListener('click', () => handleBannerClose(banner, asin));

      // 挿入位置を探す
      insertBanner(banner);

      log('log', `${type} banner displayed`);
    } catch (error) {
      log('error', 'Error showing banner:', error);
    }
  }

  /**
   * バナーを閉じる処理
   * @param {HTMLElement} banner - バナー要素
   * @param {string|null} asin - 商品のASIN
   */
  async function handleBannerClose(banner, asin) {
    try {
      banner.remove();

      // 非表示リストに追加
      if (asin) {
        const settings = await getSettings();
        const dismissed = settings.dismissedBanners || [];
        if (!dismissed.includes(asin)) {
          dismissed.push(asin);
          await chrome.storage.local.set({ dismissedBanners: dismissed });
          log('log', 'Banner dismissed and saved');
        }
      }
    } catch (error) {
      log('error', 'Error handling banner close:', error);
    }
  }

  /**
   * バナーをページに挿入
   * @param {HTMLElement} banner - バナー要素
   */
  function insertBanner(banner) {
    // タイトル要素を探す
    const titleElement = document.querySelector('#productTitle') ||
                         document.querySelector('#title');

    if (titleElement) {
      const container = titleElement.closest('.a-section') || titleElement.parentNode;
      container.insertBefore(banner, container.firstChild);
    } else {
      // タイトルが見つからない場合はページ上部に挿入
      const mainContent = document.querySelector('#dp-container') ||
                          document.querySelector('#ppd') ||
                          document.body;
      mainContent.insertBefore(banner, mainContent.firstChild);
    }
  }

  /**
   * 初期化処理
   * @returns {Promise<void>}
   */
  async function init() {
    try {
      // 設定を取得
      const settings = await getSettings();

      // セラーチェック機能が無効の場合はスキップ
      if (settings.sellerCheck === false) {
        log('log', 'Seller check is disabled');
        return;
      }

      // 少し待ってからDOM解析（動的コンテンツ対応）
      await new Promise(resolve => setTimeout(resolve, DOM_PARSE_DELAY));

      const sellerInfo = analyzeSellerInfo();
      log('log', 'Seller info:', sellerInfo);

      // Amazon公式販売の場合はバナーなし
      if (sellerInfo.isAmazonSold) {
        log('log', 'Amazon official product, no check needed');
        return;
      }

      // セラーURLがある場合は住所をチェック
      if (sellerInfo.sellerUrl && sellerInfo.sellerUrl !== 'amazon-official') {
        log('log', 'Checking seller address...');
        const addressResult = await checkSellerAddress(sellerInfo.sellerUrl);
        log('log', 'Address check result:', addressResult);

        if (!addressResult.isJapanese) {
          // 海外セラーの場合は警告を表示
          await showBanner('warning',
            `海外セラー: ${sellerInfo.sellerName || '不明'} (${addressResult.address})`
          );
          return;
        } else {
          // 日本のセラーの場合
          log('log', 'Japanese seller confirmed');
          if (settings.showJapaneseBadge) {
            await showBanner('info', `🇯🇵 日本のセラー: ${sellerInfo.sellerName}`);
          }
          return;
        }
      }

      // 海外発送キーワードが検出された場合
      if (!sellerInfo.isDomesticShipping) {
        await showBanner('warning', 'この商品は海外から発送される可能性があります');
        return;
      }

      log('log', 'Initialization complete');
    } catch (error) {
      log('error', 'Initialization error:', error);
    }
  }

  // DOM読み込み後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // SPAナビゲーション対応
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      // 既存のバナーを削除
      const existingBanner = document.getElementById(BANNER_ID);
      if (existingBanner) {
        existingBanner.remove();
      }
      setTimeout(init, DOM_PARSE_DELAY);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();
