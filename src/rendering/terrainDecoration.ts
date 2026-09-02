// 地形マスの上にコードで模様を描き込み、単色の四角よりリッチに見せる。
// 外部画像アセットは使わず(グラフィックはすべてオリジナルとする方針)、
// Phaser の Graphics プリミティブだけで草・木・山・道路・線路・川を描く。
// マップ状態には依存せず描画のみを担うため、Vitest の対象外(MainScene と同様)。

import Phaser from 'phaser';

import type { TerrainType } from '@/core/map/TerrainType';
import type { RoadLinks } from '@/rendering/roadLinks';

/** 1 マスぶんの装飾を描くための情報 */
export interface TerrainDecorationContext {
  /** 描画先(地形レイヤーの永続グラフィックス) */
  readonly graphics: Phaser.GameObjects.Graphics;
  /** マス左上のワールド座標 */
  readonly x: number;
  readonly y: number;
  /** 1 マスのピクセルサイズ */
  readonly size: number;
  /** グリッド座標。模様の配置を毎回同じにする(再描画でちらつかない)ために使う */
  readonly col: number;
  readonly row: number;
  /**
   * 道路・線路・川の接続方向。terrainType が 'road' のときは computeRoadLinks の結果を、
   * 'railway' のときは computeRailLinks、'river' のときは computeRiverLinks の結果を渡す。
   * それ以外の地形では使わない。
   */
  readonly roadLinks?: RoadLinks;
  /**
   * 所有者を示す色。拠点(都市・研究所・工場・駅・本拠地)の旗に使う。
   * 中立や非拠点では省略できる。
   */
  readonly ownerColor?: number;
}

/**
 * グリッド座標から決定的な擬似乱数 [0, 1) を得る。
 * Math.random と違い毎回同じ値になるので、占領による再描画でも
 * 草や木の位置が動かず安定した見た目になる。
 */
function hash01(col: number, row: number, salt: number): number {
  let h = ((col + 1) * 374761393 + (row + 1) * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h % 100000) / 100000;
}

/** 平地: 下地の緑に草の房を散らして質感を出す */
function drawPlain(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row } = ctx;
  const light = 0x86a84b;
  const dark = 0x54742e;
  const tufts = 6;
  for (let i = 0; i < tufts; i++) {
    const px = x + size * (0.14 + 0.72 * hash01(col, row, i * 3 + 1));
    const py = y + size * (0.4 + 0.52 * hash01(col, row, i * 3 + 2));
    const color = hash01(col, row, i * 3 + 3) < 0.5 ? light : dark;
    g.lineStyle(1, color, 0.9);
    g.lineBetween(px, py, px - 2, py - 5);
    g.lineBetween(px, py, px, py - 6);
    g.lineBetween(px, py, px + 2, py - 5);
  }
}

/** 森: 幹と丸い樹冠のミニツリーを数本描く */
function drawForest(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row } = ctx;
  const trunk = 0x4a3220;
  const canopy = 0x3f7d46;
  const highlight = 0x5fa85a;
  // 奥→手前の順に描くことで木々が重なった林に見える
  const trees = [
    { bx: 0.32, by: 0.6 },
    { bx: 0.66, by: 0.52 },
    { bx: 0.48, by: 0.78 },
  ];
  trees.forEach((tree, i) => {
    const jitterX = (hash01(col, row, i * 2 + 1) - 0.5) * size * 0.1;
    const jitterY = (hash01(col, row, i * 2 + 2) - 0.5) * size * 0.08;
    const cx = x + size * tree.bx + jitterX;
    const cy = y + size * tree.by + jitterY;
    const r = size * 0.16;
    g.fillStyle(trunk, 1);
    g.fillRect(cx - 1.5, cy, 3, size * 0.16);
    g.fillStyle(canopy, 1);
    g.fillCircle(cx, cy, r);
    g.fillStyle(highlight, 1);
    g.fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.5);
  });
}

