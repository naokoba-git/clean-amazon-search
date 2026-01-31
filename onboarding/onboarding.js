// Onboarding Script - Class-based Implementation

/**
 * OnboardingWizard - オンボーディングウィザードを管理するクラス
 */
class OnboardingWizard {
  constructor() {
    // 状態管理
    this.currentStep = 1;
    this.totalSteps = 4;
    this.selectedPreset = 'standard';
    this.autoApply = false;
    this.isAnimating = false;

    // DOM要素のキャッシュ
    this.elements = {
      steps: null,
      progressSteps: null,
      nextButtons: null,
      completeBtn: null,
      filterOptions: null,
      autoApplyOptions: null,
      container: null
    };

    // ステップ設定の定義
    this.stepConfig = [
      { id: 1, name: 'welcome', ariaLabel: 'ようこそ' },
      { id: 2, name: 'features', ariaLabel: '機能説明' },
      { id: 3, name: 'filter', ariaLabel: 'フィルター選択' },
      { id: 4, name: 'autoApply', ariaLabel: '自動適用設定' }
    ];

    // バインドされたイベントハンドラ
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleNextClick = this.handleNextClick.bind(this);
    this.handleFilterOptionClick = this.handleFilterOptionClick.bind(this);
    this.handleAutoApplyOptionClick = this.handleAutoApplyOptionClick.bind(this);
    this.handleComplete = this.handleComplete.bind(this);
  }

  /**
   * 初期化
   */
  init() {
    this.cacheElements();
    this.setupAccessibility();
    this.bindEvents();
    this.showStep(1, false);
  }

  /**
   * DOM要素をキャッシュ
   */
  cacheElements() {
    this.elements.steps = document.querySelectorAll('.step');
    this.elements.progressSteps = document.querySelectorAll('.progress-step');
    this.elements.nextButtons = document.querySelectorAll('[data-next]');
    this.elements.completeBtn = document.getElementById('complete-btn');
    this.elements.filterOptions = document.querySelectorAll('.filter-option');
    this.elements.autoApplyOptions = document.querySelectorAll('.auto-apply-option');
    this.elements.container = document.querySelector('.onboarding-container');
  }

  /**
   * アクセシビリティ属性を設定
   */
  setupAccessibility() {
    // コンテナにrole設定
    if (this.elements.container) {
      this.elements.container.setAttribute('role', 'main');
      this.elements.container.setAttribute('aria-label', 'オンボーディングウィザード');
    }

    // 各ステップにARIA属性を追加
    this.elements.steps.forEach((step, index) => {
      const config = this.stepConfig[index];
      step.setAttribute('role', 'tabpanel');
      step.setAttribute('aria-label', config.ariaLabel);
      step.setAttribute('aria-hidden', index !== 0);
      step.id = `step-${config.id}`;
    });

    // プログレスバーにARIA属性を追加
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.setAttribute('role', 'tablist');
      progressBar.setAttribute('aria-label', '進行状況');
    }

    this.elements.progressSteps.forEach((step, index) => {
      const config = this.stepConfig[index];
      step.setAttribute('role', 'tab');
      step.setAttribute('aria-label', `ステップ ${config.id}: ${config.ariaLabel}`);
      step.setAttribute('aria-selected', index === 0);
      step.setAttribute('aria-controls', `step-${config.id}`);
      step.setAttribute('tabindex', index === 0 ? '0' : '-1');
    });

    // フィルターオプションにARIA属性を追加
    this.elements.filterOptions.forEach(option => {
      option.setAttribute('role', 'radio');
      option.setAttribute('aria-checked', option.classList.contains('selected'));
      option.setAttribute('tabindex', '0');
    });

    // 自動適用オプションにARIA属性を追加
    this.elements.autoApplyOptions.forEach(option => {
      option.setAttribute('role', 'radio');
      option.setAttribute('aria-checked', option.classList.contains('selected'));
      option.setAttribute('tabindex', '0');
    });

    // ボタンのアクセシビリティ
    this.elements.nextButtons.forEach(btn => {
      btn.setAttribute('aria-label', '次のステップへ進む');
    });

