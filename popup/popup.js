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
      reloadBtn: document.getElementById('reload-btn'),
      customBrandsToggle: document.getElementById('custom-brands-toggle'),
      customBrandsBody: document.getElementById('custom-brands-body'),
      customBrandsArrow: document.getElementById('custom-brands-arrow'),
      customBrandsCount: document.getElementById('custom-brands-count'),
      customBrandInput: document.getElementById('custom-brand-input'),
      customBrandAddBtn: document.getElementById('custom-brand-add-btn'),
      customBrandsList: document.getElementById('custom-brands-list'),
      excludedBrandsToggle: document.getElementById('excluded-brands-toggle'),
      excludedBrandsBody: document.getElementById('excluded-brands-body'),
      excludedBrandsArrow: document.getElementById('excluded-brands-arrow'),
      excludedBrandsCount: document.getElementById('excluded-brands-count'),
      excludedBrandInput: document.getElementById('excluded-brand-input'),
      excludedBrandAddBtn: document.getElementById('excluded-brand-add-btn'),
      excludedBrandsList: document.getElementById('excluded-brands-list')
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
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  renderCustomBrands(brands) {
    const list = this.elements.customBrandsList;
    this.elements.customBrandsCount.textContent = `${brands.length}件`;

    if (brands.length === 0) {
      list.innerHTML = '<div class="custom-brands-empty">ブランドが追加されていません</div>';
      return;
    }

    list.innerHTML = brands.map(name => {
      const escaped = this.escapeHtml(name);
      return `
      <div class="custom-brands-item">
        <span class="custom-brands-item-name">${escaped}</span>
        <button class="custom-brands-remove-btn" data-brand="${escaped}">&times;</button>
      </div>`;
    }).join('');
  },

  renderExcludedBrands(brands) {
    const list = this.elements.excludedBrandsList;
    this.elements.excludedBrandsCount.textContent = `${brands.length}件`;

    if (brands.length === 0) {
      list.innerHTML = '<div class="excluded-brands-empty">非表示ブランドはありません</div>';
      return;
    }

    list.innerHTML = brands.map(name => {
      const escaped = this.escapeHtml(name);
      return `
      <div class="excluded-brands-item">
        <span class="excluded-brands-item-name">${escaped}</span>
        <button class="excluded-brands-remove-btn" data-brand="${escaped}">&times;</button>
      </div>`;
    }).join('');
  }
};

/**
 * カスタムブランド管理モジュール
 */
