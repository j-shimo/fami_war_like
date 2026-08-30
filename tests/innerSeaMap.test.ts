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

/** 敵軍陣地まわりの中立拠点を区切る列。col 12 以東が「敵軍が 1 ターンで届く」範囲 */
const ENEMY_SIDE_MIN_COL = 12;

/** 中央の中立都市が並ぶ列の範囲。自軍陣地(col 4 以西)と敵軍まわり(col 12 以東)に挟まれた帯 */
const CENTER_MIN_COL = 5;
const CENTER_MAX_COL = 11;

/** 自軍で最も戦場に近い前線工場。偵察車が敵陣地まで何ターンで届くかの起点 */
const PLAYER_FRONT_FACTORY = gridPosition(3, 5);

/** 敵軍の陣地とみなす列。ここへ踏み込めたら「敵陣に到達した」とする */
const ENEMY_CAMP_MIN_COL = 12;

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

/** 中央(自軍陣地と敵軍まわりに挟まれた帯)にある中立都市の座標 */
function centerNeutralCities(map: MapManager): GridPosition[] {
  return basesOf(map, 'neutral')
    .filter((b) => b.col >= CENTER_MIN_COL && b.col <= CENTER_MAX_COL)
    .map((b) => gridPosition(b.col, b.row));
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

/** 指定した行の範囲だけを使って、西端(col 0〜2)から東端(col 13〜15)まで通り抜けられるか */
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
  it('縦12・横16 のサイズで生成できる', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    expect(map.cols).toBe(16);
    expect(map.rows).toBe(12);
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
    // 敵軍の足元の 4 個は自軍からは 12 以上(歩兵で 4 ターン以上)と、盤面を丸ごと渡る距離にある
    for (const base of basesOf(map, 'neutral').filter(
      (b) => b.col >= ENEMY_SIDE_MIN_COL,
    )) {
      expect(costTo(fromPlayer, gridPosition(base.col, base.row))).toBeGreaterThan(
        infantryMovement * 3,
      );
    }
  });

  it('中央の中立都市 6 個は北ルートに 3 個・南ルートに 3 個ある', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const center = centerNeutralCities(map);
    expect(center).toHaveLength(6);
    expect(center.filter((pos) => pos.row <= 3)).toHaveLength(3);
    expect(center.filter((pos) => pos.row >= 8)).toHaveLength(3);
  });

  it('中央の中立都市はすべて敵軍のほうが近い(取り合いは敵軍有利に傾けてある)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const fromPlayer = moveCostMap(map, 'infantry', productionBasesOf(map, 'player'));
    const fromEnemy = moveCostMap(map, 'infantry', productionBasesOf(map, 'enemy'));
    const infantryMovement = UNIT_DATA.infantry.movement;
    for (const pos of centerNeutralCities(map)) {
      // 敵軍のほうが先に着くが、足元の 4 拠点と違って歩兵 1 ターンでは届かない
      expect(costTo(fromEnemy, pos)).toBeLessThan(costTo(fromPlayer, pos));
      expect(costTo(fromEnemy, pos)).toBeGreaterThan(infantryMovement);
    }
  });

  it('北ルートの中立都市は南ルートよりも大きく敵軍側へ寄せてある', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const fromPlayer = moveCostMap(map, 'infantry', productionBasesOf(map, 'player'));
    const fromEnemy = moveCostMap(map, 'infantry', productionBasesOf(map, 'enemy'));
    const center = centerNeutralCities(map);
    /** 自軍の移動コスト - 敵軍の移動コスト の合計。大きいほど敵軍側に寄っている */
    const gapOf = (positions: readonly GridPosition[]): number =>
      positions.reduce(
        (sum, pos) => sum + costTo(fromPlayer, pos) - costTo(fromEnemy, pos),
        0,
      );
    const north = center.filter((pos) => pos.row <= 3);
    const south = center.filter((pos) => pos.row >= 8);
    expect(gapOf(north)).toBe(13);
    expect(gapOf(south)).toBe(5);
    expect(gapOf(north)).toBeGreaterThan(gapOf(south));

    // 北は敵軍が 2〜3 ターン・自軍は 4 ターン、南は敵軍が 3 ターン・自軍も 3〜4 ターン
    const sorted = (positions: readonly GridPosition[], dist: Map<string, number>) =>
      positions.map((pos) => costTo(dist, pos)).sort((a, b) => a - b);
    expect(sorted(north, fromPlayer)).toEqual([10, 10, 11]);
    expect(sorted(north, fromEnemy)).toEqual([5, 6, 7]);
    expect(sorted(south, fromPlayer)).toEqual([8, 9, 10]);
    expect(sorted(south, fromEnemy)).toEqual([7, 7, 8]);
  });

  it('中央の中立都市には隣り合う 2 個組が北と南に 1 組ずつある', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const center = centerNeutralCities(map);
    const pairs = center.flatMap((a, i) =>
      center.slice(i + 1).filter((b) => manhattanDistance(a, b) === 1),
    );
    expect(pairs).toHaveLength(2);
    // 北ルートと南ルートに 1 組ずつ(歩兵 1 体が続けて 2 個占領できるかたまり)
    expect(
      center.filter(
        (pos) => pos.row <= 3 && center.some((o) => manhattanDistance(pos, o) === 1),
      ),
    ).toHaveLength(2);
    expect(
      center.filter(
        (pos) => pos.row >= 8 && center.some((o) => manhattanDistance(pos, o) === 1),
      ),
    ).toHaveLength(2);
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

  it('前線工場から敵陣地まで、偵察車が街道を 2 ターン走れば到達できる', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    // 起点は自軍で最も戦場に近い前線工場。ここが「工場から敵陣までの距離」の物差しになる
    expect(map.getTile(PLAYER_FRONT_FACTORY)?.terrainType).toBe('factory');
    expect(map.getTile(PLAYER_FRONT_FACTORY)?.owner).toBe('player');

    const reconMovement = UNIT_DATA.recon.movement;
    const fromFrontFactory = moveCostMap(map, UNIT_DATA.recon.movementType, [
      PLAYER_FRONT_FACTORY,
    ]);
    let nearestEnemyCamp = Infinity;
    map.forEachTile((tile) => {
      if (tile.position.col < ENEMY_CAMP_MIN_COL) return;
      nearestEnemyCamp = Math.min(
        nearestEnemyCamp,
        costTo(fromFrontFactory, tile.position),
      );
    });
    // 1 ターン(移動力 8)では届かず、2 ターンぶん(16)の移動で敵陣地へ踏み込める
    expect(nearestEnemyCamp).toBeGreaterThan(reconMovement);
    expect(nearestEnemyCamp).toBeLessThanOrEqual(reconMovement * 2);
    expect(nearestEnemyCamp).toBe(13);
  });

  it('中央の内海は row 5〜6 の col 5〜10 を隙間なく塞ぎ、地上ユニットは進入できない', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    for (let row = 5; row <= 6; row += 1) {
      for (let col = 5; col <= 10; col += 1) {
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
    expect(canCrossEastWest(map, 'infantry', 0, 3)).toBe(true);
    expect(canCrossEastWest(map, 'vehicle', 0, 3)).toBe(true);
    expect(canCrossEastWest(map, 'wheeled', 0, 3)).toBe(true);
  });

  it('南の森ルートは歩兵・装軌車両は通れるが、装輪車両は通り抜けられない', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    expect(canCrossEastWest(map, 'infantry', 8, 11)).toBe(true);
    expect(canCrossEastWest(map, 'vehicle', 8, 11)).toBe(true);
    expect(canCrossEastWest(map, 'wheeled', 8, 11)).toBe(false);
  });

  it('盤面中央では南北のルートを乗り換えられない(歩兵も内海を渡れない)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const midBand = { colMin: 5, colMax: 10, rowMin: 0, rowMax: 11 };
    const fromNorth = (pos: GridPosition): boolean => pos.row <= 3;
    const toSouth = (pos: GridPosition): boolean => pos.row >= 8;
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(canReachWithin(map, movementType, midBand, fromNorth, toSouth)).toBe(false);
    }
  });

  it('自陣の近くでは南北のルートを乗り換えられる(自軍 col 0〜4 / 敵軍 col 11〜15)', () => {
    const map = MapManager.fromDefinition(INNER_SEA_MAP);
    const fromNorth = (pos: GridPosition): boolean => pos.row <= 3;
    const toSouth = (pos: GridPosition): boolean => pos.row >= 8;
    const playerSide = { colMin: 0, colMax: 4, rowMin: 0, rowMax: 11 };
    const enemySide = { colMin: 11, colMax: 15, rowMin: 0, rowMax: 11 };
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(canReachWithin(map, movementType, playerSide, fromNorth, toSouth)).toBe(
        true,
      );
      expect(canReachWithin(map, movementType, enemySide, fromNorth, toSouth)).toBe(true);
    }
  });
});