/** 山: 陰影を付けた三角の山並みと雪冠を描く */
function drawMountain(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row } = ctx;
  const sunlit = 0xa88a5e;
  const shadow = 0x6d5236;
  const backPeak = 0x7a5e3e;
  const snow = 0xeef1f4;
  // マスごとに山頂を少しずらして単調さを避ける
  const shift = (hash01(col, row, 1) - 0.5) * size * 0.12;
  const peakX = x + size * 0.5 + shift;

  // 背後の小さな峰(先に描いて主峰に隠れさせる)
  g.fillStyle(backPeak, 1);
  g.fillTriangle(
    x + size * 0.28,
    y + size * 0.34,
    x + size * 0.04,
    y + size * 0.86,
    x + size * 0.5,
    y + size * 0.86,
  );

  // 主峰: 頂点から真下へ分けて左を陽面、右を陰面にする
  const apexX = peakX;
  const apexY = y + size * 0.16;
  const baseLeftX = x + size * 0.16;
  const baseRightX = x + size * 0.84;
  const baseY = y + size * 0.86;
  const baseMidX = peakX;
  g.fillStyle(sunlit, 1);
  g.fillTriangle(apexX, apexY, baseLeftX, baseY, baseMidX, baseY);
  g.fillStyle(shadow, 1);
  g.fillTriangle(apexX, apexY, baseMidX, baseY, baseRightX, baseY);

  // 雪冠
  g.fillStyle(snow, 1);
  g.fillTriangle(
    apexX,
    apexY,
    apexX - size * 0.11,
    apexY + size * 0.16,
    apexX + size * 0.11,
    apexY + size * 0.16,
  );
}

/** 海: 下地の青の上に、明るい波のさざ波を数本描いて水面を表現する */
function drawSea(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row } = ctx;
  const wave = 0x5fa0d0;
  const foam = 0x9fd0ec;
  const waves = 5;
  for (let i = 0; i < waves; i++) {
    const py = y + size * (0.16 + 0.68 * hash01(col, row, i * 2 + 1));
    const px = x + size * (0.1 + 0.35 * hash01(col, row, i * 2 + 2));
    const len = size * (0.2 + 0.2 * hash01(col, row, i * 2 + 3));
    const color = hash01(col, row, i * 2 + 4) < 0.4 ? foam : wave;
    // 短い波線(浅い山なり)を 2 本のセグメントで描く
    g.lineStyle(1.5, color, 0.85);
    g.lineBetween(px, py, px + len * 0.5, py - 1.5);
    g.lineBetween(px + len * 0.5, py - 1.5, px + len, py);
  }
}

/**
 * 川: 流れの筋と、水面から覗く川石を描いて浅瀬を表現する。
 * 海(短い波線を散らす)と見分けられるよう、流れの向きにそろえた長い筋で描く。
 * 向きは roadLinks(computeRiverLinks)の接続方向から決め、左右へ続いていれば横に、
 * それ以外(上下へ続く川・単独のマス)は縦に流す。
 */
function drawRiver(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row, roadLinks } = ctx;
  const stream = 0x8fd0e8;
  const deep = 0x2f7fa8;
  // 左右どちらかへ水面が続いていれば横向きの流れとして描く
  const horizontal = roadLinks ? roadLinks.left || roadLinks.right : true;
  const streams = 4;
  for (let i = 0; i < streams; i++) {
    // 流れの筋。マスをまたいでつながって見えるよう、流れの向きへ長く伸ばす
    const across = size * (0.18 + 0.64 * hash01(col, row, i * 3 + 71));
    const along = size * (0.05 + 0.45 * hash01(col, row, i * 3 + 72));
    const len = size * (0.3 + 0.25 * hash01(col, row, i * 3 + 73));
    const color = i % 2 === 0 ? stream : deep;
    g.lineStyle(1.5, color, 0.8);
    if (horizontal) {
      g.lineBetween(x + along, y + across, x + along + len, y + across);
    } else {
      g.lineBetween(x + across, y + along, x + across, y + along + len);
    }
  }
  // 川石。浅瀬であること(歩いて渡れること)を見た目でも示す
  const stones = 3;
  for (let i = 0; i < stones; i++) {
    const px = x + size * (0.15 + 0.7 * hash01(col, row, i * 2 + 81));
    const py = y + size * (0.15 + 0.7 * hash01(col, row, i * 2 + 82));
    const r = size * (0.05 + 0.03 * hash01(col, row, i + 91));
    g.fillStyle(0xbfc8cc, 0.85);
    g.fillCircle(px, py, r);
  }
}

