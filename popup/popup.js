// Popup Script - Clean Amazon Search
// モジュール化されたポップアップUI

/**
 * 定数モジュール
 * プリセット名などの定数を管理
 */
const Constants = {
  // プリセット名のマッピング（FilterUtils.PRESETSから自動生成も可能だが、日本語名は別途管理）
  PRESET_NAMES: {
    standard: 'スタンダード',
    premium: 'プレミアム',
    strict: 'ストリクト',
    custom: 'カスタム'
  },

  // ボタン表示テキスト
  BUTTON_TEXTS: {
    apply: { icon: '🔍', text: '安心フィルターを適用' },
    applied: { icon: '✅', text: '安心フィルター適用中' },
    disabled: { icon: '📍', text: 'Amazon検索ページで使用' }
  },

  // バッジ設定
  BADGE: {
    autoApply: { text: 'A', color: '#4CAF50' },
    off: { text: '' }
  }
};

/**
 * 設定管理モジュール
 * Chrome Storageの読み書きを担当
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
      return FilterUtils.getDefaultSettings();
    }
  },

  /**
   * 指定されたキーの設定を読み込む
   * @param {string|string[]} keys - 読み込むキー
   * @returns {Promise<Object>} 設定オブジェクト
   */
  async load(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (error) {
      console.error('設定の読み込みに失敗:', error);
      return {};
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
  },

  /**
   * カスタムフィルター設定を取得
   * @returns {Object} カスタムフィルター設定
   */
  getCustomFiltersFromUI() {
    return {
      domesticShipping: document.getElementById('custom-domestic').checked,
      fulfilledByAmazon: document.getElementById('custom-fba').checked,
      primeOnly: document.getElementById('custom-prime').checked,
      amazonSellerOnly: document.getElementById('custom-amazon-only').checked,
      minRating: document.getElementById('custom-rating').checked ? '4_and_up' : null
    };
  }
};

/**
 * UI更新モジュール
 * DOM要素の更新を担当
 */
