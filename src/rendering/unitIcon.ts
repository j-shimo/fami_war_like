// ユニット種別ごとのシルエットアイコンをコードで描く。
// 外部画像は使わず(グラフィックはすべてオリジナルとする方針)、Phaser の
// Graphics プリミティブだけで歩兵・戦車・自走砲・輸送車・対空車両・ヘリ・固定翼機・艦艇の
// 姿を描き分ける。
// 軍勢を示す色つきトークン(円)は呼び出し側(MainScene)が描き、
// このモジュールはその上に重ねるシルエットのみを担当する。
// 戦車 3 種(軽・中・重)は共通の車体シルエットを大きさで描き分ける。

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

/**
 * 戦車共通のシルエット(履帯つき車体・砲塔・右向きの砲身)を描く。
 * 軽・中・重の 3 種は、車体と砲塔・砲身の太さを scale で変えて描き分ける。
 *
 * @param bodyScale 車体・砲塔の大きさの倍率(重いほど大きく)
 * @param barrelThickness 砲身の太さの倍率(重いほど太く)
 */
function drawTankBody(
  ctx: UnitIconContext,
  bodyScale: number,
  barrelThickness: number,
): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  const s = r * bodyScale;
  g.fillStyle(color, alpha);
  // 履帯を含む車体下部
  g.fillRoundedRect(cx - s * 0.6, cy + r * 0.06, s * 1.2, s * 0.4, s * 0.14);
  // 車体上部
  g.fillRoundedRect(cx - s * 0.46, cy - r * 0.16, s * 0.92, s * 0.3, s * 0.08);
  // 砲塔
  g.fillRoundedRect(cx - s * 0.2, cy - r * 0.42, s * 0.42, s * 0.3, s * 0.07);
  // 砲身(右向き)。重い戦車ほど太く長い
  g.fillRect(cx + s * 0.18, cy - r * 0.34, s * 0.52, r * barrelThickness);
}

/** 軽戦車: 細い車体と細い砲身。3 種でもっとも小柄なシルエット */
function drawLightTank(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawTankBody(ctx, 0.86, 0.09);
  // 車体後方に立てた無線アンテナ(足の速い軽戦車の目印)
  g.lineStyle(Math.max(1.5, r * 0.07), color, alpha);
  g.lineBetween(cx - r * 0.44, cy - r * 0.14, cx - r * 0.56, cy - r * 0.6);
}

/** 中戦車: 標準的な車体と砲身。戦車系シルエットの基準になる形 */
function drawMediumTank(ctx: UnitIconContext): void {
  drawTankBody(ctx, 1, 0.12);
}

/** 重戦車: 太い車体と太い砲身に、車体前面の増加装甲を重ねたシルエット */
function drawHeavyTank(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawTankBody(ctx, 1.12, 0.16);
  // 車体前面の増加装甲(厚い装甲を表す傾斜板)
  g.fillStyle(color, alpha);
  g.fillPoints(
    [
      { x: cx + r * 0.42, y: cy - r * 0.18 },
      { x: cx + r * 0.76, y: cy + r * 0.06 },
      { x: cx + r * 0.76, y: cy + r * 0.3 },
      { x: cx + r * 0.42, y: cy + r * 0.3 },
    ],
    true,
  );
}

/** ロケット砲: 装輪車体の上に、斜め上を向いた多連装ロケット発射機を載せたシルエット */
function drawRocketArtillery(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 低く平たい車体(装甲が薄いことを表す)
  g.fillRoundedRect(cx - r * 0.66, cy - r * 0.02, r * 1.24, r * 0.3, r * 0.1);
  // 車輪(装輪車両であることを示すタイヤ 2 つ)
  g.fillCircle(cx - r * 0.4, cy + r * 0.36, r * 0.18);
  g.fillCircle(cx + r * 0.36, cy + r * 0.36, r * 0.18);
  // 発射機の基部
  g.fillRoundedRect(cx - r * 0.26, cy - r * 0.24, r * 0.34, r * 0.26, r * 0.06);
  // 斜め上へ向く多連装の発射レール(3 本並べて自走砲の単装砲身と見分ける)
  g.lineStyle(Math.max(1.5, r * 0.09), color, alpha);
  g.lineBetween(cx - r * 0.18, cy - r * 0.1, cx + r * 0.5, cy - r * 0.5);
  g.lineBetween(cx - r * 0.18, cy - r * 0.26, cx + r * 0.5, cy - r * 0.66);
  g.lineBetween(cx - r * 0.18, cy - r * 0.42, cx + r * 0.5, cy - r * 0.82);
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

/**
 * 固定翼機共通の尾翼(機体後方に立てる垂直尾翼)を描く。戦闘機・爆撃機・攻撃機で共用する。
 * 機体はすべて右(進行方向)を向いた側面のシルエットとして描く。
 */
function drawTailFin(ctx: UnitIconContext, height: number): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  g.fillPoints(
    [
      { x: cx - r * 0.72, y: cy + r * 0.04 },
      { x: cx - r * 0.5, y: cy - r * height },
      { x: cx - r * 0.34, y: cy + r * 0.04 },
    ],
    true,
  );
}

