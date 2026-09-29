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
import { FOUR_CAMPS_ISLAND_MAP } from '@/data/maps/fourCampsIslandMap';
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

/** 各軍の陣地(本拠地・工場) */
const CAMPS: Readonly<
  Record<TurnArmy, { hq: GridPosition; factories: readonly GridPosition[] }>
> = {
  player: {
    hq: gridPosition(4, 3),
    factories: [gridPosition(5, 3), gridPosition(4, 4), gridPosition(5, 4)],
  },
  enemy: {
    hq: gridPosition(27, 3),
    factories: [gridPosition(26, 3), gridPosition(26, 4), gridPosition(27, 4)],
  },
  third: {
    hq: gridPosition(5, 20),
    factories: [gridPosition(5, 19), gridPosition(6, 19), gridPosition(6, 20)],
  },
  fourth: {
    hq: gridPosition(27, 20),
    factories: [gridPosition(26, 19), gridPosition(27, 19), gridPosition(26, 20)],
  },
};

const ARMIES: readonly TurnArmy[] = ['player', 'enemy', 'third', 'fourth'];

/** 陣地の工場のうち、いちばん近いものからの移動コスト */
function costFromCamp(
  map: MapManager,
  army: TurnArmy,
  target: GridPosition,
  movementType: MovementType = 'infantry',
): number {
  return Math.min(
    ...CAMPS[army].factories.map(
      (factory) => distancesFrom(map, factory, movementType).get(target) ?? Infinity,
    ),
  );
}

