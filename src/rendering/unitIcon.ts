// ユニット種別ごとのシルエットアイコンをコードで描く。
// 外部画像は使わず(グラフィックはすべてオリジナルとする方針)、Phaser の
// Graphics プリミティブだけで歩兵・戦車・自走砲・ヘリ・艦艇の姿を描き分ける。
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

/** 回転翼(ローターと機体上のマスト)を描く。ヘリ系アイコンで共用する */
function drawRotor(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  // 機体上のマスト
  g.lineStyle(Math.max(2, r * 0.1), color, alpha);
  g.lineBetween(cx, cy - r * 0.5, cx, cy - r * 0.24);
  // メインローター(水平のブレード)
  g.lineStyle(Math.max(2, r * 0.12), color, alpha);
  g.lineBetween(cx - r * 0.62, cy - r * 0.5, cx + r * 0.62, cy - r * 0.5);
}

/** 戦闘ヘリ: 細身の機体・尾翼・攻撃ヘリらしいスタブ翼とローター */
function drawAttackHelicopter(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 機体(前方が細くなる紡錘形)
  g.fillPoints(
    [
      { x: cx - r * 0.5, y: cy - r * 0.06 },
      { x: cx + r * 0.5, y: cy - r * 0.02 },
      { x: cx + r * 0.5, y: cy + r * 0.18 },
      { x: cx - r * 0.5, y: cy + r * 0.26 },
    ],
    true,
  );
  // 尾部(右へ伸びるテールブーム)
  g.fillRect(cx + r * 0.4, cy + r * 0.0, r * 0.34, r * 0.08);
  // スタブ翼(下向きの武装ポッド)
  g.fillRect(cx - r * 0.16, cy + r * 0.24, r * 0.34, r * 0.12);
  drawRotor(ctx);
}

/** 輸送ヘリ: ずんぐりした胴体(貨物室)とローター */
function drawTransportHelicopter(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 丸みのある大きな胴体(貨物室)
  g.fillRoundedRect(cx - r * 0.5, cy - r * 0.14, r * 0.86, r * 0.42, r * 0.14);
  // 尾部(右へ伸びるテールブーム)
  g.fillRect(cx + r * 0.34, cy - r * 0.04, r * 0.4, r * 0.08);
  drawRotor(ctx);
}

/** 対空戦車: 車体の上に上向きの連装砲(対空機銃)を載せたシルエット */
function drawAntiAirTank(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 履帯を含む車体下部
  g.fillRoundedRect(cx - r * 0.6, cy + r * 0.12, r * 1.2, r * 0.38, r * 0.14);
  // 車体上部(砲塔基部)
  g.fillRoundedRect(cx - r * 0.36, cy - r * 0.1, r * 0.72, r * 0.28, r * 0.08);
  // 上向きに伸びる連装の対空砲身(斜め上を向く 2 本で戦車と見分ける)
  g.lineStyle(Math.max(2, r * 0.1), color, alpha);
  g.lineBetween(cx - r * 0.04, cy - r * 0.02, cx + r * 0.4, cy - r * 0.56);
  g.lineBetween(cx + r * 0.12, cy - r * 0.02, cx + r * 0.56, cy - r * 0.5);
}

/** 偵察車: 車輪 2 つの軽装甲車体と、後方へ伸びる長いアンテナのシルエット */
function drawRecon(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 低く平たい車体(装甲の薄さを表す)
  g.fillRoundedRect(cx - r * 0.62, cy - r * 0.12, r * 1.24, r * 0.34, r * 0.1);
  // 前面の傾斜した装甲板
  g.fillPoints(
    [
      { x: cx + r * 0.34, y: cy - r * 0.12 },
      { x: cx + r * 0.68, y: cy + r * 0.02 },
      { x: cx + r * 0.68, y: cy + r * 0.22 },
      { x: cx + r * 0.34, y: cy + r * 0.22 },
    ],
    true,
  );
  // 車輪(履帯ではなくタイヤ 2 つで戦車と見分ける)
  g.fillCircle(cx - r * 0.36, cy + r * 0.3, r * 0.2);
  g.fillCircle(cx + r * 0.4, cy + r * 0.3, r * 0.2);
  // 小さな銃塔(近接攻撃のみの軽武装)
  g.fillRoundedRect(cx - r * 0.16, cy - r * 0.34, r * 0.3, r * 0.24, r * 0.06);
  // 後方へ長く伸びる索敵アンテナ(広い視界を表す)
  g.lineStyle(Math.max(1.5, r * 0.08), color, alpha);
  g.lineBetween(cx - r * 0.4, cy - r * 0.1, cx - r * 0.62, cy - r * 0.66);
}

