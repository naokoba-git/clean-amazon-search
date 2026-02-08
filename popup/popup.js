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
  async loadAll() {
    try {
      return await chrome.storage.local.get(null);
    } catch (error) {
      console.error('設定の読み込みに失敗:', error);
      return { filterLevel: 2, stats: { hidden: 0, warned: 0, trusted: 0 } };
    }
  },

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
 * ブランドリスト管理ファクトリ
 * @param {string} storageKey - chrome.storage.syncのキー名
 * @returns {Object} ブランド管理オブジェクト
 */
function createBrandsManager(storageKey) {
  return {
    brands: [],

    async load() {
      try {
        const result = await chrome.storage.sync.get([storageKey]);
        this.brands = result[storageKey] || [];
      } catch (error) {
        console.error(`${storageKey}の読み込みに失敗:`, error);
        this.brands = [];
      }
      return this.brands;
    },

    async save() {
      await chrome.storage.sync.set({ [storageKey]: this.brands });
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
}

const CustomBrandsManager = createBrandsManager('customBrands');
const ExcludedBrandsManager = createBrandsManager('excludedBrands');

/**
 * UI管理モジュール
 */
const UIManager = {
  elements: {},

  initElements() {
    this.elements = {
      filterSlider: document.getElementById('filter-level'),
      currentLevelName: document.getElementById('current-level-name'),
      levelItems: document.querySelectorAll('.level-item'),
      statsHidden: document.getElementById('stats-hidden'),
      statsWarned: document.getElementById('stats-warned'),
      statsTrusted: document.getElementById('stats-trusted'),
      reloadBtn: document.getElementById('reload-btn'),
      // ブランドセクション要素をまとめて取得
      customBrands: this._getBrandSectionElements('custom-brands'),
      excludedBrands: this._getBrandSectionElements('excluded-brands')
    };
  },

  /**
   * ブランドセクションのDOM要素をまとめて取得
   * @param {string} prefix - IDプレフィックス ('custom-brands' | 'excluded-brands')
   * @returns {Object} DOM要素群
   */
  _getBrandSectionElements(prefix) {
    // 'custom-brands' → 'custom-brand' (末尾のsを除去)
    const singular = prefix.replace(/-brands$/, '-brand');
    return {
      toggle: document.getElementById(`${prefix}-toggle`),
      body: document.getElementById(`${prefix}-body`),
      arrow: document.getElementById(`${prefix}-arrow`),
      count: document.getElementById(`${prefix}-count`),
      input: document.getElementById(`${singular}-input`),
      addBtn: document.getElementById(`${singular}-add-btn`),
      list: document.getElementById(`${prefix}-list`)
    };
  },

  updateSlider(level) {
    this.elements.filterSlider.value = level;
    this.updateLevelDisplay(level);
  },

  updateLevelDisplay(level) {
    const levelInfo = FILTER_LEVELS[level];
    this.elements.currentLevelName.textContent = levelInfo.name;
    this.elements.levelItems.forEach(item => {
      const itemLevel = parseInt(item.dataset.level, 10);
      item.classList.toggle('active', itemLevel === level);
    });
  },

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

  /**
   * ブランドリストを描画（共通）
   * @param {Object} sectionElements - セクションのDOM要素群
   * @param {string[]} brands - ブランド配列
   * @param {string} itemClass - アイテムのCSSクラス
   * @param {string} emptyMessage - 空の場合のメッセージ
   */
  renderBrandList(sectionElements, brands, itemClass, emptyMessage) {
    const list = sectionElements.list;
    sectionElements.count.textContent = `${brands.length}件`;

    if (brands.length === 0) {
      list.innerHTML = `<div class="brand-section-empty">${emptyMessage}</div>`;
      return;
    }

    list.innerHTML = brands.map(name => {
      const escaped = this.escapeHtml(name);
      return `
      <div class="brand-section-item ${itemClass}">
        <span class="brand-section-item-name">${escaped}</span>
        <button class="brand-section-remove-btn" data-brand="${escaped}">&times;</button>
      </div>`;
    }).join('');
  },

  renderCustomBrands(brands) {
    this.renderBrandList(
      this.elements.customBrands, brands,
      'brand-section-item--custom', 'ブランドが追加されていません'
    );
  },

  renderExcludedBrands(brands) {
    this.renderBrandList(
      this.elements.excludedBrands, brands,
      'brand-section-item--excluded', '非表示ブランドはありません'
    );
  }
};

/**
 * イベントハンドラモジュール
 */
const EventHandlers = {
  async onSliderChange(event) {
    const level = parseInt(event.target.value, 10);
    UIManager.updateLevelDisplay(level);
    await SettingsManager.save({ filterLevel: level });
  },

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
   * ブランドセクションのイベントをバインド（共通）
   * @param {Object} sectionElements - セクションのDOM要素群
   * @param {Object} manager - BrandsManagerインスタンス
   * @param {Function} renderFn - 描画関数
   */
  _bindBrandSection(sectionElements, manager, renderFn) {
    // トグル
    sectionElements.toggle.addEventListener('click', () => {
      const isOpen = sectionElements.body.style.display !== 'none';
      sectionElements.body.style.display = isOpen ? 'none' : 'block';
      sectionElements.arrow.classList.toggle('open', !isOpen);
    });

    // 追加
    const addBrand = async () => {
      const name = sectionElements.input.value.trim();
      if (!name) return;
      const added = await manager.add(name);
      if (added) {
        sectionElements.input.value = '';
        renderFn(manager.brands);
      }
    };
    sectionElements.addBtn.addEventListener('click', addBrand);
    sectionElements.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBrand();
    });

    // 削除（イベント委任）
    sectionElements.list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.brand-section-remove-btn');
      if (!btn) return;
      await manager.remove(btn.dataset.brand);
      renderFn(manager.brands);
    });
  },

  bindAll() {
    const { elements } = UIManager;
    elements.filterSlider.addEventListener('input', this.onSliderChange);
    elements.reloadBtn.addEventListener('click', this.onReloadClick);

    // カスタムブランドセクション
    this._bindBrandSection(
      elements.customBrands, CustomBrandsManager,
      (brands) => UIManager.renderCustomBrands(brands)
    );

    // 非表示ブランドセクション
    this._bindBrandSection(
      elements.excludedBrands, ExcludedBrandsManager,
      (brands) => UIManager.renderExcludedBrands(brands)
    );
  }
};

/**
 * ポップアップコントローラー
 */
const PopupController = {
  initializeUI(settings) {
    const level = settings.filterLevel !== undefined ? settings.filterLevel : 2;
    UIManager.updateSlider(level);
    UIManager.updateStats(settings.stats);
  },

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

  async init() {
    try {
      UIManager.initElements();
      EventHandlers.bindAll();

      const settings = await SettingsManager.loadAll();
      this.initializeUI(settings);

      await this.migrateToSync();

      // ブランドリスト読み込み・描画
      const [brands, excludedBrands] = await Promise.all([
        CustomBrandsManager.load(),
        ExcludedBrandsManager.load()
      ]);
      UIManager.renderCustomBrands(brands);
      UIManager.renderExcludedBrands(excludedBrands);
    } catch (error) {
      console.error('ポップアップの初期化に失敗:', error);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => PopupController.init());