/**
 * 海岸: 砂の粒と、打ち寄せる波の白い泡を描いて渚を表現する。
 * 海(青)と平地(緑)のどちらとも見分けがつくよう、下地の砂色に
 * 濃淡の粒を散らしたうえで、マス下辺に沿って波打ち際の泡を重ねる。
 */
function drawBeach(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row } = ctx;
  const grainLight = 0xefe0ae;
  const grainDark = 0xbfa462;
  // 砂粒。位置は grid ハッシュで決めるため、再描画でも動かない
  const grains = 14;
  for (let i = 0; i < grains; i++) {
    const px = x + size * (0.08 + 0.84 * hash01(col, row, i * 2 + 11));
    const py = y + size * (0.08 + 0.84 * hash01(col, row, i * 2 + 12));
    const color = hash01(col, row, i + 40) < 0.5 ? grainLight : grainDark;
    g.fillStyle(color, 0.85);
    g.fillRect(px, py, 2, 2);
  }
  // 波打ち際。マスの下辺沿いに白い泡の弧を 3 本並べる
  const foam = 0xf2f8fb;
  for (let i = 0; i < 3; i++) {
    const bx = x + size * (0.1 + 0.3 * i);
    const by = y + size * (0.78 + 0.1 * hash01(col, row, i + 60));
    const len = size * 0.26;
    g.lineStyle(1.5, foam, 0.75);
    g.lineBetween(bx, by, bx + len * 0.5, by - 2);
    g.lineBetween(bx + len * 0.5, by - 2, bx + len, by);
  }
}

/** 指定した方向へ短い破線(道路の中央線)を引く */
function dashLine(
  g: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  const dashLen = 4;
  const gapLen = 3;
  const total = Math.hypot(x2 - x1, y2 - y1);
  const step = dashLen + gapLen;
  const ux = (x2 - x1) / total;
  const uy = (y2 - y1) / total;
  for (let d = 0; d < total; d += step) {
    const end = Math.min(d + dashLen, total);
    g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * end, y1 + uy * end);
  }
}

/** 道路: 隣接する道路へつながるアスファルトの帯と中央線を描く */
function drawRoad(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, roadLinks } = ctx;
  const asphalt = 0x585862;
  const centerLine = 0xd9c874;
  const half = size / 2;
  const bandHalf = size * 0.2;
  const cx = x + half;
  const cy = y + half;

  const links = roadLinks ?? { up: false, down: false, left: false, right: false };

  g.fillStyle(asphalt, 1);
  // 中央の交差部
  g.fillRect(cx - bandHalf, cy - bandHalf, bandHalf * 2, bandHalf * 2);
  if (links.left) {
    g.fillRect(x, cy - bandHalf, half, bandHalf * 2);
  }
  if (links.right) {
    g.fillRect(cx, cy - bandHalf, half, bandHalf * 2);
  }
  if (links.up) {
    g.fillRect(cx - bandHalf, y, bandHalf * 2, half);
  }
  if (links.down) {
    g.fillRect(cx - bandHalf, cy, bandHalf * 2, half);
  }

  // 中央線(接続している方向にだけ引く)
  g.lineStyle(2, centerLine, 0.85);
  if (links.left) {
    dashLine(g, x, cy, cx, cy);
  }
  if (links.right) {
    dashLine(g, cx, cy, x + size, cy);
  }
  if (links.up) {
    dashLine(g, cx, y, cx, cy);
  }
  if (links.down) {
    dashLine(g, cx, cy, cx, y + size);
  }
}

/**
 * 線路: 隣接する線路・駅へ伸びるバラストの帯に、枕木と 2 本のレールを描く。
 * 道路(アスファルトの帯 + 中央の破線)と一目で区別できるよう、
 * 灰褐色の砂利の上にはしご状の枕木を並べる。
 */
