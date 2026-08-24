import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import {
  gridPosition,
  manhattanDistance,
  type GridPosition,
} from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { UnitManager } from '@/core/units/UnitManager';
import { RIDGE_MAP } from '@/data/maps/ridgeMap';
import { getTerrainData } from '@/data/terrainData';

/**
 * 中立都市の区分けに使う列。自軍まわりの中立都市は col 4 以西、
 * 取り合いの対象になる中央の中立都市は col 9〜10 に置いてある。
 */
const PLAYER_SIDE_MAX_COL = 4;

/** 生産拠点(工場・本拠地)の座標を軍ごとに集める。歩兵を出せる場所からの距離を測るために使う */
function productionBasesOf(map: MapManager, army: 'player' | 'enemy'): GridPosition[] {
  const bases: GridPosition[] = [];
  map.forEachTile((tile) => {
    if (tile.owner !== army) return;
    if (!getTerrainData(tile.terrainType).canProduce) return;
    bases.push(tile.position);
  });
  return bases;
}

/** 所有者ごとの占領可能拠点(座標と地形)を集める */
function basesOf(map: MapManager, owner: 'player' | 'enemy' | 'neutral') {
  const bases: { col: number; row: number; terrainType: string }[] = [];
  map.forEachTile((tile) => {
    if (tile.owner !== owner) return;
    if (!getTerrainData(tile.terrainType).canCapture) return;
    bases.push({ ...tile.position, terrainType: tile.terrainType });
  });
  return bases;
}

/** pos から bases のうち最も近いものまでのマンハッタン距離 */
function distanceToNearest(pos: GridPosition, bases: readonly GridPosition[]): number {
  return Math.min(...bases.map((base) => manhattanDistance(pos, base)));
}

/**
 * 指定した矩形(col/row の範囲)の中だけを通って、開始マス群から目的マス群へ
 * movementType のユニットが到達できるかを幅優先探索で判定する。
 * ルートごとの通行可否(森ルートは装輪車両を通さない、稜線は車両を通さない)の検証に使う。
 */
function canReachWithin(
  map: MapManager,
  movementType: MovementType,
  area: { colMin: number; colMax: number; rowMin: number; rowMax: number },
  isStart: (pos: GridPosition) => boolean,
  isGoal: (pos: GridPosition) => boolean,
): boolean {
  const visited = new Set<string>();
  const queue: GridPosition[] = [];
  const push = (pos: GridPosition): void => {
    const key = `${pos.col},${pos.row}`;
    if (visited.has(key)) return;
    if (map.getMoveCost(pos, movementType) === null) return;
    visited.add(key);
    queue.push(pos);
  };

  for (let row = area.rowMin; row <= area.rowMax; row += 1) {
    for (let col = area.colMin; col <= area.colMax; col += 1) {
      const pos = gridPosition(col, row);
      if (isStart(pos)) push(pos);
    }
  }

  while (queue.length > 0) {
    const current = queue.pop() as GridPosition;
    if (isGoal(current)) return true;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = gridPosition(current.col + dc, current.row + dr);
      if (next.col < area.colMin || next.col > area.colMax) continue;
      if (next.row < area.rowMin || next.row > area.rowMax) continue;
      push(next);
    }
  }
  return false;
}

/** 指定した行の範囲だけを使って、西端(col 0〜2)から東端(col 17〜19)まで通り抜けられるか */
function canCrossEastWest(
  map: MapManager,
  movementType: MovementType,
  rowMin: number,
  rowMax: number,
): boolean {
  return canReachWithin(
    map,
    movementType,
    { colMin: 0, colMax: map.cols - 1, rowMin, rowMax },
    (pos) => pos.col < 3,
    (pos) => pos.col >= map.cols - 3,
  );
}

