/**
 * Clean Amazon Search - タイトルチェッカー
 * @fileoverview 商品タイトルの怪しさを判定するモジュール
 * @module title-checker
 */

'use strict';

/**
 * タイトルチェッカーオブジェクト
 * @namespace TitleChecker
 */
const TitleChecker = {
  /**
   * 誇張表現のデフォルトキーワード
   * @type {Object}
   */
  DEFAULT_SUSPICIOUS_PATTERNS: {
    /**
     * 年号系キーワード
     * @type {string[]}
     */
    yearBased: [
      '令和最新',
      '2024最新',
      '2025最新',
      '2026最新',
      '最新版',
      '新型',
      '新設計'
    ],

    /**
     * 誇張系キーワード
     * @type {string[]}
     */
    exaggerated: [
      '業界トップ',
      '史上最強',
      '最強',
      '革新的',
      '進化版',
      'アップグレード版',
      '改良版'
    ]
  },

  /**
   * スコア設定
   * @type {Object}
   */
  SCORE_CONFIG: {
    /** 誇張表現1つあたりのスコア */
    EXAGGERATED_EXPRESSION: 30,
    /** タイトル100文字以上 */
    TITLE_LENGTH_100: 25,
    /** タイトル80文字以上 */
    TITLE_LENGTH_80: 15,
    /** 20文字以上の【】括弧が複数ある場合 */
    LONG_BRACKETS_MULTIPLE: 10
  },

  /**
   * タイトルの怪しさをチェック
   * @param {string} title - 商品タイトル
   * @param {Object} [suspiciousPatterns] - カスタム誇張表現パターン
   * @param {string[]} [suspiciousPatterns.yearBased] - 年号系キーワード
   * @param {string[]} [suspiciousPatterns.exaggerated] - 誇張系キーワード
   * @returns {{score: number, reasons: string[]}} 判定結果
   */
  checkTitle(title, suspiciousPatterns) {
    const patterns = suspiciousPatterns || this.DEFAULT_SUSPICIOUS_PATTERNS;
    let score = 0;
    const reasons = [];

    if (!title || typeof title !== 'string') {
      return { score: 0, reasons: [] };
    }

    // 1. 誇張表現のチェック
    const allPatterns = [
      ...(patterns.yearBased || []),
      ...(patterns.exaggerated || [])
    ];

    const foundExpressions = [];
    for (const pattern of allPatterns) {
      if (title.includes(pattern)) {
        foundExpressions.push(pattern);
      }
    }

    if (foundExpressions.length > 0) {
      score += this.SCORE_CONFIG.EXAGGERATED_EXPRESSION * foundExpressions.length;
      reasons.push(`誇張表現: ${foundExpressions.join(', ')}`);
    }

    // 2. タイトル長のチェック（100文字と80文字は排他的）
    const titleLength = title.length;
    if (titleLength >= 100) {
      score += this.SCORE_CONFIG.TITLE_LENGTH_100;
      reasons.push(`タイトルが長すぎる (${titleLength}文字)`);
    } else if (titleLength >= 80) {
      score += this.SCORE_CONFIG.TITLE_LENGTH_80;
      reasons.push(`タイトルがやや長い (${titleLength}文字)`);
    }

    // 3. 【】括弧のチェック（20文字以上の内容を持つものが複数）
    const longBrackets = this.findLongBrackets(title);
    if (longBrackets.length >= 2) {
      score += this.SCORE_CONFIG.LONG_BRACKETS_MULTIPLE;
      reasons.push(`長い【】括弧が複数 (${longBrackets.length}個)`);
    }

    return { score, reasons };
  },

  /**
   * 20文字以上の【】括弧を抽出
   * @param {string} title - 商品タイトル
   * @returns {string[]} 20文字以上の括弧内容の配列
   */
  findLongBrackets(title) {
    const bracketPattern = /【([^】]+)】/g;
    const longBrackets = [];
    let match;

    while ((match = bracketPattern.exec(title)) !== null) {
      const content = match[1];
      if (content.length >= 20) {
        longBrackets.push(content);
      }
    }

    return longBrackets;
  },

  /**
   * スコアに基づいて警告レベルを取得
   * @param {number} score - スコア
   * @returns {'none' | 'low' | 'medium' | 'high'} 警告レベル
   */
  getWarningLevel(score) {
    if (score >= 60) {
      return 'high';
    } else if (score >= 30) {
      return 'medium';
    } else if (score > 0) {
      return 'low';
    }
    return 'none';
  },

  /**
   * 警告レベルに対応する色を取得
   * @param {'none' | 'low' | 'medium' | 'high'} level - 警告レベル
   * @returns {string} 色コード
   */
  getWarningColor(level) {
    const colors = {
      none: '#28a745',    // 緑
      low: '#ffc107',     // 黄
      medium: '#fd7e14',  // オレンジ
      high: '#dc3545'     // 赤
    };
    return colors[level] || colors.none;
  }
};

// グローバルに公開
if (typeof globalThis !== 'undefined') {
  globalThis.TitleChecker = TitleChecker;
}
if (typeof window !== 'undefined') {
  window.TitleChecker = TitleChecker;
}
