// ゲーム画面を模した「ミニ盤面」を描く共通ルーチン。
// ゲーム説明(GuideScene)のキャプチャと、エンディング(EndingScene)のカットで共用する。
// 本編と同じ方針でグラフィックはすべてコードで描き起こし(外部画像は持たない)、
// 地形色は TERRAIN_DATA、ユニットのシルエットは drawUnitIcon を共用して見た目をそろえる。
// ここは描画専用で、ゲームロジックには依存しない。

import Phaser from 'phaser';

import type { TerrainType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';
import { TERRAIN_DATA } from '@/data/terrainData';
import { drawUnitIcon } from '@/rendering/unitIcon';

/** ミニ盤面を描く領域(左上原点のピクセル矩形) */
export interface MiniBoardArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 本編とそろえた表示色 */
export const MINI_COLOR = {
  gridLine: 0x0d0d16,
  moveTile: 0x6fb7ff, // 移動範囲(本編と同じ明るい青)
  selected: 0xffd479, // 選択・占領中の強調(黄)
  attack: 0xff5a5a, // 攻撃対象(赤枠)
  playerToken: 0x2f5fae,
  enemyToken: 0xae2f2f,
  playerFlag: 0x3a7bd5,
  enemyFlag: 0xd53a3a,
  tokenStroke: 0xffffff,
  icon: 0xffffff,
  frame: 0x3a4a6a,
} as const;

/** ミニ盤面に登場するのは自軍・敵軍の 2 勢力のみ(中立の駒は置かない) */
export type MiniFaction = 'player' | 'enemy';

/** 軍勢ごとのトークン色 */
const TOKEN_COLOR: Record<MiniFaction, number> = {
  player: MINI_COLOR.playerToken,
  enemy: MINI_COLOR.enemyToken,
};

/** 軍勢ごとの所有旗の色 */
const FLAG_COLOR: Record<MiniFaction, number> = {
  player: MINI_COLOR.playerFlag,
  enemy: MINI_COLOR.enemyFlag,
};

/** レイアウト文字 → 地形種別の対応表 */
const TERRAIN_CODE: Readonly<Record<string, TerrainType>> = {
  '.': 'plain',
  f: 'forest',
  m: 'mountain',
  '=': 'road',
  '~': 'sea',
  b: 'beach',
  c: 'city',
  t: 'factory',
  a: 'airport',
  p: 'port',
  H: 'headquarters',
};

/** マスの位置 */
export type MiniCell = readonly [col: number, row: number];

/** 盤上に置くユニット */
export interface MiniUnit {
  readonly at: MiniCell;
  readonly type: UnitType;
  readonly army: MiniFaction;
}

/** 占領拠点に立てる所有旗 */
export interface MiniOwner {
  readonly at: MiniCell;
  readonly army: MiniFaction;
}

/** 盤面上の吹き出しラベル(戦闘予測・収入表示など) */
export interface MiniBadge {
  /** ラベルを重ねる基準マス */
  readonly at: MiniCell;
  readonly text: string;
  /** 文字色 */
  readonly color: string;
  /** 枠・下地の色 */
  readonly fill: number;
}

/** 1 枚ぶんのミニ盤面データ */
export interface MiniScene {
  /** 地形レイアウト(1 要素 = 1 行。マス数は行数・行の長さから決まる) */
  readonly layout: readonly string[];
  readonly units?: readonly MiniUnit[];
  readonly owners?: readonly MiniOwner[];
  /** 移動範囲(青塗り)のマス */
  readonly moveTiles?: readonly MiniCell[];
  /** 選択・注目マス(黄枠) */
  readonly selected?: MiniCell;
  /** 攻撃対象マス(赤枠) */
  readonly attackTarget?: MiniCell;
  /** 盤面へ重ねる説明ラベル */
  readonly badges?: readonly MiniBadge[];
}

/** 描画に使う盤面の寸法(領域内で中央寄せしたグリッド) */
export interface MiniGrid {
  readonly tile: number;
  readonly originX: number;
  readonly originY: number;
  readonly cols: number;
  readonly rows: number;
}

/** 盤面のマス数(レイアウトの行数と最長行から求める) */
function boardSize(layout: readonly string[]): { cols: number; rows: number } {
  const rows = layout.length;
  const cols = layout.reduce((max, line) => Math.max(max, line.length), 0);
  return { cols: Math.max(cols, 1), rows: Math.max(rows, 1) };
}

/** 領域内に収まる正方グリッドの寸法を求め、中央へ寄せる */
export function computeMiniGrid(
  area: MiniBoardArea,
  layout: readonly string[],
): MiniGrid {
  const { cols, rows } = boardSize(layout);
  const tile = Math.floor(Math.min(area.width / cols, area.height / rows));
  return {
    tile,
    originX: Math.round(area.x + (area.width - tile * cols) / 2),
    originY: Math.round(area.y + (area.height - tile * rows) / 2),
    cols,
    rows,
  };
}

/** マスの左上ピクセル座標 */
function cellLeftTop(grid: MiniGrid, [col, row]: MiniCell): { x: number; y: number } {
  return { x: grid.originX + col * grid.tile, y: grid.originY + row * grid.tile };
}

/** マス中心のピクセル座標 */
export function miniCellCenter(grid: MiniGrid, cell: MiniCell): { x: number; y: number } {
  const { x, y } = cellLeftTop(grid, cell);
  return { x: x + grid.tile / 2, y: y + grid.tile / 2 };
}

/** 地形レイアウトを塗り、細いグリッド線を引く */
function drawTerrain(
  g: Phaser.GameObjects.Graphics,
  grid: MiniGrid,
  layout: readonly string[],
): void {
  for (let row = 0; row < grid.rows; row++) {
    const line = layout[row] ?? '';
    for (let col = 0; col < grid.cols; col++) {
      const code = line[col] ?? '.';
      const terrain = TERRAIN_CODE[code] ?? 'plain';
      const { x, y } = cellLeftTop(grid, [col, row]);
      g.fillStyle(TERRAIN_DATA[terrain].color, 1);
      g.fillRect(x, y, grid.tile, grid.tile);
      g.lineStyle(1, MINI_COLOR.gridLine, 0.5);
      g.strokeRect(x, y, grid.tile, grid.tile);
    }
  }
}

/** 移動範囲(青)を半透明で塗る */
function drawMoveTiles(
  g: Phaser.GameObjects.Graphics,
  grid: MiniGrid,
  tiles: readonly MiniCell[],
): void {
  g.fillStyle(MINI_COLOR.moveTile, 0.4);
  for (const cell of tiles) {
    const { x, y } = cellLeftTop(grid, cell);
    g.fillRect(x, y, grid.tile, grid.tile);
  }
}

/** 指定マスを枠で囲む(選択=黄、攻撃対象=赤 など) */
function strokeCell(
  g: Phaser.GameObjects.Graphics,
  grid: MiniGrid,
  cell: MiniCell,
  color: number,
): void {
  const { x, y } = cellLeftTop(grid, cell);
  const inset = Math.max(2, grid.tile * 0.06);
  g.lineStyle(Math.max(2, grid.tile * 0.08), color, 0.95);
  g.strokeRect(x + inset, y + inset, grid.tile - inset * 2, grid.tile - inset * 2);
}

/** 占領拠点の隅に、所有軍を示す小さな旗を立てる */
function drawOwnerFlag(
  g: Phaser.GameObjects.Graphics,
  grid: MiniGrid,
  owner: MiniOwner,
): void {
  const { x, y } = cellLeftTop(grid, owner.at);
  const poleX = x + grid.tile * 0.22;
  const top = y + grid.tile * 0.14;
  const bottom = y + grid.tile * 0.58;
  // 旗竿
  g.lineStyle(Math.max(1, grid.tile * 0.04), 0xffffff, 0.9);
  g.lineBetween(poleX, top, poleX, bottom);
  // 旗(三角)
  g.fillStyle(FLAG_COLOR[owner.army], 1);
  g.fillTriangle(
    poleX,
    top,
    poleX + grid.tile * 0.3,
    top + grid.tile * 0.12,
    poleX,
    top + grid.tile * 0.24,
  );
}

/** ユニット 1 体(軍色トークン + シルエット)を描く */
function drawUnit(g: Phaser.GameObjects.Graphics, grid: MiniGrid, unit: MiniUnit): void {
  const { x, y } = miniCellCenter(grid, unit.at);
  const radius = grid.tile * 0.32;
  g.fillStyle(TOKEN_COLOR[unit.army], 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(Math.max(1, radius * 0.14), MINI_COLOR.tokenStroke, 0.9);
  g.strokeCircle(x, y, radius);
  drawUnitIcon(unit.type, {
    graphics: g,
    cx: x,
    cy: y,
    radius,
    color: MINI_COLOR.icon,
    alpha: 1,
  });
}

/**
 * ミニ盤面を area 内へ描く。
 * 生成した Phaser オブジェクトを配列で返すので、切り替え時に呼び出し側でまとめて破棄する。
 */
export function drawMiniBoard(
  scene: Phaser.Scene,
  def: MiniScene,
  area: MiniBoardArea,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const grid = computeMiniGrid(area, def.layout);

  const g = scene.add.graphics();
  objects.push(g);

  drawTerrain(g, grid, def.layout);
  if (def.moveTiles) {
    drawMoveTiles(g, grid, def.moveTiles);
  }
  for (const owner of def.owners ?? []) {
    drawOwnerFlag(g, grid, owner);
  }
  for (const unit of def.units ?? []) {
    drawUnit(g, grid, unit);
  }
  if (def.selected) {
    strokeCell(g, grid, def.selected, MINI_COLOR.selected);
  }
  if (def.attackTarget) {
    strokeCell(g, grid, def.attackTarget, MINI_COLOR.attack);
  }

  // 盤面の外周に枠を描いて、ゲーム画面らしく囲う
  g.lineStyle(2, MINI_COLOR.frame, 1);
  g.strokeRect(grid.originX, grid.originY, grid.tile * grid.cols, grid.tile * grid.rows);

  for (const badge of def.badges ?? []) {
    objects.push(...drawBadge(scene, grid, badge));
  }

  return objects;
}

/** 盤面上の吹き出しラベルを作る(下地の角丸パネル + テキスト) */
function drawBadge(
  scene: Phaser.Scene,
  grid: MiniGrid,
  badge: MiniBadge,
): Phaser.GameObjects.GameObject[] {
  const anchor = miniCellCenter(grid, badge.at);
  const label = scene.add
    .text(0, 0, badge.text, {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: badge.color,
      padding: { x: 6, y: 3 },
    })
    .setOrigin(0.5);
  // 基準マスの少し上に、盤面からはみ出さないよう置く
  const half = label.width / 2;
  const minX = grid.originX + half;
  const maxX = grid.originX + grid.tile * grid.cols - half;
  label.x = Phaser.Math.Clamp(anchor.x, minX, maxX);
  label.y = Math.max(grid.originY + label.height / 2, anchor.y - grid.tile * 0.75);

  const bg = scene.add.graphics();
  bg.fillStyle(badge.fill, 0.92);
  bg.fillRoundedRect(
    label.x - label.width / 2,
    label.y - label.height / 2,
    label.width,
    label.height,
    4,
  );
  bg.lineStyle(1, 0xffffff, 0.35);
  bg.strokeRoundedRect(
    label.x - label.width / 2,
    label.y - label.height / 2,
    label.width,
    label.height,
    4,
  );
  // 下地を先に、テキストを後ろに重ねる
  label.setDepth(1);
  return [bg, label];
}
