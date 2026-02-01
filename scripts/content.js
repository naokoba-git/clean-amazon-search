/**
 * Clean Amazon Search - 検索結果ページ用 Content Script
 * @fileoverview 検索結果ページでDOM解析ベースのフィルタリングを適用
 * @module content
 * @requires constants.js (manifest.jsonで先に読み込み)
 * @requires brand-checker.js (manifest.jsonで先に読み込み)
 * @requires title-checker.js (manifest.jsonで先に読み込み)
 * @requires score-calculator.js (manifest.jsonで先に読み込み)
 * @requires product-filter.js (manifest.jsonで先に読み込み)
 */

(function() {
  'use strict';

  /** @constant {string} ログプレフィックス */
  const LOG_PREFIX = '[CAS-Content]';

  /** @type {MutationObserver|null} 商品監視用オブザーバー */
  let productObserver = null;

  /** @type {Object|null} フィルター設定のキャッシュ */
  let filterConfigCache = null;

  /** @type {number} 現在のフィルターレベル */
  let currentFilterLevel = 2;

  /** @type {string} 現在のURL（ページ遷移検知用） */
  let currentUrl = window.location.href;

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
   * Amazon検索結果ページかどうかを判定
   * @returns {boolean} 検索結果ページの場合true
   */
  function isSearchResultsPage() {
    const url = window.location.href;
    return url.includes('/s?') || url.includes('/s/');
  }

  /**
   * chrome.storage.localからフィルターレベルを取得
   * @returns {Promise<number>} フィルターレベル (0-4)
   */
  async function getFilterLevel() {
    try {
      return new Promise((resolve) => {
        chrome.storage.local.get(['filterLevel'], (result) => {
          if (chrome.runtime.lastError) {
            log('warn', 'Failed to get filterLevel:', chrome.runtime.lastError.message);
            resolve(2); // デフォルト: STANDARD
          } else {
            // filterLevelが設定されていない場合はデフォルト値を使用
            const level = typeof result.filterLevel === 'number' ? result.filterLevel : 2;
            resolve(level);
          }
        });
      });
    } catch (error) {
      log('error', 'Error getting filterLevel:', error);
      return 2; // デフォルト: STANDARD
    }
  }

  /**
   * フィルター設定（信頼ブランド、疑わしいパターン）を読み込み
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async function loadFilterConfig() {
    // キャッシュがあれば使用
    if (filterConfigCache) {
      return filterConfigCache;
    }

    try {
      // ProductFilterのメソッドを使用して設定を読み込み
      if (typeof ProductFilter !== 'undefined') {
        const [trustedBrands, suspiciousPatterns] = await Promise.all([
          ProductFilter.loadTrustedBrands(),
          ProductFilter.loadSuspiciousPatterns()
        ]);

        filterConfigCache = {
          trustedBrands,
          suspiciousPatterns
        };

        log('log', `Loaded config: ${trustedBrands.length} trusted brands, ${suspiciousPatterns.length} suspicious patterns`);
        return filterConfigCache;
      }
    } catch (error) {
      log('error', 'Failed to load filter config:', error);
    }

    // フォールバック: 空の設定
    return {
      trustedBrands: [],
      suspiciousPatterns: []
    };
  }

  /**
   * フィルタリングを実行
   * @returns {Promise<Object>} 統計情報
   */
  async function runFiltering() {
    // ProductFilterが利用可能かチェック
    if (typeof ProductFilter === 'undefined') {
      log('error', 'ProductFilter is not available');
      return { total: 0, hidden: 0, warned: 0, trusted: 0 };
    }

    // フィルターレベルを取得
    currentFilterLevel = await getFilterLevel();
    log('log', `Filter level: ${currentFilterLevel}`);

    // フィルターがOFFの場合は何もしない
    if (currentFilterLevel === 0) {
      log('log', 'Filtering is disabled (level 0)');
      return { total: 0, hidden: 0, warned: 0, trusted: 0 };
    }

    // フィルタリングを実行
    const stats = await ProductFilter.run(currentFilterLevel);
    log('log', 'Filtering complete:', stats);

    // 統計情報をbackgroundに送信
    try {
      await chrome.runtime.sendMessage({
        action: 'updateFilterStats',
        stats: stats
      });
    } catch (error) {
      log('warn', 'Failed to send stats to background:', error);
    }

    return stats;
  }

  /**
   * 新しく追加された商品要素をフィルタリング
   * @param {Element} productElement - 商品のDOM要素
   */
  async function filterNewProduct(productElement) {
    // 既に処理済みならスキップ
    if (productElement.dataset.casProcessed) {
      return;
    }

    // フィルターがOFFの場合は何もしない
    if (currentFilterLevel === 0) {
      return;
    }

    // ProductFilterが利用可能かチェック
    if (typeof ProductFilter === 'undefined') {
      return;
    }

    try {
      // 設定を読み込み（キャッシュから）
      const config = await loadFilterConfig();

      // 商品情報を抽出
      const productInfo = ProductFilter.extractProductInfo(productElement);

      // スコアを計算
      const scoreResult = ProductFilter.calculateScore(productInfo, config);

      // フィルターを適用
      ProductFilter.applyFilter(productElement, scoreResult, currentFilterLevel);

      // 処理済みマークを付ける
      productElement.dataset.casProcessed = 'true';
    } catch (error) {
      log('warn', 'Error filtering new product:', error);
    }
  }

  /**
   * MutationObserverで動的に追加される商品を監視
   */
  function observeNewProducts() {
    // 既にオブザーバーが設定されている場合はスキップ
    if (productObserver) {
      return;
    }

    // 検索結果コンテナを探す
    const container = document.querySelector('.s-main-slot') ||
                      document.querySelector('[data-component-type="s-search-results"]') ||
                      document.querySelector('.s-search-results');

    if (!container) {
      log('warn', 'Search results container not found for observation');
      return;
    }

    // MutationObserverを設定
    productObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // 追加されたノード自体が商品要素の場合
          if (node.dataset && node.dataset.componentType === 's-search-result') {
            filterNewProduct(node);
            continue;
          }

          // 追加されたノード内の商品要素を検索
          if (node.querySelectorAll) {
            const products = node.querySelectorAll('[data-component-type="s-search-result"]');
            for (const product of products) {
              filterNewProduct(product);
            }
          }
        }
      }
    });

    // 監視を開始
    productObserver.observe(container, {
      childList: true,
      subtree: true
    });

    log('log', 'Started observing for new products');
  }

  /**
   * storage変更を監視してフィルターレベルの変更に対応
   */
  function watchStorageChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;

      if (changes.filterLevel) {
        const newLevel = changes.filterLevel.newValue;
        log('log', `Filter level changed: ${currentFilterLevel} -> ${newLevel}`);
        currentFilterLevel = newLevel;

        // ページを再フィルタリング
        resetAndRefilter();
      }
    });
  }

  /**
   * フィルタリング状態をリセットして再実行
   */
  function resetAndRefilter() {
    // 既存の処理済みマークとスタイルをリセット
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');
    for (const product of products) {
      delete product.dataset.casProcessed;
      delete product.dataset.casTrusted;
      delete product.dataset.casHidden;
      product.classList.remove(
        'cas-product-hidden',
        'cas-product-dimmed',
        'cas-product-trusted',
        'cas-trusted-hidden',
        'cas-all-visible'
      );
      const badge = product.querySelector('.cas-product-badge');
      if (badge) badge.remove();
    }

    // バナーを削除
    const banner = document.getElementById('cas-filter-banner');
    if (banner) {
      banner.remove();
      document.body.style.paddingTop = '';
    }

    // 再フィルタリング
    runFiltering();
  }

  /**
   * URL変更を監視（SPAページ遷移対応）
   */
  function watchUrlChanges() {
    // 定期的にURLをチェック（Amazon SPAナビゲーション対応）
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        const oldUrl = currentUrl;
        currentUrl = window.location.href;
        log('log', `URL changed: ${oldUrl} -> ${currentUrl}`);

        // 検索結果ページの場合のみ再フィルタリング
        if (isSearchResultsPage()) {
          // 少し待機して新しいコンテンツが読み込まれるのを待つ
          setTimeout(() => {
            resetAndRefilter();
          }, 1000);
        }
      }
    }, 500);

    // popstateイベント（ブラウザの戻る/進むボタン）
    window.addEventListener('popstate', () => {
      log('log', 'Popstate event detected');
      if (isSearchResultsPage()) {
        setTimeout(() => {
          currentUrl = window.location.href;
          resetAndRefilter();
        }, 1000);
      }
    });

    log('log', 'Started watching URL changes');
  }

  /**
   * 初期化処理
   */
  async function init() {
    try {
      log('log', 'Initializing content script...');

      // 検索結果ページでない場合は終了
      if (!isSearchResultsPage()) {
        log('log', 'Not a search results page, skipping');
        return;
      }

      // DOM読み込み完了を待つ
      if (document.readyState === 'loading') {
        await new Promise(resolve => {
          document.addEventListener('DOMContentLoaded', resolve);
        });
      }

      // 少し待機して商品要素が読み込まれるのを待つ
      await new Promise(resolve => setTimeout(resolve, 500));

      // フィルタリングを実行
      await runFiltering();

      // 新しい商品の監視を開始
      observeNewProducts();

      // storage変更を監視
      watchStorageChanges();

      // URL変更を監視（ページ遷移対応）
      watchUrlChanges();

      // アイコン状態を更新
      try {
        await chrome.runtime.sendMessage({
          action: 'updateIconState',
          isFiltered: currentFilterLevel > 0
        });
      } catch (error) {
        log('warn', 'Failed to update icon state:', error);
      }

      log('log', 'Initialization complete');
    } catch (error) {
      log('error', 'Initialization error:', error);
    }
  }

  /**
   * メッセージハンドラ
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        case 'runFiltering':
          // フィルタリングを再実行
          runFiltering().then(stats => {
            sendResponse({ success: true, stats });
          }).catch(error => {
            sendResponse({ success: false, error: error.message });
          });
          return true; // 非同期レスポンス

        case 'getFilterStats':
          // 現在の統計情報を返す
          const products = document.querySelectorAll('[data-component-type="s-search-result"]');
          const hidden = document.querySelectorAll('.cas-product-hidden').length;
          const warned = document.querySelectorAll('.cas-product-dimmed').length;
          const trusted = document.querySelectorAll('[data-cas-badge="trusted"]').length;
          sendResponse({
            success: true,
            stats: {
              total: products.length,
              hidden,
              warned,
              trusted
            }
          });
          break;

        case 'showAllProducts':
          // 非表示の商品をすべて表示
          if (typeof ProductFilter !== 'undefined') {
            ProductFilter.showAllProducts();
            // バナーを削除
            const banner = document.getElementById('cas-filter-banner');
            if (banner) {
              banner.remove();
              document.body.style.paddingTop = '';
            }
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

    return false;
  });

  // 初期化実行
  init();

})();
