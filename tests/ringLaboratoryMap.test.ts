import { describe, expect, it } from 'vitest';
import { EnemyAi } from '@/core/ai/EnemyAi';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { RING_LABORATORY_MAP } from '@/data/maps/ringLaboratoryMap';
import { getTerrainData } from '@/data/terrainData';
import { UNIT_DATA } from '@/data/unitData';

/** 盤面のちょうど中央にある研究所 */
const LABORATORY = gridPosition(8, 7);

/** 自軍(先手)の本拠地。左下(盤面の角からは 2 マス内側) */
const PLAYER_HQ = gridPosition(2, 12);

/** 敵軍(後手)の本拠地。右上(自軍と点対称) */
const ENEMY_HQ = gridPosition(14, 2);

/** 自軍(先手)の工場 3 つ。左下の本拠地を囲む陣地 */
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(3, 11),
  gridPosition(2, 11),
  gridPosition(3, 12),
];

/** 敵軍(後手)の工場 3 つ。右上の本拠地を囲む陣地(自軍と点対称) */
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(13, 3),
  gridPosition(14, 3),
  gridPosition(13, 2),
];

/** 自軍の陣地 4 拠点(本拠地 1 + 工場 3)。生産はこの 4 マスから始まる */
const PLAYER_BASES: readonly GridPosition[] = [PLAYER_HQ, ...PLAYER_FACTORIES];

/** 敵軍の陣地 4 拠点(本拠地 1 + 工場 3) */
const ENEMY_BASES: readonly GridPosition[] = [ENEMY_HQ, ...ENEMY_FACTORIES];

/** 中立都市 1 個ぶんの設計値(陣地からの移動コストと、先に届くのはどちらか) */
interface CityPlan {
  /** 都市の座標 */
  readonly pos: GridPosition;
  /** 自軍の陣地 4 拠点からの最短移動コスト(歩兵) */
  readonly player: number;
  /** 敵軍の陣地 4 拠点からの最短移動コスト(歩兵) */
  readonly enemy: number;
  /** 先に届くのはどちらか。同着は先に動ける自軍(先手)が取れる */
  readonly first: 'player' | 'enemy';
}

/**
 * 中立都市 14 個の設計値。
 * 陣地の隣(両軍 2 個ずつ)・左上(2 個)・右下の 4 連(4 個)・対角線(4 個)の 4 グループからなる。
 */
const CITY_PLANS: readonly CityPlan[] = [
  // 陣地のすぐ隣。取り合いにはならない安全な収入だが、1 ターンで届くのは後手の敵軍だけで、
  // 先手の自軍は 2 ターンかかる(後手のハンデの中心)
  { pos: gridPosition(2, 8), player: 4, enemy: 16, first: 'player' },
  { pos: gridPosition(7, 12), player: 4, enemy: 15, first: 'player' },
  { pos: gridPosition(14, 5), player: 17, enemy: 2, first: 'enemy' },
  { pos: gridPosition(10, 2), player: 16, enemy: 3, first: 'enemy' },
  // 左上。街道の左上の角とその外側で、どちらも自軍が先に取れる
  { pos: gridPosition(3, 3), player: 8, enemy: 10, first: 'player' },
  { pos: gridPosition(4, 2), player: 10, enemy: 10, first: 'player' },
  // 右下の 4 連(下辺の街道 row 11 の 1 マス下)。西の 2 個は自軍・東の 2 個は敵軍が先に届く
  { pos: gridPosition(11, 12), player: 8, enemy: 11, first: 'player' },
  { pos: gridPosition(12, 12), player: 9, enemy: 10, first: 'player' },
  { pos: gridPosition(13, 12), player: 10, enemy: 9, first: 'enemy' },
  { pos: gridPosition(14, 12), player: 11, enemy: 9, first: 'enemy' },
  // 街道の角と角を結ぶ対角線(col - row = 2)。4 個とも敵軍が 1 ターン早い
  { pos: gridPosition(5, 3), player: 10, enemy: 8, first: 'enemy' },
  { pos: gridPosition(7, 5), player: 10, enemy: 8, first: 'enemy' },
  { pos: gridPosition(10, 8), player: 10, enemy: 8, first: 'enemy' },
  { pos: gridPosition(13, 11), player: 10, enemy: 8, first: 'enemy' },
];