function drawRailway(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, roadLinks } = ctx;
  const ballast = 0x6f6a5e;
  const sleeper = 0x5a4632;
  const rail = 0xd6d2c4;
  const half = size / 2;
  const bandHalf = size * 0.22;
  const railHalf = size * 0.11;
  const cx = x + half;
  const cy = y + half;

  const links = roadLinks ?? { up: false, down: false, left: false, right: false };
  // どこにもつながらない線路は、横向きの 1 区間として描いて線路と分かるようにする
  const isolated = !links.up && !links.down && !links.left && !links.right;
  const left = links.left || isolated;
  const right = links.right || isolated;

  // バラスト(砂利)の帯
  g.fillStyle(ballast, 1);
  g.fillRect(cx - bandHalf, cy - bandHalf, bandHalf * 2, bandHalf * 2);
  if (left) {
    g.fillRect(x, cy - bandHalf, half, bandHalf * 2);
  }
  if (right) {
    g.fillRect(cx, cy - bandHalf, half, bandHalf * 2);
  }
  if (links.up) {
    g.fillRect(cx - bandHalf, y, bandHalf * 2, half);
  }
  if (links.down) {
    g.fillRect(cx - bandHalf, cy, bandHalf * 2, half);
  }

  // 枕木(帯に対して直交する短い木材を等間隔に並べる)
  const sleeperStep = 5;
  g.fillStyle(sleeper, 1);
  if (left || right) {
    const from = left ? x : cx - bandHalf;
    const to = right ? x + size : cx + bandHalf;
    for (let sx = from + 1; sx < to - 1; sx += sleeperStep) {
      g.fillRect(sx, cy - bandHalf * 0.8, 2, bandHalf * 1.6);
    }
  }
  if (links.up || links.down) {
    const from = links.up ? y : cy - bandHalf;
    const to = links.down ? y + size : cy + bandHalf;
    for (let sy = from + 1; sy < to - 1; sy += sleeperStep) {
      g.fillRect(cx - bandHalf * 0.8, sy, bandHalf * 1.6, 2);
    }
  }

  // レール(枕木の上に光る 2 本の鋼)
  g.lineStyle(1.5, rail, 0.95);
  if (left) {
    g.lineBetween(x, cy - railHalf, cx, cy - railHalf);
    g.lineBetween(x, cy + railHalf, cx, cy + railHalf);
  }
  if (right) {
    g.lineBetween(cx, cy - railHalf, x + size, cy - railHalf);
    g.lineBetween(cx, cy + railHalf, x + size, cy + railHalf);
  }
  if (links.up) {
    g.lineBetween(cx - railHalf, y, cx - railHalf, cy);
    g.lineBetween(cx + railHalf, y, cx + railHalf, cy);
  }
  if (links.down) {
    g.lineBetween(cx - railHalf, cy, cx - railHalf, y + size);
    g.lineBetween(cx + railHalf, cy, cx + railHalf, y + size);
  }
}

/**
 * 建物の屋上などに所有者色の旗(ポール＋ペナント)を描く。
 * ownerColor 省略時は中立を表す淡色にする。
 */
function drawOwnerFlag(
  ctx: TerrainDecorationContext,
  poleX: number,
  baseY: number,
  topY: number,
  flagSize = 8,
): void {
  const { graphics: g } = ctx;
  const color = ctx.ownerColor ?? 0xdddddd;
  g.lineStyle(1.5, 0x30303a, 1);
  g.lineBetween(poleX, baseY, poleX, topY);
  g.fillStyle(color, 1);
  g.fillTriangle(
    poleX,
    topY,
    poleX,
    topY + flagSize * 0.7,
    poleX + flagSize,
    topY + flagSize * 0.35,
  );
}

/** 窓の格子を建物の面に描く */
function drawWindows(
  ctx: TerrainDecorationContext,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: number,
): void {
  const { graphics: g } = ctx;
  const win = 2.5;
  const gapX = 5;
  const gapY = 6;
  g.fillStyle(color, 1);
  for (let wy = top + 3; wy <= bottom - win - 1; wy += gapY) {
    for (let wx = left + 3; wx <= right - win - 1; wx += gapX) {
      g.fillRect(wx, wy, win, win);
    }
  }
}

