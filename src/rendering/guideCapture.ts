// ゲーム説明(GuideScene)の各スライドに載せる「キャプチャ」を描く。
// 本編と同じ方針でグラフィックはすべてコードで描き起こし(外部画像は持たない)、
// 実際のゲーム画面を模した小さな盤面を手続き的に組み立てる。
// 盤面の地形色は TERRAIN_DATA、ユニットのシルエットは drawUnitIcon を共用して、
// 本編の見た目とそろえている。ここは描画専用で、ゲームロジックには依存しない。

import Phaser from 'phaser';

import type { TerrainType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';
import { TERRAIN_DATA } from '@/data/terrainData';
import type { GuideCaptureKind } from '@/data/guideData';
import { drawUnitIcon } from '@/rendering/unitIcon';

/** キャプチャを描く領域(左上原点のピクセル矩形) */
export interface GuideCaptureArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** ミニ盤面のマス数(全キャプチャ共通) */
const GRID_COLS = 5;
const GRID_ROWS = 4;

/** 本編とそろえた表示色 */
const COLOR = {
  gridLine: 0x0d0d16,
  moveTile: 0x3a7bd5, // 移動範囲(青)
  selected: 0xffd479, // 選択・占領中の強調(黄)
  attack: 0xff5a5a, // 攻撃対象(赤枠)
  playerToken: 0x2f5fae,
  enemyToken: 0xae2f2f,
  playerFlag: 0x3a7bd5,
  enemyFlag: 0xd53a3a,
  tokenStroke: 0xffffff,
  icon: 0xffffff,
} as const;

/** キャプチャに登場するのは自軍・敵軍の 2 勢力のみ(中立の駒は置かない) */
type Faction = 'player' | 'enemy';

/** 軍勢ごとのトークン色 */
const TOKEN_COLOR: Record<Faction, number> = {
  player: COLOR.playerToken,
  enemy: COLOR.enemyToken,
};

/** 軍勢ごとの所有旗の色 */
const FLAG_COLOR: Record<Faction, number> = {
  player: COLOR.playerFlag,
  enemy: COLOR.enemyFlag,
};

/** レイアウト文字 → 地形種別の対応表 */
const TERRAIN_CODE: Readonly<Record<string, TerrainType>> = {
  '.': 'plain',
  f: 'forest',
  m: 'mountain',
  '=': 'road',
  '~': 'sea',
  c: 'city',
  t: 'factory',
  a: 'airport',
  H: 'headquarters',
};

/** マスの位置 */
type Cell = readonly [col: number, row: number];

/** 盤上に置くユニット */
interface MiniUnit {
  readonly at: Cell;
  readonly type: UnitType;
  readonly army: Faction;
}

/** 占領拠点に立てる所有旗 */
interface MiniOwner {
  readonly at: Cell;
  readonly army: Faction;
}

/** 1 枚のキャプチャを構成する盤面データ */
interface MiniScene {
  /** GRID_ROWS 行ぶんの地形レイアウト(各行 GRID_COLS 文字) */
  readonly layout: readonly string[];
  readonly units?: readonly MiniUnit[];
  readonly owners?: readonly MiniOwner[];
  /** 移動範囲(青塗り)のマス */
  readonly moveTiles?: readonly Cell[];
  /** 選択・注目マス(黄枠) */
  readonly selected?: Cell;
  /** 攻撃対象マス(赤枠) */
  readonly attackTarget?: Cell;
}

/** 描画に使う盤面の寸法(領域内で中央寄せしたグリッド) */
interface Grid {
  readonly tile: number;
  readonly originX: number;
  readonly originY: number;
}

/** 領域内に収まる正方グリッドの寸法を求め、中央へ寄せる */
function computeGrid(area: GuideCaptureArea): Grid {
  const tile = Math.floor(Math.min(area.width / GRID_COLS, area.height / GRID_ROWS));
  const boardWidth = tile * GRID_COLS;
  const boardHeight = tile * GRID_ROWS;
  return {
    tile,
    originX: Math.round(area.x + (area.width - boardWidth) / 2),
    originY: Math.round(area.y + (area.height - boardHeight) / 2),
  };
}

/** マスの左上ピクセル座標 */
function cellLeftTop(grid: Grid, [col, row]: Cell): { x: number; y: number } {
  return { x: grid.originX + col * grid.tile, y: grid.originY + row * grid.tile };
}

/** マス中心のピクセル座標 */
function cellCenter(grid: Grid, cell: Cell): { x: number; y: number } {
  const { x, y } = cellLeftTop(grid, cell);
  return { x: x + grid.tile / 2, y: y + grid.tile / 2 };
}

/** 地形レイアウトを塗り、細いグリッド線を引く */
function drawTerrain(
  g: Phaser.GameObjects.Graphics,
  grid: Grid,
  layout: readonly string[],
): void {
  for (let row = 0; row < GRID_ROWS; row++) {
    const line = layout[row] ?? '';
    for (let col = 0; col < GRID_COLS; col++) {
      const code = line[col] ?? '.';
      const terrain = TERRAIN_CODE[code] ?? 'plain';
      const { x, y } = cellLeftTop(grid, [col, row]);
      g.fillStyle(TERRAIN_DATA[terrain].color, 1);
      g.fillRect(x, y, grid.tile, grid.tile);
      g.lineStyle(1, COLOR.gridLine, 0.5);
      g.strokeRect(x, y, grid.tile, grid.tile);
    }
  }
}

/** 移動範囲(青)を半透明で塗る */
function drawMoveTiles(
  g: Phaser.GameObjects.Graphics,
  grid: Grid,
  tiles: readonly Cell[],
): void {
  g.fillStyle(COLOR.moveTile, 0.4);
  for (const cell of tiles) {
    const { x, y } = cellLeftTop(grid, cell);
    g.fillRect(x, y, grid.tile, grid.tile);
  }
}

/** 指定マスを枠で囲む(選択=黄、攻撃対象=赤 など) */
function strokeCell(
  g: Phaser.GameObjects.Graphics,
  grid: Grid,
  cell: Cell,
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
  grid: Grid,
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
function drawUnit(g: Phaser.GameObjects.Graphics, grid: Grid, unit: MiniUnit): void {
  const { x, y } = cellCenter(grid, unit.at);
  const radius = grid.tile * 0.32;
  g.fillStyle(TOKEN_COLOR[unit.army], 1);
  g.fillCircle(x, y, radius);
  g.lineStyle(Math.max(1, radius * 0.14), COLOR.tokenStroke, 0.9);
  g.strokeCircle(x, y, radius);
  drawUnitIcon(unit.type, {
    graphics: g,
    cx: x,
    cy: y,
    radius,
    color: COLOR.icon,
    alpha: 1,
  });
}

/** スライド種別ごとのミニ盤面定義 */
const SCENES: Readonly<Record<GuideCaptureKind, MiniScene>> = {
  objective: {
    layout: ['H.f..', '.==..', '..==f', 'f..cH'],
    owners: [
      { at: [0, 0], army: 'player' },
      { at: [4, 3], army: 'enemy' },
    ],
    units: [
      { at: [1, 1], type: 'tank', army: 'player' },
      { at: [3, 2], type: 'tank', army: 'enemy' },
    ],
    attackTarget: [4, 3],
  },
  income: {
    layout: ['H.c..', '.t...', '..f..', '..c.H'],
    owners: [
      { at: [0, 0], army: 'player' },
      { at: [1, 1], army: 'player' },
      { at: [2, 0], army: 'player' },
    ],
    units: [{ at: [1, 1], type: 'infantry', army: 'player' }],
    selected: [1, 1],
  },
  move: {
    layout: ['..f..', '.....', '..m..', 'f...c'],
    units: [{ at: [1, 1], type: 'tank', army: 'player' }],
    moveTiles: [
      [1, 0],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [0, 2],
    ],
    selected: [1, 1],
  },
  attack: {
    layout: ['.....', '..f..', '.....', 'f...c'],
    units: [
      { at: [1, 2], type: 'tank', army: 'player' },
      { at: [2, 2], type: 'tank', army: 'enemy' },
    ],
    selected: [1, 2],
    attackTarget: [2, 2],
  },
  capture: {
    layout: ['.....', '..c..', '.....', 'H...c'],
    owners: [{ at: [0, 3], army: 'player' }],
    units: [{ at: [2, 1], type: 'infantry', army: 'player' }],
    selected: [2, 1],
  },
  endTurn: {
    layout: ['H.f..', '.==..', '..f..', '...cH'],
    owners: [
      { at: [0, 0], army: 'player' },
      { at: [4, 3], army: 'enemy' },
    ],
    units: [
      { at: [1, 1], type: 'infantry', army: 'player' },
      { at: [3, 2], type: 'tank', army: 'enemy' },
    ],
  },
};

/** キャプチャ内に置く小さな吹き出しラベル(戦闘予測・収入表示など) */
interface Badge {
  /** ラベルを重ねる基準マス */
  readonly at: Cell;
  readonly text: string;
  /** 文字色 */
  readonly color: string;
  /** 枠・下地の色 */
  readonly fill: number;
}

/** スライド種別ごとに、盤面へ重ねる説明ラベル */
const BADGES: Readonly<Record<GuideCaptureKind, readonly Badge[]>> = {
  objective: [{ at: [4, 3], text: '敵本拠地を占領', color: '#ffd479', fill: 0x3a1c1c }],
  income: [{ at: [1, 1], text: '+資金 → 生産', color: '#ffe08a', fill: 0x1c2a3a }],
  move: [{ at: [3, 1], text: '移動範囲', color: '#cfe4ff', fill: 0x1c2a44 }],
  attack: [
    { at: [2, 2], text: '戦闘予測 -6 / 反撃-2', color: '#ffd0d0', fill: 0x3a1c1c },
  ],
  capture: [{ at: [2, 1], text: '占領 20 → 10', color: '#ffe08a', fill: 0x2a2a1c }],
  endTurn: [
    { at: [2, 0], text: 'ターン終了 → 敵の番', color: '#cfe4ff', fill: 0x1c2436 },
  ],
};

/**
 * 指定スライドのキャプチャを area 内に描く。
 * 生成した Phaser オブジェクトを配列で返すので、スライド切り替え時に呼び出し側でまとめて破棄する。
 */
export function drawGuideCapture(
  scene: Phaser.Scene,
  kind: GuideCaptureKind,
  area: GuideCaptureArea,
): Phaser.GameObjects.GameObject[] {
  const objects: Phaser.GameObjects.GameObject[] = [];
  const grid = computeGrid(area);
  const def = SCENES[kind];

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
    strokeCell(g, grid, def.selected, COLOR.selected);
  }
  if (def.attackTarget) {
    strokeCell(g, grid, def.attackTarget, COLOR.attack);
  }

  // 盤面の外周に枠を描いて、ゲーム画面らしく囲う
  g.lineStyle(2, 0x3a4a6a, 1);
  g.strokeRect(grid.originX, grid.originY, grid.tile * GRID_COLS, grid.tile * GRID_ROWS);

  for (const badge of BADGES[kind]) {
    objects.push(...drawBadge(scene, grid, badge));
  }

  return objects;
}

/** 盤面上の吹き出しラベルを作る(下地の角丸パネル + テキスト) */
function drawBadge(
  scene: Phaser.Scene,
  grid: Grid,
  badge: Badge,
): Phaser.GameObjects.GameObject[] {
  const anchor = cellCenter(grid, badge.at);
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
  const maxX = grid.originX + grid.tile * GRID_COLS - half;
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
