/**
 * Clean Amazon Search - 商品フィルター
 * @fileoverview 検索結果ページの商品をスコアに基づいてフィルタリング
 * @module product-filter
 * @requires constants.js
 * @requires brand-checker.js
 * @requires title-checker.js
 */

'use strict';

/**
 * 商品フィルターオブジェクト
 * @namespace ProductFilter
 */
const ProductFilter = {
  /**
   * フィルターレベル定義
   * @type {Object}
   */
  FILTER_LEVELS: {
    OFF: 0,        // フィルターOFF
    LIGHT: 1,      // ライト（警告のみ）
    STANDARD: 2,   // スタンダード
    STRICT: 3,     // ストリクト
    MAXIMUM: 4     // 最強
  },

  /**
   * 各レベルの閾値設定（PM会議決定に基づく）
   * @type {Object}
   */
  THRESHOLDS: {
    // LIGHT: 警告のみ表示、非表示なし
    1: { warn: 30, hide: Infinity },
    // STANDARD: 中程度のフィルタリング（デフォルト）
    2: { warn: 30, hide: 50 },
    // STRICT: 厳格なフィルタリング
    3: { warn: 20, hide: 35 },
    // MAXIMUM: 最強フィルタリング
    4: { warn: 10, hide: 25 }
  },

  /**
   * バッジタイプ定義
   * @type {Object}
   */
  BADGE_TYPES: {
    TRUSTED: 'trusted',
    WARNING: 'warning',
    DANGER: 'danger'
  },

  /**
   * CSS スタイル定義
   * @type {string}
   */
  STYLES: `
    .cas-filter-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #4CAF50 0%, #388E3C 100%);
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-size: 14px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
    }
    .cas-filter-banner-close {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      padding: 4px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .cas-filter-banner-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .cas-product-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: bold;
      margin: 6px 0;
    }
    .cas-product-badge-trusted {
      background: #d4edda;
      border: 1px solid #28a745;
      color: #155724;
    }
    .cas-product-badge-warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      color: #856404;
    }
    .cas-product-badge-danger {
      background: #f8d7da;
      border: 1px solid #dc3545;
      color: #721c24;
    }
    .cas-product-badge-icon {
      font-size: 12px;
    }
    .cas-product-badge-reasons {
      font-weight: normal;
      font-size: 10px;
      margin-left: 4px;
      color: inherit;
      opacity: 0.8;
    }
    .cas-product-hidden {
      display: none !important;
    }
    .cas-trusted-hidden {
      display: none !important;
    }
    .cas-product-dimmed {
      opacity: 0.5;
      transition: opacity 0.2s;
    }
    .cas-product-dimmed:hover {
      opacity: 1;
    }
  `,

  /**
   * スタイルが注入済みかどうか
   * @type {boolean}
   */
  stylesInjected: false,

  /**
   * CSSスタイルをページに注入
   */
  injectStyles() {
    if (this.stylesInjected) return;

    const styleElement = document.createElement('style');
    styleElement.id = 'cas-product-filter-styles';
    styleElement.textContent = this.STYLES;
    document.head.appendChild(styleElement);
    this.stylesInjected = true;
  },

  /**
   * 商品DOM要素から情報を抽出
   * @param {Element} productElement - 商品のDOM要素
   * @returns {{brandName: string, title: string, asin: string, priceText: string, productUrl: string}} 商品情報
   */
  extractProductInfo(productElement) {
    const info = {
      brandName: '',
      title: '',
      asin: '',
      priceText: '',
      productUrl: ''
    };

    try {
      // ASIN の取得
      info.asin = productElement.dataset.asin || '';

      // タイトルの取得
      const titleElement = productElement.querySelector('h2 a span') ||
                           productElement.querySelector('h2 span') ||
                           productElement.querySelector('.a-text-normal');
      if (titleElement) {
        info.title = titleElement.textContent?.trim() || '';
      }

      // 商品URLの取得
      const linkElement = productElement.querySelector('h2 a') ||
                          productElement.querySelector('a.a-link-normal[href*="/dp/"]');
      if (linkElement) {
        info.productUrl = linkElement.href || '';
      }

      // ブランド名の取得（複数のパターンを試行）

      // パターン1: タイトルの先頭からブランド名を抽出（最も確実）
      // Amazonのタイトルは通常「ブランド名 商品名...」の形式
      if (info.title) {
        const brandFromTitle = this.extractBrandFromTitle(info.title);
        if (brandFromTitle) {
          info.brandName = brandFromTitle;
        }
      }

      // パターン2: ブランドリンク（/stores/や/brand/を含むリンク）
      if (!info.brandName) {
        const brandLink = productElement.querySelector('a[href*="/stores/"]') ||
                          productElement.querySelector('a[href*="/brand/"]');
        if (brandLink) {
          const brandText = brandLink.textContent?.trim();
          if (brandText && brandText.length < 50) {
            info.brandName = brandText;
          }
        }
      }

      // パターン3: span.a-size-base-plus（商品タイトルとは別のブランド行）
      if (!info.brandName) {
        const brandRows = productElement.querySelectorAll('.a-row .a-size-base');
        for (const row of brandRows) {
          const text = row.textContent?.trim() || '';
          // 短いテキストでタイトルと異なる場合はブランド名の可能性
          if (text.length > 0 && text.length < 30 && text !== info.title.substring(0, text.length)) {
            info.brandName = text;
            break;
          }
        }
      }

      // パターン4: 「ブランド:」で始まるテキスト
      if (!info.brandName) {
        const allText = productElement.textContent || '';
        const brandMatch = allText.match(/ブランド[:：]\s*([^\s,、]+)/);
        if (brandMatch) {
          info.brandName = brandMatch[1];
        }
      }

      // 価格の取得
      const priceElement = productElement.querySelector('.a-price .a-offscreen') ||
                           productElement.querySelector('.a-price-whole');
      if (priceElement) {
        info.priceText = priceElement.textContent?.trim() || '';
      }

    } catch (error) {
      console.warn('[ProductFilter] Error extracting product info:', error);
    }

    return info;
  },

  /**
   * スコアを計算
   * @param {Object} productInfo - 商品情報
   * @param {Object} config - 設定（信頼ブランドリスト等）
   * @returns {{score: number, reasons: string[], isTrusted: boolean}} スコア結果
   */
  calculateScore(productInfo, config = {}) {
    let totalScore = 0;
    const allReasons = [];
    let isTrusted = false;

    // 信頼ブランドリストを取得
    const trustedBrands = config.trustedBrands || [];
    const suspiciousPatterns = config.suspiciousPatterns || [];

    // ブランドチェック
    if (productInfo.brandName && typeof BrandChecker !== 'undefined') {
      const brandResult = BrandChecker.checkBrand(
        productInfo.brandName,
        trustedBrands,
        suspiciousPatterns
      );
      totalScore += brandResult.score;
      allReasons.push(...brandResult.reasons);

      // 信頼ブランドの場合
      if (brandResult.score < 0) {
        isTrusted = true;
      }
    }

    // タイトルチェック
    if (productInfo.title && typeof TitleChecker !== 'undefined') {
      const titleResult = TitleChecker.checkTitle(productInfo.title);
      totalScore += titleResult.score;
      allReasons.push(...titleResult.reasons);
    }

    return {
      score: totalScore,
      reasons: allReasons,
      isTrusted
    };
  },

  /**
   * 商品要素にフィルターを適用
   * @param {Element} productElement - 商品のDOM要素
   * @param {{score: number, reasons: string[], isTrusted: boolean}} scoreResult - スコア結果
   * @param {number} filterLevel - フィルターレベル (0-4)
   * @returns {'hidden'|'warned'|'trusted'|'none'} 適用結果
   */
  applyFilter(productElement, scoreResult, filterLevel) {
    // フィルターOFFの場合は何もしない
    if (filterLevel === this.FILTER_LEVELS.OFF) {
      return 'none';
    }

    const thresholds = this.THRESHOLDS[filterLevel] || this.THRESHOLDS[2];
    const { score, reasons, isTrusted } = scoreResult;

    // 既存のバッジを削除
    this.removeBadge(productElement);

    // 信頼ブランドの場合
    if (isTrusted) {
      this.addProductBadge(productElement, this.BADGE_TYPES.TRUSTED, reasons);
      productElement.classList.remove('cas-product-hidden', 'cas-product-dimmed');
      return 'trusted';
    }

    // スコアに基づいて処理
    if (score >= thresholds.hide) {
      // 非表示
      productElement.classList.add('cas-product-hidden');
      productElement.dataset.casHidden = 'true';
      productElement.dataset.casScore = score.toString();
      return 'hidden';
    } else if (score >= thresholds.warn) {
      // 警告表示
      this.addProductBadge(productElement, this.BADGE_TYPES.WARNING, reasons);
      productElement.classList.add('cas-product-dimmed');
      productElement.classList.remove('cas-product-hidden');
      return 'warned';
    } else if (score > 20) {
      // 軽度の注意（バッジのみ）
      this.addProductBadge(productElement, this.BADGE_TYPES.WARNING, reasons);
      productElement.classList.remove('cas-product-hidden', 'cas-product-dimmed');
      return 'warned';
    }

    // 問題なし
    productElement.classList.remove('cas-product-hidden', 'cas-product-dimmed');
    return 'none';
  },

  /**
   * ページ内の全商品をフィルタリング
   * @param {Object} config - 設定オブジェクト
   * @param {number} filterLevel - フィルターレベル (0-4)
   * @returns {{total: number, hidden: number, warned: number, trusted: number}} 統計情報
   */
  filterAllProducts(config, filterLevel) {
    // スタイルを注入
    this.injectStyles();

    const stats = {
      total: 0,
      hidden: 0,
      warned: 0,
      trusted: 0
    };

    // 商品要素を取得
    const productSelector = '[data-component-type="s-search-result"]';
    const productElements = document.querySelectorAll(productSelector);

    for (const productElement of productElements) {
      stats.total++;

      // 商品情報を抽出
      const productInfo = this.extractProductInfo(productElement);

      // スコアを計算
      const scoreResult = this.calculateScore(productInfo, config);

      // フィルターを適用
      const result = this.applyFilter(productElement, scoreResult, filterLevel);

      // 統計を更新
      switch (result) {
        case 'hidden':
          stats.hidden++;
          break;
        case 'warned':
          stats.warned++;
          break;
        case 'trusted':
          stats.trusted++;
          break;
      }
    }

    return stats;
  },

  /**
   * フィルターバナーを追加
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  addFilterBanner(stats) {
    // 既存のバナーを削除
    const existingBanner = document.getElementById('cas-filter-banner');
    if (existingBanner) {
      existingBanner.remove();
    }

    // 非表示商品がない場合はバナーを表示しない
    if (stats.hidden === 0) {
      return;
    }

    // スタイルを注入
    this.injectStyles();

    // バナーを作成
    const banner = document.createElement('div');
    banner.id = 'cas-filter-banner';
    banner.className = 'cas-filter-banner';

    const messageText = `${stats.hidden}件の怪しい商品を非表示中`;
    const detailText = stats.warned > 0 ? ` | ${stats.warned}件に警告表示` : '';
    const trustedText = stats.trusted > 0 ? ` | <a href="#" id="cas-show-trusted-only" style="color: #90EE90; text-decoration: underline; cursor: pointer;">${stats.trusted}件の信頼ブランド</a>` : '';

    banner.innerHTML = `
      <span class="cas-filter-banner-icon">&#128737;</span>
      <span>${messageText}${detailText}${trustedText}</span>
      <button class="cas-filter-banner-close" id="cas-banner-close">閉じる</button>
      <button class="cas-filter-banner-close" id="cas-banner-show-all">すべて表示</button>
      <button class="cas-filter-banner-close" id="cas-banner-trusted-only">信頼のみ</button>
    `;

    document.body.insertBefore(banner, document.body.firstChild);

    // ページのpaddingを調整
    document.body.style.paddingTop = `${banner.offsetHeight}px`;

    // 閉じるボタンのイベント
    const closeBtn = document.getElementById('cas-banner-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.remove();
        document.body.style.paddingTop = '';
      });
    }

    // すべて表示ボタンのイベント
    const showAllBtn = document.getElementById('cas-banner-show-all');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        this.showAllProducts();
        banner.remove();
        document.body.style.paddingTop = '';
      });
    }

    // 信頼ブランドのみ表示ボタンのイベント
    const trustedOnlyBtn = document.getElementById('cas-banner-trusted-only');
    if (trustedOnlyBtn) {
      trustedOnlyBtn.addEventListener('click', () => {
        this.showTrustedOnly();
        this.updateBannerForTrustedMode(banner);
      });
    }

    // 信頼ブランドのリンクをクリック
    const trustedLink = document.getElementById('cas-show-trusted-only');
    if (trustedLink) {
      trustedLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showTrustedOnly();
        this.updateBannerForTrustedMode(banner);
      });
    }
  },

  /**
   * 信頼ブランドのみ表示
   */
  showTrustedOnly() {
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');
    let trustedCount = 0;
    let hiddenCount = 0;

    for (const product of products) {
      const badge = product.querySelector('.cas-product-badge-trusted');
      if (badge) {
        // 信頼ブランドは表示
        product.classList.remove('cas-product-hidden', 'cas-trusted-hidden');
        trustedCount++;
      } else {
        // それ以外は非表示
        product.classList.add('cas-trusted-hidden');
        hiddenCount++;
      }
    }

    console.log(`[ProductFilter] Trusted only mode: showing ${trustedCount}, hiding ${hiddenCount}`);
  },

  /**
   * 信頼モード時のバナー更新
   * @param {Element} banner - バナー要素
   */
  updateBannerForTrustedMode(banner) {
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');
    const trustedCount = document.querySelectorAll('.cas-product-badge-trusted').length;
    const totalCount = products.length;

    banner.innerHTML = `
      <span class="cas-filter-banner-icon">&#10003;</span>
      <span style="color: #90EE90;">信頼ブランドのみ表示中（${trustedCount}件 / ${totalCount}件）</span>
      <button class="cas-filter-banner-close" id="cas-banner-show-all-from-trusted">通常表示に戻す</button>
    `;

    // 通常表示に戻すボタン
    const showAllFromTrusted = document.getElementById('cas-banner-show-all-from-trusted');
    if (showAllFromTrusted) {
      showAllFromTrusted.addEventListener('click', () => {
        this.restoreFromTrustedMode();
        banner.remove();
        document.body.style.paddingTop = '';
      });
    }
  },

  /**
   * 信頼モードから通常モードに復元
   */
  restoreFromTrustedMode() {
    const hiddenByTrusted = document.querySelectorAll('.cas-trusted-hidden');
    for (const product of hiddenByTrusted) {
      product.classList.remove('cas-trusted-hidden');
    }
  },

  /**
   * 非表示の商品をすべて表示
   */
  showAllProducts() {
    const hiddenProducts = document.querySelectorAll('.cas-product-hidden');
    for (const product of hiddenProducts) {
      product.classList.remove('cas-product-hidden');
      delete product.dataset.casHidden;
    }
  },

  /**
   * 商品要素にバッジを追加
   * @param {Element} productElement - 商品のDOM要素
   * @param {'trusted'|'warning'|'danger'} type - バッジタイプ
   * @param {string[]} reasons - 理由の配列
   */
  addProductBadge(productElement, type, reasons = []) {
    // 既存のバッジを削除
    this.removeBadge(productElement);

    // バッジを作成
    const badge = document.createElement('div');
    badge.className = `cas-product-badge cas-product-badge-${type}`;

    // アイコンとテキストを設定
    let icon = '';
    let text = '';

    switch (type) {
      case this.BADGE_TYPES.TRUSTED:
        icon = '&#10003;';
        text = '信頼ブランド';
        break;
      case this.BADGE_TYPES.WARNING:
        icon = '&#9888;';
        text = '注意';
        break;
      case this.BADGE_TYPES.DANGER:
        icon = '&#10060;';
        text = '危険';
        break;
    }

    // 理由を整形（最大3つまで表示）
    const displayReasons = reasons.slice(0, 3);
    const reasonsText = displayReasons.length > 0
      ? `(${displayReasons.join(', ')})`
      : '';

    badge.innerHTML = `
      <span class="cas-product-badge-icon">${icon}</span>
      <span>${text}</span>
      ${reasonsText ? `<span class="cas-product-badge-reasons">${reasonsText}</span>` : ''}
    `;

    // タイトル要素の後に挿入
    const titleElement = productElement.querySelector('h2');
    if (titleElement) {
      titleElement.parentNode.insertBefore(badge, titleElement.nextSibling);
    } else {
      // タイトルが見つからない場合は先頭に挿入
      const firstChild = productElement.querySelector('.s-inner-result-item') || productElement;
      firstChild.insertBefore(badge, firstChild.firstChild);
    }

    // データ属性を設定
    productElement.dataset.casBadge = type;
  },

  /**
   * 商品要素からバッジを削除
   * @param {Element} productElement - 商品のDOM要素
   */
  removeBadge(productElement) {
    const existingBadge = productElement.querySelector('.cas-product-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
    delete productElement.dataset.casBadge;
  },

  /**
   * タイトルからブランド名を抽出
   * @param {string} title - 商品タイトル
   * @returns {string|null} ブランド名、抽出できない場合はnull
   */
  extractBrandFromTitle(title) {
    if (!title) return null;

    // 【】で始まる場合はスキップして次の単語を取得
    let cleanTitle = title.replace(/^【[^】]*】\s*/, '');

    // タイトルの先頭の単語を取得（スペースや記号で区切る）
    const match = cleanTitle.match(/^([A-Za-z][A-Za-z0-9\-\.]*|[ァ-ヶー]+|[一-龠]+)/);
    if (match) {
      const candidate = match[1];
      // 1文字や一般的な単語は除外
      if (candidate.length >= 2 && !this.isCommonWord(candidate)) {
        return candidate;
      }
    }

    // 半角スペースで区切った最初の単語
    const firstWord = cleanTitle.split(/[\s\u3000]/)[0];
    if (firstWord && firstWord.length >= 2 && firstWord.length <= 30) {
      // 英数字で始まる場合、または日本語ブランド名の場合
      if (/^[A-Za-z0-9]/.test(firstWord) || /^[ァ-ヶー一-龠]/.test(firstWord)) {
        // 括弧や記号を除去
        const cleanBrand = firstWord.replace(/[\(\)（）\[\]【】「」]/g, '').trim();
        if (cleanBrand.length >= 2 && !this.isCommonWord(cleanBrand)) {
          return cleanBrand;
        }
      }
    }

    return null;
  },

  /**
   * 一般的な単語かどうかを判定
   * @param {string} word - 単語
   * @returns {boolean} 一般的な単語の場合true
   */
  isCommonWord(word) {
    const commonWords = [
      'for', 'with', 'and', 'the', 'new', 'pro', 'max', 'mini', 'plus',
      'モバイル', 'ワイヤレス', '充電', '対応', '最新', '大容量', '急速'
    ];
    return commonWords.includes(word.toLowerCase());
  },

  /**
   * 設定ファイルから信頼ブランドリストを読み込み
   * @returns {Promise<string[]>} 信頼ブランドの配列
   */
  async loadTrustedBrands() {
    try {
      const url = chrome.runtime.getURL('config/trusted-brands.json');
      const response = await fetch(url);
      const data = await response.json();

      // 全カテゴリのブランドを結合
      const allBrands = [];
      if (data.brands) {
        for (const category of Object.values(data.brands)) {
          if (category.list && Array.isArray(category.list)) {
            allBrands.push(...category.list);
          }
        }
      }

      return allBrands;
    } catch (error) {
      console.error('[ProductFilter] Failed to load trusted brands:', error);
      return [];
    }
  },

  /**
   * 設定ファイルから怪しいパターンを読み込み
   * @returns {Promise<Object[]>} パターン設定の配列
   */
  async loadSuspiciousPatterns() {
    try {
      const url = chrome.runtime.getURL('config/suspicious-patterns.json');
      const response = await fetch(url);
      const data = await response.json();

      // ブランドパターンを抽出
      if (data.brand_patterns && data.brand_patterns.patterns) {
        return data.brand_patterns.patterns.map(p => ({
          pattern: p.pattern,
          score: p.score,
          reason: p.description
        }));
      }

      return [];
    } catch (error) {
      console.error('[ProductFilter] Failed to load suspicious patterns:', error);
      return [];
    }
  },

  /**
   * 設定を読み込んでフィルタリングを実行
   * @param {number} [filterLevel=2] - フィルターレベル
   * @returns {Promise<{total: number, hidden: number, warned: number, trusted: number}>} 統計情報
   */
  async run(filterLevel = 2) {
    try {
      // 設定を読み込み
      const [trustedBrands, suspiciousPatterns] = await Promise.all([
        this.loadTrustedBrands(),
        this.loadSuspiciousPatterns()
      ]);

      const config = {
        trustedBrands,
        suspiciousPatterns
      };

      // フィルタリングを実行
      const stats = this.filterAllProducts(config, filterLevel);

      // バナーを表示
      this.addFilterBanner(stats);

      console.log('[ProductFilter] Filtering complete:', stats);

      return stats;
    } catch (error) {
      console.error('[ProductFilter] Error running filter:', error);
      return { total: 0, hidden: 0, warned: 0, trusted: 0 };
    }
  },

  /**
   * MutationObserverで新しい商品を監視
   * @param {Object} config - 設定オブジェクト
   * @param {number} filterLevel - フィルターレベル
   * @returns {MutationObserver} オブザーバーインスタンス
   */
  observeNewProducts(config, filterLevel) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 新しく追加された商品要素をチェック
            const products = node.querySelectorAll
              ? node.querySelectorAll('[data-component-type="s-search-result"]')
              : [];

            for (const productElement of products) {
              // 既に処理済みならスキップ
              if (productElement.dataset.casProcessed) continue;

              const productInfo = this.extractProductInfo(productElement);
              const scoreResult = this.calculateScore(productInfo, config);
              this.applyFilter(productElement, scoreResult, filterLevel);
              productElement.dataset.casProcessed = 'true';
            }
          }
        }
      }
    });

    // 検索結果コンテナを監視
    const container = document.querySelector('.s-main-slot') ||
                      document.querySelector('[data-component-type="s-search-results"]');
    if (container) {
      observer.observe(container, {
        childList: true,
        subtree: true
      });
    }

    return observer;
  }
};

// グローバルに公開
if (typeof globalThis !== 'undefined') {
  globalThis.ProductFilter = ProductFilter;
}
if (typeof window !== 'undefined') {
  window.ProductFilter = ProductFilter;
}
