import { describe, expect, it } from 'vitest';
import { EnemyAi } from '@/core/ai/EnemyAi';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { RepairManager } from '@/core/economy/RepairManager';
import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType, TerrainType } from '@/core/map/TerrainType';
import {
  DEFAULT_FOUR_PLAYER_SETUP,
  absentArmies,
  participatingArmies,
  withSlot,
} from '@/core/mode/FourPlayerSetup';
import { distancesFrom } from '@/core/movement/PathDistance';
import { TurnManager, type TurnArmy } from '@/core/turn/TurnManager';
import { UnitManager } from '@/core/units/UnitManager';
import {
  applyElimination,
  EliminationChecker,
  findHomeHeadquarters,
  judgeFourPlayer,
} from '@/core/victory/ArmyElimination';
import { INCOME_PER_BASE } from '@/data/economyConfig';
import { MAP_LIST, mapsInGroup } from '@/data/maps';
import { removeAbsentArmies } from '@/data/maps/armySlots';
import { TWIN_SHOAL_ISLANDS_MAP } from '@/data/maps/twinShoalIslandsMap';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

/** 座標を集合のキーにする */
function key(pos: GridPosition): string {
  return `${pos.col},${pos.row}`;
}

/** 上下左右の隣接マス */
function neighbors(pos: GridPosition): GridPosition[] {
  return [
    { col: pos.col, row: pos.row - 1 },
    { col: pos.col, row: pos.row + 1 },
    { col: pos.col - 1, row: pos.row },
    { col: pos.col + 1, row: pos.row },
  ];
}