describe('RIDGE_MAP(逆転稜線マップ)', () => {
  it('縦16・横20 のサイズで生成できる', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    expect(map.cols).toBe(20);
    expect(map.rows).toBe(16);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const manager = UnitManager.fromPlacements(RIDGE_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0 に設定されている(有利不利は収入だけで表現する)', () => {
    expect(RIDGE_MAP.initialFunds).toBe(0);
  });

  it('地上ユニットのみのマップである(海・海岸・空港・港を含まない)', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const groundOnly = [
      'plain',
      'forest',
      'mountain',
      'road',
      'city',
      'factory',
      'headquarters',
    ];
    map.forEachTile((tile) => {
      expect(groundOnly).toContain(tile.terrainType);
    });
  });

  it('自軍は本拠地 1・工場 2・都市 1 の計 4 拠点、収入 4000 で開始する', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const bases = basesOf(map, 'player');
    expect(bases).toHaveLength(4);
    expect(bases.filter((b) => b.terrainType === 'headquarters')).toHaveLength(1);
    expect(bases.filter((b) => b.terrainType === 'factory')).toHaveLength(2);
    expect(bases.filter((b) => b.terrainType === 'city')).toHaveLength(1);
    expect(new EconomyManager().getIncome('player', map)).toBe(4000);
  });

  it('敵軍は本拠地 1・工場 2・都市 7 の計 10 拠点、収入 10000 で開始する', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const bases = basesOf(map, 'enemy');
    expect(bases).toHaveLength(10);
    expect(bases.filter((b) => b.terrainType === 'headquarters')).toHaveLength(1);
    expect(bases.filter((b) => b.terrainType === 'factory')).toHaveLength(2);
    expect(bases.filter((b) => b.terrainType === 'city')).toHaveLength(7);
    expect(new EconomyManager().getIncome('enemy', map)).toBe(10000);
  });

  it('開始時の収入差は敵軍が 6000 上回る(自軍がかなり不利な立ち上がり)', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const economy = new EconomyManager();
    expect(economy.getIncome('enemy', map) - economy.getIncome('player', map)).toBe(6000);
  });

  it('中立都市は 12 個で、自軍まわりに 8 個・中央に 4 個ある', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const neutrals = basesOf(map, 'neutral');
    expect(neutrals).toHaveLength(12);
    expect(neutrals.every((b) => b.terrainType === 'city')).toBe(true);
    expect(neutrals.filter((b) => b.col <= PLAYER_SIDE_MAX_COL)).toHaveLength(8);
    expect(neutrals.filter((b) => b.col >= 9 && b.col <= 10)).toHaveLength(4);
  });

  it('敵軍陣地(col 14 以東)には中立都市が 1 つもない', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    expect(basesOf(map, 'neutral').filter((b) => b.col >= 14)).toHaveLength(0);
  });

  it('自軍まわりの中立都市は自軍の生産拠点の近くにあり、敵軍からは遠い', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const playerBases = productionBasesOf(map, 'player');
    const enemyBases = productionBasesOf(map, 'enemy');
    const homeNeutrals = basesOf(map, 'neutral').filter(
      (b) => b.col <= PLAYER_SIDE_MAX_COL,
    );
    for (const base of homeNeutrals) {
      const pos = gridPosition(base.col, base.row);
      // 自軍の工場・本拠地から 4 マス以内(生産した歩兵が 1〜2 ターンで着ける足元の距離)
      expect(distanceToNearest(pos, playerBases)).toBeLessThanOrEqual(4);
      // 敵軍の工場・本拠地からは 15 マス以上離れている
      expect(distanceToNearest(pos, enemyBases)).toBeGreaterThanOrEqual(15);
    }
  });

  it('自軍まわりの中立都市は本拠地を挟んで北 4 個・南 4 個に分かれている', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const homeNeutrals = basesOf(map, 'neutral').filter(
      (b) => b.col <= PLAYER_SIDE_MAX_COL,
    );
    // 本拠地は (1,8)。北の工場 (1,5) と南の工場 (1,11) がそれぞれ 4 個ずつを担当する
    expect(homeNeutrals.filter((b) => b.row < 8)).toHaveLength(4);
    expect(homeNeutrals.filter((b) => b.row > 8)).toHaveLength(4);
  });

  it('敵軍にとって最寄りの中立都市は中央にあり、自軍の最寄りよりずっと遠い', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const playerBases = productionBasesOf(map, 'player');
    const enemyBases = productionBasesOf(map, 'enemy');
    const neutrals = basesOf(map, 'neutral').map((b) => gridPosition(b.col, b.row));
    const nearestForEnemy = Math.min(
      ...neutrals.map((pos) => distanceToNearest(pos, enemyBases)),
    );
    const nearestForPlayer = Math.min(
      ...neutrals.map((pos) => distanceToNearest(pos, playerBases)),
    );
    expect(nearestForPlayer).toBeLessThanOrEqual(2);
    expect(nearestForEnemy).toBeGreaterThanOrEqual(9);
  });

  it('中央の中立都市 4 個は両軍から等距離に置かれている', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const playerBases = productionBasesOf(map, 'player');
    const enemyBases = productionBasesOf(map, 'enemy');
    const middle = basesOf(map, 'neutral')
      .filter((b) => b.col >= 9 && b.col <= 10)
      .map((b) => gridPosition(b.col, b.row));
    expect(middle).toHaveLength(4);
    // 中心線は col 9.5。col 9 と col 10 に 2 個ずつ置いて左右のバランスを取っている
    expect(middle.filter((pos) => pos.col === 9)).toHaveLength(2);
    expect(middle.filter((pos) => pos.col === 10)).toHaveLength(2);
    // 生産拠点からの距離の合計は両軍で等しい
    const playerTotal = middle.reduce(
      (sum, pos) => sum + distanceToNearest(pos, playerBases),
      0,
    );
    const enemyTotal = middle.reduce(
      (sum, pos) => sum + distanceToNearest(pos, enemyBases),
      0,
    );
    expect(playerTotal).toBe(enemyTotal);
  });

  it('自軍まわりの中立都市 8 個を取り切ると、収入が敵軍を 2000 上回る', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    for (const base of basesOf(map, 'neutral')) {
      if (base.col > PLAYER_SIDE_MAX_COL) continue;
      const tile = map.getTile(gridPosition(base.col, base.row));
      if (tile) tile.owner = 'player';
    }
    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(12000);
    expect(economy.getIncome('enemy', map)).toBe(10000);
  });

  it('中央の中立都市を敵軍に取り切られると収入は逆転する(取り合いが決着点になる)', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    for (const base of basesOf(map, 'neutral')) {
      const tile = map.getTile(gridPosition(base.col, base.row));
      if (!tile) continue;
      tile.owner = base.col <= PLAYER_SIDE_MAX_COL ? 'player' : 'enemy';
    }
    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(12000);
    expect(economy.getIncome('enemy', map)).toBe(14000);
  });

  it('北の森ルートは歩兵・装軌車両は通れるが、装輪車両は通り抜けられない', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    expect(canCrossEastWest(map, 'infantry', 0, 5)).toBe(true);
    expect(canCrossEastWest(map, 'vehicle', 0, 5)).toBe(true);
    expect(canCrossEastWest(map, 'wheeled', 0, 5)).toBe(false);
  });

  it('南の道路ルートは装輪車両を含むすべての地上ユニットが通り抜けられる', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    expect(canCrossEastWest(map, 'infantry', 11, 15)).toBe(true);
    expect(canCrossEastWest(map, 'vehicle', 11, 15)).toBe(true);
    expect(canCrossEastWest(map, 'wheeled', 11, 15)).toBe(true);
  });

  it('稜線の row 7〜9・col 6〜13 は隙間なく山で、車両が進入できない', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    for (let row = 7; row <= 9; row += 1) {
      for (let col = 6; col <= 13; col += 1) {
        const pos = gridPosition(col, row);
        expect(map.getTile(pos)?.terrainType).toBe('mountain');
        expect(map.getMoveCost(pos, 'vehicle')).toBeNull();
        expect(map.getMoveCost(pos, 'wheeled')).toBeNull();
      }
    }
    // 歩兵だけはコスト 2 で稜線を越えられる
    expect(map.getMoveCost(gridPosition(9, 8), 'infantry')).toBe(2);
  });

  it('盤面中央では南北のルートを乗り換えられない(車両は稜線を越えられない)', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    // 中央帯(col 5〜14)だけを使って、北ルート(row 0〜5)から南ルート(row 11〜15)へ渡れるか
    const midBand = { colMin: 5, colMax: 14, rowMin: 0, rowMax: 15 };
    const fromNorth = (pos: GridPosition): boolean => pos.row <= 5;
    const toSouth = (pos: GridPosition): boolean => pos.row >= 11;
    expect(canReachWithin(map, 'vehicle', midBand, fromNorth, toSouth)).toBe(false);
    expect(canReachWithin(map, 'wheeled', midBand, fromNorth, toSouth)).toBe(false);
    // 歩兵は稜線を越えて乗り換えられる
    expect(canReachWithin(map, 'infantry', midBand, fromNorth, toSouth)).toBe(true);
  });

  it('自陣の近くでは南北のルートを乗り換えられる(自軍 col 0〜4 / 敵軍 col 15〜19)', () => {
    const map = MapManager.fromDefinition(RIDGE_MAP);
    const fromNorth = (pos: GridPosition): boolean => pos.row <= 5;
    const toSouth = (pos: GridPosition): boolean => pos.row >= 11;
    const playerSide = { colMin: 0, colMax: 4, rowMin: 0, rowMax: 15 };
    const enemySide = { colMin: 15, colMax: 19, rowMin: 0, rowMax: 15 };
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(canReachWithin(map, movementType, playerSide, fromNorth, toSouth)).toBe(
        true,
      );
      expect(canReachWithin(map, movementType, enemySide, fromNorth, toSouth)).toBe(true);
    }
  });
});