    if (this.elements.completeBtn) {
      this.elements.completeBtn.setAttribute('aria-label', 'セットアップを完了する');
    }
  }

  /**
   * イベントをバインド
   */
  bindEvents() {
    // キーボードナビゲーション
    document.addEventListener('keydown', this.handleKeyDown);

    // 次へボタン
    this.elements.nextButtons.forEach(btn => {
      btn.addEventListener('click', this.handleNextClick);
    });

    // フィルターオプション
    this.elements.filterOptions.forEach(option => {
      option.addEventListener('click', this.handleFilterOptionClick);
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleFilterOptionClick({ currentTarget: option });
        }
      });
    });

    // 自動適用オプション
    this.elements.autoApplyOptions.forEach(option => {
      option.addEventListener('click', this.handleAutoApplyOptionClick);
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleAutoApplyOptionClick({ currentTarget: option });
        }
      });
    });

    // 完了ボタン
    if (this.elements.completeBtn) {
      this.elements.completeBtn.addEventListener('click', this.handleComplete);
    }
  }

  /**
   * キーボードイベントハンドラ
   */
  handleKeyDown(e) {
    // アニメーション中は操作を無効化
    if (this.isAnimating) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        this.goToNextStep();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        this.goToPreviousStep();
        break;
      case 'Enter':
        // フォーカスがオプション要素上でない場合のみ
        if (!e.target.closest('.filter-option, .auto-apply-option')) {
          e.preventDefault();
          if (this.currentStep < this.totalSteps) {
            this.goToNextStep();
          } else {
            this.handleComplete();
          }
        }
        break;
      case 'Escape':
        // 最初のステップに戻る
        if (this.currentStep > 1) {
          e.preventDefault();
          this.showStep(1);
        }
        break;
    }
  }

  /**
   * 次へボタンクリックハンドラ
   */
  handleNextClick(e) {
    if (this.isAnimating) return;
    const nextStep = parseInt(e.currentTarget.dataset.next);
    this.showStep(nextStep);
  }

  /**
   * フィルターオプションクリックハンドラ
   */
  handleFilterOptionClick(e) {
    const option = e.currentTarget;

    // 全オプションの選択を解除
    this.elements.filterOptions.forEach(o => {
      o.classList.remove('selected');
      o.setAttribute('aria-checked', 'false');
    });

    // クリックされたオプションを選択
    option.classList.add('selected');
    option.setAttribute('aria-checked', 'true');

    const radio = option.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;

    this.selectedPreset = option.dataset.preset;
  }

  /**
   * 自動適用オプションクリックハンドラ
   */
  handleAutoApplyOptionClick(e) {
    const option = e.currentTarget;

    // 全オプションの選択を解除
    this.elements.autoApplyOptions.forEach(o => {
      o.classList.remove('selected');
      o.setAttribute('aria-checked', 'false');
    });

    // クリックされたオプションを選択
    option.classList.add('selected');
    option.setAttribute('aria-checked', 'true');

    const radio = option.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;

    this.autoApply = option.dataset.auto === 'true';
  }

  /**
   * 次のステップへ移動
   */
  goToNextStep() {
    if (this.currentStep < this.totalSteps) {
      this.showStep(this.currentStep + 1);
    } else {
      this.handleComplete();
    }
  }

  /**
   * 前のステップへ移動
   */
  goToPreviousStep() {
    if (this.currentStep > 1) {
      this.showStep(this.currentStep - 1);
    }
  }

  /**
   * 指定されたステップを表示
   * @param {number} stepNumber - 表示するステップ番号
   * @param {boolean} animate - アニメーションを使用するか
   */
  showStep(stepNumber, animate = true) {
    if (this.isAnimating || stepNumber === this.currentStep) return;

    const previousStep = this.currentStep;
    const direction = stepNumber > previousStep ? 'forward' : 'backward';

    if (animate) {
      this.animateStepTransition(previousStep, stepNumber, direction);
    } else {
      this.updateStepDisplay(stepNumber);
    }
  }

  /**
   * ステップ遷移アニメーション
   */
  animateStepTransition(fromStep, toStep, direction) {
    this.isAnimating = true;

    const currentStepEl = document.querySelector(`.step[data-step="${fromStep}"]`);
    const targetStepEl = document.querySelector(`.step[data-step="${toStep}"]`);

    if (!currentStepEl || !targetStepEl) {
      this.isAnimating = false;
      return;
    }

    // フェードアウトアニメーション
    currentStepEl.classList.add('fade-out');
    currentStepEl.classList.add(direction === 'forward' ? 'slide-left' : 'slide-right');

    setTimeout(() => {
      // 現在のステップを非表示
      currentStepEl.classList.remove('active', 'fade-out', 'slide-left', 'slide-right');
      currentStepEl.setAttribute('aria-hidden', 'true');

      // 新しいステップを表示（フェードイン準備）
      targetStepEl.classList.add('fade-in');
      targetStepEl.classList.add(direction === 'forward' ? 'slide-from-right' : 'slide-from-left');
      targetStepEl.classList.add('active');
      targetStepEl.setAttribute('aria-hidden', 'false');

      // プログレスバーを更新
      this.updateProgressBar(toStep);
      this.currentStep = toStep;

      // フェードイン完了後にクラスを削除
      setTimeout(() => {
        targetStepEl.classList.remove('fade-in', 'slide-from-right', 'slide-from-left');
        this.isAnimating = false;

        // フォーカス管理
        this.manageFocus(toStep);

        // ライブリージョンで変更を通知
        this.announceStepChange(toStep);
      }, 300);
    }, 200);
  }

  /**
   * ステップ表示を更新（アニメーションなし）
   */
  updateStepDisplay(stepNumber) {
    // 全ステップを非表示
    this.elements.steps.forEach(step => {
      step.classList.remove('active');
      step.setAttribute('aria-hidden', 'true');
    });

    // 対象ステップを表示
    const targetStep = document.querySelector(`.step[data-step="${stepNumber}"]`);
    if (targetStep) {
      targetStep.classList.add('active');
      targetStep.setAttribute('aria-hidden', 'false');
    }

    // プログレスバーを更新
    this.updateProgressBar(stepNumber);
    this.currentStep = stepNumber;
  }

  /**
   * プログレスバーを更新
   */
  updateProgressBar(stepNumber) {
    this.elements.progressSteps.forEach((step, index) => {
      step.classList.remove('active', 'completed');
      step.setAttribute('aria-selected', 'false');
      step.setAttribute('tabindex', '-1');

      if (index + 1 < stepNumber) {
        step.classList.add('completed');
      } else if (index + 1 === stepNumber) {
        step.classList.add('active');
        step.setAttribute('aria-selected', 'true');
        step.setAttribute('tabindex', '0');
      }
    });
  }

  /**
   * フォーカス管理
   */
  manageFocus(stepNumber) {
    const targetStep = document.querySelector(`.step[data-step="${stepNumber}"]`);
    if (targetStep) {
      // ステップ内の最初のフォーカス可能な要素にフォーカス
      const focusable = targetStep.querySelector('button, [tabindex="0"]');
      if (focusable) {
        focusable.focus();
      }
    }
  }

  /**
   * スクリーンリーダー用にステップ変更を通知
   */
  announceStepChange(stepNumber) {
    const config = this.stepConfig[stepNumber - 1];
    let announcement = document.getElementById('sr-announcement');

    if (!announcement) {
      announcement = document.createElement('div');
      announcement.id = 'sr-announcement';
      announcement.setAttribute('role', 'status');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      document.body.appendChild(announcement);
    }

    announcement.textContent = `ステップ ${stepNumber} / ${this.totalSteps}: ${config.ariaLabel}`;
  }

  /**
   * 完了処理
   */
  async handleComplete() {
    if (this.isAnimating) return;

    try {
      // 設定を保存
      await chrome.storage.local.set({
        filterPreset: this.selectedPreset,
        autoApply: this.autoApply,
        onboardingCompleted: true,
        customFilters: {
          domesticShipping: true,
          fulfilledByAmazon: true,
          primeOnly: false,
          amazonSellerOnly: false,
          minRating: this.selectedPreset === 'premium' ? '4_and_up' : null
        }
      });

      // バッジを更新
      if (this.autoApply) {
        chrome.action.setBadgeText({ text: 'A' });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      }

      // Amazonのページを開く（新しいタブで）
      chrome.tabs.create({
        url: 'https://www.amazon.co.jp'
      });

      // オンボーディングタブを閉じる
      window.close();
    } catch (error) {
      console.error('オンボーディング完了処理でエラーが発生しました:', error);
    }
  }

  /**
   * クリーンアップ
   */
  destroy() {
    document.removeEventListener('keydown', this.handleKeyDown);

    this.elements.nextButtons.forEach(btn => {
      btn.removeEventListener('click', this.handleNextClick);
    });

    if (this.elements.completeBtn) {
      this.elements.completeBtn.removeEventListener('click', this.handleComplete);
    }
  }
}

// DOMContentLoadedで初期化
document.addEventListener('DOMContentLoaded', () => {
  const wizard = new OnboardingWizard();
  wizard.init();

  // グローバルに公開（デバッグ用）
  window.onboardingWizard = wizard;
});
