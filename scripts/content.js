/**
 * Clean Amazon Search - 検索結果ページ用 Content Script
 * @fileoverview 検索結果ページでのフィルター適用とUIボタン表示
 * @module content
 * @requires constants.js (manifest.jsonで先に読み込み)
 * @requires filter-utils.js (manifest.jsonで先に読み込み)
 * @requires seller-checker.js (manifest.jsonで先に読み込み)
 */

(function() {
  'use strict';

  /** @constant {string} ログプレフィックス */
  const LOG_PREFIX = '[CAS-Content]';

  /** @constant {string} フィルターボタンID */
  const FILTER_BUTTON_ID = 'cas-filter-button';


  /**
   * ログ出力ヘルパー
   * @param {string} level - ログレベル ('log' | 'warn' | 'error')
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
   * @throws {Error} Chrome storage APIエラー
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
      // デフォルト設定を返す
      return FilterUtils.getDefaultSettings();
    }
  }

  /**
   * 統計を更新
   * @param {string} type - 統計タイプ
   * @returns {Promise<void>}
   */
  async function updateStats(type) {
    try {
      await chrome.runtime.sendMessage({ action: 'updateStats', type });
    } catch (error) {
      log('warn', `Failed to update stats (${type}):`, error);
    }
  }

  /**
   * フィルターを適用してリダイレクト
   * @param {string} [preset='standard'] - 使用するプリセット名
   * @returns {void}
   */
  function applyFilterAndRedirect(preset = 'standard') {
    try {
      const currentUrl = window.location.href;

      // Amazon検索ページかチェック
      if (!FilterUtils.isAmazonSearchPage(currentUrl)) {
        log('warn', 'Not an Amazon search page, skipping filter');
        return;
      }

      // 既に適用済みかチェック
      if (FilterUtils.isFilterApplied(currentUrl, preset)) {
        log('log', 'Filter already applied');
        return;
      }

      // 新しいURLを生成
      const newUrl = FilterUtils.applyFilter(currentUrl, preset);

      if (newUrl !== currentUrl) {
        // 統計を更新（非同期で実行、エラーは無視）
        updateStats('domestic');
        updateStats('fba');

        if (preset === 'premium') {
          updateStats('rating');
        }

        log('log', 'Redirecting with filter applied');
        window.location.href = newUrl;
      }
    } catch (error) {
      log('error', 'Error applying filter:', error);
    }
  }

  /**
   * ページ内フィルターボタンを作成
   * @returns {Promise<void>}
   */
  async function createPageButton() {
    try {
      // 既にボタンがある場合はスキップ
      if (document.getElementById(FILTER_BUTTON_ID)) {
        return;
      }

      // 検索結果のフィルターエリアを探す
      const filterBar = document.querySelector('.s-desktop-toolbar') ||
                        document.querySelector('[data-component-type="s-search-results"]');

      if (!filterBar) {
        log('warn', 'Filter bar not found, cannot create button');
        return;
      }

      // 設定を取得
      const settings = await getSettings();
      const preset = settings.filterPreset || 'standard';
      const isFiltered = FilterUtils.isFilterApplied(window.location.href, preset);

      // ボタンを作成
      const button = document.createElement('button');
      button.id = FILTER_BUTTON_ID;
      button.type = 'button';

      // スタイルを設定
      applyButtonStyles(button, isFiltered);

      // イベントリスナーを設定
      if (!isFiltered) {
        button.addEventListener('mouseenter', () => handleButtonHover(button, true));
        button.addEventListener('mouseleave', () => handleButtonHover(button, false));
        button.addEventListener('click', handleButtonClick);
      }

      // コンテナを作成してボタンを挿入
      const container = document.createElement('div');
      container.style.cssText = 'padding: 10px; text-align: center;';
      container.appendChild(button);

      filterBar.parentNode.insertBefore(container, filterBar);
      log('log', 'Filter button created');
    } catch (error) {
      log('error', 'Error creating page button:', error);
    }
  }

  /**
   * ボタンにスタイルを適用
   * @param {HTMLButtonElement} button - ボタン要素
   * @param {boolean} isFiltered - フィルター適用済みかどうか
   */
  function applyButtonStyles(button, isFiltered) {
    if (isFiltered) {
      button.innerHTML = '&#10003; 安心フィルター適用中';
      button.style.cssText = `
        background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: bold;
        cursor: default;
        margin: 10px 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `;
      button.disabled = true;
    } else {
      button.innerHTML = '&#128737; 安心フィルターで再検索';
      button.style.cssText = `
        background: linear-gradient(135deg, #FF9900 0%, #FF6600 100%);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        margin: 10px 0;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        transition: transform 0.2s, box-shadow 0.2s;
      `;
    }
  }

  /**
   * ボタンホバー時の処理
   * @param {HTMLButtonElement} button - ボタン要素
   * @param {boolean} isHover - ホバー中かどうか
   */
  function handleButtonHover(button, isHover) {
    if (isHover) {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    } else {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    }
  }

  /**
   * ボタンクリック時の処理
   * @returns {Promise<void>}
   */
  async function handleButtonClick() {
    try {
      const settings = await getSettings();
      applyFilterAndRedirect(settings.filterPreset || 'standard');
    } catch (error) {
      log('error', 'Error handling button click:', error);
    }
  }

  /**
   * セラーチェック通知を表示
   * @param {Object} settings - 設定オブジェクト
   */
  function showSellerCheckNotice(settings) {
    if (settings.sellerCheck === false) return;

    const existingNotice = document.getElementById('cas-seller-notice');
    if (existingNotice) return;

    const notice = document.createElement('div');
    notice.id = 'cas-seller-notice';
    notice.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">🛡️</span>
        <div>
          <strong>海外セラー判定ON</strong>
          <span style="color: #555; margin-left: 8px;">商品をクリックすると、販売元の国を自動チェックします</span>
        </div>
      </div>
    `;
    notice.style.cssText = `
      background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
      border: 1px solid #4CAF50;
      border-radius: 8px;
      padding: 10px 16px;
      margin: 12px 0;
      font-size: 13px;
      color: #1b5e20;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;

    const filterBar = document.querySelector('.s-desktop-toolbar') ||
                      document.querySelector('[data-component-type="s-search-results"]');
    if (filterBar) {
      filterBar.parentNode.insertBefore(notice, filterBar);
    }
  }

  /**
   * 初期化処理
   * @returns {Promise<void>}
   */
  async function init() {
    try {
      const settings = await getSettings();
      const preset = settings.filterPreset || 'standard';

      // アイコン状態を更新
      const isFiltered = FilterUtils.isFilterApplied(window.location.href, preset);

      try {
        await chrome.runtime.sendMessage({ action: 'updateIconState', isFiltered });
      } catch (error) {
        log('warn', 'Failed to update icon state:', error);
      }

      // ページ内ボタンを表示
      if (settings.showPageButton !== false) {
        // DOM読み込み後に実行
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', createPageButton);
        } else {
          await createPageButton();
        }
      }

      // セラーチェック通知を表示
      if (settings.sellerCheck !== false) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => showSellerCheckNotice(settings));
        } else {
          showSellerCheckNotice(settings);
        }
      }

      log('log', 'Initialization complete');
    } catch (error) {
      log('error', 'Initialization error:', error);
    }
  }

  /**
   * メッセージハンドラ
   * @param {Object} message - メッセージオブジェクト
   * @param {chrome.runtime.MessageSender} sender - 送信者情報
   * @param {function} sendResponse - レスポンス送信関数
   * @returns {boolean} 非同期レスポンスの場合true
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'applyFilter':
          applyFilterAndRedirect(message.preset || 'standard');
          sendResponse({ success: true });
          break;

        case 'autoApplyFilter':
          // 自動適用（既に適用済みでなければ）
          const currentUrl = window.location.href;
          if (!FilterUtils.isFilterApplied(currentUrl, message.preset)) {
            applyFilterAndRedirect(message.preset);
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      log('error', 'Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    }

    return true;
  });

  // 初期化実行
  init();

})();