/** start から pass を満たすマスだけを幅優先でたどり、到達できたマスの集合を返す */
function floodFill(
  map: MapManager,
  start: GridPosition,
  pass: (pos: GridPosition) => boolean,
): Set<string> {
  const seen = new Set<string>([key(start)]);
  const queue: GridPosition[] = [start];
  while (queue.length > 0) {
    const current = queue.pop() as GridPosition;
    for (const next of neighbors(current)) {
      if (!map.isInBounds(next) || seen.has(key(next)) || !pass(next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/** 指定地形のマスをすべて集める */
function tilesOf(map: MapManager, terrain: TerrainType): GridPosition[] {
  const found: GridPosition[] = [];
  map.forEachTile((tile) => {
    if (tile.terrainType === terrain) found.push(tile.position);
  });
  return found;
}

const ARMIES: readonly TurnArmy[] = ['player', 'enemy', 'third', 'fourth'];

/** 各軍の本拠地 */
const HQ: Readonly<Record<TurnArmy, GridPosition>> = {
  player: gridPosition(3, 2),
  enemy: gridPosition(16, 3),
  third: gridPosition(3, 20),
  fourth: gridPosition(16, 20),
};

describe('双瀬四島マップ(4P マップ)', () => {
  const map = MapManager.fromDefinition(TWIN_SHOAL_ISLANDS_MAP);
  const midCol = map.cols / 2;
  const midRow = map.rows / 2;
  /** 西の島・東の島の横の範囲 */
  const WEST_COLS = [1, 8] as const;
  const EAST_COLS = [11, 18] as const;

  /** そのマスがどの軍の島(盤面の 4 分の 1)に入るか */
  const quarterOf = (pos: GridPosition): TurnArmy => {
    if (pos.row < midRow) return pos.col < midCol ? 'player' : 'enemy';
    return pos.col < midCol ? 'third' : 'fourth';
  };

  const terrainAt = (pos: GridPosition): TerrainType | undefined =>
    map.getTile(pos)?.terrainType;
  const isSea = (pos: GridPosition): boolean => terrainAt(pos) === 'sea';
  const isShoal = (pos: GridPosition): boolean => terrainAt(pos) === 'river';
  const isLand = (pos: GridPosition): boolean => !isSea(pos) && !isShoal(pos);

  /** 指定した軍が地上ユニットを生産できるマス(工場・本拠地) */
  const producers = (army: TurnArmy): GridPosition[] => {
    const found: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (
        tile.owner === army &&
        (tile.terrainType === 'factory' || tile.terrainType === 'headquarters')
      ) {
        found.push(tile.position);
      }
    });
    return found;
  };

  /** 陣地の工場・本拠地のうち、いちばん近いものからの移動コスト */
  const costFromCamp = (
    army: TurnArmy,
    target: GridPosition,
    movementType: MovementType = 'infantry',
  ): number =>
    Math.min(
      ...producers(army).map(
        (from) => distancesFrom(map, from, movementType).get(target) ?? Infinity,
      ),
    );

  it('20x24 の 4P マップとして一覧に登録されている', () => {
    expect(map.cols).toBe(20);
    expect(map.rows).toBe(24);
    const entry = MAP_LIST.find((item) => item.id === 'twinShoalIslands');
    expect(entry?.group).toBe('four');
    expect(entry?.category).toBe('normal');
    expect(mapsInGroup(MAP_LIST, 'four')).toContain(entry);
  });

  it('4 軍とも本拠地 1・工場 4・空港 2・港 2(1P 左上・2P 右上・3P 左下・4P 右下)', () => {
    for (const army of ARMIES) {
      const counts: Record<string, number> = {};
      map.forEachTile((tile) => {
        if (tile.owner === army) {
          counts[tile.terrainType] = (counts[tile.terrainType] ?? 0) + 1;
          // 陣地の拠点はすべて自分の島の中にある
          expect(quarterOf(tile.position)).toBe(army);
        }
      });
      expect(counts).toEqual({ headquarters: 1, factory: 4, airport: 2, port: 2 });
      expect(map.getTile(HQ[army])?.terrainType).toBe('headquarters');
      expect(map.getTile(HQ[army])?.owner).toBe(army);
      expect(quarterOf(HQ[army])).toBe(army);
    }
  });

  it('初期ユニットは無く、初期資金は 0。収入は 4 軍とも 9000', () => {
    expect(TWIN_SHOAL_ISLANDS_MAP.units ?? []).toHaveLength(0);
    expect(TWIN_SHOAL_ISLANDS_MAP.initialFunds).toBe(0);
    const economy = new EconomyManager({ initialFunds: 0 });
    for (const army of ARMIES) {
      expect(economy.getIncome(army, map)).toBe(9000);
    }
  });

  it('中立の拠点は都市だけで島ごとに 6 個。陣地と合わせて島ごとの収入は 15000', () => {
    const neutralBases: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (tile.owner === 'neutral' && getTerrainData(tile.terrainType).canCapture) {
        neutralBases.push(tile.position);
      }
    });
    for (const pos of neutralBases) {
      expect(terrainAt(pos)).toBe('city');
    }
    for (const army of ARMIES) {
      const cities = neutralBases.filter((pos) => quarterOf(pos) === army);
      expect(cities).toHaveLength(6);
      // 陣地の収入 9000 + 都市 6 個ぶん = 島を取り切ったときの収入 15000
      const campIncome = new EconomyManager({ initialFunds: 0 }).getIncome(army, map);
      expect(campIncome + cities.length * INCOME_PER_BASE).toBe(15000);
    }
    expect(tilesOf(map, 'laboratory')).toHaveLength(0);
    expect(tilesOf(map, 'station')).toHaveLength(0);
  });

  it('島はどれも横 8 マス以内で、4 つの島は鏡写しではなく少しずつ違う', () => {
    map.forEachTile((tile) => {
      if (!isLand(tile.position)) return;
      const [from, to] = tile.position.col < midCol ? WEST_COLS : EAST_COLS;
      expect(tile.position.col).toBeGreaterThanOrEqual(from);
      expect(tile.position.col).toBeLessThanOrEqual(to);
    });
    // 各島を 1P の島の向きにそろえて(左右・上下を反転して)比べても、どの 2 島も一致しない
    const rows = TWIN_SHOAL_ISLANDS_MAP.terrain;
    const island = (army: TurnArmy): string[] => {
      const east = army === 'enemy' || army === 'fourth';
      const south = army === 'third' || army === 'fourth';
      const [from, to] = east ? EAST_COLS : WEST_COLS;
      const band = south ? rows.slice(13, 23) : rows.slice(1, 11);
      const cells = band.map((line) => {
        const part = line.slice(from, to + 1);
        return east ? [...part].reverse().join('') : part;
      });
      return south ? cells.reverse() : cells;
    };
    const shapes = ARMIES.map((army) => island(army).join('/'));
    expect(new Set(shapes).size).toBe(4);
  });

  it('陸は 4 つの島に分かれ、外周はすべて海', () => {
    for (let col = 0; col < map.cols; col += 1) {
      expect(isSea(gridPosition(col, 0))).toBe(true);
      expect(isSea(gridPosition(col, map.rows - 1))).toBe(true);
    }
    for (let row = 0; row < map.rows; row += 1) {
      expect(isSea(gridPosition(0, row))).toBe(true);
      expect(isSea(gridPosition(map.cols - 1, row))).toBe(true);
    }
    // 浅瀬を除いた陸だけでたどると、どの島もほかの本拠地へつながらない
    let landTiles = 0;
    map.forEachTile((tile) => {
      if (isLand(tile.position)) landTiles += 1;
    });
    let islandTiles = 0;
    for (const army of ARMIES) {
      const island = floodFill(map, HQ[army], isLand);
      islandTiles += island.size;
      for (const other of ARMIES) {
        expect(island.has(key(HQ[other]))).toBe(other === army);
      }
    }
    // 陸のマスは 4 つの島のどれかに必ず入る(はぐれた小島は無い)
    expect(islandTiles).toBe(landTiles);
  });

  it('1P と 2P・3P と 4P の島だけが浅瀬でつながり、北と南は海で隔てられる', () => {
    // 浅瀬は島のあいだの海峡(col 9〜10)にだけあり、北と南に縦 4 マスで 1 か所ずつ
    const shoals = tilesOf(map, 'river');
    expect(shoals).toHaveLength(16);
    for (const shoal of shoals) {
      expect([9, 10]).toContain(shoal.col);
    }
    const shoalRows = (north: boolean): number[] => [
      ...new Set(
        shoals.filter((pos) => pos.row < midRow === north).map((pos) => pos.row),
      ),
    ];
    expect(shoalRows(true)).toEqual([4, 5, 6, 7]);
    expect(shoalRows(false)).toEqual([16, 17, 18, 19]);
    const walkable = (pos: GridPosition): boolean => !isSea(pos);
    const north = floodFill(map, HQ.player, walkable);
    expect(north.has(key(HQ.enemy))).toBe(true);
    expect(north.has(key(HQ.third))).toBe(false);
    expect(north.has(key(HQ.fourth))).toBe(false);
    const south = floodFill(map, HQ.third, walkable);
    expect(south.has(key(HQ.fourth))).toBe(true);
    expect(south.has(key(HQ.player))).toBe(false);
    // 北の島と南の島のあいだ(row 11〜12)は端から端まで海
    for (let row = 11; row <= 12; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        expect(isSea(gridPosition(col, row))).toBe(true);
      }
    }
  });

  it('浅瀬は歩兵と装軌車両なら渡れるが、装輪車両は渡れない', () => {
    expect(costFromCamp('player', HQ.enemy, 'infantry')).toBe(16);
    expect(costFromCamp('player', HQ.enemy, 'vehicle')).toBe(18);
    expect(costFromCamp('player', HQ.enemy, 'wheeled')).toBe(Infinity);
    expect(costFromCamp('enemy', HQ.player, 'infantry')).toBe(17);
    expect(costFromCamp('third', HQ.fourth, 'infantry')).toBe(16);
    expect(costFromCamp('fourth', HQ.third, 'vehicle')).toBe(19);
    expect(costFromCamp('fourth', HQ.third, 'wheeled')).toBe(Infinity);
    // 海を隔てた相手の本拠地へは、地上ユニットは歩いて行けない
    expect(costFromCamp('player', HQ.third, 'infantry')).toBe(Infinity);
    expect(costFromCamp('enemy', HQ.fourth, 'vehicle')).toBe(Infinity);
  });

  it('港は陣地のそば(工場から 3 マス以内)で、1P・3P は島の左側・2P・4P は島の右側', () => {
    for (const port of tilesOf(map, 'port')) {
      const army = map.getTile(port)?.owner as TurnArmy;
      const factories = producers(army).filter((pos) => terrainAt(pos) === 'factory');
      const nearest = Math.min(
        ...factories.map(
          (factory) =>
            Math.abs(factory.col - port.col) + Math.abs(factory.row - port.row),
        ),
      );
      expect(nearest).toBeGreaterThanOrEqual(1);
      expect(nearest).toBeLessThanOrEqual(3);
      // 島の外側の海岸に面している
      const west = army === 'player' || army === 'third';
      expect(port.col).toBe(west ? WEST_COLS[0] : EAST_COLS[1]);
      expect(isSea(gridPosition(west ? port.col - 1 : port.col + 1, port.row))).toBe(
        true,
      );
    }
  });

  it('北と南のあいだの海は幅 2 マスで、ロケット砲は海越しに向かいの島を撃てる', () => {
    const rocket = getUnitData('rocketArtillery');
    // 北の島の南の海岸(row 10)から南の島の北の海岸(row 13)までは 3 マス
    const gap = 13 - 10;
    expect(gap).toBeGreaterThanOrEqual(rocket.minAttackRange);
    expect(gap).toBeLessThanOrEqual(rocket.maxAttackRange);
    // 西の島どうし・東の島どうしで、真向かいに陸が向き合う海岸がある
    for (const col of [2, 12]) {
      expect(isLand(gridPosition(col, 10))).toBe(true);
      expect(isLand(gridPosition(col, 13))).toBe(true);
    }
    // 1P の港 (1,4) から、海を渡って 3P の港 (1,19) までは海路 17
    expect(distancesFrom(map, gridPosition(1, 4), 'sea').get(gridPosition(1, 19))).toBe(
      17,
    );
  });

  it('山は無く、陸は平地が主で、森は少し', () => {
    const count = (terrain: TerrainType): number => tilesOf(map, terrain).length;
    expect(count('mountain')).toBe(0);
    expect(count('plain')).toBeGreaterThan(count('road'));
    expect(count('plain')).toBeGreaterThan(count('forest') * 3);
    expect(count('forest')).toBeGreaterThan(0);
  });

  it('中立都市はどれも道路沿いにあり、1 個か 2 個の塊で置いてある', () => {
    const cities = tilesOf(map, 'city');
    const cityKeys = new Set(cities.map(key));
    const seen = new Set<string>();
    for (const city of cities) {
      expect(neighbors(city).some((pos) => terrainAt(pos) === 'road')).toBe(true);
      if (seen.has(key(city))) continue;
      const cluster = floodFill(map, city, (pos) => cityKeys.has(key(pos)));
      cluster.forEach((cell) => seen.add(cell));
      expect(cluster.size).toBeLessThanOrEqual(2);
    }
  });

  it('自分の島の中立都市は、手番の遅い軍ほどわずかに取りやすい', () => {
    const costs = (army: TurnArmy): number[] =>
      tilesOf(map, 'city')
        .filter((pos) => quarterOf(pos) === army)
        .map((city) => costFromCamp(army, city));
    const total = (army: TurnArmy): number =>
      costs(army).reduce((sum, cost) => sum + cost, 0);
    expect(ARMIES.map(total)).toEqual([31, 30, 29, 28]);
    // 1 ターン(移動コスト 3 以内)で届く都市は 4 軍とも 2 個
    for (const army of ARMIES) {
      expect(costs(army).filter((cost) => cost <= 3)).toHaveLength(2);
    }
  });

  it('「なし」を選んだ軍勢の陣地は中立(本拠地は都市)になる', () => {
    const setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'third', { control: 'none' });
    const def = removeAbsentArmies(TWIN_SHOAL_ISLANDS_MAP, absentArmies(setup));
    const reduced = MapManager.fromDefinition(def);
    expect(reduced.getTile(HQ.third)?.terrainType).toBe('city');
    let thirdTiles = 0;
    reduced.forEachTile((tile) => {
      if (tile.owner === 'third') thirdTiles += 1;
    });
    expect(thirdTiles).toBe(0);
    expect(findHomeHeadquarters(reduced).has('third')).toBe(false);
    expect(findHomeHeadquarters(reduced).size).toBe(3);
  });

  it('4 軍ともコンピューターにしても、手番を回して拠点を取り合える', () => {
    const def = TWIN_SHOAL_ISLANDS_MAP;
    const aiMap = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([], aiMap);
    const economy = new EconomyManager({ initialFunds: def.initialFunds });
    const battle = new BattleManager(aiMap, units);
    const capture = new CaptureSystem();
    const production = new ProductionManager(aiMap, units, economy);
    const repair = new RepairManager(aiMap, units, economy);
    const order = participatingArmies(DEFAULT_FOUR_PLAYER_SETUP);
    const turn = new TurnManager(units, undefined, order);
    const checker = new EliminationChecker(aiMap, units, findHomeHeadquarters(aiMap));
    const ais = new Map(
      order.map((army) => [
        army,
        new EnemyAi({ map: aiMap, units, battle, capture, production }, army),
      ]),
    );
    const initialBases = new Map(
      order.map((army) => [army, economy.countBases(army, aiMap)] as const),
    );

    // 4 軍 × 10 ターンぶん、収入 → 修理 → AI の手番 → 脱落の判定 を繰り返す
    for (let step = 0; step < order.length * 10; step += 1) {
      const army = turn.currentArmy;
      economy.collectIncome(army, aiMap);
      repair.repairAll(army);
      expect(() => ais.get(army)?.run()).not.toThrow();
      for (const elimination of checker.check(turn.activeArmies)) {
        applyElimination(elimination, aiMap, units);
        turn.eliminate(elimination.army);
      }
      if (judgeFourPlayer(turn.activeArmies, []).kind !== 'ongoing') {
        break;
      }
      turn.endTurn();
    }

    // どの軍も生産して自分の島の都市を取りに出ている
    for (const army of order) {
      if (!turn.isEliminated(army)) {
        expect(economy.countBases(army, aiMap)).toBeGreaterThan(
          initialBases.get(army) ?? 0,
        );
      }
    }
  });
});