/**
 * 艦艇共通の船体(下すぼまりの台形)を描く。水上艦のアイコンで共用する。
 * 上部構造の描き分けで戦艦・護衛艦・輸送艦を区別する。
 */
function drawHull(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  g.fillPoints(
    [
      { x: cx - r * 0.72, y: cy + r * 0.16 },
      { x: cx + r * 0.78, y: cy + r * 0.16 },
      { x: cx + r * 0.5, y: cy + r * 0.5 },
      { x: cx - r * 0.5, y: cy + r * 0.5 },
    ],
    true,
  );
}

/** 戦艦: 高い艦橋と前後に伸びる主砲身を持つ大型艦のシルエット */
function drawBattleship(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawHull(ctx);
  g.fillStyle(color, alpha);
  // 中央の艦橋(高くそびえる塔)
  g.fillRect(cx - r * 0.12, cy - r * 0.56, r * 0.24, r * 0.7);
  // 前後の主砲塔
  g.fillRect(cx - r * 0.56, cy - r * 0.12, r * 0.26, r * 0.26);
  g.fillRect(cx + r * 0.3, cy - r * 0.12, r * 0.26, r * 0.26);
  // 主砲身(前後に突き出す長い砲)
  g.lineStyle(Math.max(2, r * 0.1), color, alpha);
  g.lineBetween(cx - r * 0.44, cy - r * 0.04, cx - r * 0.86, cy - r * 0.24);
  g.lineBetween(cx + r * 0.44, cy - r * 0.04, cx + r * 0.86, cy - r * 0.24);
}

/** 護衛艦: 低い船体にレーダーマストを 1 本立てた、細身の護衛艦らしいシルエット */
function drawEscortShip(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawHull(ctx);
  g.fillStyle(color, alpha);
  // 低い船橋
  g.fillRect(cx - r * 0.24, cy - r * 0.18, r * 0.4, r * 0.34);
  // 前部の小さな砲塔
  g.fillRect(cx + r * 0.34, cy - r * 0.02, r * 0.2, r * 0.18);
  // 高いレーダーマスト(広い視界を表す)
  g.lineStyle(Math.max(2, r * 0.09), color, alpha);
  g.lineBetween(cx - r * 0.04, cy - r * 0.18, cx - r * 0.04, cy - r * 0.68);
  // マスト上の横棒(レーダーアンテナ)
  g.lineBetween(cx - r * 0.28, cy - r * 0.56, cx + r * 0.2, cy - r * 0.56);
}

/** 輸送艦: 平たい船体の上に貨物コンテナを積んだシルエット */
function drawTransportShip(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawHull(ctx);
  g.fillStyle(color, alpha);
  // 後部の船橋
  g.fillRect(cx - r * 0.66, cy - r * 0.24, r * 0.26, r * 0.4);
  // 甲板に積んだ貨物(2 段のコンテナ。輸送枠 2 を思わせる形にする)
  g.fillRect(cx - r * 0.24, cy - r * 0.12, r * 0.76, r * 0.28);
  g.fillRect(cx - r * 0.1, cy - r * 0.4, r * 0.48, r * 0.24);
}

/** 潜水艦: 水面下の紡錘形の船体とセイル(司令塔)、波線で潜航を表すシルエット */
function drawSubmarine(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 葉巻型の船体
  g.fillRoundedRect(cx - r * 0.7, cy + r * 0.02, r * 1.4, r * 0.36, r * 0.18);
  // セイル(司令塔)
  g.fillRect(cx - r * 0.12, cy - r * 0.3, r * 0.28, r * 0.34);
  // 潜望鏡
  g.lineStyle(Math.max(2, r * 0.08), color, alpha);
  g.lineBetween(cx + r * 0.02, cy - r * 0.3, cx + r * 0.02, cy - r * 0.6);
  // 船体の上に引く水面線(潜航している様子を示す)
  g.lineStyle(Math.max(1.5, r * 0.08), color, alpha * 0.7);
  g.lineBetween(cx - r * 0.8, cy - r * 0.16, cx - r * 0.34, cy - r * 0.16);
  g.lineBetween(cx + r * 0.34, cy - r * 0.16, cx + r * 0.8, cy - r * 0.16);
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
    case 'attackHelicopter':
      drawAttackHelicopter(ctx);
      break;
    case 'transportHelicopter':
      drawTransportHelicopter(ctx);
      break;
    case 'antiAirTank':
      drawAntiAirTank(ctx);
      break;
    case 'recon':
      drawRecon(ctx);
      break;
    case 'battleship':
      drawBattleship(ctx);
      break;
    case 'escortShip':
      drawEscortShip(ctx);
      break;
    case 'transportShip':
      drawTransportShip(ctx);
      break;
    case 'submarine':
      drawSubmarine(ctx);
      break;
    default:
      break;
  }
}
