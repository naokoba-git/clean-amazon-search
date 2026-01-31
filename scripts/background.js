/**
 * Clean Amazon Search - Service Worker (Background Script)
 * @fileoverview バックグラウンド処理、キーボードショートカット、タブ更新監視
 * @module background
 * @requires constants.js
 * @requires filter-utils.js
 */

'use strict';

// constants.jsとfilter-utils.jsをインポート
importScripts('constants.js', 'filter-utils.js', 'seller-checker.js');

/**
 * 初回インストール時の処理
 * オンボーディングページを開き、デフォルト設定を保存
 * @param {Object} details - インストール詳細
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // オンボーディングページを開く
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/onboarding.html')
    });

    // FilterUtilsからデフォルト設定を取得して保存
    const defaultSettings = FilterUtils.getDefaultSettings();
    chrome.storage.local.set(defaultSettings);
  }
});

/**
 * キーボードショートカットの処理
 * @param {string} command - コマンド名
 */
chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes(AMAZON_JP_HOST)) {
      return;
    }

    if (command === 'apply-filter') {
      await handleApplyFilterCommand(tab);
    } else if (command === 'toggle-auto') {
      await handleToggleAutoCommand();
    }
  } catch (error) {
    console.error('[Background] Command handler error:', error);
  }
});

/**
 * フィルター適用コマンドの処理
 * @param {chrome.tabs.Tab} tab - アクティブタブ
 * @returns {Promise<void>}
 */
async function handleApplyFilterCommand(tab) {
  try {
    const settings = await chrome.storage.local.get(['filterPreset', 'customFilters']);
    const preset = settings.filterPreset || 'standard';

    await chrome.tabs.sendMessage(tab.id, {
      action: 'applyFilter',
      preset: preset
    });
  } catch (error) {
    console.error('[Background] Apply filter command error:', error);
  }
}

/**
 * 自動適用トグルコマンドの処理
 * @returns {Promise<void>}
 */
async function handleToggleAutoCommand() {
  try {
    const settings = await chrome.storage.local.get(['autoApply']);
    const newAutoApply = !settings.autoApply;

    await chrome.storage.local.set({ autoApply: newAutoApply });
    updateIconBadge(newAutoApply);
  } catch (error) {
    console.error('[Background] Toggle auto command error:', error);
  }
}

/**
 * アイコンバッジを更新
 * @param {boolean} autoApply - 自動適用が有効かどうか
 */
function updateIconBadge(autoApply) {
  try {
    if (autoApply) {
      chrome.action.setBadgeText({ text: BADGE_CONFIG.autoApply.text });
      chrome.action.setBadgeBackgroundColor({ color: BADGE_CONFIG.autoApply.color });
    } else {
      chrome.action.setBadgeText({ text: BADGE_CONFIG.off.text });
    }
  } catch (error) {
    console.error('[Background] Badge update error:', error);
  }
}

/**
 * アイコン状態を更新
 * @param {number} tabId - タブID
 * @param {boolean} isFiltered - フィルター適用済みかどうか
 * @returns {Promise<void>}
 */
async function updateIconState(tabId, isFiltered) {
  const iconPath = isFiltered ? ICON_PATHS.active : ICON_PATHS.inactive;

  try {
    await chrome.action.setIcon({ tabId, path: iconPath });
  } catch (error) {
    // タブが閉じられている場合などのエラーを無視
    // 詳細ログはデバッグ時のみ
  }
}

/**
 * タブ更新時の処理
 * @param {number} tabId - タブID
 * @param {Object} changeInfo - 変更情報
 * @param {chrome.tabs.Tab} tab - タブ情報
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) {
    return;
  }

  // Amazon.co.jpの検索ページかチェック
  if (!FilterUtils.isAmazonSearchPage(tab.url)) {
    return;
  }

  try {
    const settings = await chrome.storage.local.get(['filterPreset', 'autoApply']);
    const preset = settings.filterPreset || 'standard';

    // FilterUtilsの共通関数を使用してフィルター適用状態をチェック
    const isFiltered = FilterUtils.isFilterApplied(tab.url, preset);
    await updateIconState(tabId, isFiltered);

    // 自動適用モードがONの場合
    if (settings.autoApply && !isFiltered) {
      await chrome.tabs.sendMessage(tabId, {
        action: 'autoApplyFilter',
        preset: preset
      }).catch(() => {
        // content scriptがまだロードされていない場合のエラーを無視
      });
    }
  } catch (error) {
    console.error('[Background] Tab update handler error:', error);
  }
});

/**
 * 統計情報を更新
 * @param {string} type - 統計タイプ ('domestic' | 'fba' | 'rating')
 * @returns {Promise<void>}
 */
