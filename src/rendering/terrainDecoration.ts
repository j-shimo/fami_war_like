// 地形マスの上にコードで模様を描き込み、単色の四角よりリッチに見せる。
// 外部画像アセットは使わず(グラフィックはすべてオリジナルとする方針)、
// Phaser の Graphics プリミティブだけで草・木・山・道路を描く。
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
  /** 道路の接続方向。terrainType が 'road' のときのみ使う */
  readonly roadLinks?: RoadLinks;
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
 * 地形種別に応じた装飾を描く。
 * 平地・森・山・道路のみ対応し、拠点(都市・工場・本拠地)は
 * 従来どおり枠と頭文字ラベルで表現するため何も描かない。
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
    default:
      break;
  }
}
