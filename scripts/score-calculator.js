/**
 * Clean Amazon Search - スコア統合計算機
 * @fileoverview BrandChecker、TitleChecker、SellerCheckerの結果を統合してトータルスコアを計算
 * @module score-calculator
 */

'use strict';

/**
 * スコア計算オブジェクト
 * @namespace ScoreCalculator
 */
const ScoreCalculator = {
  /**
   * 判定閾値の設定
   * @type {Object}
   */
  THRESHOLDS: {
    /** trusted: 0未満 */
    TRUSTED: 0,
    /** safe: 0-29 */
    SAFE: 30,
    /** warning: 30-49 */
    WARNING: 50
    /** danger: 50以上 */
  },

  /**
   * 判定結果とアクションのマッピング
   * @type {Object}
   */
  VERDICT_ACTIONS: {
    trusted: 'show_badge',
    safe: 'show',
    warning: 'show_warning',
    danger: 'hide'
  },

  /**
   * トータルスコアを計算し、最終判定を行う
   * @param {Object} productInfo - 商品情報
   * @param {string} productInfo.brandName - ブランド名
   * @param {string} productInfo.title - 商品タイトル
   * @param {Object} [productInfo.sellerInfo] - セラー情報（オプション）
   * @param {boolean} [productInfo.sellerInfo.isJapanese] - 日本のセラーかどうか
   * @param {string} [productInfo.sellerInfo.address] - セラーの住所
   * @param {Object} config - 設定
   * @param {string[]} config.trustedBrands - 信頼できるブランドのリスト
   * @param {Object} config.suspiciousPatterns - 疑わしいパターンの設定
   * @returns {{
   *   totalScore: number,
   *   brandScore: {score: number, reasons: string[]},
   *   titleScore: {score: number, reasons: string[]},
   *   sellerScore: {score: number, reasons: string[]},
   *   verdict: 'trusted'|'safe'|'warning'|'danger',
   *   action: 'show_badge'|'show'|'show_warning'|'hide'
   * }} 計算結果
   */
  calculateScore(productInfo, config) {
    // 入力バリデーション
    const validatedInfo = this.validateProductInfo(productInfo);
    const validatedConfig = this.validateConfig(config);

    // 各チェッカーでスコアを計算
    const brandScore = this.calculateBrandScore(
      validatedInfo.brandName,
      validatedConfig.trustedBrands,
      validatedConfig.suspiciousPatterns.brand
    );

    const titleScore = this.calculateTitleScore(
      validatedInfo.title,
      validatedConfig.suspiciousPatterns.title
    );

    const sellerScore = this.calculateSellerScore(validatedInfo.sellerInfo);

    // トータルスコアを計算
    const totalScore = brandScore.score + titleScore.score + sellerScore.score;

    // 最終判定
    const verdict = this.determineVerdict(totalScore);
    const action = this.VERDICT_ACTIONS[verdict];

    return {
      totalScore,
      brandScore,
      titleScore,
      sellerScore,
      verdict,
      action
    };
  },

  /**
   * 商品情報をバリデーション
   * @param {Object} productInfo - 商品情報
   * @returns {Object} バリデーション済みの商品情報
   */
  validateProductInfo(productInfo) {
    return {
      brandName: (productInfo && typeof productInfo.brandName === 'string')
        ? productInfo.brandName
        : '',
      title: (productInfo && typeof productInfo.title === 'string')
        ? productInfo.title
        : '',
      sellerInfo: (productInfo && productInfo.sellerInfo)
        ? productInfo.sellerInfo
        : null
    };
  },

  /**
   * 設定をバリデーション
   * @param {Object} config - 設定
   * @returns {Object} バリデーション済みの設定
   */
  validateConfig(config) {
    return {
      trustedBrands: (config && Array.isArray(config.trustedBrands))
        ? config.trustedBrands
        : [],
      suspiciousPatterns: {
        brand: (config && config.suspiciousPatterns && Array.isArray(config.suspiciousPatterns.brand))
          ? config.suspiciousPatterns.brand
          : [],
        title: (config && config.suspiciousPatterns && config.suspiciousPatterns.title)
          ? config.suspiciousPatterns.title
          : null
      }
    };
  },

  /**
   * ブランドスコアを計算
   * @param {string} brandName - ブランド名
   * @param {string[]} trustedBrands - 信頼ブランドリスト
   * @param {Object[]} suspiciousPatterns - 疑わしいパターン
   * @returns {{score: number, reasons: string[]}} ブランドスコア
   */
  calculateBrandScore(brandName, trustedBrands, suspiciousPatterns) {
    // BrandCheckerが利用可能か確認
    if (typeof BrandChecker !== 'undefined' && BrandChecker.checkBrand) {
      return BrandChecker.checkBrand(brandName, trustedBrands, suspiciousPatterns);
    }

    // BrandCheckerが利用できない場合はデフォルト値
    console.warn('[ScoreCalculator] BrandChecker is not available');
    return { score: 0, reasons: [] };
  },

  /**
   * タイトルスコアを計算
   * @param {string} title - 商品タイトル
   * @param {Object} suspiciousPatterns - 疑わしいパターン
   * @returns {{score: number, reasons: string[]}} タイトルスコア
   */
  calculateTitleScore(title, suspiciousPatterns) {
    // TitleCheckerが利用可能か確認
    if (typeof TitleChecker !== 'undefined' && TitleChecker.checkTitle) {
      return TitleChecker.checkTitle(title, suspiciousPatterns);
    }

    // TitleCheckerが利用できない場合はデフォルト値
    console.warn('[ScoreCalculator] TitleChecker is not available');
    return { score: 0, reasons: [] };
  },

  /**
   * セラースコアを計算
   * @param {Object|null} sellerInfo - セラー情報
   * @returns {{score: number, reasons: string[]}} セラースコア
   */
  calculateSellerScore(sellerInfo) {
    // セラー情報がない場合
    if (!sellerInfo) {
      return { score: 0, reasons: [] };
    }

    let score = 0;
    const reasons = [];

    // 日本のセラーかどうかで判定
    if (sellerInfo.isJapanese === true) {
      // 日本のセラーは信頼度が高い（マイナススコア）
      score = -20;
      reasons.push('日本のセラー');
    } else if (sellerInfo.isJapanese === false) {
      // 海外セラーは警告スコアを加算
      score = 30;
      const address = sellerInfo.address || '不明';
      reasons.push(`海外セラー（${address}）`);
    }

    return { score, reasons };
  },

  /**
   * トータルスコアから判定結果を決定
   * @param {number} totalScore - トータルスコア
   * @returns {'trusted'|'safe'|'warning'|'danger'} 判定結果
   */
  determineVerdict(totalScore) {
    if (totalScore < this.THRESHOLDS.TRUSTED) {
      return 'trusted';
    } else if (totalScore < this.THRESHOLDS.SAFE) {
      return 'safe';
    } else if (totalScore < this.THRESHOLDS.WARNING) {
      return 'warning';
    } else {
      return 'danger';
    }
  },

  /**
   * 判定結果に対応する表示色を取得
   * @param {'trusted'|'safe'|'warning'|'danger'} verdict - 判定結果
   * @returns {string} CSS色コード
   */
  getVerdictColor(verdict) {
    const colors = {
      trusted: '#28a745',  // 緑
      safe: '#6c757d',     // グレー
      warning: '#ffc107',  // 黄
      danger: '#dc3545'    // 赤
    };
    return colors[verdict] || colors.safe;
  },

  /**
   * 判定結果に対応するラベルを取得
   * @param {'trusted'|'safe'|'warning'|'danger'} verdict - 判定結果
   * @returns {string} 日本語ラベル
   */
  getVerdictLabel(verdict) {
    const labels = {
      trusted: '信頼',
      safe: '安全',
      warning: '注意',
      danger: '危険'
    };
    return labels[verdict] || labels.safe;
  },

  /**
   * 全ての理由を統合して取得
   * @param {{score: number, reasons: string[]}} brandScore - ブランドスコア
   * @param {{score: number, reasons: string[]}} titleScore - タイトルスコア
   * @param {{score: number, reasons: string[]}} sellerScore - セラースコア
   * @returns {string[]} 全ての理由の配列
   */
  getAllReasons(brandScore, titleScore, sellerScore) {
    const allReasons = [];

    if (brandScore && brandScore.reasons) {
      allReasons.push(...brandScore.reasons);
    }
    if (titleScore && titleScore.reasons) {
      allReasons.push(...titleScore.reasons);
    }
    if (sellerScore && sellerScore.reasons) {
      allReasons.push(...sellerScore.reasons);
    }

    return allReasons;
  }
};

// グローバルに公開
if (typeof globalThis !== 'undefined') {
  globalThis.ScoreCalculator = ScoreCalculator;
}
if (typeof window !== 'undefined') {
  window.ScoreCalculator = ScoreCalculator;
}
