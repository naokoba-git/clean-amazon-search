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
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 8px 14px !important;
      border-radius: 6px !important;
      font-size: 13px !important;
      font-weight: bold !important;
      margin: 8px 0 !important;
      line-height: 1.4 !important;
      z-index: 100 !important;
      position: relative !important;
      width: fit-content !important;
      overflow: visible !important;
      clear: both !important;
    }
    .cas-product-badge-trusted {
      background: #d4edda !important;
      border: 2px solid #28a745 !important;
      color: #155724 !important;
    }
    .cas-product-badge-warning {
      background: #fff3cd !important;
      border: 3px solid #ffc107 !important;
      color: #664d03 !important;
      font-size: 13px !important;
      padding: 8px 14px !important;
      box-shadow: 0 2px 8px rgba(255, 193, 7, 0.4) !important;
    }
    .cas-product-badge-danger {
      background: #f8d7da !important;
      border: 2px solid #dc3545 !important;
      color: #721c24 !important;
    }
    .cas-product-badge-icon {
      font-size: 16px !important;
    }
    .cas-product-badge-reasons {
      font-weight: normal !important;
      font-size: 11px !important;
      margin-left: 6px !important;
      color: inherit !important;
      opacity: 0.9 !important;
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

    // 信頼ブランドの場合（バッジは表示しないが、内部的にマーク）
    if (isTrusted) {
      // バッジは表示せず、data属性でマークのみ
      productElement.dataset.casTrusted = 'true';
      productElement.classList.add('cas-product-trusted');
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
   * 現在の統計情報を保存（モード切替時の復元用）
   * @type {{total: number, hidden: number, warned: number, trusted: number}|null}
   */
  currentStats: null,

  /**
   * 現在のバナーモード
   * @type {'filtered'|'trusted'|'all'}
   */
  bannerMode: 'filtered',

  /**
   * フィルターバナーを追加
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  addFilterBanner(stats) {
    // 統計情報を保存
    this.currentStats = stats;
    this.bannerMode = 'filtered';

    // 既存のバナーを削除
    const existingBanner = document.getElementById('cas-filter-banner');
    if (existingBanner) {
      existingBanner.remove();
    }

    // 非表示・警告・信頼ブランドがない場合はバナー不要
    if (stats.hidden === 0 && stats.warned === 0 && stats.trusted === 0) {
      return;
    }

    // スタイルを注入
    this.injectStyles();

    // バナーを作成
    const banner = document.createElement('div');
    banner.id = 'cas-filter-banner';
    banner.className = 'cas-filter-banner';

    document.body.insertBefore(banner, document.body.firstChild);

    // 通常フィルタモードでバナーを表示
    this.renderFilteredBanner(banner, stats);
  },

  /**
   * 通常フィルタモードのバナーを描画
   * @param {Element} banner - バナー要素
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  renderFilteredBanner(banner, stats) {
    this.bannerMode = 'filtered';

    const messageText = stats.hidden > 0 ? `${stats.hidden}件の怪しい商品を非表示中` : 'フィルタ適用中';
    const detailText = stats.warned > 0 ? ` | ${stats.warned}件に警告表示` : '';
    const trustedText = stats.trusted > 0
      ? ` | <a href="#" id="cas-show-trusted-only" style="color: #90EE90; text-decoration: underline; cursor: pointer;">${stats.trusted}件の信頼ブランド</a>`
      : '';

    banner.innerHTML = `
      <span class="cas-filter-banner-icon">&#128737;</span>
      <span>${messageText}${detailText}${trustedText}</span>
      <button class="cas-filter-banner-close" id="cas-banner-show-all">すべて表示</button>
      <button class="cas-filter-banner-close" id="cas-banner-close">閉じる</button>
    `;

    // ページのpaddingを調整
    document.body.style.paddingTop = `${banner.offsetHeight}px`;

    this.attachFilteredBannerEvents(banner, stats);
  },

  /**
   * 通常フィルタモードのイベントを設定
   * @param {Element} banner - バナー要素
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  attachFilteredBannerEvents(banner, stats) {
    // 閉じるボタン
    const closeBtn = document.getElementById('cas-banner-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.remove();
        document.body.style.paddingTop = '';
      });
    }

    // すべて表示ボタン
    const showAllBtn = document.getElementById('cas-banner-show-all');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        this.showAllProducts();
        this.renderAllProductsBanner(banner, stats);
      });
    }

    // 信頼ブランドのリンクをクリック
    const trustedLink = document.getElementById('cas-show-trusted-only');
    if (trustedLink) {
      trustedLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showTrustedOnly();
        this.renderTrustedBanner(banner, stats);
      });
    }
  },

  /**
   * 信頼ブランドのみモードのバナーを描画
   * @param {Element} banner - バナー要素
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  renderTrustedBanner(banner, stats) {
    this.bannerMode = 'trusted';
    const totalCount = stats.total;

    // 実際に表示されている信頼ブランド数をカウント
    const visibleTrusted = document.querySelectorAll('.cas-product-trusted:not(.cas-trusted-hidden)').length;

    banner.innerHTML = `
      <span class="cas-filter-banner-icon" style="color: #90EE90;">&#10003;</span>
      <span style="color: #90EE90;">信頼ブランドのみ表示中（${visibleTrusted}件 / 全${totalCount}件）</span>
      <button class="cas-filter-banner-close" id="cas-banner-normal-filter">通常フィルタ</button>
      <button class="cas-filter-banner-close" id="cas-banner-show-all">すべて表示</button>
      <button class="cas-filter-banner-close" id="cas-banner-close">閉じる</button>
    `;

    document.body.style.paddingTop = `${banner.offsetHeight}px`;

    this.attachTrustedBannerEvents(banner, stats);
  },

  /**
   * 信頼モードのイベントを設定
   * @param {Element} banner - バナー要素
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  attachTrustedBannerEvents(banner, stats) {
    // 閉じるボタン
    const closeBtn = document.getElementById('cas-banner-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.remove();
        document.body.style.paddingTop = '';
      });
    }

    // 通常フィルタボタン
    const normalFilterBtn = document.getElementById('cas-banner-normal-filter');
    if (normalFilterBtn) {
      normalFilterBtn.addEventListener('click', () => {
        this.restoreFilteredMode();
        this.renderFilteredBanner(banner, stats);
      });
    }

    // すべて表示ボタン
    const showAllBtn = document.getElementById('cas-banner-show-all');
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => {
        this.showAllProducts();
        this.renderAllProductsBanner(banner, stats);
      });
    }
  },

  /**
   * すべて表示モードのバナーを描画
   * @param {Element} banner - バナー要素
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  renderAllProductsBanner(banner, stats) {
    this.bannerMode = 'all';

    banner.innerHTML = `
      <span class="cas-filter-banner-icon" style="color: #FFD700;">&#9888;</span>
      <span style="color: #FFD700;">フィルターOFF - すべての商品を表示中（全${stats.total}件）</span>
      <button class="cas-filter-banner-close" id="cas-banner-apply-filter">フィルタ適用</button>
      <button class="cas-filter-banner-close" id="cas-banner-close">閉じる</button>
    `;

    document.body.style.paddingTop = `${banner.offsetHeight}px`;

    this.attachAllProductsBannerEvents(banner, stats);
  },

  /**
   * すべて表示モードのイベントを設定
   * @param {Element} banner - バナー要素
   * @param {{total: number, hidden: number, warned: number, trusted: number}} stats - 統計情報
   */
  attachAllProductsBannerEvents(banner, stats) {
    // 閉じるボタン
    const closeBtn = document.getElementById('cas-banner-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        banner.remove();
        document.body.style.paddingTop = '';
      });
    }

    // フィルタ適用ボタン
    const applyFilterBtn = document.getElementById('cas-banner-apply-filter');
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', () => {
        this.applyFilterMode();
        this.renderFilteredBanner(banner, stats);
      });
    }
  },

  /**
   * 信頼ブランドのみ表示
   */
  showTrustedOnly() {
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');

    for (const product of products) {
      // data属性またはクラスで信頼ブランドを判定
      const isTrusted = product.dataset.casTrusted === 'true' ||
                        product.classList.contains('cas-product-trusted');
      if (isTrusted) {
        // 信頼ブランドは表示
        product.classList.remove('cas-product-hidden', 'cas-trusted-hidden', 'cas-all-visible');
      } else {
        // それ以外は非表示
        product.classList.add('cas-trusted-hidden');
        product.classList.remove('cas-all-visible');
      }
    }

    console.log('[ProductFilter] Switched to trusted-only mode');
  },

  /**
   * 通常フィルタモードに復元
   */
  restoreFilteredMode() {
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');

    for (const product of products) {
      // 信頼モードの非表示を解除
      product.classList.remove('cas-trusted-hidden', 'cas-all-visible');

      // 元のhidden状態を復元
      if (product.dataset.casHidden === 'true') {
        product.classList.add('cas-product-hidden');
      }
    }

    console.log('[ProductFilter] Restored to filtered mode');
  },

  /**
   * フィルタを再適用
   */
  applyFilterMode() {
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');

    for (const product of products) {
      // すべて表示モードの解除
      product.classList.remove('cas-trusted-hidden', 'cas-all-visible');

      // 元のhidden状態を復元
      if (product.dataset.casHidden === 'true') {
        product.classList.add('cas-product-hidden');
      }
    }

    console.log('[ProductFilter] Applied filter mode');
  },

  /**
   * 非表示の商品をすべて表示
   */
  showAllProducts() {
    const products = document.querySelectorAll('[data-component-type="s-search-result"]');

    for (const product of products) {
      // すべての非表示クラスを解除（ただしcasHiddenは保持）
      product.classList.remove('cas-product-hidden', 'cas-trusted-hidden');
      product.classList.add('cas-all-visible');
    }

    console.log('[ProductFilter] Showing all products');
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

    // 理由を整形（簡潔な表現に変換、最大2つまで）
    const simplifiedReasons = reasons.slice(0, 2).map(r => this.simplifyReason(r));
    const reasonsText = simplifiedReasons.length > 0
      ? simplifiedReasons.join('・')
      : '';

    badge.innerHTML = `
      <span class="cas-product-badge-icon">${icon}</span>
      <span>${text}</span>
      ${reasonsText ? `<span class="cas-product-badge-reasons">| ${reasonsText}</span>` : ''}
    `;

    // タイトルセクションの後（Aタグの外側）に挿入
    // overflow: hiddenの親要素を避けるため、タイトル行全体の後に挿入
    const titleSection = productElement.querySelector('.s-title-instructions-style') ||
                         productElement.querySelector('.a-section.a-spacing-none.a-spacing-top-small') ||
                         productElement.querySelector('h2')?.closest('.a-section');

    if (titleSection && titleSection.parentNode) {
      titleSection.parentNode.insertBefore(badge, titleSection.nextSibling);
    } else {
      // フォールバック: 価格の前に挿入を試みる
      const priceSection = productElement.querySelector('.a-price') ||
                           productElement.querySelector('.a-row.a-size-base');
      if (priceSection && priceSection.parentNode) {
        priceSection.parentNode.insertBefore(badge, priceSection);
      } else {
        // 最終フォールバック: 商品カードの内側に直接挿入
        const innerContent = productElement.querySelector('.puis-padding-left-small') ||
                             productElement.querySelector('.s-inner-result-item') ||
                             productElement;
        if (innerContent.firstChild) {
          innerContent.insertBefore(badge, innerContent.firstChild);
        } else {
          innerContent.appendChild(badge);
        }
      }
    }

    // データ属性を設定
    productElement.dataset.casBadge = type;
  },

  /**
   * 警告理由を簡潔な表現に変換
   * @param {string} reason - 元の理由
   * @returns {string} 簡潔な理由
   */
  simplifyReason(reason) {
    const simplifications = {
      // ブランド関連
      '子音のみ4文字以上（例: BKPH, XRDT, GVNM）': '怪しいブランド名',
      '大文字のみ6文字以上（例: QWERTZ, ASDFGH）': '怪しいブランド名',
      '大文字のみ6文字以上': '怪しいブランド名',
      '末尾がJP（例: BrandJP, RandomJP）': 'JP商法',
      '末尾がJapan（例: NoNameJapan）': 'Japan商法',
      '末尾にJP/日本': 'JP商法',
      'ランダムな英数字の組み合わせ（例: AB123, XY99Z）': '怪しいブランド名',
      'ランダムな英字列（子音のみ4文字以上）': '怪しいブランド名',
      '中国企業の接尾辞を含むブランド名': '中国ブランド',
      '簡体字を含むブランド名（中国ブランドの可能性）': '中国ブランド',
      '大文字小文字が交互（例: AbCdEf）': '怪しいブランド名',
      'ノーブランド/Generic': 'ノーブランド',
      // タイトル関連
      'タイトルが非常に長い': 'タイトル長すぎ',
      'タイトルが長すぎる': 'タイトル長すぎ',
      // 誇大表現
      '誇大広告表現': '誇大広告',
      '最新版表現': '誇大広告',
      '令和最新': '誇大広告',
      // その他
      '信頼できるブランド': '信頼ブランド',
      '日本の工房・製作所': '日本ブランド'
    };

    // 完全一致
    if (simplifications[reason]) {
      return simplifications[reason];
    }

    // 部分一致
    for (const [key, value] of Object.entries(simplifications)) {
      if (reason.includes(key) || key.includes(reason)) {
        return value;
      }
    }

    // タイトル長さの特別処理
    if (reason.match(/タイトルが.*長.*\(\d+文字\)/)) {
      return 'タイトル長すぎ';
    }

    // 短縮できない場合は最初の10文字
    return reason.length > 12 ? reason.substring(0, 10) + '…' : reason;
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
