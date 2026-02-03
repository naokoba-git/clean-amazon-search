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
│   ├── seller-checker.js  # セラー住所判定
│   ├── brand-checker.js   # ブランド名判定
│   ├── title-checker.js   # タイトル判定
│   ├── score-calculator.js # スコア計算
│   └── product-filter.js  # 商品フィルタリング
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── styles.css
├── onboarding/
│   ├── onboarding.html
│   ├── onboarding.js
│   └── onboarding.css
├── config/
│   ├── filters.json           # フィルタープリセット
│   ├── sellers.json           # セラー情報
│   ├── trusted-brands.json    # 信頼ブランドリスト
│   └── suspicious-patterns.json # 怪しいパターン定義
├── releases/              # リリースZIPファイル
├── icons/                 # アイコン画像
├── docs/                  # ドキュメント
├── Docs/                  # プロンプト履歴等
└── _locales/ja/          # 日本語ローカライズ
```

## 主要機能

### 1. DOMベースフィルタリング（検索結果ページ）
- 商品のブランド名・タイトルを解析してスコア計算
- スコアに基づいて商品を非表示/警告表示/信頼表示
- フィルターレベル: OFF / ライト / スタンダード / ストリクト / 最強

### 2. バッジ表示機能
- **警告バッジ（黄色）**: 怪しいブランド名、タイトル長すぎ、誇大広告など
- **信頼バッジ（緑色）**: 信頼ブランドリストに登録されたブランド
- バナーで統計表示（非表示件数、警告件数、信頼ブランド件数）

### 3. 海外セラー判定機能（商品詳細ページ）
- セラーの住所をチェックして日本/海外を自動判定
- Background Service Worker経由でセラーページをfetch
- 海外セラーの場合は警告バナーを表示

### 4. 判定基準
- **ブランド名**: 中国語、ランダム英字、JP商法など
- **タイトル**: 100文字以上、誇張表現（「令和最新」「最強」など）
- **信頼リスト**: Apple, Sony, Ankerなど主要ブランド登録済み

## 技術的な注意点

### 権限（Manifest V3）
- `storage`: 設定保存用
- `host_permissions`: Amazon.co.jp内でのみ動作
- ※ `activeTab`は不要（host_permissionsで代替）
- ※ `scripting`は不要（content_scriptsで自動注入）

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

### v1.2.2 (2026-02-03)
- **Chrome Web Store審査対応**
- `activeTab`権限を削除（host_permissionsで代替可能、冗長）
- User-Agentスプーフィングを削除（ポリシー違反リスク）
- プライバシーポリシーを実際の権限・動作に合わせて修正

### v1.2.1 (2026-02-03)
- 不要な権限を削除（審査対応の初期対応）

### v1.2.0 (2026-02-01)
- 警告バッジ表示バグを修正（overflow:hidden問題）
- 信頼ブランドバッジを表示するように変更
- バッジ挿入位置をAタグ外側に修正

### v1.1.0 (2026-02-01)
- DOMベースフィルタリング機能を実装
- ブランド名・タイトル判定機能を追加
- 信頼ブランドリスト機能を追加
- PM会議でフィルタリング方針を再設計（FBA問題対応）
- ページネーション対応（URL変更検知）

### v1.0.0 (2026-01-31)
- 初期リリース
- Prime対象フィルタリング
- 海外セラー自動判定（商品ページ）
- ポップアップUI
- オンボーディング画面

## Chrome Web Store審査

### 審査履歴
| 日付 | バージョン | 結果 | 理由 |
|------|-----------|------|------|
| 2026-02-03 | 1.1.0 | 不承認 | 権限の過剰使用（activeTab） |
| 2026-02-03 | 1.2.2 | 再提出予定 | - |

### 審査チェックリスト（確認済み）
- [x] 不要な権限がない（storage, host_permissionsのみ）
- [x] User-Agentスプーフィングなし
- [x] リモートコード実行なし（eval, new Function等）
- [x] 外部サーバー通信なし（Amazon.co.jp内のみ）
- [x] プライバシーポリシーが権限と一致
- [x] 難読化コードなし

## 今後の改善案
- [ ] Chrome Web Store公開完了
- [ ] 検索結果ページでのセラー一括チェック（技術的課題あり）
- [ ] セラーのブラックリスト/ホワイトリスト機能
- [ ] 判定結果のキャッシュ改善
- [ ] タイトル長判定の閾値調整

## 最終更新
2026-02-03
