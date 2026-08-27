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
import { INNER_SEA_MAP } from '@/data/maps/innerSeaMap';
import { getTerrainData } from '@/data/terrainData';
import { UNIT_DATA } from '@/data/unitData';

/** 敵軍陣地まわりの中立拠点を区切る列。col 15 以東が「敵軍が 1 ターンで届く」範囲 */
const ENEMY_SIDE_MIN_COL = 15;

/** 中央の中立都市が並ぶ列の範囲(col 7〜12) */
const CENTER_MIN_COL = 7;
const CENTER_MAX_COL = 12;

/** 生産拠点(工場・本拠地)の座標を軍ごとに集める */
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

/**
 * starts から各マスまでの移動コスト(ダイクストラ)を求める。
 * 「歩兵が何ターンで着けるか」を移動力と突き合わせて測るために使う。
 */
function moveCostMap(
  map: MapManager,
  movementType: MovementType,
  starts: readonly GridPosition[],
): Map<string, number> {
  const key = (pos: GridPosition): string => `${pos.col},${pos.row}`;
  const dist = new Map<string, number>();
  const queue: { pos: GridPosition; cost: number }[] = [];
  for (const start of starts) {
    dist.set(key(start), 0);
    queue.push({ pos: start, cost: 0 });
  }
  while (queue.length > 0) {
    queue.sort((a, b) => b.cost - a.cost);
    const current = queue.pop() as { pos: GridPosition; cost: number };
    if (current.cost > (dist.get(key(current.pos)) ?? Infinity)) continue;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = gridPosition(current.pos.col + dc, current.pos.row + dr);
      const cost = map.getMoveCost(next, movementType);
      if (cost === null) continue;
      const nextCost = current.cost + cost;
      if (nextCost < (dist.get(key(next)) ?? Infinity)) {
        dist.set(key(next), nextCost);
        queue.push({ pos: next, cost: nextCost });
      }
    }
  }
  return dist;
}

/** pos までの移動コスト(到達できないマスは Infinity) */
function costTo(dist: Map<string, number>, pos: GridPosition): number {
  return dist.get(`${pos.col},${pos.row}`) ?? Infinity;
}

/** pos から bases のうち最も近いものまでのマンハッタン距離 */
function distanceToNearest(pos: GridPosition, bases: readonly GridPosition[]): number {
  return Math.min(...bases.map((base) => manhattanDistance(pos, base)));
}

