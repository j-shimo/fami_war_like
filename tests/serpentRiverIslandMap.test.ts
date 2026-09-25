import { describe, expect, it } from 'vitest';
import { EnemyAi } from '@/core/ai/EnemyAi';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { distancesFrom } from '@/core/movement/PathDistance';
import { UnitManager } from '@/core/units/UnitManager';
import { MAP_LIST } from '@/data/maps';
import { SERPENT_RIVER_ISLAND_MAP } from '@/data/maps/serpentRiverIslandMap';
import { swapMapSides } from '@/data/maps/sideSwap';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

// 2P側専用のマップなので、定義上の enemy が遊ぶ人の自軍(左下・後手)、
// 定義上の player が CPU の敵軍(右上・先手)になる。
// 以下の定数名は遊ぶ人から見た呼び方(自軍 = 左下、敵軍 = 右上)にそろえている。

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
      if (!map.isInBounds(next)) continue;
      if (seen.has(key(next))) continue;
      if (!pass(next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/** 条件を満たすマスをすべて集める */
function collect(
  map: MapManager,
  predicate: (tile: NonNullable<ReturnType<MapManager['getTile']>>) => boolean,
): GridPosition[] {
  const found: GridPosition[] = [];
  map.forEachTile((tile) => {
    if (predicate(tile)) found.push(tile.position);
  });
  return found;
}

/** マンハッタン距離(間接攻撃の射程判定に使う) */
function manhattan(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** movementType のユニットが進入できるマスかどうか */
function passable(map: MapManager, movementType: MovementType) {
  return (pos: GridPosition): boolean => map.getMoveCost(pos, movementType) !== null;
}

/** 自軍(左下・定義上 enemy)の陣地。本拠地 1・工場 4・空港 2 */
const SELF_HQ = gridPosition(4, 23);
const SELF_BASES: readonly GridPosition[] = [
  SELF_HQ,
  gridPosition(3, 22),
  gridPosition(5, 22),
  gridPosition(3, 24),
  gridPosition(5, 24),
  gridPosition(2, 21),
  gridPosition(7, 25),
];

/** 敵軍(右上・定義上 player)の陣地。本拠地 1・工場 3・駅 1・空港 2・都市 4 */
const RIVAL_HQ = gridPosition(32, 4);
const RIVAL_STATION = gridPosition(31, 6);
const RIVAL_FACTORIES: readonly GridPosition[] = [
  gridPosition(31, 3),
  gridPosition(33, 3),
  gridPosition(33, 5),
];
const RIVAL_AIRPORTS: readonly GridPosition[] = [
  gridPosition(29, 2),
  gridPosition(35, 6),
];
const RIVAL_CITIES: readonly GridPosition[] = [
  gridPosition(34, 2),
  gridPosition(27, 4),
  gridPosition(30, 8),
  gridPosition(34, 8),
];

/** 川の源(北岸)と河口(南岸) */
const RIVER_SOURCE = gridPosition(18, 1);
const RIVER_MOUTH = gridPosition(22, 26);

/** 川に架かる 3 つの橋(北ルート・中央ルート・下ルート) */
const NORTH_BRIDGE = gridPosition(18, 2);
const MIDDLE_BRIDGE = gridPosition(23, 12);
const SOUTH_BRIDGE = gridPosition(23, 21);
const BRIDGES: readonly GridPosition[] = [NORTH_BRIDGE, MIDDLE_BRIDGE, SOUTH_BRIDGE];

/** 中央の T 字路と、その少し東で中央ルート・下ルートに分かれる分岐点 */
const T_JUNCTION = gridPosition(15, 13);
const FORK = gridPosition(19, 13);

/** 自軍の本拠地から少し東へ進んだところで北へ折れる角 */
const STEM_CORNER = gridPosition(8, 23);

/** 敵軍の線路の南端(川の東岸) */
const RAIL_END = gridPosition(25, 10);

const map = MapManager.fromDefinition(SERPENT_RIVER_ISLAND_MAP);

/** 道路・拠点だけをたどる(街道網のつながりを見る) */
function onRoadNetwork(excluded: readonly GridPosition[] = []) {
  const skip = new Set(excluded.map(key));
  return (pos: GridPosition): boolean => {
    if (skip.has(key(pos))) return false;
    const terrain = map.getTile(pos)?.terrainType;
    return terrain === 'road' || terrain === 'headquarters' || terrain === 'factory';
  };
}

/**
 * 川の西側(自軍の陣地の側)のマス。橋を落とした状態で、自軍の本拠地から
 * 川と海を越えずに行けるマスを集める(川の岸に沿って盤面を東西に分ける)。
 */
const WEST_OF_RIVER = floodFill(map, SELF_HQ, (pos) => {
  if (BRIDGES.some((bridge) => key(bridge) === key(pos))) return false;
  const terrain = map.getTile(pos)?.terrainType;
  return terrain !== 'river' && terrain !== 'sea';
});

/** 川の西側か(自軍の陣地の側) */
function isWestOfRiver(pos: GridPosition): boolean {
  return WEST_OF_RIVER.has(key(pos));
}

describe('SERPENT_RIVER_ISLAND_MAP(蛇河大島マップ)', () => {
  it('縦28・横38 の盤面で生成でき、盤面の外周はすべて海', () => {
    expect(map.cols).toBe(38);
    expect(map.rows).toBe(28);
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      const onEdge =
        col === 0 || row === 0 || col === map.cols - 1 || row === map.rows - 1;
      if (onEdge) expect(tile.terrainType).toBe('sea');
    });
  });

  it('新マップ(group: new)の激ムズマップとして、2P側の一覧に登録されている', () => {
    const entry = MAP_LIST.find((item) => item.id === 'serpentRiverIsland');
    expect(entry?.category).toBe('extra');
    expect(entry?.group).toBe('new');
    expect(entry?.side).toBe('2p');
    expect(entry?.definition).toBe(SERPENT_RIVER_ISLAND_MAP);
  });

  it('陸地は 1 つの大きな島で、港は 1 つも無い', () => {
    const land = collect(map, (tile) => tile.terrainType !== 'sea');
    const island = floodFill(
      map,
      SELF_HQ,
      (pos) => map.getTile(pos)?.terrainType !== 'sea',
    );
    expect(island.size).toBe(land.length);
    expect(island.has(key(RIVAL_HQ))).toBe(true);
    expect(collect(map, (tile) => tile.terrainType === 'port')).toHaveLength(0);
  });

  it('初期資金は 0 で、自軍は収入 7000・敵軍は収入 11000 で始まる', () => {
    expect(SERPENT_RIVER_ISLAND_MAP.initialFunds).toBe(0);
    // 2P側は盤面を入れ替えて遊ぶので、遊ぶ人の自軍は定義上の enemy になる
    const swapped = MapManager.fromDefinition(swapMapSides(SERPENT_RIVER_ISLAND_MAP));
    const owned = { player: 0, enemy: 0 };
    swapped.forEachTile((tile) => {
      if (tile.owner === 'player') owned.player += 1;
      if (tile.owner === 'enemy') owned.enemy += 1;
    });
    expect(owned.player).toBe(7); // 入れ替え後の player = 遊ぶ人の自軍
    expect(owned.enemy).toBe(11); // 入れ替え後の enemy = CPU の敵軍
    expect(swapped.getTile(SELF_HQ)?.owner).toBe('player');
    expect(swapped.getTile(RIVAL_HQ)?.owner).toBe('enemy');
  });

  it('自軍の陣地は本拠地・工場 4・空港 2 だけで、都市は 1 個も持たない', () => {
    for (const pos of SELF_BASES) {
      expect(map.getTile(pos)?.owner).toBe('enemy');
    }
    const owned = collect(map, (tile) => tile.owner === 'enemy');
    expect(owned).toHaveLength(SELF_BASES.length);
    const countOf = (terrain: string): number =>
      owned.filter((pos) => map.getTile(pos)?.terrainType === terrain).length;
    expect(countOf('headquarters')).toBe(1);
    expect(countOf('factory')).toBe(4);
    expect(countOf('airport')).toBe(2);
    expect(countOf('city')).toBe(0);
    // 陣地は盤面の左下
    for (const pos of owned) {
      expect(pos.col).toBeLessThan(10);
      expect(pos.row).toBeGreaterThan(18);
    }
  });

  it('敵軍は本拠地の近くの工場 3・駅 1・空港 2 を含む 10 拠点を占領済みで始まる', () => {
    const owned = collect(map, (tile) => tile.owner === 'player');
    expect(owned).toHaveLength(11);
    expect(map.getTile(RIVAL_HQ)?.terrainType).toBe('headquarters');
    for (const pos of RIVAL_FACTORIES) {
      expect(map.getTile(pos)?.terrainType).toBe('factory');
      expect(map.getTile(pos)?.owner).toBe('player');
      expect(manhattan(pos, RIVAL_HQ)).toBeLessThanOrEqual(2);
    }
    for (const pos of RIVAL_AIRPORTS) {
      expect(map.getTile(pos)?.terrainType).toBe('airport');
      expect(map.getTile(pos)?.owner).toBe('player');
    }
    for (const pos of RIVAL_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('player');
    }
    // 陣地は盤面の右上
    for (const pos of owned) {
      expect(pos.col).toBeGreaterThan(25);
      expect(pos.row).toBeLessThan(10);
    }
  });

  it('駅は盤面に 1 つだけで、敵軍(先手)しか列車砲を作れない', () => {
    const stations = collect(map, (tile) => tile.terrainType === 'station');
    expect(stations).toEqual([RIVAL_STATION]);
    expect(map.getTile(RIVAL_STATION)?.owner).toBe('player');
  });

  it('敵軍の線路は駅から川の東岸まで伸び、列車砲は線路の南端から中央の橋を撃てる', () => {
    const rail = distancesFrom(map, RIVAL_STATION, 'rail');
    expect(rail.get(RAIL_END)).toBe(10);
    // 線路網は駅から伸びる 1 本だけで、線路のマスはすべて駅から走って行ける
    const rails = collect(map, (tile) => tile.terrainType === 'railway');
    for (const pos of rails) {
      expect(rail.get(pos)).toBeDefined();
    }
    const railgun = getUnitData('railgun');
    const distance = manhattan(RAIL_END, MIDDLE_BRIDGE);
    expect(distance).toBeGreaterThanOrEqual(railgun.minAttackRange);
    expect(distance).toBeLessThanOrEqual(railgun.maxAttackRange);
    // 線路の南端は川の東岸にあり、川そのものは越えない
    expect(isWestOfRiver(RAIL_END)).toBe(false);
  });

  it('川は北岸から東へ回り込んで南岸へ抜け、島を東西に分ける', () => {
    expect(map.getTile(RIVER_SOURCE)?.terrainType).toBe('river');
    expect(map.getTile(gridPosition(RIVER_SOURCE.col, 0))?.terrainType).toBe('sea');
    expect(map.getTile(RIVER_MOUTH)?.terrainType).toBe('river');
    expect(
      map.getTile(gridPosition(RIVER_MOUTH.col, RIVER_MOUTH.row + 1))?.terrainType,
    ).toBe('sea');
    // 川(と橋)は源から河口まで 1 本につながっている
    const bridgeKeys = new Set(BRIDGES.map(key));
    const course = floodFill(
      map,
      RIVER_SOURCE,
      (pos) => map.getTile(pos)?.terrainType === 'river' || bridgeKeys.has(key(pos)),
    );
    expect(course.has(key(RIVER_MOUTH))).toBe(true);
    // 源より河口のほうが東にあり、途中でいちばん東へ張り出す(東へ回り込む)
    const rivers = collect(map, (tile) => tile.terrainType === 'river');
    const eastmost = Math.max(...rivers.map((pos) => pos.col));
    expect(RIVER_MOUTH.col).toBeGreaterThan(RIVER_SOURCE.col);
    expect(eastmost).toBeGreaterThan(RIVER_MOUTH.col);
    // 両軍の陣地は川の反対側にある
    expect(isWestOfRiver(SELF_HQ)).toBe(true);
    expect(isWestOfRiver(RIVAL_HQ)).toBe(false);
  });

  it('装輪車両が川を越えられるのは 3 つの橋だけ', () => {
    for (const bridge of BRIDGES) {
      expect(map.getTile(bridge)?.terrainType).toBe('road');
      // 橋の上下は川
      expect(map.getTile(gridPosition(bridge.col, bridge.row - 1))?.terrainType).toBe(
        'river',
      );
      expect(map.getTile(gridPosition(bridge.col, bridge.row + 1))?.terrainType).toBe(
        'river',
      );
    }
    const wheeled = passable(map, 'wheeled');
    expect(floodFill(map, SELF_HQ, wheeled).has(key(RIVAL_HQ))).toBe(true);
    // 3 つの橋を落とすと、装輪車両は敵軍の陣地へ届かない
    const withoutBridges = floodFill(
      map,
      SELF_HQ,
      (pos) => !BRIDGES.some((bridge) => key(bridge) === key(pos)) && wheeled(pos),
    );
    expect(withoutBridges.has(key(RIVAL_HQ))).toBe(false);
    // 歩兵と装軌車両は橋が無くても川を渡れる
    for (const movementType of ['infantry', 'vehicle'] as const) {
      const reach = floodFill(
        map,
        SELF_HQ,
        (pos) =>
          !BRIDGES.some((bridge) => key(bridge) === key(pos)) &&
          passable(map, movementType)(pos),
      );
      expect(reach.has(key(RIVAL_HQ))).toBe(true);
    }
  });

  it('街道は北ルート・中央ルート・下ルートの 3 本で、どの橋からでも敵軍の陣地へ通じる', () => {
    // 橋を 2 つ落としても、残る 1 つの橋を通る街道で陣地から陣地へ行ける
    for (const kept of BRIDGES) {
      const dropped = BRIDGES.filter((bridge) => key(bridge) !== key(kept));
      const reach = floodFill(map, SELF_HQ, onRoadNetwork(dropped));
      expect(reach.has(key(RIVAL_HQ))).toBe(true);
    }
    // 3 つとも落とすと街道はつながらない
    expect(floodFill(map, SELF_HQ, onRoadNetwork(BRIDGES)).has(key(RIVAL_HQ))).toBe(
      false,
    );
  });

  it('本拠地から少し東へ進んで北へ折れた道が、中央の T 字路で東西に分かれる', () => {
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    // 本拠地の東隣から (8,23) まで東へ進み、そこで北へ折れる
    for (let col = SELF_HQ.col + 1; col <= STEM_CORNER.col; col += 1) {
      expect(isRoad(gridPosition(col, SELF_HQ.row))).toBe(true);
    }
    expect(isRoad(gridPosition(STEM_CORNER.col, STEM_CORNER.row - 1))).toBe(true);
    expect(isRoad(gridPosition(STEM_CORNER.col + 1, STEM_CORNER.row))).toBe(false);
    // T 字路: 南から上がってきた道が東西に分かれ、北には抜けない
    const [up, down, left, right] = neighbors(T_JUNCTION);
    expect(isRoad(T_JUNCTION)).toBe(true);
    expect(isRoad(down)).toBe(true);
    expect(isRoad(left)).toBe(true);
    expect(isRoad(right)).toBe(true);
    expect(isRoad(up)).toBe(false);
    // T 字路は盤面の中央付近
    expect(Math.abs(T_JUNCTION.col - map.cols / 2)).toBeLessThanOrEqual(4);
    expect(Math.abs(T_JUNCTION.row - map.rows / 2)).toBeLessThanOrEqual(1);
    // T 字路の西の腕は北ルートへ合流する(北の橋だけで敵陣地へ行ける)
    const westOnly = floodFill(
      map,
      T_JUNCTION,
      onRoadNetwork([MIDDLE_BRIDGE, SOUTH_BRIDGE]),
    );
    expect(westOnly.has(key(NORTH_BRIDGE))).toBe(true);
  });

  it('T 字路から少し東の分岐点で、中央ルートと下ルートに分かれる', () => {
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    const [up, down, left, right] = neighbors(FORK);
    expect(isRoad(FORK)).toBe(true);
    expect(isRoad(left)).toBe(true);
    expect(isRoad(right)).toBe(true); // 中央ルート(東へ)
    expect(isRoad(down)).toBe(true); // 下ルート(南東へ)
    expect(isRoad(up)).toBe(false);
    expect(FORK.row).toBe(T_JUNCTION.row);
    expect(FORK.col - T_JUNCTION.col).toBeLessThanOrEqual(4);
    // 中央ルートは中央の橋、下ルートは南の橋を渡る
    const middle = floodFill(map, right, onRoadNetwork([FORK, SOUTH_BRIDGE]));
    expect(middle.has(key(MIDDLE_BRIDGE))).toBe(true);
    const lower = floodFill(
      map,
      down,
      onRoadNetwork([FORK, MIDDLE_BRIDGE, gridPosition(32, 12)]),
    );
    expect(lower.has(key(SOUTH_BRIDGE))).toBe(true);
    expect(lower.has(key(MIDDLE_BRIDGE))).toBe(false);
  });

  it('街道はまっすぐ伸びず、同じ向きに続くのは長くても 9 マス', () => {
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    let longest = 0;
    for (let row = 0; row < map.rows; row += 1) {
      let run = 0;
      for (let col = 0; col < map.cols; col += 1) {
        run = isRoad(gridPosition(col, row)) ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
    for (let col = 0; col < map.cols; col += 1) {
      let run = 0;
      for (let row = 0; row < map.rows; row += 1) {
        run = isRoad(gridPosition(col, row)) ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
    }
    // いちばん長いのは T 字路の横棒(row 13)
    expect(longest).toBeLessThanOrEqual(9);
  });

  it('平地・森・山がバランス良く配置されている', () => {
    const count = (terrain: string): number =>
      collect(map, (tile) => tile.terrainType === terrain).length;
    const plain = count('plain');
    const forest = count('forest');
    const mountain = count('mountain');
    const total = plain + forest + mountain;
    expect(plain / total).toBeLessThan(0.65);
    expect(forest / total).toBeGreaterThan(0.2);
    expect(mountain / total).toBeGreaterThan(0.15);
    // 川の西と東のどちらにも森と山がある
    for (const west of [true, false]) {
      for (const terrain of ['forest', 'mountain']) {
        expect(
          collect(
            map,
            (tile) =>
              tile.terrainType === terrain && isWestOfRiver(tile.position) === west,
          ).length,
        ).toBeGreaterThan(20);
      }
    }
  });

  it('中立拠点は都市 45 個で、先に届くのは自軍 23 個・敵軍 22 個', () => {
    const neutral = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture && tile.owner === 'neutral',
    );
    expect(neutral).toHaveLength(45);
    for (const pos of neutral) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
    }
    // 研究所は置いていない
    expect(collect(map, (tile) => tile.terrainType === 'laboratory')).toHaveLength(0);

    const fromSelf = distancesFrom(map, SELF_HQ, 'infantry');
    const fromRival = distancesFrom(map, RIVAL_HQ, 'infantry');
    let self = 0;
    let rival = 0;
    for (const pos of neutral) {
      const a = fromSelf.get(pos) ?? Infinity;
      const b = fromRival.get(pos) ?? Infinity;
      expect(a).not.toBe(b); // 同着は無い
      if (a < b) self += 1;
      else rival += 1;
    }
    expect(self).toBe(23);
    expect(rival).toBe(22);
    // 川の西に 25 個・東に 20 個
    expect(neutral.filter((pos) => isWestOfRiver(pos))).toHaveLength(25);
  });

  it('敵軍だけが初期部隊を持つ(戦闘機・爆撃機 2・中戦車・ロケット砲・対空戦車)', () => {
    const manager = UnitManager.fromPlacements(SERPENT_RIVER_ISLAND_MAP.units ?? [], map);
    // 定義上の enemy(= 遊ぶ人の自軍)は 1 体も持たない
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
    const rivals = manager.getUnitsByArmy('player');
    expect(rivals).toHaveLength(6);
    const countOf = (unitType: string): number =>
      rivals.filter((unit) => unit.unitType === unitType).length;
    expect(countOf('fighter')).toBe(1);
    expect(countOf('bomber')).toBe(2);
    expect(countOf('mediumTank')).toBe(1);
    expect(countOf('rocketArtillery')).toBe(1);
    expect(countOf('antiAirTank')).toBe(1);
    // すべて川の東(敵軍の側)に置いてある
    for (const unit of rivals) {
      expect(isWestOfRiver(unit.position)).toBe(false);
    }
    // ロケット砲は中央の橋を射程に収める
    const rocket = rivals.find((unit) => unit.unitType === 'rocketArtillery');
    const rocketData = getUnitData('rocketArtillery');
    const distance = manhattan(rocket?.position ?? RIVAL_HQ, MIDDLE_BRIDGE);
    expect(distance).toBeGreaterThanOrEqual(rocketData.minAttackRange);
    expect(distance).toBeLessThanOrEqual(rocketData.maxAttackRange);
  });

  it('陣地から陣地までは歩兵 47・装軌車両 48・装輪車両 50', () => {
    expect(distancesFrom(map, SELF_HQ, 'infantry').get(RIVAL_HQ)).toBe(47);
    expect(distancesFrom(map, SELF_HQ, 'vehicle').get(RIVAL_HQ)).toBe(48);
    expect(distancesFrom(map, SELF_HQ, 'wheeled').get(RIVAL_HQ)).toBe(50);
  });
  it('2P側で入れ替えた盤面でも、CPU(右上の敵軍)が初期部隊と収入で手番を回せる', () => {
    const swappedDef = swapMapSides(SERPENT_RIVER_ISLAND_MAP);
    const aiMap = MapManager.fromDefinition(swappedDef);
    const units = UnitManager.fromPlacements(swappedDef.units ?? [], aiMap);
    // 入れ替え後は CPU の敵軍が enemy になる
    expect(units.getUnitsByArmy('enemy')).toHaveLength(6);
    expect(units.getUnitsByArmy('player')).toHaveLength(0);
    const economy = new EconomyManager({ initialFunds: swappedDef.initialFunds });
    const ai = new EnemyAi({
      map: aiMap,
      units,
      battle: new BattleManager(aiMap, units),
      capture: new CaptureSystem(),
      production: new ProductionManager(aiMap, units, economy),
    });

    // 収入 → 敵軍AIの手番 → 行動済みのリセット、を 8 ターンぶん繰り返す
    for (let turn = 0; turn < 8; turn += 1) {
      economy.collectIncome('enemy', aiMap);
      expect(() => ai.run()).not.toThrow();
      for (const unit of units.getUnitsByArmy('enemy')) unit.hasActed = false;
    }

    let captured = 0;
    aiMap.forEachTile((tile) => {
      if (tile.owner === 'enemy' && getTerrainData(tile.terrainType).canCapture) {
        captured += 1;
      }
    });
    expect(captured).toBeGreaterThan(11);
  });
});