describe('四陣大島マップ(4P マップ)', () => {
  const map = MapManager.fromDefinition(FOUR_CAMPS_ISLAND_MAP);

  it('32x24 の 4P マップとして一覧に登録されている', () => {
    expect(map.cols).toBe(32);
    expect(map.rows).toBe(24);
    const entry = MAP_LIST.find((item) => item.id === 'fourCampsIsland');
    expect(entry?.group).toBe('four');
    expect(entry?.category).toBe('normal');
    expect(mapsInGroup(MAP_LIST, 'four')).toContain(entry);
  });

  it('4 軍とも本拠地 1 + 工場 3 だけを持って始まる(1P 左上・2P 右上・3P 左下・4P 右下)', () => {
    for (const army of ARMIES) {
      const owned: string[] = [];
      map.forEachTile((tile) => {
        if (tile.owner === army) owned.push(`${tile.terrainType}@${key(tile.position)}`);
      });
      const camp = CAMPS[army];
      expect(owned.sort()).toEqual(
        [
          `headquarters@${key(camp.hq)}`,
          ...camp.factories.map((factory) => `factory@${key(factory)}`),
        ].sort(),
      );
    }
    expect(CAMPS.player.hq.col).toBeLessThan(16);
    expect(CAMPS.player.hq.row).toBeLessThan(12);
    expect(CAMPS.enemy.hq.col).toBeGreaterThan(16);
    expect(CAMPS.enemy.hq.row).toBeLessThan(12);
    expect(CAMPS.third.hq.col).toBeLessThan(16);
    expect(CAMPS.third.hq.row).toBeGreaterThan(12);
    expect(CAMPS.fourth.hq.col).toBeGreaterThan(16);
    expect(CAMPS.fourth.hq.row).toBeGreaterThan(12);
  });

  it('初期ユニットは無く、初期資金は 0(収入 4000 から立ち上げる)', () => {
    expect(FOUR_CAMPS_ISLAND_MAP.units ?? []).toHaveLength(0);
    expect(FOUR_CAMPS_ISLAND_MAP.initialFunds).toBe(0);
    const economy = new EconomyManager({ initialFunds: 0 });
    for (const army of ARMIES) {
      expect(economy.getIncome(army, map)).toBe(4000);
    }
  });

  it('拠点は陣地のほかは中立都市 24 個だけ(港・空港・研究所・駅は無い)', () => {
    expect(tilesOf(map, 'city')).toHaveLength(24);
    for (const terrain of ['port', 'airport', 'laboratory', 'station'] as const) {
      expect(tilesOf(map, terrain)).toHaveLength(0);
    }
    for (const city of tilesOf(map, 'city')) {
      expect(map.getTile(city)?.owner).toBe('neutral');
    }
  });

  it('1 つの島で、海は左端にだけある', () => {
    const seas = tilesOf(map, 'sea');
    expect(seas.length).toBeGreaterThan(0);
    for (const sea of seas) {
      expect(sea.col).toBeLessThanOrEqual(2);
    }
    // 左端の 2 列はすべて海
    for (let row = 0; row < map.rows; row += 1) {
      expect(map.getTile(gridPosition(0, row))?.terrainType).toBe('sea');
      expect(map.getTile(gridPosition(1, row))?.terrainType).toBe('sea');
    }
    // 陸はひとつながり(歩兵で 4 軍の陣地がすべて行き来できる)
    const land = floodFill(
      map,
      CAMPS.player.hq,
      (pos) => map.getTile(pos)?.terrainType !== 'sea',
    );
    for (const army of ARMIES) {
      expect(land.has(key(CAMPS[army].hq))).toBe(true);
    }
  });

  it('1P と 2P の間には山脈があり、車両は山脈の南を回らないと行き来できない', () => {
    const mountains = tilesOf(map, 'mountain');
    expect(mountains.length).toBeGreaterThanOrEqual(20);
    for (const mountain of mountains) {
      expect(mountain.col).toBeGreaterThan(CAMPS.player.hq.col);
      expect(mountain.col).toBeLessThan(CAMPS.enemy.hq.col);
      expect(mountain.row).toBeLessThanOrEqual(6);
    }
    // 装軌車両は山脈のある row 6 より上だけを通って 1P から 2P へは行けない
    const north = floodFill(
      map,
      CAMPS.player.factories[0],
      (pos) => pos.row <= 6 && map.getMoveCost(pos, 'vehicle') !== null,
    );
    expect(north.has(key(CAMPS.enemy.hq))).toBe(false);
    // 歩兵は山を越えて近道でき、装軌車両よりずっと近い
    const infantry = costFromCamp(map, 'player', CAMPS.enemy.hq, 'infantry');
    const vehicle = costFromCamp(map, 'player', CAMPS.enemy.hq, 'vehicle');
    expect(infantry).toBe(26);
    expect(vehicle).toBe(31);
  });

  it('川が 1P と 3P・2P と 4P の間を流れ、装輪車両は橋を通らないと南北を行き来できない', () => {
    const bridges = [gridPosition(5, 12), gridPosition(17, 12), gridPosition(26, 11)];
    for (const bridge of bridges) {
      expect(map.getTile(bridge)?.terrainType).toBe('road');
    }
    // 橋を通れないものとすると、北(1P・2P)から南(3P・4P)へは装輪車両で行けない
    const withoutBridges = floodFill(
      map,
      CAMPS.player.factories[0],
      (pos) =>
        !bridges.some((bridge) => key(bridge) === key(pos)) &&
        map.getMoveCost(pos, 'wheeled') !== null,
    );
    expect(withoutBridges.has(key(CAMPS.enemy.hq))).toBe(true);
    expect(withoutBridges.has(key(CAMPS.third.hq))).toBe(false);
    expect(withoutBridges.has(key(CAMPS.fourth.hq))).toBe(false);
  });

  it('3P の陣地は川(堀)に囲まれ、出入りできるのは 2 本の橋だけ', () => {
    const moatBridges = [gridPosition(7, 17), gridPosition(9, 19)];
    for (const bridge of moatBridges) {
      expect(map.getTile(bridge)?.terrainType).toBe('road');
    }
    // 川も橋も通らずに歩ける範囲は、堀の内側だけ
    const inside = floodFill(map, CAMPS.third.hq, (pos) => {
      const terrain = map.getTile(pos)?.terrainType;
      return (
        terrain !== 'river' &&
        terrain !== 'sea' &&
        !moatBridges.some((bridge) => key(bridge) === key(pos))
      );
    });
    expect(inside.size).toBeLessThan(25);
    for (const army of ['player', 'enemy', 'fourth'] as const) {
      expect(inside.has(key(CAMPS[army].hq))).toBe(false);
    }
    // 内側のマスの隣は、川・海・橋・内側のどれか(= 川に囲まれている)
    for (const cell of inside) {
      const [col, row] = cell.split(',').map(Number);
      for (const next of neighbors(gridPosition(col, row))) {
        const terrain = map.getTile(next)?.terrainType;
        const isBridge = moatBridges.some((bridge) => key(bridge) === key(next));
        expect(
          inside.has(key(next)) || terrain === 'river' || terrain === 'sea' || isBridge,
        ).toBe(true);
      }
    }
  });

  it('道路で 1P〜3P・3P〜4P・2P〜4P がつながり、1P〜2P は道路でつながらない', () => {
    const onRoad = (pos: GridPosition): boolean => {
      const terrain = map.getTile(pos)?.terrainType;
      return terrain === 'road' || terrain === 'factory' || terrain === 'headquarters';
    };
    const fromCamp = (army: TurnArmy): Set<string> =>
      floodFill(map, CAMPS[army].hq, onRoad);
    // 道路は 1 本の網でつながっているので、途中で 1P と 2P がつながるのは 4P を経由するときだけ
    const network = fromCamp('player');
    for (const army of ARMIES) {
      expect(network.has(key(CAMPS[army].hq))).toBe(true);
    }
    // 4P の陣地を通らなければ、1P から 2P へは道路だけでは行けない
    const withoutFourth = floodFill(
      map,
      CAMPS.player.hq,
      (pos) => onRoad(pos) && map.getTile(pos)?.owner !== 'fourth',
    );
    expect(withoutFourth.has(key(CAMPS.enemy.hq))).toBe(false);
    expect(withoutFourth.has(key(CAMPS.third.hq))).toBe(true);
  });

  it('3P〜4P の街道は row 19 の一直線', () => {
    for (let col = 7; col <= 25; col += 1) {
      expect(map.getTile(gridPosition(col, 19))?.terrainType).toBe('road');
    }
    expect(map.getTile(gridPosition(6, 19))?.owner).toBe('third');
    expect(map.getTile(gridPosition(26, 19))?.owner).toBe('fourth');
  });

  it('1P から島の真ん中を通る街道が、3P〜4P の街道に T 字でつながる', () => {
    // 3P〜4P の街道の真ん中 (16,19) の北隣から道路が北へ伸びている
    expect(map.getTile(gridPosition(16, 18))?.terrainType).toBe('road');
    // 3P・4P の陣地と 1P〜3P の街道(col 7 より西)を通らずに、道路だけで 1P から (16,19) へ行ける
    const center = floodFill(map, CAMPS.player.factories[0], (pos) => {
      const terrain = map.getTile(pos)?.terrainType;
      return (
        (terrain === 'road' || terrain === 'factory') && pos.col >= 5 && pos.row <= 19
      );
    });
    expect(center.has('16,19')).toBe(true);
    // その道は島の真ん中(col 12〜20・row 9〜15)を通る
    const middle = [...center].filter((cell) => {
      const [col, row] = cell.split(',').map(Number);
      return col >= 12 && col <= 20 && row >= 9 && row <= 15;
    });
    expect(middle.length).toBeGreaterThan(5);
  });

  it('陣地のすぐ隣の都市は、1P より 2P・3P より 4P のほうが早く届く', () => {
    const cities = tilesOf(map, 'city');
    const nearest = (army: TurnArmy): number[] =>
      cities.map((city) => costFromCamp(map, army, city)).sort((a, b) => a - b);
    const [p1, p2, p3, p4] = ARMIES.map(nearest);
    // 最寄りの都市: 1P・3P は 2 ターン(移動コスト 4〜6)、2P・4P は 1 ターン(3 以下)
    expect(p1[0]).toBeGreaterThan(3);
    expect(p3[0]).toBeGreaterThan(3);
    expect(p2[0]).toBeLessThanOrEqual(3);
    expect(p4[0]).toBeLessThanOrEqual(3);
    // 2 番目に近い都市も同じ関係
    expect(p2[1]).toBeLessThan(p1[1]);
    expect(p4[1]).toBeLessThan(p3[1]);
    // 1P・3P も 2 ターンで届く都市を 3 個ずつ持つ
    expect(p1.filter((cost) => cost <= 6)).toHaveLength(3);
    expect(p3.filter((cost) => cost <= 6)).toHaveLength(3);
  });

  it('「なし」を選んだ軍勢の陣地は中立(本拠地は都市)になる', () => {
    const setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'third', { control: 'none' });
    const def = removeAbsentArmies(FOUR_CAMPS_ISLAND_MAP, absentArmies(setup));
    const reduced = MapManager.fromDefinition(def);
    expect(reduced.getTile(CAMPS.third.hq)?.terrainType).toBe('city');
    expect(reduced.getTile(CAMPS.third.hq)?.owner).toBe('neutral');
    for (const factory of CAMPS.third.factories) {
      expect(reduced.getTile(factory)?.owner).toBe('neutral');
    }
    expect(findHomeHeadquarters(reduced).has('third')).toBe(false);
    expect(findHomeHeadquarters(reduced).size).toBe(3);
  });

  it('4 軍ともコンピューターにしても、手番を回して拠点を取り合える', () => {
    const def = FOUR_CAMPS_ISLAND_MAP;
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

    // どの軍も生産して都市を取りに出ている
    for (const army of order) {
      let bases = 0;
      aiMap.forEachTile((tile) => {
        if (tile.owner === army && getTerrainData(tile.terrainType).canCapture) {
          bases += 1;
        }
      });
      if (!turn.isEliminated(army)) {
        expect(bases).toBeGreaterThan(4);
      }
    }
  });
});
