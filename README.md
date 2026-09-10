# fami_war_like

往年のターン制ウォーシミュレーションに着想を得たオリジナル作品「グリッドウォーズ(仮題)」の開発リポジトリです。
TypeScript + Phaser + Vite で開発し、ブラウザで遊べるWebゲームとして公開します。

## ドキュメント

| ドキュメント | 内容 |
|---|---|
| [企画書](docs/Proposal.md) | プロジェクトの方向性・コンセプト・スコープ |
| [商用化企画書](docs/CommercialProposal.md) | 商用化の検討資料。現状の棚卸し・企画案・課題 |
| [商用化企画書(スライド)](docs/CommercialProposal.pptx) | 上記を提出用にまとめたプレゼン資料(20 枚) |
| [Steam配信実績の提案(簡易版)](docs/PlatformExpansionProposal.md) | 「なぜ商用化するのか」を 1 枚で説明する提案資料 |
| [Steam配信実績の提案(スライド)](docs/PlatformExpansionProposal.pptx) | 上記の提出用スライド(7 枚) |
| [ゲームデザイン](docs/GameDesign.md) | ルールの詳細定義 |
| [ユニット仕様](docs/UnitSpec.md) | ユニットのパラメータと相性表 |
| [地形仕様](docs/TerrainSpec.md) | 地形の移動コストと防御補正 |
| [開発計画](docs/DevelopmentPlan.md) | Phase別のタスク分解 |

## 開発環境

- Node.js 20 以上
- TypeScript + Phaser + Vite
- テスト: Vitest / 静的解析: ESLint + Prettier

### セットアップ

```bash
npm install
```

### 主なコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動する |
| `npm run build` | 本番ビルドを生成する(`dist/`) |
| `npm run preview` | 本番ビルドをローカルで確認する |
| `npm test` | Vitest でロジックのテストを実行する |
| `npm run typecheck` | 型チェックを実行する |
| `npm run lint` | ESLint を実行する |
| `npm run format` | Prettier で整形する |

### フォルダ構成

```text
src/
  core/      // ゲームロジック(描画非依存。ユニットテスト対象)
    ai/ battle/ economy/ map/ turn/ units/
  data/      // ユニット・地形・マップのデータ定義
  scenes/    // Phaser の Scene
  ui/        // UI 表示コンポーネント
  assets/    // スプライト・タイル・効果音
tests/       // Vitest によるロジックのテスト
```

## デプロイ

`main` ブランチへの push で GitHub Actions が本番ビルドを行い、GitHub Pages に自動公開します。
