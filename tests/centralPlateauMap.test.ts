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
import { MAP_LIST, mapsInGroup } from '@/data/maps';
import { removeAbsentArmies } from '@/data/maps/armySlots';
import { CENTRAL_PLATEAU_MAP } from '@/data/maps/centralPlateauMap';
import { getTerrainData } from '@/data/terrainData';

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
  player: gridPosition(2, 2),
  enemy: gridPosition(23, 2),
  third: gridPosition(2, 23),
  fourth: gridPosition(23, 23),
};

/** 各軍の峠を抜けた先の、高台の入口のマス */
const GATE: Readonly<Record<TurnArmy, GridPosition>> = {
  player: gridPosition(9, 12),
  enemy: gridPosition(14, 9),
  third: gridPosition(10, 16),
  fourth: gridPosition(16, 16),
};

const WEST_LAB = gridPosition(10, 13);
const EAST_LAB = gridPosition(16, 12);
const AIRPORT = gridPosition(13, 13);

/** 盤面を 90 度回したときの座標(1P の左上 → 2P の右上 → 4P の右下 → 3P の左下) */
function rotate(pos: GridPosition, size: number): GridPosition {
  return gridPosition(size - 1 - pos.row, pos.col);
}

/** 高台の内側(山の輪の内側)かどうか */
function onPlateau(pos: GridPosition): boolean {
  return pos.col >= 9 && pos.col <= 16 && pos.row >= 9 && pos.row <= 16;
}

/** 高台を囲む山の輪(厚さ 2)の上かどうか */
function onRing(pos: GridPosition): boolean {
  const inOuter = pos.col >= 7 && pos.col <= 18 && pos.row >= 7 && pos.row <= 18;
  return inOuter && !onPlateau(pos);
}

