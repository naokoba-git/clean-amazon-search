/**
 * Clean Amazon Search - ブランド名チェッカー
 * @fileoverview ブランド名の怪しさを判定するモジュール
 * @module brand-checker
 */

'use strict';

/**
 * ブランドチェッカーオブジェクト
 * @namespace BrandChecker
 */
const BrandChecker = {
  /**
   * 子音のみで構成される文字の正規表現
   * @type {RegExp}
   */
  CONSONANT_ONLY_PATTERN: /^[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]{4,}$/,

  /**
   * 大文字のみ6文字以上の正規表現
   * @type {RegExp}
   */
  UPPERCASE_ONLY_PATTERN: /^[A-Z]{6,}$/,

  /**
   * 末尾にJP/日本がつくパターン
   * @type {RegExp}
   */
  JP_SUFFIX_PATTERN: /(JP|Japan|日本)$/i,

  /**
   * ノーブランド/Genericを示すパターン
   * @type {RegExp}
   */
  GENERIC_PATTERN: /^(ノーブランド|ノーブランド品|Generic|Unbranded|no brand)$/i,

  /**
   * 日本語の会社名によく使われる接尾辞
   * これらで終わる漢字のみのブランド名は日本ブランドとして扱う
   * @type {RegExp}
   */
  JAPANESE_SUFFIX_PATTERN: /(?:工房|製作所|商店|本舗|堂|屋|庵|軒|亭|園|房|舎|社|館|苑|荘|家|処|所|店|坊|塾|院|会|組|座|派|流|窯|焼|塗|織|染|彫|細工|木工|鋳物|刃物|金物|漆器|陶器|硝子|ガラス|鍛冶|職人|工芸|民芸|伝統)$/,

  /**
   * デフォルトのスコア設定
   * @type {Object}
   */
  DEFAULT_SCORES: {
    consonantOnly: 35,
    uppercaseOnly: 30,
    jpSuffix: 20,
    generic: 25,
    trusted: -100
  },

  /**
   * ブランド名の怪しさを判定する
   * @param {string} brandName - 判定するブランド名
   * @param {string[]} [trustedBrands=[]] - 信頼できるブランドのホワイトリスト
   * @param {Object[]} [suspiciousPatterns=[]] - 疑わしいパターンの設定
   * @param {string} suspiciousPatterns[].pattern - 正規表現パターン文字列
   * @param {number} suspiciousPatterns[].score - 加算するスコア
   * @param {string} suspiciousPatterns[].reason - 理由の説明
   * @returns {{score: number, reasons: string[]}} 怪しさスコアと理由の配列
   */
  checkBrand(brandName, trustedBrands = [], suspiciousPatterns = []) {
    if (!brandName || typeof brandName !== 'string') {
      return { score: 0, reasons: [] };
    }

    const normalizedName = brandName.trim();
    if (normalizedName === '') {
      return { score: 0, reasons: [] };
    }

    let score = 0;
    const reasons = [];

    // 信頼ブランドチェック（最優先）
    if (this.isTrustedBrand(normalizedName, trustedBrands)) {
      return {
        score: this.DEFAULT_SCORES.trusted,
        reasons: ['信頼できるブランド']
      };
    }

    // 日本ブランドの可能性チェック（漢字のみ + 日本語接尾辞）
    if (this.isLikelyJapaneseBrand(normalizedName)) {
      return {
        score: -30, // 軽い信頼ボーナス
        reasons: ['日本の工房・製作所']
      };
    }

    // ノーブランド/Genericチェック
    if (this.isGenericBrand(normalizedName)) {
      score += this.DEFAULT_SCORES.generic;
      reasons.push('ノーブランド/Generic');
    }

    // ランダム英字（子音のみ4文字以上）チェック
    if (this.hasConsonantOnlySequence(normalizedName)) {
      score += this.DEFAULT_SCORES.consonantOnly;
      reasons.push('ランダムな英字列（子音のみ4文字以上）');
    }

    // 大文字のみ6文字以上チェック
    if (this.isUppercaseOnly(normalizedName)) {
      score += this.DEFAULT_SCORES.uppercaseOnly;
      reasons.push('大文字のみ6文字以上');
    }

    // 末尾にJP/日本チェック
    if (this.hasJpSuffix(normalizedName)) {
      score += this.DEFAULT_SCORES.jpSuffix;
      reasons.push('末尾にJP/日本');
    }

    // 外部パターンによるチェック
    const externalResult = this.checkExternalPatterns(normalizedName, suspiciousPatterns);
    score += externalResult.score;
    reasons.push(...externalResult.reasons);

    return { score, reasons };
  },

  /**
   * 信頼できるブランドかどうかを判定
   * @param {string} brandName - ブランド名
   * @param {string[]} trustedBrands - 信頼ブランドリスト
   * @returns {boolean} 信頼できるブランドの場合true
   */
  isTrustedBrand(brandName, trustedBrands) {
    if (!Array.isArray(trustedBrands) || trustedBrands.length === 0) {
      return false;
    }

    const lowerName = brandName.toLowerCase();
    return trustedBrands.some(brand => {
      if (typeof brand !== 'string') return false;
      return brand.toLowerCase() === lowerName;
    });
  },

  /**
   * ノーブランド/Genericブランドかどうかを判定
   * @param {string} brandName - ブランド名
   * @returns {boolean} ノーブランドの場合true
   */
  isGenericBrand(brandName) {
    return this.GENERIC_PATTERN.test(brandName);
  },

  /**
   * 子音のみの4文字以上のシーケンスが含まれるかを判定
   * @param {string} brandName - ブランド名
   * @returns {boolean} 子音のみのシーケンスが含まれる場合true
   */
  hasConsonantOnlySequence(brandName) {
    // ブランド名を単語に分割してチェック
    const words = brandName.split(/[\s\-_]+/);
    return words.some(word => this.CONSONANT_ONLY_PATTERN.test(word));
  },

  /**
   * 大文字のみ6文字以上かを判定
   * @param {string} brandName - ブランド名
   * @returns {boolean} 大文字のみ6文字以上の場合true
   */
  isUppercaseOnly(brandName) {
    // スペースやハイフンを除去して判定
    const cleaned = brandName.replace(/[\s\-_]+/g, '');
    return this.UPPERCASE_ONLY_PATTERN.test(cleaned);
  },

  /**
   * 末尾にJP/日本がつくかを判定
   * @param {string} brandName - ブランド名
   * @returns {boolean} 末尾にJP/日本がつく場合true
   */
  hasJpSuffix(brandName) {
    return this.JP_SUFFIX_PATTERN.test(brandName);
  },

  /**
   * 日本語の会社名接尾辞を持つかを判定
   * @param {string} brandName - ブランド名
   * @returns {boolean} 日本語の接尾辞を持つ場合true
   */
  hasJapaneseSuffix(brandName) {
    return this.JAPANESE_SUFFIX_PATTERN.test(brandName);
  },

  /**
   * 漢字のみで構成されているかを判定
   * @param {string} brandName - ブランド名
   * @returns {boolean} 漢字のみの場合true
   */
  isKanjiOnly(brandName) {
    // CJK統合漢字の範囲
    return /^[\u4e00-\u9fff]+$/.test(brandName);
  },

  /**
   * 日本ブランドとして信頼できるかを判定
   * 漢字のみで日本語の接尾辞を持つブランドは日本ブランドとして扱う
   * @param {string} brandName - ブランド名
   * @returns {boolean} 日本ブランドとして信頼できる場合true
   */
  isLikelyJapaneseBrand(brandName) {
    if (!brandName) return false;
    // 漢字のみで構成され、日本語の接尾辞を持つ場合
    if (this.isKanjiOnly(brandName) && this.hasJapaneseSuffix(brandName)) {
      return true;
    }
    return false;
  },

  /**
   * 外部パターン設定によるチェック
   * @param {string} brandName - ブランド名
   * @param {Object[]} patterns - パターン設定配列
   * @returns {{score: number, reasons: string[]}} スコアと理由
   */
  checkExternalPatterns(brandName, patterns) {
    let score = 0;
    const reasons = [];

    if (!Array.isArray(patterns)) {
      return { score, reasons };
    }

    for (const patternConfig of patterns) {
      if (!patternConfig || typeof patternConfig.pattern !== 'string') {
        continue;
      }

      try {
        const regex = new RegExp(patternConfig.pattern, 'i');
        if (regex.test(brandName)) {
          const patternScore = typeof patternConfig.score === 'number' ? patternConfig.score : 0;
          score += patternScore;
          if (patternConfig.reason) {
            reasons.push(patternConfig.reason);
          }
        }
      } catch (e) {
        // 無効な正規表現パターンはスキップ
        console.warn('[BrandChecker] Invalid pattern:', patternConfig.pattern, e);
      }
    }

    return { score, reasons };
  },

  /**
   * スコアに基づいて危険度レベルを取得
   * @param {number} score - 怪しさスコア
   * @returns {'safe'|'low'|'medium'|'high'} 危険度レベル
   */
  getRiskLevel(score) {
    if (score < 0) return 'safe';
    if (score < 25) return 'low';
    if (score < 50) return 'medium';
    return 'high';
  },

  /**
   * 危険度レベルに対応する色を取得
   * @param {'safe'|'low'|'medium'|'high'} level - 危険度レベル
   * @returns {string} CSS色コード
   */
  getRiskColor(level) {
    const colors = {
      safe: '#28a745',
      low: '#6c757d',
      medium: '#ffc107',
      high: '#dc3545'
    };
    return colors[level] || colors.low;
  }
};

// グローバルに公開
if (typeof globalThis !== 'undefined') {
  globalThis.BrandChecker = BrandChecker;
}
if (typeof window !== 'undefined') {
  window.BrandChecker = BrandChecker;
}