const UIManager = {
  // DOM要素のキャッシュ
  elements: {},

  /**
   * DOM要素を初期化
   */
  initElements() {
    this.elements = {
      // ページ
      mainPage: document.getElementById('main-page'),
      settingsPage: document.getElementById('settings-page'),

      // ボタン
      applyFilterBtn: document.getElementById('apply-filter-btn'),
      openSettingsBtn: document.getElementById('open-settings-btn'),
      backBtn: document.getElementById('back-btn'),
      saveSettingsBtn: document.getElementById('save-settings-btn'),

      // トグル
      autoApplyToggle: document.getElementById('auto-apply-toggle'),
      pageButtonToggle: document.getElementById('page-button-toggle'),
      sellerCheckToggle: document.getElementById('seller-check-toggle'),
      hideOverseasToggle: document.getElementById('hide-overseas-toggle'),
      hideOverseasContainer: document.getElementById('hide-overseas-container'),

      // 表示要素
      currentPresetName: document.getElementById('current-preset-name'),
      customSettings: document.getElementById('custom-settings'),

      // フィルターオプション
      filterOptions: document.querySelectorAll('.filter-option'),

      // 統計
      statsDomestic: document.getElementById('stats-domestic'),
      statsFba: document.getElementById('stats-fba'),
      statsRating: document.getElementById('stats-rating')
    };
  },

  /**
   * プリセット選択状態を更新
   * @param {string} preset - 選択されているプリセット
   */
  updatePresetSelection(preset) {
    this.elements.filterOptions.forEach(option => {
      const isSelected = option.dataset.preset === preset;
      option.classList.toggle('selected', isSelected);
      option.querySelector('input[type="radio"]').checked = isSelected;
    });
    this.elements.customSettings.classList.toggle('active', preset === 'custom');
  },

  /**
   * トグルの状態を更新
   * @param {Object} settings - 設定オブジェクト
   */
  updateToggles(settings) {
    this.elements.autoApplyToggle.checked = settings.autoApply || false;
    this.elements.pageButtonToggle.checked = settings.showPageButton !== false;
    this.elements.sellerCheckToggle.checked = settings.sellerCheck !== false;
    this.elements.hideOverseasToggle.checked = settings.hideOverseasSellers !== false;

    // セラーチェックが無効の場合、サブオプションを非表示
    this.updateHideOverseasVisibility(settings.sellerCheck !== false);
  },

  /**
   * 海外セラー非表示オプションの表示を更新
   * @param {boolean} show - 表示するかどうか
   */
  updateHideOverseasVisibility(show) {
    if (this.elements.hideOverseasContainer) {
      this.elements.hideOverseasContainer.style.display = show ? 'flex' : 'none';
    }
  },

  /**
   * カスタムフィルターUIを更新
   * @param {Object} customFilters - カスタムフィルター設定
   */
  updateCustomFilters(customFilters) {
    if (!customFilters) return;

    document.getElementById('custom-domestic').checked = customFilters.domesticShipping;
    document.getElementById('custom-fba').checked = customFilters.fulfilledByAmazon;
    document.getElementById('custom-prime').checked = customFilters.primeOnly;
    document.getElementById('custom-amazon-only').checked = customFilters.amazonSellerOnly;
    document.getElementById('custom-rating').checked = customFilters.minRating === '4_and_up';
  },

  /**
   * 統計表示を更新
   * @param {Object} stats - 統計データ
   */
  updateStats(stats) {
    if (!stats) return;

    this.elements.statsDomestic.textContent = stats.domesticFilter || 0;
    this.elements.statsFba.textContent = stats.fbaFilter || 0;
    this.elements.statsRating.textContent = stats.ratingFilter || 0;
  },

  /**
   * 適用ボタンの状態を更新
   * @param {'apply'|'applied'|'disabled'} state - ボタン状態
   */
  updateApplyButton(state) {
    const btn = this.elements.applyFilterBtn;
    const config = Constants.BUTTON_TEXTS[state];

    btn.innerHTML = `<span>${config.icon}</span><span>${config.text}</span>`;

    if (state === 'apply') {
      btn.disabled = false;
      btn.style.background = '';
    } else if (state === 'applied') {
      btn.disabled = true;
      btn.style.background = '';
    } else if (state === 'disabled') {
      btn.disabled = true;
      btn.style.background = '#ccc';
    }
  },

  /**
   * プリセット名を表示
   * @param {string} preset - プリセットID
   */
  displayPresetName(preset) {
    this.elements.currentPresetName.textContent =
      Constants.PRESET_NAMES[preset] || Constants.PRESET_NAMES.standard;
  },

  /**
   * メインページを表示
   */
  showMainPage() {
    this.elements.mainPage.classList.remove('hidden');
    this.elements.settingsPage.classList.remove('active');
  },

  /**
   * 設定ページを表示
   */
  showSettingsPage() {
    this.elements.mainPage.classList.add('hidden');
    this.elements.settingsPage.classList.add('active');
  }
};

/**
 * イベントハンドラモジュール
 * イベント処理を担当
 */