/** 中立都市 14 個の座標 */
const NEUTRAL_CITIES: readonly GridPosition[] = CITY_PLANS.map((plan) => plan.pos);

/** 陣地のすぐ隣の中立都市。自軍は 2 ターン・敵軍は 1 ターンで届く */
const PLAYER_HOME_CITIES: readonly GridPosition[] = [
  gridPosition(2, 8),
  gridPosition(7, 12),
];
const ENEMY_HOME_CITIES: readonly GridPosition[] = [
  gridPosition(14, 5),
  gridPosition(10, 2),
];

/** 右下の 4 連都市(下辺の街道のすぐ下、row 12 の col 11〜14) */
const SOUTH_EAST_ROW_CITIES: readonly GridPosition[] = [
  gridPosition(11, 12),
  gridPosition(12, 12),
  gridPosition(13, 12),
  gridPosition(14, 12),
];

/** 陣地を縁取る森。自軍側 (2,10)(4,12)(5,12)(1,12)(2,13) と、その点対称にあたる敵軍側 */
const BASE_FOREST: readonly GridPosition[] = [
  gridPosition(2, 10),
  gridPosition(4, 12),
  gridPosition(5, 12),
  gridPosition(1, 12),
  gridPosition(2, 13),
  gridPosition(14, 4),
  gridPosition(12, 2),
  gridPosition(11, 2),
  gridPosition(15, 2),
  gridPosition(14, 1),
];

/** 陣地の裏へ回り込める、縁の平地。いずれも自陣の工場に接している */
const BASE_POCKET_PLAINS: readonly GridPosition[] = [
  gridPosition(1, 11),
  gridPosition(3, 13),
  gridPosition(15, 3),
  gridPosition(13, 1),
];

/** 「日」を横倒しにした街道の骨格(外周の長方形 + 中央の縦棒)が通る列・行 */
const RING_ROWS = [3, 11] as const;
const RING_COLS = [3, 13] as const;
const CENTER_COL = 8;
/** 街道の長方形が通る範囲(row 3 / row 11 は col 3〜13、col 3 / col 13 は row 3〜11) */
const RING_MIN = 3;
const RING_COL_MAX = 13;
const RING_ROW_MAX = 11;

/** 帯ごとの列の範囲(左=山 / 中央=平地 / 右=森)。行は街道に挟まれた row 4〜10 */
const LEFT_BAND = { colMin: 4, colMax: 6 };
const CENTER_BAND = { colMin: 7, colMax: 9 };
const RIGHT_BAND = { colMin: 10, colMax: 12 };
const BAND_ROW_MIN = 4;
const BAND_ROW_MAX = 10;

/** 地上ユニットの移動タイプ(このマップに出てくるのはこの 3 種だけ) */
const GROUND_MOVEMENTS: readonly MovementType[] = ['infantry', 'vehicle', 'wheeled'];

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