/** 戦闘機: 細く尖った機首と後退翼を持つ、もっとも鋭いシルエット */
function drawFighter(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawTailFin(ctx, 0.62);
  g.fillStyle(color, alpha);
  // 機体(前方へ大きく尖った紡錘形)
  g.fillPoints(
    [
      { x: cx + r * 0.86, y: cy + r * 0.08 },
      { x: cx + r * 0.1, y: cy - r * 0.06 },
      { x: cx - r * 0.74, y: cy - r * 0.02 },
      { x: cx - r * 0.74, y: cy + r * 0.2 },
      { x: cx + r * 0.3, y: cy + r * 0.22 },
    ],
    true,
  );
  // 後退翼(後ろへ強く傾いた三角形)。爆撃機の直線翼と見分ける特徴
  g.fillPoints(
    [
      { x: cx + r * 0.14, y: cy + r * 0.1 },
      { x: cx - r * 0.5, y: cy + r * 0.6 },
      { x: cx + r * 0.06, y: cy + r * 0.6 },
    ],
    true,
  );
  // 風防(機首寄りの小さなキャノピー)
  g.fillPoints(
    [
      { x: cx + r * 0.34, y: cy - r * 0.06 },
      { x: cx + r * 0.16, y: cy - r * 0.26 },
      { x: cx - r * 0.04, y: cy - r * 0.04 },
    ],
    true,
  );
}

/** 爆撃機: 太い胴体と長い直線翼、胴体下の爆弾を持つ大型機のシルエット */
function drawBomber(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawTailFin(ctx, 0.5);
  g.fillStyle(color, alpha);
  // 太く長い胴体(積載量の大きさを表す)。機首は前方へゆるく尖らせる
  g.fillPoints(
    [
      { x: cx + r * 0.88, y: cy + r * 0.04 },
      { x: cx + r * 0.44, y: cy - r * 0.16 },
      { x: cx - r * 0.76, y: cy - r * 0.16 },
      { x: cx - r * 0.76, y: cy + r * 0.18 },
      { x: cx + r * 0.5, y: cy + r * 0.18 },
    ],
    true,
  );
  // 長い直線翼(前後にまっすぐ伸びる)
  g.fillRect(cx - r * 0.56, cy + r * 0.18, r * 1.06, r * 0.1);
  // 主翼に吊るしたエンジン 2 基
  g.fillRect(cx - r * 0.4, cy + r * 0.26, r * 0.24, r * 0.14);
  g.fillRect(cx + r * 0.08, cy + r * 0.26, r * 0.24, r * 0.14);
  // 胴体下へ落とす爆弾 2 発(爆撃機であることを示す)
  g.fillCircle(cx - r * 0.1, cy + r * 0.58, r * 0.09);
  g.fillCircle(cx + r * 0.2, cy + r * 0.58, r * 0.09);
}