async function updateStats(type) {
  try {
    const settings = await chrome.storage.local.get(['stats']);
    const defaultStats = FilterUtils.getDefaultSettings().stats;
    const stats = settings.stats || defaultStats;

    // 日付が変わっていたらリセット
    const today = new Date().toISOString().split('T')[0];
    if (stats.lastResetDate !== today) {
      stats.domesticFilter = 0;
      stats.fbaFilter = 0;
      stats.ratingFilter = 0;
      stats.lastResetDate = today;
    }

    // 統計をインクリメント
    switch (type) {
      case 'domestic':
        stats.domesticFilter++;
        break;
      case 'fba':
        stats.fbaFilter++;
        break;
      case 'rating':
        stats.ratingFilter++;
        break;
      default:
        console.warn(`[Background] Unknown stats type: ${type}`);
    }

    await chrome.storage.local.set({ stats });
  } catch (error) {
    console.error('[Background] Stats update error:', error);
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
      case 'updateStats':
        updateStats(message.type);
        sendResponse({ success: true });
        break;

      case 'getSettings':
        chrome.storage.local.get(null).then(sendResponse);
        return true; // 非同期レスポンス

      case 'updateIconState':
        if (sender.tab) {
          updateIconState(sender.tab.id, message.isFiltered);
        }
        sendResponse({ success: true });
        break;

      case 'checkSellerAddress':
        // セラー住所チェック（Background経由でCORS回避）
        checkSellerAddressFromBackground(message.sellerUrl)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true; // 非同期レスポンス

      case 'fetchProductPage':
        // 商品ページを取得してセラー情報を抽出
        fetchProductPageFromBackground(message.productUrl)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true; // 非同期レスポンス

      default:
        console.warn(`[Background] Unknown message action: ${message.action}`);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[Background] Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  }

  return false;
});

/**
 * セラー住所をチェック（Background Service Worker経由）
 * @param {string} sellerUrl - セラーページのURL
 * @returns {Promise<{isJapanese: boolean, address: string}>}
 */
async function checkSellerAddressFromBackground(sellerUrl) {
  // Amazon公式の場合
  if (sellerUrl === 'amazon-official') {
    return { isJapanese: true, address: 'Amazon.co.jp' };
  }

  try {
    const fullUrl = sellerUrl.startsWith('http')
      ? sellerUrl
      : `https://www.amazon.co.jp${sellerUrl}`;

    const response = await fetch(fullUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja-JP,ja;q=0.9'
      }
    });

    if (!response.ok) {
      return { isJapanese: false, address: '取得失敗', error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    return SellerChecker.analyzeSellerPage(html);
  } catch (error) {
    console.error('[Background] Seller check error:', error);
    return { isJapanese: false, address: '取得失敗', error: error.message };
  }
}

/**
 * 商品ページを取得してセラー情報を抽出
 * @param {string} productUrl - 商品ページのURL
 * @returns {Promise<{sellerUrl: string|null, sellerName: string|null}>}
 */
async function fetchProductPageFromBackground(productUrl) {
  try {
    console.log(`[Background] Fetching product: ${productUrl}`);

    const response = await fetch(productUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log(`[Background] Response status: ${response.status}`);

    if (!response.ok) {
      return { sellerUrl: null, sellerName: null, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    console.log(`[Background] HTML length: ${html.length}`);

    // セラーリンクを抽出（複数パターン対応）
    // パターン1: sellerProfileTriggerId
    let sellerMatch = html.match(/id="sellerProfileTriggerId"[^>]*href="([^"]+)"/);
    if (sellerMatch) {
      console.log(`[Background] Found seller via sellerProfileTriggerId`);
      const nameMatch = html.match(/id="sellerProfileTriggerId"[^>]*>([^<]+)</);
      return {
        sellerUrl: sellerMatch[1],
        sellerName: nameMatch ? nameMatch[1].trim() : null
      };
    }

    // パターン2: tabular-buybox内のセラー情報
    const buyboxMatch = html.match(/tabular-buybox-text[^>]*>[\s\S]*?href="([^"]*seller=[^"]+)"[^>]*>([^<]+)/);
    if (buyboxMatch) {
      console.log(`[Background] Found seller via buybox`);
      return {
        sellerUrl: buyboxMatch[1],
        sellerName: buyboxMatch[2].trim()
      };
    }

    // パターン3: merchant-info内のセラーリンク
    const merchantMatch = html.match(/id="merchant-info"[\s\S]*?href="([^"]*seller=[^"]+)"/);
    if (merchantMatch) {
      console.log(`[Background] Found seller via merchant-info`);
      return {
        sellerUrl: merchantMatch[1],
        sellerName: null
      };
    }

    // パターン4: offer-display-feature-text
    const offerMatch = html.match(/offer-display-feature-text[^>]*>[\s\S]*?href="[^"]*seller=([^"&]+)"/);
    if (offerMatch) {
      console.log(`[Background] Found seller ID via offer-display`);
      return {
        sellerUrl: `/gp/help/seller/at-a-glance.html?seller=${offerMatch[1]}`,
        sellerName: null
      };
    }

    // Amazon.co.jpが販売の場合
    if (html.includes('この商品は、Amazon.co.jp が販売、発送します') ||
        html.includes('ships from and sold by Amazon.co.jp') ||
        (html.includes('販売元') && html.includes('Amazon.co.jp') && html.includes('出荷元'))) {
      console.log(`[Background] Detected Amazon.co.jp as seller`);
      return {
        sellerUrl: 'amazon-official',
        sellerName: 'Amazon.co.jp'
      };
    }

    // HTMLの一部をデバッグ用に出力
    const sellerSection = html.match(/merchant-info[\s\S]{0,500}/);
    if (sellerSection) {
      console.log(`[Background] merchant-info section:`, sellerSection[0].substring(0, 200));
    }

    console.log(`[Background] No seller info found in HTML`);
    return { sellerUrl: null, sellerName: null };
  } catch (error) {
    console.error('[Background] Product fetch error:', error);
    return { sellerUrl: null, sellerName: null, error: error.message };
  }
}

/**
 * 起動時の初期化処理
 * アイコンバッジを設定
 */
chrome.storage.local.get(['autoApply']).then((settings) => {
  updateIconBadge(settings.autoApply || false);
}).catch((error) => {
  console.error('[Background] Startup initialization error:', error);
});
