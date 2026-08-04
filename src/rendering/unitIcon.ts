// ユニット種別ごとのシルエットアイコンをコードで描く。
// 外部画像は使わず(グラフィックはすべてオリジナルとする方針)、Phaser の
// Graphics プリミティブだけで歩兵・戦車・自走砲の姿を描き分ける。
// 軍勢を示す色つきトークン(円)は呼び出し側(MainScene)が描き、
// このモジュールはその上に重ねるシルエットのみを担当する。

import Phaser from 'phaser';

import type { UnitType } from '@/core/units/UnitType';

/** シルエットを描くための情報 */
export interface UnitIconContext {
  /** 描画先 */
  readonly graphics: Phaser.GameObjects.Graphics;
  /** トークン中心のワールド座標 */
  readonly cx: number;
  readonly cy: number;
  /** トークン(円)の半径。シルエットの大きさの基準にする */
  readonly radius: number;
  /** シルエットの色(通常は白) */
  readonly color: number;
  /** 不透明度。行動済みユニットは薄くする */
  readonly alpha: number;
}

/** 歩兵: ヘルメット・胴体・小銃のシルエット */
function drawInfantry(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 頭(ヘルメット)
  g.fillCircle(cx, cy - r * 0.42, r * 0.26);
  // 胴体(下広がりの台形)
  g.fillPoints(
    [
      { x: cx - r * 0.2, y: cy - r * 0.12 },
      { x: cx + r * 0.2, y: cy - r * 0.12 },
      { x: cx + r * 0.32, y: cy + r * 0.44 },
      { x: cx - r * 0.32, y: cy + r * 0.44 },
    ],
    true,
  );
  // 肩に担いだ小銃
  g.lineStyle(Math.max(2, r * 0.12), color, alpha);
  g.lineBetween(cx - r * 0.1, cy + r * 0.06, cx + r * 0.5, cy - r * 0.34);
}

/** 戦車: 車体・砲塔・右向きの砲身のシルエット(側面図) */
function drawTank(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 履帯を含む車体下部
  g.fillRoundedRect(cx - r * 0.6, cy + r * 0.06, r * 1.2, r * 0.4, r * 0.14);
  // 車体上部
  g.fillRoundedRect(cx - r * 0.46, cy - r * 0.16, r * 0.92, r * 0.3, r * 0.08);
  // 砲塔
  g.fillRoundedRect(cx - r * 0.2, cy - r * 0.42, r * 0.42, r * 0.3, r * 0.07);
  // 砲身(右向き)
  g.fillRect(cx + r * 0.18, cy - r * 0.34, r * 0.52, r * 0.12);
}

/** 自走砲: 車体と斜め上に伸びる長い砲身のシルエット */
function drawArtillery(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 車体
  g.fillRoundedRect(cx - r * 0.58, cy + r * 0.04, r * 1.16, r * 0.4, r * 0.14);
  // 砲の基部
  g.fillRoundedRect(cx - r * 0.22, cy - r * 0.14, r * 0.36, r * 0.26, r * 0.06);
  // 斜め上へ伸びる長い砲身(戦車と見分ける特徴)
  g.lineStyle(r * 0.18, color, alpha);
  g.lineBetween(cx - r * 0.05, cy - r * 0.02, cx + r * 0.62, cy - r * 0.52);
}

/**
 * ユニット種別に応じたシルエットアイコンを描く。
 * 軍勢を示すトークン(円)の上に重ねて使う。
 */
export function drawUnitIcon(unitType: UnitType, ctx: UnitIconContext): void {
  switch (unitType) {
    case 'infantry':
      drawInfantry(ctx);
      break;
    case 'tank':
      drawTank(ctx);
      break;
    case 'artillery':
      drawArtillery(ctx);
      break;
    default:
      break;
  }
}