describe('中央高台マップ(4P マップ)', () => {
  const map = MapManager.fromDefinition(CENTRAL_PLATEAU_MAP);

  const terrainAt = (pos: GridPosition): TerrainType | undefined =>
    map.getTile(pos)?.terrainType;

  /** 指定した軍の工場 */
  const factories = (army: TurnArmy): GridPosition[] => {
    const found: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (tile.owner === army && tile.terrainType === 'factory')
        found.push(tile.position);
    });
    return found;
  };

  /** 工場ごと・移動タイプごとの距離表(同じ計算を繰り返さないように覚えておく) */
  const distanceCache = new Map<string, ReturnType<typeof distancesFrom>>();
  const distancesFromCached = (
    from: GridPosition,
    movementType: MovementType,
  ): ReturnType<typeof distancesFrom> => {
    const cacheKey = `${key(from)}:${movementType}`;
    let table = distanceCache.get(cacheKey);
    if (table === undefined) {
      table = distancesFrom(map, from, movementType);
      distanceCache.set(cacheKey, table);
    }
    return table;
  };

  /** 陣地の工場のうち、いちばん近いものからの移動コスト */
  const costFromCamp = (
    army: TurnArmy,
    target: GridPosition,
    movementType: MovementType = 'infantry',
  ): number =>
    Math.min(
      ...factories(army).map(
        (from) => distancesFromCached(from, movementType).get(target) ?? Infinity,
      ),
    );

  it('26x26 の 4P マップとして一覧に登録されている', () => {
    expect(map.cols).toBe(26);
    expect(map.rows).toBe(26);
    const entry = MAP_LIST.find((item) => item.id === 'centralPlateau');
    expect(entry?.group).toBe('four');
    expect(entry?.category).toBe('normal');
    expect(mapsInGroup(MAP_LIST, 'four')).toContain(entry);
  });

  it('4 軍とも本拠地 1・工場 3(1P 左上・2P 右上・3P 左下・4P 右下)', () => {
    for (const army of ARMIES) {
      const counts: Record<string, number> = {};
      map.forEachTile((tile) => {
        if (tile.owner === army) {
          counts[tile.terrainType] = (counts[tile.terrainType] ?? 0) + 1;
        }
      });
      expect(counts).toEqual({ headquarters: 1, factory: 3 });
      expect(map.getTile(HQ[army])?.terrainType).toBe('headquarters');
      expect(map.getTile(HQ[army])?.owner).toBe(army);
    }
  });

  it('初期ユニットは無く、初期資金は 0。収入は 4 軍とも 4000', () => {
    expect(CENTRAL_PLATEAU_MAP.units ?? []).toHaveLength(0);
    expect(CENTRAL_PLATEAU_MAP.initialFunds).toBe(0);
    const economy = new EconomyManager({ initialFunds: 0 });
    for (const army of ARMIES) {
      expect(economy.getIncome(army, map)).toBe(4000);
    }
  });

  it('高台は厚さ 2 マスの山の輪に囲まれ、峠 4 か所だけが道路で抜けている', () => {
    const passes: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (!onRing(tile.position)) return;
      if (tile.terrainType === 'road') {
        passes.push(tile.position);
      } else {
        expect(tile.terrainType).toBe('mountain');
      }
    });
    // 峠は 1 か所につき 2 マス(山の厚さぶん)
    expect(passes).toHaveLength(8);
    // 輪の 80 マスのうち、峠の 8 マスを除いた 72 マスが山
    expect(tilesOf(map, 'mountain').filter(onRing)).toHaveLength(72);
  });

  it('高台の中の中立拠点は研究所 2 個と空港 1 個だけで、空港は盤面でここだけ', () => {
    const plateauBases: string[] = [];
    map.forEachTile((tile) => {
      if (onPlateau(tile.position) && getTerrainData(tile.terrainType).canCapture) {
        expect(tile.owner).toBe('neutral');
        plateauBases.push(key(tile.position));
      }
    });
    expect(plateauBases.sort()).toEqual(
      [key(AIRPORT), key(EAST_LAB), key(WEST_LAB)].sort(),
    );
    expect(terrainAt(WEST_LAB)).toBe('laboratory');
    expect(terrainAt(EAST_LAB)).toBe('laboratory');
    expect(tilesOf(map, 'laboratory')).toHaveLength(2);
    expect(tilesOf(map, 'airport')).toEqual([AIRPORT]);
    expect(tilesOf(map, 'port')).toHaveLength(0);
    expect(tilesOf(map, 'station')).toHaveLength(0);
    expect(tilesOf(map, 'sea')).toHaveLength(0);
  });

  it('車両は峠を通らないと高台へ上がれない', () => {
    for (const movementType of ['vehicle', 'wheeled'] as const) {
      for (const army of ARMIES) {
        const reach = distancesFrom(map, HQ[army], movementType);
        // 高台へ入るときに最初に踏む内側のマスは、峠の出口(GATE)のどれか
        map.forEachTile((tile) => {
          if (!onPlateau(tile.position)) return;
          const cost = reach.get(tile.position);
          if (cost === undefined) return;
          const fromOutside = neighbors(tile.position).some(
            (next) =>
              map.isInBounds(next) && !onPlateau(next) && reach.get(next) !== undefined,
          );
          if (fromOutside) {
            expect(Object.values(GATE).map(key)).toContain(key(tile.position));
          }
        });
        // 研究所と空港へはどの軍の車両も行ける
        expect(reach.get(WEST_LAB)).toBeDefined();
        expect(reach.get(EAST_LAB)).toBeDefined();
        expect(reach.get(AIRPORT)).toBeDefined();
      }
    }
  });

  it('峠は手番の遅い軍ほど近い(工場から高台の入口まで 15 / 14 / 13 / 12)', () => {
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(ARMIES.map((army) => costFromCamp(army, GATE[army], movementType))).toEqual([
        15, 14, 13, 12,
      ]);
    }
  });

  it('西の研究所は 1P と 3P・東の研究所は 2P と 4P が狙い、空港は 4P がいちばん近い', () => {
    expect(ARMIES.map((army) => costFromCamp(army, WEST_LAB))).toEqual([17, 22, 16, 21]);
    expect(ARMIES.map((army) => costFromCamp(army, EAST_LAB))).toEqual([22, 17, 23, 16]);
    expect(ARMIES.map((army) => costFromCamp(army, AIRPORT))).toEqual([20, 19, 19, 18]);
  });

  it('峠を除けば、陣地まわりの地形と中立都市は 90 度ずつ回した同じ並び', () => {
    const size = map.cols;
    const isPassRoad = (pos: GridPosition): boolean =>
      terrainAt(pos) === 'road' && (onRing(pos) || onPlateau(pos));
    const spurs: readonly GridPosition[] = [
      // 環状道路から峠までの支線(峠と同じく回転させていない)
      ...[5, 6].map((col) => gridPosition(col, 12)),
      ...[5, 6].map((row) => gridPosition(14, row)),
      ...[19, 20].map((row) => gridPosition(10, row)),
      ...[19, 20].map((col) => gridPosition(col, 16)),
    ];
    const isSpur = (pos: GridPosition): boolean => spurs.some((s) => key(s) === key(pos));
    map.forEachTile((tile) => {
      const pos = tile.position;
      if (onPlateau(pos) || isPassRoad(pos) || isSpur(pos)) return;
      const turned = rotate(pos, size);
      if (onPlateau(turned) || isPassRoad(turned) || isSpur(turned)) return;
      expect(terrainAt(turned)).toBe(tile.terrainType);
    });
    // 陣地もそのまま回した位置にある
    expect(key(rotate(HQ.player, size))).toBe(key(HQ.enemy));
    expect(key(rotate(HQ.enemy, size))).toBe(key(HQ.fourth));
    expect(key(rotate(HQ.fourth, size))).toBe(key(HQ.third));
  });

  it('中立都市は 24 個で、4 軍とも最寄りの 6 個までの距離が同じ', () => {
    const cities = tilesOf(map, 'city');
    expect(cities).toHaveLength(24);
    const nearest = (army: TurnArmy): number[] =>
      cities
        .filter((city) =>
          ARMIES.every((other) => costFromCamp(army, city) <= costFromCamp(other, city)),
        )
        .map((city) => costFromCamp(army, city))
        .sort((a, b) => a - b);
    for (const army of ARMIES) {
      expect(nearest(army)).toEqual([2, 4, 6, 7, 7, 8]);
    }
  });

  it('「なし」を選んだ軍勢の陣地は中立(本拠地は都市)になる', () => {
    const setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'fourth', { control: 'none' });
    const def = removeAbsentArmies(CENTRAL_PLATEAU_MAP, absentArmies(setup));
    const reduced = MapManager.fromDefinition(def);
    expect(reduced.getTile(HQ.fourth)?.terrainType).toBe('city');
    let fourthTiles = 0;
    reduced.forEachTile((tile) => {
      if (tile.owner === 'fourth') fourthTiles += 1;
    });
    expect(fourthTiles).toBe(0);
    expect(findHomeHeadquarters(reduced).has('fourth')).toBe(false);
    expect(findHomeHeadquarters(reduced).size).toBe(3);
  });

  it('4 軍ともコンピューターにしても、手番を回して拠点を取り合える', () => {
    const def = CENTRAL_PLATEAU_MAP;
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

    // どの軍も生産して陣地のまわりの都市を取りに出ている
    for (const army of order) {
      if (!turn.isEliminated(army)) {
        expect(economy.countBases(army, aiMap)).toBeGreaterThan(
          initialBases.get(army) ?? 0,
        );
      }
    }
  });
});