/** cost の移動に何ターンかかるか(移動力 movement のユニット) */
function turnsFor(cost: number, movement: number): number {
  return Math.ceil(cost / movement);
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

/** 帯(col の範囲 × row 2〜8)に含まれる地形の内訳を数える */
function bandTerrainCount(
  map: MapManager,
  band: { colMin: number; colMax: number },
): Record<string, number> {
  const count: Record<string, number> = {};
  for (let row = BAND_ROW_MIN; row <= BAND_ROW_MAX; row += 1) {
    for (let col = band.colMin; col <= band.colMax; col += 1) {
      const terrainType = map.getTile(gridPosition(col, row))?.terrainType ?? 'none';
      count[terrainType] = (count[terrainType] ?? 0) + 1;
    }
  }
  return count;
}

describe('RING_LABORATORY_MAP(環状研究所マップ)', () => {
  it('縦15・横17 のサイズで生成できる(地上戦向けの小さめの盤面)', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    expect(map.cols).toBe(17);
    expect(map.rows).toBe(15);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const manager = UnitManager.fromPlacements(RING_LABORATORY_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0(有利不利は研究所への先着と中立都市までの距離だけで表現する)', () => {
    expect(RING_LABORATORY_MAP.initialFunds).toBe(0);
  });

  it('地上ユニットのみのマップである(海・海岸・空港・港を 1 マスも含まない)', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    map.forEachTile((tile) => {
      expect(['sea', 'beach', 'airport', 'port']).not.toContain(tile.terrainType);
    });
  });

  it('本拠地は両軍に 1 つずつ、盤面の隅から 2 マス内側にある', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const headquarters: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (tile.terrainType === 'headquarters') headquarters.push(tile.position);
    });
    expect(headquarters).toHaveLength(2);
    expect(headquarters).toContainEqual(PLAYER_HQ);
    expect(headquarters).toContainEqual(ENEMY_HQ);
    expect(map.getTile(PLAYER_HQ)?.owner).toBe('player');
    expect(map.getTile(ENEMY_HQ)?.owner).toBe('enemy');
    // 盤面の隅(角のマス)には置かない。四方すべてにマスがある内側の位置にある
    for (const hq of [PLAYER_HQ, ENEMY_HQ]) {
      expect(hq.col).toBeGreaterThanOrEqual(2);
      expect(hq.col).toBeLessThanOrEqual(map.cols - 3);
      expect(hq.row).toBeGreaterThanOrEqual(2);
      expect(hq.row).toBeLessThanOrEqual(map.rows - 3);
    }
  });

  it('本拠地に隣接するのは自陣の工場 2 マスと森 2 マスで、装輪車両は陣地を突破するしかない', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const neighborsOf = (pos: GridPosition): GridPosition[] =>
      [
        gridPosition(pos.col + 1, pos.row),
        gridPosition(pos.col - 1, pos.row),
        gridPosition(pos.col, pos.row + 1),
        gridPosition(pos.col, pos.row - 1),
      ].filter((next) => map.getTile(next) !== null && map.getTile(next) !== undefined);

    for (const [hq, army] of [
      [PLAYER_HQ, 'player'],
      [ENEMY_HQ, 'enemy'],
    ] as const) {
      const neighbors = neighborsOf(hq);
      expect(neighbors).toHaveLength(4);
      const factories = neighbors.filter(
        (next) => map.getTile(next)?.terrainType === 'factory',
      );
      // 隣の 4 マスのうち 2 マスは自陣の工場
      expect(factories).toHaveLength(2);
      for (const factory of factories) {
        expect(map.getTile(factory)?.owner).toBe(army);
      }
      // 残る 2 マスは陣地を縁取る森。装輪車両は森へ入れないので、
      // 偵察車・ロケット砲は必ず工場のある側から陣地を突破することになる
      const forests = neighbors.filter(
        (next) => map.getTile(next)?.terrainType === 'forest',
      );
      expect(forests).toHaveLength(2);
      for (const forest of forests) {
        expect(map.getMoveCost(forest, 'wheeled')).toBeNull();
      }
    }
  });

  it('両軍とも本拠地 1 + 工場 3 の 4 拠点を所有し、収入 4000 で完全に対等に始まる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const economy = new EconomyManager();
    for (const army of ['player', 'enemy'] as const) {
      const bases = basesOf(map, army);
      expect(bases).toHaveLength(4);
      expect(bases.filter((base) => base.terrainType === 'headquarters')).toHaveLength(1);
      expect(bases.filter((base) => base.terrainType === 'factory')).toHaveLength(3);
      expect(economy.getIncome(army, map)).toBe(4000);
    }
  });

  it('陣地のまわりは森で縁取ってあり、両軍とも点対称に同じ数だけ置かれている', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    for (const pos of BASE_FOREST) {
      expect(map.getTile(pos)?.terrainType).toBe('forest');
      // (col, row) → (16 - col, 14 - row) の点対称の位置も森
      const mirror = gridPosition(map.cols - 1 - pos.col, map.rows - 1 - pos.row);
      expect(map.getTile(mirror)?.terrainType).toBe('forest');
    }
  });

  it('両軍の陣地の外側には、森と平地の縁が幅 2 マス以上ある(隅に貼り付けない)', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const bases = [...PLAYER_BASES, ...ENEMY_BASES];
    for (const base of bases) {
      // どの拠点も盤面の縁から 2 マス以上内側にある
      expect(base.col).toBeGreaterThanOrEqual(2);
      expect(base.col).toBeLessThanOrEqual(map.cols - 3);
      expect(base.row).toBeGreaterThanOrEqual(2);
      expect(base.row).toBeLessThanOrEqual(map.rows - 3);
    }
    // 自軍の陣地より左下・敵軍の陣地より右上は、森と平地で埋めてある
    const outsides = [
      { colMin: 0, colMax: 1, rowMin: 11, rowMax: 14 },
      { colMin: 0, colMax: 4, rowMin: 13, rowMax: 14 },
      { colMin: 15, colMax: 16, rowMin: 0, rowMax: 3 },
      { colMin: 12, colMax: 16, rowMin: 0, rowMax: 1 },
    ];
    for (const area of outsides) {
      for (let row = area.rowMin; row <= area.rowMax; row += 1) {
        for (let col = area.colMin; col <= area.colMax; col += 1) {
          expect(['forest', 'plain']).toContain(
            map.getTile(gridPosition(col, row))?.terrainType,
          );
        }
      }
    }
  });

  it('陣地の裏へ回り込める平地は自陣の工場に接しており、装輪車両も出入りできる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const bases = [...PLAYER_BASES, ...ENEMY_BASES];
    for (const plain of BASE_POCKET_PLAINS) {
      expect(map.getTile(plain)?.terrainType).toBe('plain');
      const neighbors = [
        gridPosition(plain.col + 1, plain.row),
        gridPosition(plain.col - 1, plain.row),
        gridPosition(plain.col, plain.row + 1),
        gridPosition(plain.col, plain.row - 1),
      ];
      expect(
        neighbors.some((next) =>
          bases.some((base) => base.col === next.col && base.row === next.row),
        ),
      ).toBe(true);
      expect(map.getMoveCost(plain, 'wheeled')).not.toBeNull();
    }
  });

  it('自軍の陣地は左下、敵軍の陣地は右上にあり、点対称に置かれている', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    for (const base of PLAYER_BASES) {
      const tile = map.getTile(base);
      expect(tile?.owner).toBe('player');
      // (col, row) → (16 - col, 14 - row) の点対称の位置に、同じ地形の敵軍の拠点がある
      const mirror = gridPosition(map.cols - 1 - base.col, map.rows - 1 - base.row);
      expect(ENEMY_BASES).toContainEqual(mirror);
      expect(map.getTile(mirror)?.terrainType).toBe(tile?.terrainType);
      expect(map.getTile(mirror)?.owner).toBe('enemy');
    }
  });

  it('街道は「日」を横倒しにした形(外周の長方形 + 中央の縦棒)につながっている', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    /** 骨格の上のマスは、拠点に置き換わっていても地上ユニットが移動コスト 1 で通れる */
    const expectPassable = (pos: GridPosition): void => {
      for (const movementType of GROUND_MOVEMENTS) {
        expect(map.getMoveCost(pos, movementType)).toBe(1);
      }
    };
    // 上辺・下辺(row 3 / row 11 の col 3〜13)
    for (const row of RING_ROWS) {
      for (let col = RING_MIN; col <= RING_COL_MAX; col += 1) {
        expectPassable(gridPosition(col, row));
      }
    }
    // 左辺・右辺・中央の縦棒(col 3 / col 13 / col 8 の row 3〜11)
    for (const col of [...RING_COLS, CENTER_COL]) {
      for (let row = RING_MIN; row <= RING_ROW_MAX; row += 1) {
        expectPassable(gridPosition(col, row));
      }
    }
    // 中央の縦棒は研究所を貫いており、街道をたどるだけで研究所へ着く
    expect(map.getTile(LABORATORY)?.terrainType).toBe('laboratory');
  });

  it('自軍の角から敵軍の角までは、どのルートでも移動コスト 18 で等距離になる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const fromPlayerCorner = moveCostMap(map, 'infantry', [gridPosition(3, 11)]);
    expect(costTo(fromPlayerCorner, gridPosition(13, 3))).toBe(18);
  });

  it('研究所は盤面のちょうど中央に 1 個だけ置かれ、中立で始まる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const laboratories: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (tile.terrainType === 'laboratory') laboratories.push(tile.position);
    });
    expect(laboratories).toEqual([LABORATORY]);
    expect(LABORATORY.col).toBe((map.cols - 1) / 2);
    expect(LABORATORY.row).toBe((map.rows - 1) / 2);
    expect(map.getTile(LABORATORY)?.owner).toBe('neutral');
  });

  it('研究所は自軍の工場からちょうど 3 ターン(移動コスト 9)で届く', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const movement = UNIT_DATA.infantry.movement;
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const cost = costTo(fromPlayer, LABORATORY);
    expect(cost).toBe(9);
    // 2 ターンぶん(6)では届かず、3 ターンぶん(9)でぴったり届く
    expect(cost).toBeGreaterThan(movement * 2);
    expect(turnsFor(cost, movement)).toBe(3);
    // 最短になるのは街道の角にある前線工場 (3,11)。残る 3 拠点はそれより遠い
    expect(costTo(moveCostMap(map, 'infantry', [gridPosition(3, 11)]), LABORATORY)).toBe(
      9,
    );
    for (const base of [gridPosition(2, 11), gridPosition(3, 12), PLAYER_HQ]) {
      expect(costTo(moveCostMap(map, 'infantry', [base]), LABORATORY)).toBeGreaterThan(9);
    }
  });

  it('研究所までの距離は両軍とも等しく、先に動ける自軍が先着する', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const fromEnemy = moveCostMap(map, 'infantry', ENEMY_BASES);
    expect(costTo(fromEnemy, LABORATORY)).toBe(costTo(fromPlayer, LABORATORY));
  });

  it('中立の研究所を占領し切った歩兵は、その場で新型戦車へ進化する', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const tile = map.getTile(LABORATORY);
    if (!tile) throw new Error('研究所のマスが見つかりません');
    const capture = new CaptureSystem();
    const infantry = new Unit({
      id: 'player-infantry',
      unitType: 'infantry',
      armyType: 'player',
      position: LABORATORY,
    });
    // 占領耐久値 20 を HP10 の歩兵が 2 回に分けて削り切る
    expect(capture.capture(infantry, tile).captured).toBe(false);
    infantry.hasActed = false;
    const result = capture.capture(infantry, tile);
    expect(result.captured).toBe(true);
    expect(result.evolvedTo).toBe('newTank');
    expect(infantry.unitType).toBe('newTank');
    expect(tile.owner).toBe('player');
  });

  it('中立都市は 14 個で、設計どおりの座標に置かれている', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const cities = basesOf(map, 'neutral').filter((base) => base.terrainType === 'city');
    expect(cities).toHaveLength(14);
    for (const city of cities) {
      expect(NEUTRAL_CITIES).toContainEqual(gridPosition(city.col, city.row));
    }
  });

  it('中立都市までの移動コストは設計どおり(陣地の隣・左上・右下の 4 連・対角線)', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const fromEnemy = moveCostMap(map, 'infantry', ENEMY_BASES);
    for (const plan of CITY_PLANS) {
      expect({
        pos: plan.pos,
        player: costTo(fromPlayer, plan.pos),
        enemy: costTo(fromEnemy, plan.pos),
      }).toEqual({ pos: plan.pos, player: plan.player, enemy: plan.enemy });
    }
  });

  it('先に届く中立都市は自軍 6 個・敵軍 8 個で、後手の敵軍が 2 個ぶん多い', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const fromEnemy = moveCostMap(map, 'infantry', ENEMY_BASES);
    for (const plan of CITY_PLANS) {
      // 同着のマスは先に動ける自軍(先手)が取れる
      const first =
        costTo(fromPlayer, plan.pos) <= costTo(fromEnemy, plan.pos) ? 'player' : 'enemy';
      expect(first).toBe(plan.first);
    }
    expect(CITY_PLANS.filter((plan) => plan.first === 'player')).toHaveLength(6);
    expect(CITY_PLANS.filter((plan) => plan.first === 'enemy')).toHaveLength(8);
  });

  it('陣地のすぐ隣の中立都市は両軍 2 個ずつで、1 ターンで届くのは後手の敵軍だけ', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const movement = UNIT_DATA.infantry.movement;
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const fromEnemy = moveCostMap(map, 'infantry', ENEMY_BASES);
    for (const city of PLAYER_HOME_CITIES) {
      // 自軍の 2 個は移動 2 ターン。1 ターンぶん(移動力 3)では届かない
      expect(costTo(fromPlayer, city)).toBeGreaterThan(movement);
      expect(turnsFor(costTo(fromPlayer, city), movement)).toBe(2);
      // 取り合いにはならない(敵軍からは遠い)
      expect(costTo(fromEnemy, city)).toBeGreaterThan(costTo(fromPlayer, city));
    }
    for (const city of ENEMY_HOME_CITIES) {
      // 敵軍の 2 個は移動 1 ターン。生産の次のターンから占領を始められる
      expect(turnsFor(costTo(fromEnemy, city), movement)).toBe(1);
      expect(costTo(fromPlayer, city)).toBeGreaterThan(costTo(fromEnemy, city));
    }
  });

  it('後手の敵軍は、先手の自軍より 1 ターン早く陣地の隣の都市を占領し切れる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const movement = UNIT_DATA.infantry.movement;
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const fromEnemy = moveCostMap(map, 'infantry', ENEMY_BASES);
    /**
     * 1 ターン目に生産した歩兵が、その都市を占領し切るターン数。
     * 生産ターンは動けないので移動の開始は 2 ターン目、
     * 到着したターンから占領耐久値 20 を HP10 の歩兵が 2 ターンかけて削り切る。
     */
    const captureTurn = (cost: number): number => 1 + turnsFor(cost, movement) + 1;
    for (const playerCity of PLAYER_HOME_CITIES) {
      for (const enemyCity of ENEMY_HOME_CITIES) {
        expect(captureTurn(costTo(fromEnemy, enemyCity))).toBe(
          captureTurn(costTo(fromPlayer, playerCity)) - 1,
        );
      }
    }
    // 敵軍は 3 ターン目・自軍は 4 ターン目に占領が終わる
    for (const city of ENEMY_HOME_CITIES) {
      expect(captureTurn(costTo(fromEnemy, city))).toBe(3);
    }
    for (const city of PLAYER_HOME_CITIES) {
      expect(captureTurn(costTo(fromPlayer, city))).toBe(4);
    }
  });

  it('右下の 4 連都市は下辺の街道のすぐ下に、4 マス続けて並ぶ', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    for (const city of SOUTH_EAST_ROW_CITIES) {
      // 下辺の街道 row 11 の 1 マス下(row 12)に並ぶ
      expect(city.row).toBe(RING_ROW_MAX + 1);
      expect(map.getTile(city)?.terrainType).toBe('city');
      expect(map.getTile(city)?.owner).toBe('neutral');
      // すぐ上は下辺の街道。街道は col 3〜13 なので、東端の (14,12) だけは街道の外側に出る
      const above = map.getTile(gridPosition(city.col, RING_ROW_MAX));
      const expected = city.col <= RING_COL_MAX ? ['road', 'city'] : ['forest'];
      expect(expected).toContain(above?.terrainType);
    }
    // col 11〜14 が途切れずに続いている
    const cols = SOUTH_EAST_ROW_CITIES.map((city) => city.col);
    expect(cols).toEqual([11, 12, 13, 14]);
  });

  it('対角線(col - row = 2)の 4 個は、4 個とも敵軍が 1 ターン早く届く', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const movement = UNIT_DATA.infantry.movement;
    const fromPlayer = moveCostMap(map, 'infantry', PLAYER_BASES);
    const fromEnemy = moveCostMap(map, 'infantry', ENEMY_BASES);
    const diagonal = [
      gridPosition(5, 3),
      gridPosition(7, 5),
      gridPosition(10, 8),
      gridPosition(13, 11),
    ];
    for (const city of diagonal) {
      expect(city.col - city.row).toBe(2);
      expect(costTo(fromEnemy, city)).toBe(8);
      expect(costTo(fromPlayer, city)).toBe(10);
      // 敵軍は 3 ターン、自軍は 4 ターン。先着はするが、自軍も取り合いに参加できる距離
      expect(turnsFor(costTo(fromEnemy, city), movement)).toBe(3);
      expect(turnsFor(costTo(fromPlayer, city), movement)).toBe(4);
    }
  });

  it('中立拠点は研究所 1 個と中立都市 14 個(取り合いの対象は 15 拠点)', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const neutrals = basesOf(map, 'neutral');
    expect(neutrals).toHaveLength(15);
    expect(neutrals.filter((base) => base.terrainType === 'laboratory')).toHaveLength(1);
    expect(neutrals.filter((base) => base.terrainType === 'city')).toHaveLength(14);
  });

  it('先着ぶんを取り切った収入は自軍 11000・敵軍 12000 で、敵軍が 1000 上回る', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    // 研究所は等距離なので先に動ける自軍が取る
    const laboratory = map.getTile(LABORATORY);
    if (laboratory) laboratory.owner = 'player';
    for (const plan of CITY_PLANS) {
      const tile = map.getTile(plan.pos);
      if (tile) tile.owner = plan.first;
    }
    const economy = new EconomyManager();
    // 自軍: 陣地 4 + 研究所 1 + 都市 6 = 11 拠点
    expect(economy.getIncome('player', map)).toBe(11000);
    // 敵軍: 陣地 4 + 都市 8 = 12 拠点
    expect(economy.getIncome('enemy', map)).toBe(12000);
  });

  it('道路に挟まれた内側は、左が山・中央が平地・右が森を多めに配置してある', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const left = bandTerrainCount(map, LEFT_BAND);
    const center = bandTerrainCount(map, CENTER_BAND);
    const right = bandTerrainCount(map, RIGHT_BAND);
    // 各帯は 3 列 × 7 行 = 21 マス。左は山 16・右は森 16 で 4 分の 3 以上を占める
    expect(left.mountain).toBe(16);
    expect(right.forest).toBe(16);
    // 中央は平地 13・街道 6(縦棒)・研究所 1・中立都市 1 で、山も森も 1 マスも無い
    expect(center.plain).toBe(13);
    expect(center.road).toBe(6);
    expect(center.laboratory).toBe(1);
    expect(center.city).toBe(1);
    expect(center.mountain).toBeUndefined();
    expect(center.forest).toBeUndefined();
    expect(left.mountain).toBeGreaterThan((left.plain ?? 0) + (left.forest ?? 0));
    expect(right.forest).toBeGreaterThan((right.plain ?? 0) + (right.mountain ?? 0));
  });

  it('左の山帯は車両が 1 両も通れず、歩兵だけが乗り越えられる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const band = {
      colMin: LEFT_BAND.colMin,
      colMax: LEFT_BAND.colMax,
      rowMin: BAND_ROW_MIN,
      rowMax: BAND_ROW_MAX,
    };
    const fromSouth = (pos: GridPosition): boolean => pos.row === BAND_ROW_MAX;
    const toNorth = (pos: GridPosition): boolean => pos.row === BAND_ROW_MIN;
    expect(canReachWithin(map, 'infantry', band, fromSouth, toNorth)).toBe(true);
    expect(canReachWithin(map, 'vehicle', band, fromSouth, toNorth)).toBe(false);
    expect(canReachWithin(map, 'wheeled', band, fromSouth, toNorth)).toBe(false);
  });

  it('右の森帯は歩兵・装軌車両は通れるが、装輪車両は通り抜けられない', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const band = {
      colMin: RIGHT_BAND.colMin,
      colMax: RIGHT_BAND.colMax,
      rowMin: BAND_ROW_MIN,
      rowMax: BAND_ROW_MAX,
    };
    const fromSouth = (pos: GridPosition): boolean => pos.row === BAND_ROW_MAX;
    const toNorth = (pos: GridPosition): boolean => pos.row === BAND_ROW_MIN;
    expect(canReachWithin(map, 'infantry', band, fromSouth, toNorth)).toBe(true);
    expect(canReachWithin(map, 'vehicle', band, fromSouth, toNorth)).toBe(true);
    expect(canReachWithin(map, 'wheeled', band, fromSouth, toNorth)).toBe(false);
  });

  it('中央の平地帯はすべての地上ユニットが南北に通り抜けられる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const band = {
      colMin: CENTER_BAND.colMin,
      colMax: CENTER_BAND.colMax,
      rowMin: BAND_ROW_MIN,
      rowMax: BAND_ROW_MAX,
    };
    const fromSouth = (pos: GridPosition): boolean => pos.row === BAND_ROW_MAX;
    const toNorth = (pos: GridPosition): boolean => pos.row === BAND_ROW_MIN;
    for (const movementType of GROUND_MOVEMENTS) {
      expect(canReachWithin(map, movementType, band, fromSouth, toNorth)).toBe(true);
    }
  });

  it('敵軍AIは本拠地の無い盤面でも、生産と中立拠点の占領を進められる', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    const units = UnitManager.fromPlacements(RING_LABORATORY_MAP.units ?? [], map);
    const economy = new EconomyManager({
      initialFunds: RING_LABORATORY_MAP.initialFunds,
    });
    const ai = new EnemyAi({
      map,
      units,
      battle: new BattleManager(map, units),
      capture: new CaptureSystem(),
      production: new ProductionManager(map, units, economy),
    });

    // 収入 → 敵軍AIの手番 → 行動済みのリセット、を 6 ターンぶん繰り返す
    for (let turn = 0; turn < 6; turn += 1) {
      economy.collectIncome('enemy', map);
      expect(() => ai.run()).not.toThrow();
      for (const unit of units.getUnitsByArmy('enemy')) unit.hasActed = false;
    }

    // 工場 3 つから歩兵を出し、3 ターンで届く中立都市を実際に占領できている
    expect(units.getUnitsByArmy('enemy').length).toBeGreaterThan(0);
    const captured = NEUTRAL_CITIES.filter(
      (city) => map.getTile(city)?.owner === 'enemy',
    );
    expect(captured.length).toBeGreaterThan(0);
  });

  it('進入できるマスに、街道からたどり着けない袋小路は無い', () => {
    const map = MapManager.fromDefinition(RING_LABORATORY_MAP);
    for (const movementType of GROUND_MOVEMENTS) {
      const dist = moveCostMap(map, movementType, PLAYER_BASES);
      map.forEachTile((tile) => {
        if (map.getMoveCost(tile.position, movementType) === null) return;
        expect(costTo(dist, tile.position)).toBeLessThan(Infinity);
      });
    }
  });
});