/** 都市: 高さの違うビルが並ぶ小さなスカイラインを描く */
function drawCity(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size } = ctx;
  const body = 0xc4c8d2;
  const shade = 0x9297a4;
  const lit = 0xf2d06b;
  const ground = y + size * 0.86;

  // [左, 上端, 右] の順で高さ違いのビルを 3 棟
  const buildings = [
    { l: 0.14, t: 0.34, r: 0.36 },
    { l: 0.4, t: 0.16, r: 0.64 },
    { l: 0.66, t: 0.46, r: 0.86 },
  ];
  for (const b of buildings) {
    const left = x + size * b.l;
    const right = x + size * b.r;
    const top = y + size * b.t;
    g.fillStyle(body, 1);
    g.fillRect(left, top, right - left, ground - top);
    // 右端に陰を落として立体感を出す
    g.fillStyle(shade, 1);
    g.fillRect(right - 3, top, 3, ground - top);
    drawWindows(ctx, left, top, right - 3, ground, lit);
  }

  // 最も高い中央ビルの屋上に所有者旗
  const flagX = x + size * 0.52;
  drawOwnerFlag(ctx, flagX, y + size * 0.16, y + size * 0.04);
}

/**
 * 研究所: ドーム屋根の研究棟とアンテナ・実験用フラスコを描く。
 * 都市と同じ防御・移動コストを持つ拠点だが、一目で見分けられるよう
 * 白い建屋と丸いドームで「研究施設」らしいシルエットにする。
 */
function drawLaboratory(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size } = ctx;
  const wall = 0xdfe4ec;
  const shade = 0xa9b1c0;
  const dome = 0xb7cbe4;
  const glass = 0x6fa8d8;
  const ground = y + size * 0.86;

  // 研究棟(横に広い低層の建屋)
  const bodyL = x + size * 0.16;
  const bodyR = x + size * 0.84;
  const bodyT = y + size * 0.5;
  g.fillStyle(wall, 1);
  g.fillRect(bodyL, bodyT, bodyR - bodyL, ground - bodyT);
  g.fillStyle(shade, 1);
  g.fillRect(bodyR - 3, bodyT, 3, ground - bodyT);

  // 建屋の窓(横一列の実験室の明かり)
  g.fillStyle(glass, 1);
  for (let wx = bodyL + 3; wx <= bodyR - 6; wx += 6) {
    g.fillRect(wx, bodyT + size * 0.1, 3.5, 3.5);
  }

  // 中央のドーム屋根(観測ドーム)
  const domeCx = x + size * 0.5;
  const domeR = size * 0.2;
  g.fillStyle(dome, 1);
  g.fillCircle(domeCx, bodyT, domeR);
  // ドームの下半分は建屋に隠れる(建屋の色で塗りつぶして半球に見せる)
  g.fillStyle(wall, 1);
  g.fillRect(domeCx - domeR, bodyT, domeR * 2, domeR);
  // ドームのスリット
  g.lineStyle(1.5, shade, 1);
  g.lineBetween(domeCx, bodyT - domeR, domeCx, bodyT);

  // 右手のアンテナ(研究施設の目印)
  g.lineStyle(1.5, 0x4a505c, 1);
  g.lineBetween(x + size * 0.76, bodyT, x + size * 0.76, y + size * 0.28);
  g.lineStyle(1, 0x4a505c, 1);
  g.lineBetween(x + size * 0.7, y + size * 0.32, x + size * 0.82, y + size * 0.32);

  // 左上に所有者旗
  drawOwnerFlag(ctx, x + size * 0.24, bodyT, y + size * 0.22);
}