const EventHandlers = {
  /**
   * フィルターを適用
   */
  async applyFilter() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.url?.includes('amazon.co.jp')) {
        return;
      }

      const settings = await SettingsManager.load(['filterPreset']);
      const preset = settings.filterPreset || 'standard';

      await chrome.tabs.sendMessage(tab.id, {
        action: 'applyFilter',
        preset: preset
      });

      window.close();
    } catch (error) {
      console.error('フィルター適用に失敗:', error);
    }
  },

  /**
   * 設定を保存
   */
  async saveSettings() {
    const selectedPreset = document.querySelector('input[name="filter-preset"]:checked').value;
    const customFilters = SettingsManager.getCustomFiltersFromUI();

    const success = await SettingsManager.save({
      filterPreset: selectedPreset,
      customFilters: customFilters
    });

    if (success) {
      UIManager.displayPresetName(selectedPreset);
      UIManager.showMainPage();
      // 設定変更後、ボタン状態を更新
      await PopupController.updateButtonState();
    }
  },

  /**
   * 自動適用トグルの変更
   * @param {Event} event - changeイベント
   */
  async onAutoApplyChange(event) {
    const isEnabled = event.target.checked;
    await SettingsManager.save({ autoApply: isEnabled });

    // バッジを更新
    if (isEnabled) {
      chrome.action.setBadgeText({ text: Constants.BADGE.autoApply.text });
      chrome.action.setBadgeBackgroundColor({ color: Constants.BADGE.autoApply.color });
    } else {
      chrome.action.setBadgeText({ text: Constants.BADGE.off.text });
    }
  },

  /**
   * ページ内ボタン表示トグルの変更
   * @param {Event} event - changeイベント
   */
  async onPageButtonChange(event) {
    await SettingsManager.save({ showPageButton: event.target.checked });
  },

  /**
   * セラーチェックトグルの変更
   * @param {Event} event - changeイベント
   */
  async onSellerCheckChange(event) {
    const isEnabled = event.target.checked;
    await SettingsManager.save({ sellerCheck: isEnabled });
    UIManager.updateHideOverseasVisibility(isEnabled);
  },

  /**
   * 海外セラー非表示トグルの変更
   * @param {Event} event - changeイベント
   */
  async onHideOverseasChange(event) {
    await SettingsManager.save({ hideOverseasSellers: event.target.checked });
  },

  /**
   * フィルターオプションのクリック
   * @param {Event} event - clickイベント
   */
  onFilterOptionClick(event) {
    const option = event.currentTarget;

    UIManager.elements.filterOptions.forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    option.querySelector('input[type="radio"]').checked = true;

    // カスタム設定の表示/非表示
    UIManager.elements.customSettings.classList.toggle('active', option.dataset.preset === 'custom');
  },

  /**
   * すべてのイベントリスナーを登録
   */
  bindAll() {
    const { elements } = UIManager;

    // ボタン
    elements.applyFilterBtn.addEventListener('click', this.applyFilter);
    elements.openSettingsBtn.addEventListener('click', () => UIManager.showSettingsPage());
    elements.backBtn.addEventListener('click', () => UIManager.showMainPage());
    elements.saveSettingsBtn.addEventListener('click', this.saveSettings);

    // トグル
    elements.autoApplyToggle.addEventListener('change', this.onAutoApplyChange);
    elements.pageButtonToggle.addEventListener('change', this.onPageButtonChange);
    elements.sellerCheckToggle.addEventListener('change', this.onSellerCheckChange);
    elements.hideOverseasToggle.addEventListener('change', this.onHideOverseasChange);

    // フィルターオプション
    elements.filterOptions.forEach(option => {
      option.addEventListener('click', this.onFilterOptionClick);
    });
  }
};

/**
 * ポップアップコントローラー
 * 全体の初期化と制御を担当
 */
const PopupController = {
  /**
   * アクティブタブを取得
   * @returns {Promise<chrome.tabs.Tab|null>} アクティブタブ
   */
  async getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab || null;
    } catch (error) {
      console.error('タブの取得に失敗:', error);
      return null;
    }
  },

  /**
   * 適用ボタンの状態を更新
   */
  async updateButtonState() {
    const tab = await this.getActiveTab();
    const settings = await SettingsManager.load(['filterPreset']);
    const preset = settings.filterPreset || 'standard';

    if (tab?.url?.includes('amazon.co.jp/s')) {
      try {
        const isApplied = FilterUtils.isFilterApplied(tab.url, preset);
        UIManager.updateApplyButton(isApplied ? 'applied' : 'apply');
      } catch (error) {
        console.error('フィルター状態の確認に失敗:', error);
        UIManager.updateApplyButton('apply');
      }
    } else {
      UIManager.updateApplyButton('disabled');
    }
  },

  /**
   * UIを設定データで初期化
   * @param {Object} settings - 設定オブジェクト
   */
  async initializeUI(settings) {
    const preset = settings.filterPreset || 'standard';

    // プリセット名を表示
    UIManager.displayPresetName(preset);

    // プリセット選択状態を更新
    UIManager.updatePresetSelection(preset);

    // トグルを更新
    UIManager.updateToggles(settings);

    // カスタムフィルターを更新
    UIManager.updateCustomFilters(settings.customFilters);

    // 統計を更新
    UIManager.updateStats(settings.stats);

    // 適用ボタンの状態を更新
    await this.updateButtonState();
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
      await this.initializeUI(settings);
    } catch (error) {
      console.error('ポップアップの初期化に失敗:', error);
    }
  }
};

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => PopupController.init());
