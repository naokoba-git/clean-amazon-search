/**
 * Clean Amazon Search - セラー住所チェッカー
 * @fileoverview 販売元の住所を確認し、日本のセラーかどうかを判定
 * @module seller-checker
 */

'use strict';

/**
 * セラーチェッカーオブジェクト
 * @namespace SellerChecker
 */
const SellerChecker = {
  /**
   * セラー情報のキャッシュ（セラーID → 判定結果）
   * @type {Map<string, {isJapanese: boolean, address: string, checkedAt: number}>}
   */
  cache: new Map(),

  /**
   * キャッシュの有効期限（24時間）
   * @type {number}
   */
  CACHE_TTL: 24 * 60 * 60 * 1000,

  /**
   * 日本の都道府県リスト
   * @type {string[]}
   */
  JAPAN_PREFECTURES: [
    '北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島',
    '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
    '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜',
    '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫',
    '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口',
    '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎',
    '熊本', '大分', '宮崎', '鹿児島', '沖縄'
  ],

  /**
   * 日本の住所を示すキーワード
   * @type {string[]}
   */
  JAPAN_INDICATORS: [
    '日本', 'Japan', 'JP', '〒'
  ],

  /**
   * 海外（主に中国）の住所を示すキーワード
   * @type {string[]}
   */
  OVERSEAS_INDICATORS: [
    // 中国
    '中国', 'China', 'CN', 'PRC',
    '广东', '深圳', '广州', '东莞', '佛山', '珠海', '惠州',
    '浙江', '杭州', '宁波', '温州', '义乌',
    '江苏', '苏州', '南京', '无锡',
    '上海', '北京', '天津', '重庆',
    '福建', '厦门', '泉州', '福州',
    '山东', '青岛', '济南',
    '河南', '郑州',
    '湖北', '武汉',
    '四川', '成都',
    '香港', 'Hong Kong', 'HK',
    // その他アジア
    '台湾', 'Taiwan', 'TW',
    '韓国', 'Korea', 'KR',
    // 欧米
    'USA', 'United States', 'UK', 'United Kingdom'
  ],

  /**
   * セラーIDをURLから抽出
   * @param {string} sellerUrl - セラーページのURL
   * @returns {string|null} セラーID
   */
  extractSellerId(sellerUrl) {
    const match = sellerUrl.match(/seller=([A-Z0-9]+)/);
    return match ? match[1] : null;
  },

  /**
   * セラーページから住所情報を取得
   * @param {string} sellerUrl - セラーページのURL
   * @returns {Promise<{isJapanese: boolean, address: string, error?: string}>}
   */
  async checkSellerAddress(sellerUrl) {
    const sellerId = this.extractSellerId(sellerUrl);

    // キャッシュ確認
    if (sellerId && this.cache.has(sellerId)) {
      const cached = this.cache.get(sellerId);
      if (Date.now() - cached.checkedAt < this.CACHE_TTL) {
        console.log(`[SellerChecker] キャッシュヒット: ${sellerId}`);
        return { isJapanese: cached.isJapanese, address: cached.address };
      }
    }

    try {
      const fullUrl = sellerUrl.startsWith('http')
        ? sellerUrl
        : `https://www.amazon.co.jp${sellerUrl}`;

      const response = await fetch(fullUrl, {
        credentials: 'include',
        headers: {
          'Accept': 'text/html',
          'Accept-Language': 'ja-JP,ja;q=0.9'
        }
      });

      if (!response.ok) {
        return { isJapanese: false, address: '', error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const result = this.analyzeSellerPage(html);

      // キャッシュに保存
      if (sellerId) {
        this.cache.set(sellerId, {
          isJapanese: result.isJapanese,
          address: result.address,
          checkedAt: Date.now()
        });
        this.saveCache();
      }

      return result;
    } catch (error) {
      console.error('[SellerChecker] Error:', error);
      return { isJapanese: false, address: '', error: error.message };
    }
  },

  /**
   * セラーページのHTMLを解析して住所を判定
   * @param {string} html - セラーページのHTML
   * @returns {{isJapanese: boolean, address: string}}
   */
  analyzeSellerPage(html) {
    // HTMLからテキストを抽出（タグ除去）
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');

    // 住所らしき部分を探す
    let detectedAddress = '';
    let isJapanese = false;
    let isOverseas = false;
    let japanScore = 0;
    let overseasScore = 0;

    // 日本の都道府県チェック
    for (const pref of this.JAPAN_PREFECTURES) {
      if (textContent.includes(pref)) {
        japanScore += 10;
        detectedAddress = pref;
        break;
      }
    }

    // 日本インジケーターチェック
    for (const indicator of this.JAPAN_INDICATORS) {
      if (textContent.includes(indicator)) {
        japanScore += 5;
      }
    }

    // 海外インジケーターチェック
    for (const indicator of this.OVERSEAS_INDICATORS) {
      if (textContent.includes(indicator)) {
        overseasScore += 5;
        if (!detectedAddress) {
          detectedAddress = indicator;
        }
      }
    }

    // Amazon.co.jp自体の判定（最優先）
    if (textContent.includes('Amazon.co.jp') && textContent.includes('販売元: Amazon')) {
      return { isJapanese: true, address: 'Amazon.co.jp' };
    }

    // スコアで判定
    if (japanScore > 0 && japanScore >= overseasScore) {
      isJapanese = true;
    } else if (overseasScore > 0) {
      isOverseas = true;
      isJapanese = false;
    } else {
      // 判定できない場合は安全のためfalse
      isJapanese = false;
    }

    return {
      isJapanese,
      address: detectedAddress || '不明'
    };
  },

  /**
   * 商品要素からセラーリンクを取得
   * @param {Element} productElement - 商品のDOM要素
   * @returns {string|null} セラーページのURL
   */
  getSellerLinkFromProduct(productElement) {
    // 検索結果ページの場合
    const sellerSpan = productElement.querySelector('.a-size-small.a-color-base');
    if (sellerSpan) {
      const parentLink = sellerSpan.closest('a');
      if (parentLink && parentLink.href.includes('seller=')) {
        return parentLink.href;
      }
    }
    return null;
  },

  /**
   * 商品詳細ページからセラーリンクを取得
   * @returns {string|null} セラーページのURL
   */
  getSellerLinkFromProductPage() {
    const sellerLink = document.querySelector('#sellerProfileTriggerId');
    if (sellerLink && sellerLink.href) {
      return sellerLink.href;
    }

    // 代替: merchant-info内のリンク
    const merchantInfo = document.querySelector('#merchant-info a[href*="seller="]');
    if (merchantInfo) {
      return merchantInfo.href;
    }

    return null;
  },

  /**
   * キャッシュをローカルストレージに保存
   */
  async saveCache() {
    try {
      const cacheObj = {};
      this.cache.forEach((value, key) => {
        cacheObj[key] = value;
      });
      await chrome.storage.local.set({ sellerCache: cacheObj });
    } catch (error) {
      console.error('[SellerChecker] Cache save error:', error);
    }
  },

  /**
   * ローカルストレージからキャッシュを読み込み
   */
  async loadCache() {
    try {
      const result = await chrome.storage.local.get('sellerCache');
      if (result.sellerCache) {
        Object.entries(result.sellerCache).forEach(([key, value]) => {
          // 期限切れでないもののみ読み込み
          if (Date.now() - value.checkedAt < this.CACHE_TTL) {
            this.cache.set(key, value);
          }
        });
        console.log(`[SellerChecker] キャッシュ読み込み: ${this.cache.size}件`);
      }
    } catch (error) {
      console.error('[SellerChecker] Cache load error:', error);
    }
  },

  /**
   * 商品に警告バッジを追加
   * @param {Element} productElement - 商品のDOM要素
   * @param {string} message - 表示するメッセージ
   */
  addWarningBadge(productElement, message) {
    // 既存のバッジがあれば削除
    const existingBadge = productElement.querySelector('.cas-seller-warning');
    if (existingBadge) {
      existingBadge.remove();
    }

    const badge = document.createElement('div');
    badge.className = 'cas-seller-warning';
    badge.innerHTML = `
      <span class="cas-warning-icon">⚠️</span>
      <span class="cas-warning-text">${message}</span>
    `;
    badge.style.cssText = `
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 4px 8px;
      margin: 8px 0;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    // 商品タイトルの下に挿入
    const titleElement = productElement.querySelector('h2') || productElement.querySelector('.a-text-normal');
    if (titleElement) {
      titleElement.parentNode.insertBefore(badge, titleElement.nextSibling);
    } else {
      productElement.prepend(badge);
    }
  },

  /**
   * 商品に日本セラーバッジを追加
   * @param {Element} productElement - 商品のDOM要素
   */
  addJapaneseBadge(productElement) {
    const existingBadge = productElement.querySelector('.cas-japan-badge');
    if (existingBadge) return;

    const badge = document.createElement('div');
    badge.className = 'cas-japan-badge';
    badge.innerHTML = `
      <span>🇯🇵</span>
      <span>日本のセラー</span>
    `;
    badge.style.cssText = `
      background: #d4edda;
      border: 1px solid #28a745;
      border-radius: 4px;
      padding: 4px 8px;
      margin: 8px 0;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    const titleElement = productElement.querySelector('h2') || productElement.querySelector('.a-text-normal');
    if (titleElement) {
      titleElement.parentNode.insertBefore(badge, titleElement.nextSibling);
    }
  },

  /**
   * 商品を非表示にする
   * @param {Element} productElement - 商品のDOM要素
   * @param {boolean} hide - 非表示にするかどうか
   */
  hideProduct(productElement, hide = true) {
    if (hide) {
      productElement.style.display = 'none';
      productElement.dataset.casHidden = 'true';
    } else {
      productElement.style.display = '';
      delete productElement.dataset.casHidden;
    }
  }
};

// グローバルに公開
if (typeof globalThis !== 'undefined') {
  globalThis.SellerChecker = SellerChecker;
}
if (typeof window !== 'undefined') {
  window.SellerChecker = SellerChecker;
}