/** 工場: 煙突・のこぎり屋根の工場棟・煙を描く */
function drawFactory(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size } = ctx;
  const hall = 0x9aa0aa;
  const roof = 0x6e737d;
  const stack = 0x8a5a4a;
  const smoke = 0xd8d8e0;
  const ground = y + size * 0.84;

  // 煙突(左)
  const stackL = x + size * 0.16;
  const stackR = x + size * 0.28;
  g.fillStyle(stack, 1);
  g.fillRect(stackL, y + size * 0.2, stackR - stackL, ground - y - size * 0.2);
  g.fillStyle(0xb0483a, 1);
  g.fillRect(stackL, y + size * 0.2, stackR - stackL, 3);

  // 煙(立ちのぼる 3 つの丸)
  g.fillStyle(smoke, 0.85);
  const smokeX = (stackL + stackR) / 2;
  g.fillCircle(smokeX, y + size * 0.14, 3.5);
  g.fillCircle(smokeX + 3, y + size * 0.08, 3);
  g.fillCircle(smokeX + 7, y + size * 0.04, 2.5);

  // 工場棟(右)
  const hallL = x + size * 0.34;
  const hallR = x + size * 0.86;
  const hallT = y + size * 0.46;
  g.fillStyle(hall, 1);
  g.fillRect(hallL, hallT, hallR - hallL, ground - hallT);

  // のこぎり屋根(直角三角形を横に並べる)
  g.fillStyle(roof, 1);
  const teeth = 3;
  const toothW = (hallR - hallL) / teeth;
  for (let i = 0; i < teeth; i++) {
    const tx = hallL + i * toothW;
    g.fillTriangle(tx, hallT, tx + toothW, hallT, tx + toothW, hallT - size * 0.12);
  }

  // 出入口
  g.fillStyle(0x4a4e57, 1);
  g.fillRect(x + size * 0.54, ground - size * 0.16, size * 0.12, size * 0.16);

  // 工場棟の右上に所有者旗
  drawOwnerFlag(ctx, hallR - 2, hallT, hallT - size * 0.16);
}

/** 空港: 舗装された滑走路と中央の破線、小さな管制塔・所有者旗を描く */
function drawAirport(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size } = ctx;
  const apron = 0x596570;
  const runway = 0x424c56;
  const marking = 0xe6ecf2;
  const tower = 0xb9c1cb;
  const towerShade = 0x8c95a1;

  // エプロン(舗装面)
  g.fillStyle(apron, 1);
  g.fillRect(x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84);

  // 斜めの滑走路(左下→右上)
  const rw = size * 0.16;
  g.fillStyle(runway, 1);
  g.fillTriangle(
    x + size * 0.14,
    y + size * 0.82,
    x + size * 0.14 + rw,
    y + size * 0.82,
    x + size * 0.86,
    y + size * 0.14,
  );
  g.fillTriangle(
    x + size * 0.14 + rw,
    y + size * 0.82,
    x + size * 0.86,
    y + size * 0.14,
    x + size * 0.86 - rw,
    y + size * 0.14,
  );

  // 滑走路の中央破線
  g.lineStyle(1.5, marking, 0.9);
  dashLine(
    g,
    x + size * (0.14 + rw / size / 2),
    y + size * 0.82,
    x + size * (0.86 - rw / size / 2),
    y + size * 0.14,
  );

  // 管制塔(右下)
  const towerX = x + size * 0.66;
  const towerY = y + size * 0.6;
  g.fillStyle(tower, 1);
  g.fillRect(towerX, towerY, size * 0.12, size * 0.24);
  g.fillStyle(towerShade, 1);
  g.fillRect(towerX + size * 0.09, towerY, size * 0.03, size * 0.24);
  // 塔の展望室
  g.fillStyle(0x2f3a44, 1);
  g.fillRect(towerX - size * 0.02, towerY - size * 0.05, size * 0.16, size * 0.06);

  // 左上に所有者旗
  drawOwnerFlag(ctx, x + size * 0.22, y + size * 0.4, y + size * 0.14);
}

/**
 * 港: 岸壁(下半分は水面)と桟橋・クレーン・係留柱、所有者旗を描く。
 * 上半分を陸(岸壁)、下半分を水面にして「陸と海の境目の拠点」だと一目で分かるようにする。
 */