/**
 * 指定した矩形の中だけを通って、開始マス群から目的マス群へ
 * movementType のユニットが到達できるかを幅優先探索で判定する。
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

describe('INNER_SEA_MAP(優勢内海マップ)', () => {
  it('縦16・横20 のサイズで生成できる', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    expect(map.cols).toBe(20);
    expect(map.rows).toBe(16);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const manager = UnitManager.fromPlacements(INNER_SEA_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0 に設定されている(有利不利は収入と距離だけで表現する)', () => {
    expect(INNER_SEA_MAP.initialFunds).toBe(0);
  });

  it('地上ユニットのみのマップである(空港・港を含まない)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    map.forEachTile((tile) => {
      expect(tile.terrainType).not.toBe('airport');
      expect(tile.terrainType).not.toBe('port');
    });
  });

  it('中央には海があるが、港が無いため海上ユニットは 1 隻も生産できない', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    let seaTiles = 0;
    let seaProducers = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'sea') seaTiles += 1;
      const data = getTerrainData(tile.terrainType);
      if (data.canProduce && data.moveCost.sea !== null) seaProducers += 1;
    });
    expect(seaTiles).toBeGreaterThan(0);
    expect(seaProducers).toBe(0);
  });

  it('自軍は本拠地 1・工場 3・都市 9 の計 13 拠点、収入 13000 で開始する', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const bases = basesOf(map, 'player');
    expect(bases).toHaveLength(13);
    expect(bases.filter((b) => b.terrainType === 'headquarters')).toHaveLength(1);
    expect(bases.filter((b) => b.terrainType === 'factory')).toHaveLength(3);
    expect(bases.filter((b) => b.terrainType === 'city')).toHaveLength(9);
    expect(new EconomyManager().getIncome('player', map)).toBe(13000);
  });

  it('敵軍は本拠地 1・工場 3 の計 4 拠点、収入 4000 で開始する(所有都市は 0)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const bases = basesOf(map, 'enemy');
    expect(bases).toHaveLength(4);
    expect(bases.filter((b) => b.terrainType === 'headquarters')).toHaveLength(1);
    expect(bases.filter((b) => b.terrainType === 'factory')).toHaveLength(3);
    expect(bases.filter((b) => b.terrainType === 'city')).toHaveLength(0);
    expect(new EconomyManager().getIncome('enemy', map)).toBe(4000);
  });

  it('開始時の収入差は自軍が 9000 上回る(自軍がかなり有利な立ち上がり)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const economy = new EconomyManager();
    expect(economy.getIncome('player', map) - economy.getIncome('enemy', map)).toBe(9000);
  });

  it('両軍の生産拠点は本拠地 1・工場 3 で数が揃い、盤面中心について点対称に置かれている', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const playerBases = productionBasesOf(map, 'player');
    const enemyBases = productionBasesOf(map, 'enemy');
    expect(playerBases).toHaveLength(4);
    expect(enemyBases).toHaveLength(4);
    // (col, row) → (19 - col, 15 - row) の点対称で 1 対 1 に対応し、地形も一致する
    for (const base of playerBases) {
      const mirror = gridPosition(map.cols - 1 - base.col, map.rows - 1 - base.row);
      expect(enemyBases.some((e) => e.col === mirror.col && e.row === mirror.row)).toBe(
        true,
      );
      expect(map.getTile(mirror)?.terrainType).toBe(map.getTile(base)?.terrainType);
    }
  });

  it('中立拠点は中立工場 1・中立都市 9 の計 10 個ある', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const neutrals = basesOf(map, 'neutral');
    expect(neutrals).toHaveLength(10);
    expect(neutrals.filter((b) => b.terrainType === 'factory')).toHaveLength(1);
    expect(neutrals.filter((b) => b.terrainType === 'city')).toHaveLength(9);
  });

  it('敵軍の足元には中立工場 1 個と中立都市 3 個があり、歩兵が 1 ターンで届く', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const nearEnemy = basesOf(map, 'neutral').filter((b) => b.col >= ENEMY_SIDE_MIN_COL);
    expect(nearEnemy).toHaveLength(4);
    expect(nearEnemy.filter((b) => b.terrainType === 'factory')).toHaveLength(1);
    expect(nearEnemy.filter((b) => b.terrainType === 'city')).toHaveLength(3);

    const infantryMovement = UNIT_DATA.infantry.movement;
    const fromEnemy = moveCostMap(map, 'infantry', productionBasesOf(map, 'enemy'));
    for (const base of nearEnemy) {
      // 敵軍の生産拠点から歩兵の移動力(3)以内 = 1 ターンの移動で占領に着手できる
      expect(costTo(fromEnemy, gridPosition(base.col, base.row))).toBeLessThanOrEqual(
        infantryMovement,
      );
    }
  });

  it('自軍の陣地(col 4 以西)には中立拠点が 1 つもない', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    expect(basesOf(map, 'neutral').filter((b) => b.col <= 4)).toHaveLength(0);
  });

  it('中立拠点はすべて自軍から遠い(最寄りでも歩兵で 3 ターンかかる)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const fromPlayer = moveCostMap(map, 'infantry', productionBasesOf(map, 'player'));
    const infantryMovement = UNIT_DATA.infantry.movement;
    const costs = basesOf(map, 'neutral').map((b) =>
      costTo(fromPlayer, gridPosition(b.col, b.row)),
    );
    const nearest = Math.min(...costs);
    // 最寄りでも移動力 3 の 2 ターンぶん(6)より遠い = 3 ターン以上かかる
    expect(nearest).toBeGreaterThan(infantryMovement * 2);
    expect(nearest).toBe(8);
    // 敵軍の足元の 4 個は自軍からは 16 以上と、盤面を丸ごと渡る距離にある
    for (const base of basesOf(map, 'neutral').filter(
      (b) => b.col >= ENEMY_SIDE_MIN_COL,
    )) {
      expect(costTo(fromPlayer, gridPosition(base.col, base.row))).toBeGreaterThanOrEqual(
        16,
      );
    }
  });

  it('中央の中立都市 6 個は両軍の生産拠点から等距離に置かれている', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const playerBases = productionBasesOf(map, 'player');
    const enemyBases = productionBasesOf(map, 'enemy');
    const center = basesOf(map, 'neutral')
      .filter((b) => b.col >= CENTER_MIN_COL && b.col <= CENTER_MAX_COL)
      .map((b) => gridPosition(b.col, b.row));
    expect(center).toHaveLength(6);
    // 北ルート・南ルートに 3 個ずつ
    expect(center.filter((pos) => pos.row <= 4)).toHaveLength(3);
    expect(center.filter((pos) => pos.row >= 11)).toHaveLength(3);
    // 6 個は盤面中心について点対称
    for (const pos of center) {
      const mirror = gridPosition(map.cols - 1 - pos.col, map.rows - 1 - pos.row);
      expect(center.some((p) => p.col === mirror.col && p.row === mirror.row)).toBe(true);
    }
    // 生産拠点も点対称なので、マンハッタン距離の合計は両軍で等しい
    const playerTotal = center.reduce(
      (sum, pos) => sum + distanceToNearest(pos, playerBases),
      0,
    );
    const enemyTotal = center.reduce(
      (sum, pos) => sum + distanceToNearest(pos, enemyBases),
      0,
    );
    expect(playerTotal).toBe(enemyTotal);
  });

  it('敵軍が足元の 4 拠点を取り切っても、収入は自軍が 5000 上回る', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    for (const base of basesOf(map, 'neutral')) {
      if (base.col < ENEMY_SIDE_MIN_COL) continue;
      const tile = map.getTile(gridPosition(base.col, base.row));
      if (tile) tile.owner = 'enemy';
    }
    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(13000);
    expect(economy.getIncome('enemy', map)).toBe(8000);
  });

  it('中央の中立都市を敵軍に取り切られると収入は逆転する(取り合いが決着点になる)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    for (const base of basesOf(map, 'neutral')) {
      const tile = map.getTile(gridPosition(base.col, base.row));
      if (tile) tile.owner = 'enemy';
    }
    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(13000);
    expect(economy.getIncome('enemy', map)).toBe(14000);
  });

  it('中央の内海は row 7〜8 の col 5〜14 を隙間なく塞ぎ、地上ユニットは進入できない', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    for (let row = 7; row <= 8; row += 1) {
      for (let col = 5; col <= 14; col += 1) {
        const pos = gridPosition(col, row);
        expect(map.getTile(pos)?.terrainType).toBe('sea');
        for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
          expect(map.getMoveCost(pos, movementType)).toBeNull();
        }
      }
    }
  });

  it('北の街道ルートは装輪車両を含むすべての地上ユニットが通り抜けられる', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    expect(canCrossEastWest(map, 'infantry', 0, 4)).toBe(true);
    expect(canCrossEastWest(map, 'vehicle', 0, 4)).toBe(true);
    expect(canCrossEastWest(map, 'wheeled', 0, 4)).toBe(true);
  });

  it('南の森ルートは歩兵・装軌車両は通れるが、装輪車両は通り抜けられない', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    expect(canCrossEastWest(map, 'infantry', 11, 15)).toBe(true);
    expect(canCrossEastWest(map, 'vehicle', 11, 15)).toBe(true);
    expect(canCrossEastWest(map, 'wheeled', 11, 15)).toBe(false);
  });

  it('盤面中央では南北のルートを乗り換えられない(歩兵も内海を渡れない)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const midBand = { colMin: 5, colMax: 14, rowMin: 0, rowMax: 15 };
    const fromNorth = (pos: GridPosition): boolean => pos.row <= 4;
    const toSouth = (pos: GridPosition): boolean => pos.row >= 11;
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(canReachWithin(map, movementType, midBand, fromNorth, toSouth)).toBe(false);
    }
  });

  it('自陣の近くでは南北のルートを乗り換えられる(自軍 col 0〜4 / 敵軍 col 15〜19)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const fromNorth = (pos: GridPosition): boolean => pos.row <= 4;
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
