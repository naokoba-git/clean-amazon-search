# Clean Amazon Search - プロジェクトコンテキスト

## プロジェクト概要
Amazon.co.jp用Chrome拡張機能。Prime対象商品フィルタリングと海外セラー自動判定機能を提供。

## リポジトリ
https://github.com/naokoba-git/clean-amazon-search

## 技術スタック
- Chrome Extension Manifest V3
- Vanilla JavaScript (ES6+)
- CSS3

## ディレクトリ構成
```
clean-amazon-search/
├── manifest.json          # 拡張機能設定
├── scripts/
│   ├── background.js      # Service Worker
│   ├── content.js         # 検索結果ページ用
│   ├── product.js         # 商品詳細ページ用
│   ├── constants.js       # 定数定義
│   ├── filter-utils.js    # フィルターユーティリティ
│   └── seller-checker.js  # セラー住所判定
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── styles.css
├── onboarding/
│   ├── onboarding.html
│   ├── onboarding.js
│   └── onboarding.css
├── config/
│   ├── filters.json       # フィルタープリセット
│   └── sellers.json       # セラー情報
├── icons/                 # アイコン画像
└── _locales/ja/          # 日本語ローカライズ
```

## 主要機能

### 1. フィルタリング機能
- **スタンダード**: Prime対象 (`p_85:2322926051`)
- **プレミアム**: Prime + 評価★4以上 (`p_85:2322926051`, `p_72:83461051`)
- **ストリクト**: Amazon公式販売のみ (`p_6:AN1VRQENFRJN5`)

### 2. 海外セラー判定機能
- 商品詳細ページでセラーの住所をチェック
- Background Service Worker経由でセラーページをfetch
- 日本の都道府県 vs 中国の省市を判定
- 海外セラーの場合は警告バナーを表示

## 技術的な注意点

### CORS制限
- Content Scriptからの直接fetchはCORS制限あり
- Background Service Worker経由でfetchすることで回避
- 検索結果ページでの一括チェックは困難（Amazonがブロック）

### フィルターパラメータ
- `p_85`: Prime対象
- `p_72`: 評価フィルター
- `p_6`: セラーID
- `rh`パラメータで複数条件をカンマ区切り

### セラー住所判定ロジック
```javascript
// 日本判定: 都道府県名を検出
JAPAN_PREFECTURES = ['北海道', '東京', '大阪', ...]

// 海外判定: 中国の省市を検出
OVERSEAS_INDICATORS = ['中国', 'China', '深圳', '广东', ...]
```

## 開発履歴

### v1.0.0 (2026-02-01)
- 初期リリース
- Prime対象フィルタリング
- 海外セラー自動判定（商品ページ）
- ポップアップUI
- オンボーディング画面

## 今後の改善案
- [ ] 検索結果ページでのセラー一括チェック（技術的課題あり）
- [ ] セラーのブラックリスト/ホワイトリスト機能
- [ ] 判定結果のキャッシュ改善
- [ ] Chrome Web Store公開

## テスト方法
```bash
# Playwrightでテスト（scratchpadディレクトリで実行）
node test-final.js
```

## 最終更新
2026-02-01