function drawPort(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size, col, row } = ctx;
  const quay = 0x8d8f93;
  const quayShade = 0x6f7176;
  const water = 0x2f6aa0;
  const foam = 0x9fd0ec;
  const crane = 0xd8b45a;
  const bollard = 0x3a3f46;

  // 下半分の水面(海と同じ青)
  g.fillStyle(water, 1);
  g.fillRect(x, y + size * 0.5, size, size * 0.5);
  // 水面のさざ波
  for (let i = 0; i < 3; i++) {
    const py = y + size * (0.62 + 0.3 * hash01(col, row, i + 11));
    const px = x + size * (0.08 + 0.4 * hash01(col, row, i + 21));
    const len = size * (0.16 + 0.16 * hash01(col, row, i + 31));
    g.lineStyle(1.5, foam, 0.8);
    g.lineBetween(px, py, px + len, py);
  }

  // 上半分の岸壁(舗装面)と、水際のコンクリート縁
  g.fillStyle(quay, 1);
  g.fillRect(x, y, size, size * 0.5);
  g.fillStyle(quayShade, 1);
  g.fillRect(x, y + size * 0.46, size, size * 0.06);

  // 水面へ突き出す桟橋
  g.fillStyle(quay, 1);
  g.fillRect(x + size * 0.56, y + size * 0.5, size * 0.16, size * 0.34);
  // 桟橋の脚
  g.lineStyle(1.5, quayShade, 1);
  g.lineBetween(x + size * 0.6, y + size * 0.84, x + size * 0.6, y + size * 0.92);
  g.lineBetween(x + size * 0.68, y + size * 0.84, x + size * 0.68, y + size * 0.92);

  // 岸壁のクレーン(縦の支柱と海側へ伸びるジブ)
  g.lineStyle(2, crane, 1);
  g.lineBetween(x + size * 0.28, y + size * 0.44, x + size * 0.28, y + size * 0.14);
  g.lineBetween(x + size * 0.28, y + size * 0.16, x + size * 0.6, y + size * 0.24);
  // ジブから下がる吊りワイヤ
  g.lineStyle(1, crane, 0.9);
  g.lineBetween(x + size * 0.56, y + size * 0.23, x + size * 0.56, y + size * 0.38);

  // 水際の係留柱(ボラード)
  g.fillStyle(bollard, 1);
  g.fillRect(x + size * 0.14, y + size * 0.38, size * 0.06, size * 0.08);
  g.fillRect(x + size * 0.84, y + size * 0.38, size * 0.06, size * 0.08);

  // 左上に所有者旗
  drawOwnerFlag(ctx, x + size * 0.72, y + size * 0.4, y + size * 0.08);
}

/**
 * 駅: 三角屋根のプラットホーム上屋と、その手前を通る線路を描く。
 * 工場と同じ性能の拠点だが、列車砲を生産できる唯一の拠点なので、
 * 一目で分かるよう赤煉瓦の駅舎とホームの線路で表す。
 */
function drawStation(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size } = ctx;
  const wall = 0xc9a08a;
  const shade = 0x9b6f5b;
  const roof = 0x7a4a3c;
  const glass = 0xf2d9a0;
  const platform = 0xb9b2a4;
  const rail = 0xd6d2c4;
  const sleeper = 0x5a4632;
  const ground = y + size * 0.62;

  // 駅舎(左寄りの平屋)
  const bodyL = x + size * 0.14;
  const bodyR = x + size * 0.7;
  const bodyT = y + size * 0.28;
  g.fillStyle(wall, 1);
  g.fillRect(bodyL, bodyT, bodyR - bodyL, ground - bodyT);
  g.fillStyle(shade, 1);
  g.fillRect(bodyR - 3, bodyT, 3, ground - bodyT);

  // 三角屋根(駅舎の上に少し張り出させる)
  g.fillStyle(roof, 1);
  g.fillTriangle(
    bodyL - size * 0.06,
    bodyT,
    bodyR + size * 0.06,
    bodyT,
    (bodyL + bodyR) / 2,
    y + size * 0.1,
  );

  // 待合室の明かり(横一列の窓)
  g.fillStyle(glass, 1);
  for (let wx = bodyL + 3; wx <= bodyR - 6; wx += 7) {
    g.fillRect(wx, bodyT + size * 0.08, 4, 4);
  }

  // 駅舎の前のプラットホーム
  g.fillStyle(platform, 1);
  g.fillRect(x, ground, size, size * 0.1);

  // ホームに沿って走る線路(枕木 + レール 2 本)
  const trackY = y + size * 0.84;
  g.fillStyle(sleeper, 1);
  for (let sx = x + 2; sx < x + size - 2; sx += 5) {
    g.fillRect(sx, trackY - size * 0.07, 2, size * 0.14);
  }
  g.lineStyle(1.5, rail, 0.95);
  g.lineBetween(x, trackY - size * 0.04, x + size, trackY - size * 0.04);
  g.lineBetween(x, trackY + size * 0.04, x + size, trackY + size * 0.04);

  // 屋根の頂に所有者旗
  drawOwnerFlag(ctx, (bodyL + bodyR) / 2, y + size * 0.1, y + size * 0.02);
}