const CustomBrandsManager = {
  /** @type {string[]} */
  brands: [],

  async load() {
    try {
      const result = await chrome.storage.sync.get(['customBrands']);
      this.brands = result.customBrands || [];
    } catch (error) {
      console.error('カスタムブランドの読み込みに失敗:', error);
      this.brands = [];
    }
    return this.brands;
  },

  async save() {
    await chrome.storage.sync.set({ customBrands: this.brands });
  },

  async add(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (this.brands.some(b => b.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    this.brands.push(trimmed);
    await this.save();
    return true;
  },

  async remove(name) {
    this.brands = this.brands.filter(b => b !== name);
    await this.save();
  }
};

/**
 * 非表示ブランド管理モジュール
 */
const ExcludedBrandsManager = {
  /** @type {string[]} */
  brands: [],

  async load() {
    try {
      const result = await chrome.storage.sync.get(['excludedBrands']);
      this.brands = result.excludedBrands || [];
    } catch (error) {
      console.error('非表示ブランドの読み込みに失敗:', error);
      this.brands = [];
    }
    return this.brands;
  },

  async save() {
    await chrome.storage.sync.set({ excludedBrands: this.brands });
  },

  async add(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (this.brands.some(b => b.toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    this.brands.push(trimmed);
    await this.save();
    return true;
  },

  async remove(name) {
    this.brands = this.brands.filter(b => b !== name);
    await this.save();
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

  onCustomBrandsToggle() {
    const body = UIManager.elements.customBrandsBody;
    const arrow = UIManager.elements.customBrandsArrow;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    arrow.classList.toggle('open', !isOpen);
  },

  async onCustomBrandAdd() {
    const input = UIManager.elements.customBrandInput;
    const name = input.value.trim();
    if (!name) return;

    const added = await CustomBrandsManager.add(name);
    if (added) {
      input.value = '';
      UIManager.renderCustomBrands(CustomBrandsManager.brands);
    }
  },

  async onCustomBrandRemove(event) {
    const btn = event.target.closest('.custom-brands-remove-btn');
    if (!btn) return;
    const name = btn.dataset.brand;
    await CustomBrandsManager.remove(name);
    UIManager.renderCustomBrands(CustomBrandsManager.brands);
  },

  onExcludedBrandsToggle() {
    const body = UIManager.elements.excludedBrandsBody;
    const arrow = UIManager.elements.excludedBrandsArrow;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    arrow.classList.toggle('open', !isOpen);
  },

  async onExcludedBrandAdd() {
    const input = UIManager.elements.excludedBrandInput;
    const name = input.value.trim();
    if (!name) return;

    const added = await ExcludedBrandsManager.add(name);
    if (added) {
      input.value = '';
      UIManager.renderExcludedBrands(ExcludedBrandsManager.brands);
    }
  },

  async onExcludedBrandRemove(event) {
    const btn = event.target.closest('.excluded-brands-remove-btn');
    if (!btn) return;
    const name = btn.dataset.brand;
    await ExcludedBrandsManager.remove(name);
    UIManager.renderExcludedBrands(ExcludedBrandsManager.brands);
  },

  /**
   * すべてのイベントリスナーを登録
   */
  bindAll() {
    const { elements } = UIManager;
    elements.filterSlider.addEventListener('input', this.onSliderChange);
    elements.reloadBtn.addEventListener('click', this.onReloadClick);

    // カスタムブランド
    elements.customBrandsToggle.addEventListener('click', this.onCustomBrandsToggle);
    elements.customBrandAddBtn.addEventListener('click', () => this.onCustomBrandAdd());
    elements.customBrandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onCustomBrandAdd();
    });
    elements.customBrandsList.addEventListener('click', (e) => this.onCustomBrandRemove(e));

    // 非表示ブランド
    elements.excludedBrandsToggle.addEventListener('click', this.onExcludedBrandsToggle);
    elements.excludedBrandAddBtn.addEventListener('click', () => this.onExcludedBrandAdd());
    elements.excludedBrandInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.onExcludedBrandAdd();
    });
    elements.excludedBrandsList.addEventListener('click', (e) => this.onExcludedBrandRemove(e));
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
   * chrome.storage.local → sync マイグレーション
   */
  async migrateToSync() {
    try {
      const local = await chrome.storage.local.get(['customBrands', '_migratedToSync']);
      if (local._migratedToSync) return;

      if (local.customBrands && Array.isArray(local.customBrands) && local.customBrands.length > 0) {
        const sync = await chrome.storage.sync.get(['customBrands']);
        if (!sync.customBrands || sync.customBrands.length === 0) {
          await chrome.storage.sync.set({ customBrands: local.customBrands });
        }
      }
      await chrome.storage.local.set({ _migratedToSync: true });
    } catch (e) {
      console.warn('Migration failed:', e);
    }
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

      // local→syncマイグレーション（一度だけ実行）
      await this.migrateToSync();

      // カスタムブランドを読み込んで描画
      const brands = await CustomBrandsManager.load();
      UIManager.renderCustomBrands(brands);

      // 非表示ブランドを読み込んで描画
      const excludedBrands = await ExcludedBrandsManager.load();
      UIManager.renderExcludedBrands(excludedBrands);
    } catch (error) {
      console.error('ポップアップの初期化に失敗:', error);
    }
  }
};

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => PopupController.init());