/** 攻撃機: 戦闘機と爆撃機の中間。直線翼の下に武装ポッドを下げたシルエット */
function drawAttackAircraft(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  drawTailFin(ctx, 0.54);
  g.fillStyle(color, alpha);
  // 機体(戦闘機より丸い機首。ずんぐりした攻撃機らしい形)
  g.fillPoints(
    [
      { x: cx + r * 0.78, y: cy - r * 0.02 },
      { x: cx + r * 0.82, y: cy + r * 0.16 },
      { x: cx - r * 0.7, y: cy + r * 0.22 },
      { x: cx - r * 0.7, y: cy - r * 0.12 },
      { x: cx + r * 0.36, y: cy - r * 0.14 },
    ],
    true,
  );
  // 直線翼(戦闘機の後退翼と見分ける)
  g.fillRect(cx - r * 0.42, cy + r * 0.22, r * 0.84, r * 0.12);
  // 翼下の武装ポッド 2 つ(対地・対艦攻撃力を表す)
  g.fillRect(cx - r * 0.32, cy + r * 0.34, r * 0.2, r * 0.16);
  g.fillRect(cx + r * 0.14, cy + r * 0.34, r * 0.2, r * 0.16);
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

/**
 * 対空自走砲: 履帯の車体に、レーダー皿と真上へ向く単装の対空砲を載せたシルエット。
 * 連装砲の対空戦車とは、背中のレーダー皿と 1 本の長い砲身で見分ける。
 */
function drawAntiAirArtillery(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 履帯を含む車体下部(自走砲と同じ装軌車両)
  g.fillRoundedRect(cx - r * 0.6, cy + r * 0.16, r * 1.2, r * 0.34, r * 0.13);
  // 砲塔(箱型の基部)
  g.fillRoundedRect(cx - r * 0.3, cy - r * 0.08, r * 0.6, r * 0.28, r * 0.07);
  // 背中のレーダー皿(索敵しながら撃つ対空車両の目印)
  g.fillPoints(
    [
      { x: cx - r * 0.46, y: cy - r * 0.16 },
      { x: cx - r * 0.72, y: cy - r * 0.5 },
      { x: cx - r * 0.34, y: cy - r * 0.44 },
    ],
    true,
  );
  // 真上へ向く長い単装の対空砲身
  g.lineStyle(Math.max(2, r * 0.13), color, alpha);
  g.lineBetween(cx + r * 0.08, cy - r * 0.04, cx + r * 0.34, cy - r * 0.7);
}

/**
 * 対空ロケット砲: 装輪車体に、斜め上を向く 2 発の対空ミサイルと索敵レーダーを載せたシルエット。
 * 3 本の発射レールを持つロケット砲とは、太い 2 発のミサイルとレーダー板で見分ける。
 */
function drawAntiAirRocketArtillery(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 低く平たい車体(ロケット砲と同じ装輪車両)
  g.fillRoundedRect(cx - r * 0.66, cy + r * 0.02, r * 1.24, r * 0.28, r * 0.1);
  // 車輪(タイヤ 2 つ)
  g.fillCircle(cx - r * 0.4, cy + r * 0.36, r * 0.18);
  g.fillCircle(cx + r * 0.36, cy + r * 0.36, r * 0.18);
  // 発射機の基部
  g.fillRoundedRect(cx - r * 0.12, cy - r * 0.18, r * 0.32, r * 0.24, r * 0.06);
  // 斜め上を向く 2 発の対空ミサイル(ロケット砲の 3 本レールより太く本数が少ない)
  g.lineStyle(Math.max(2.5, r * 0.14), color, alpha);
  g.lineBetween(cx - r * 0.02, cy - r * 0.14, cx + r * 0.5, cy - r * 0.6);
  g.lineBetween(cx - r * 0.02, cy - r * 0.36, cx + r * 0.5, cy - r * 0.82);
  // 車体前方の索敵レーダー板(飛行ユニットしか狙わないことを表す)
  g.lineStyle(Math.max(1.5, r * 0.08), color, alpha);
  g.lineBetween(cx - r * 0.46, cy + r * 0.02, cx - r * 0.66, cy - r * 0.42);
  g.lineBetween(cx - r * 0.66, cy - r * 0.42, cx - r * 0.3, cy - r * 0.3);
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
 * 輸送車: 履帯つきの車体に箱型の荷台(兵員室)を載せたシルエット。
 * タイヤと索敵アンテナを持つ偵察車、砲塔と砲身を持つ戦車と見分けられるようにする。
 */
function drawTransportVehicle(ctx: UnitIconContext): void {
  const { graphics: g, cx, cy, radius: r, color, alpha } = ctx;
  g.fillStyle(color, alpha);
  // 履帯を含む車体下部(装軌車両であることを示す)
  g.fillRoundedRect(cx - r * 0.64, cy + r * 0.16, r * 1.28, r * 0.32, r * 0.12);
  // 箱型の荷台(兵員室)。背の高い四角形で「運ぶ車」を表す
  g.fillRect(cx - r * 0.52, cy - r * 0.4, r * 0.92, r * 0.56);
  // 前面の傾斜した装甲板(進行方向を示す)
  g.fillPoints(
    [
      { x: cx + r * 0.4, y: cy - r * 0.12 },
      { x: cx + r * 0.68, y: cy + r * 0.04 },
      { x: cx + r * 0.68, y: cy + r * 0.16 },
      { x: cx + r * 0.4, y: cy + r * 0.16 },
    ],
    true,
  );
  // 屋根の上の小さな機銃(自衛用の軽武装)
  g.fillRect(cx - r * 0.12, cy - r * 0.56, r * 0.22, r * 0.18);
  g.lineStyle(Math.max(1.5, r * 0.07), color, alpha);
  g.lineBetween(cx + r * 0.06, cy - r * 0.48, cx + r * 0.46, cy - r * 0.48);
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
    case 'lightTank':
      drawLightTank(ctx);
      break;
    case 'mediumTank':
      drawMediumTank(ctx);
      break;
    case 'heavyTank':
      drawHeavyTank(ctx);
      break;
    case 'artillery':
      drawArtillery(ctx);
      break;
    case 'rocketArtillery':
      drawRocketArtillery(ctx);
      break;
    case 'fighter':
      drawFighter(ctx);
      break;
    case 'bomber':
      drawBomber(ctx);
      break;
    case 'attackAircraft':
      drawAttackAircraft(ctx);
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
    case 'antiAirArtillery':
      drawAntiAirArtillery(ctx);
      break;
    case 'antiAirRocketArtillery':
      drawAntiAirRocketArtillery(ctx);
      break;
    case 'recon':
      drawRecon(ctx);
      break;
    case 'transportVehicle':
      drawTransportVehicle(ctx);
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
