// Popup Script - Clean Amazon Search
// スライダー式フィルターUI

/**
 * フィルターレベルの定義
 */
const FILTER_LEVELS = {
  0: { name: 'OFF', description: 'フィルターなし' },
  1: { name: 'ライト', description: '警告のみ' },
  2: { name: 'スタンダード', description: '怪しい商品を非表示' },
  3: { name: 'ストリクト', description: 'より厳格に非表示' },
  4: { name: '最強', description: 'Amazon公式のみ' }
};

/**
 * 設定管理モジュール
 */
const SettingsManager = {
  /**
   * 全設定を読み込む
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async loadAll() {
    try {
      return await chrome.storage.local.get(null);
    } catch (error) {
      console.error('設定の読み込みに失敗:', error);
      return { filterLevel: 2, stats: { hidden: 0, warned: 0, trusted: 0 } };
    }
  },

  /**
   * 設定を保存する
   * @param {Object} data - 保存するデータ
   * @returns {Promise<boolean>} 成功したかどうか
   */
  async save(data) {
    try {
      await chrome.storage.local.set(data);
      return true;
    } catch (error) {
      console.error('設定の保存に失敗:', error);
      return false;
    }
  }
};

/**
 * UI管理モジュール
 */
const UIManager = {
  elements: {},

  /**
   * DOM要素を初期化
   */
  initElements() {
    this.elements = {
      filterSlider: document.getElementById('filter-level'),
      currentLevelName: document.getElementById('current-level-name'),
      levelItems: document.querySelectorAll('.level-item'),
      statsHidden: document.getElementById('stats-hidden'),
      statsWarned: document.getElementById('stats-warned'),
      statsTrusted: document.getElementById('stats-trusted'),
      reloadBtn: document.getElementById('reload-btn')
    };
  },

  /**
   * スライダーの値を更新
   * @param {number} level - フィルターレベル (0-4)
   */
  updateSlider(level) {
    this.elements.filterSlider.value = level;
    this.updateLevelDisplay(level);
  },

  /**
   * レベル表示を更新
   * @param {number} level - フィルターレベル (0-4)
   */
  updateLevelDisplay(level) {
    const levelInfo = FILTER_LEVELS[level];
    this.elements.currentLevelName.textContent = levelInfo.name;

    // レベル項目のハイライト
    this.elements.levelItems.forEach(item => {
      const itemLevel = parseInt(item.dataset.level, 10);
      item.classList.toggle('active', itemLevel === level);
    });
  },

  /**
   * 統計表示を更新
   * @param {Object} stats - 統計データ
   */
  updateStats(stats) {
    if (!stats) return;
    this.elements.statsHidden.textContent = stats.hidden || 0;
    this.elements.statsWarned.textContent = stats.warned || 0;
    this.elements.statsTrusted.textContent = stats.trusted || 0;
  }
};

/**
 * イベントハンドラモジュール
 */
const EventHandlers = {
  /**
   * スライダー変更時の処理
   * @param {Event} event - inputイベント
   */
  async onSliderChange(event) {
    const level = parseInt(event.target.value, 10);
    UIManager.updateLevelDisplay(level);
    await SettingsManager.save({ filterLevel: level });
  },

  /**
   * ページリロードボタンのクリック処理
   */
  async onReloadClick() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (tab?.url?.includes('amazon.co.jp')) {
        await chrome.tabs.reload(tab.id);
        window.close();
      }
    } catch (error) {
      console.error('ページのリロードに失敗:', error);
    }
  },

  /**
   * すべてのイベントリスナーを登録
   */
  bindAll() {
    const { elements } = UIManager;
    elements.filterSlider.addEventListener('input', this.onSliderChange);
    elements.reloadBtn.addEventListener('click', this.onReloadClick);
  }
};

/**
 * ポップアップコントローラー
 */
const PopupController = {
  /**
   * UIを設定データで初期化
   * @param {Object} settings - 設定オブジェクト
   */
  initializeUI(settings) {
    // フィルターレベルを設定（デフォルト: 2 = スタンダード）
    const level = settings.filterLevel !== undefined ? settings.filterLevel : 2;
    UIManager.updateSlider(level);

    // 統計を更新
    UIManager.updateStats(settings.stats);
  },

  /**
   * ポップアップを初期化
   */
  async init() {
    try {
      // DOM要素を初期化
      UIManager.initElements();

      // イベントリスナーを登録
      EventHandlers.bindAll();

      // 設定を読み込んでUIを初期化
      const settings = await SettingsManager.loadAll();
      this.initializeUI(settings);
    } catch (error) {
      console.error('ポップアップの初期化に失敗:', error);
    }
  }
};

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => PopupController.init());