/** 本拠地: 天守を持つ城郭と大きめの所有者旗を描く */
function drawHeadquarters(ctx: TerrainDecorationContext): void {
  const { graphics: g, x, y, size } = ctx;
  const stone = 0xcfc3b0;
  const shade = 0xa89c88;
  const ground = y + size * 0.86;

  // 本体(横に広い城壁)
  const bodyL = x + size * 0.16;
  const bodyR = x + size * 0.84;
  const bodyT = y + size * 0.44;
  g.fillStyle(stone, 1);
  g.fillRect(bodyL, bodyT, bodyR - bodyL, ground - bodyT);
  g.fillStyle(shade, 1);
  g.fillRect(bodyR - 3, bodyT, 3, ground - bodyT);

  // 城壁上部の狭間(小さな凸を並べる)
  g.fillStyle(stone, 1);
  for (let mx = bodyL; mx < bodyR - 2; mx += size * 0.14) {
    g.fillRect(mx, bodyT - size * 0.06, size * 0.08, size * 0.06);
  }

  // 中央の天守(ひときわ高い塔)
  const towerL = x + size * 0.4;
  const towerR = x + size * 0.6;
  const towerT = y + size * 0.22;
  g.fillStyle(stone, 1);
  g.fillRect(towerL, towerT, towerR - towerL, bodyT - towerT + 2);
  g.fillStyle(shade, 1);
  g.fillRect(towerR - 2, towerT, 2, bodyT - towerT + 2);

  // 城門
  g.fillStyle(0x5a4632, 1);
  g.fillRect(x + size * 0.44, ground - size * 0.18, size * 0.12, size * 0.18);

  // 天守の頂に大きめの所有者旗
  drawOwnerFlag(ctx, (towerL + towerR) / 2, towerT, y + size * 0.06, 11);
}

/**
 * 地形種別に応じた装飾を描く。
 * 自然地形(平地・森・山・道路・線路・海・川・海岸)に加え、
 * 拠点(都市・研究所・工場・空港・港・駅・本拠地)も建物のシルエットと所有者旗で表現する。
 */
export function drawTerrainDecoration(
  terrainType: TerrainType,
  ctx: TerrainDecorationContext,
): void {
  switch (terrainType) {
    case 'plain':
      drawPlain(ctx);
      break;
    case 'forest':
      drawForest(ctx);
      break;
    case 'mountain':
      drawMountain(ctx);
      break;
    case 'road':
      drawRoad(ctx);
      break;
    case 'railway':
      drawRailway(ctx);
      break;
    case 'sea':
      drawSea(ctx);
      break;
    case 'river':
      drawRiver(ctx);
      break;
    case 'beach':
      drawBeach(ctx);
      break;
    case 'city':
      drawCity(ctx);
      break;
    case 'laboratory':
      drawLaboratory(ctx);
      break;
    case 'factory':
      drawFactory(ctx);
      break;
    case 'airport':
      drawAirport(ctx);
      break;
    case 'port':
      drawPort(ctx);
      break;
    case 'station':
      drawStation(ctx);
      break;
    case 'headquarters':
      drawHeadquarters(ctx);
      break;
    default:
      break;
  }
}
