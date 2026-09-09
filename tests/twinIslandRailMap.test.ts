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
import { TWIN_ISLAND_RAIL_MAP } from '@/data/maps/twinIslandRailMap';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

/** 先手の自軍(上の島の左上)。本拠地 1・工場 3・港 2・駅 1 */
const PLAYER_HQ = gridPosition(5, 2);
const PLAYER_STATION = gridPosition(5, 1);
const PLAYER_PORTS: readonly GridPosition[] = [gridPosition(3, 2), gridPosition(3, 4)];
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(4, 2),
  gridPosition(6, 2),
  gridPosition(4, 3),
];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  PLAYER_STATION,
  ...PLAYER_PORTS,
  ...PLAYER_FACTORIES,
];

/** 後手の敵軍(下の島の左側)。本拠地 1・工場 3・港 2・都市 4 */
const ENEMY_HQ = gridPosition(5, 22);
const ENEMY_PORTS: readonly GridPosition[] = [gridPosition(3, 22), gridPosition(3, 24)];
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(4, 22),
  gridPosition(6, 22),
  gridPosition(4, 23),
];
const ENEMY_CITIES: readonly GridPosition[] = [
  gridPosition(4, 21),
  gridPosition(5, 21),
  gridPosition(5, 23),
  gridPosition(6, 23),
];
const ENEMY_BASES: readonly GridPosition[] = [
  ENEMY_HQ,
  ...ENEMY_PORTS,
  ...ENEMY_FACTORIES,
  ...ENEMY_CITIES,
];

/** 線路がつなぐ 2 つの中立駅(中間駅と下の駅) */
const MID_STATION = gridPosition(14, 7);
const LOW_STATION = gridPosition(8, 13);

/** 中立の研究所(中間駅のわきと、下の駅から右へ進んだ位置) */
const MID_LABORATORY = gridPosition(16, 8);
const SOUTH_LABORATORY = gridPosition(13, 15);

/** 車両が線路側と街道側を行き来できる 2 か所の門(中間駅と南の峠) */
const SOUTH_PASS = gridPosition(11, 14);

/** 上の島の南岸の海岸(乗船地)と、その向かいの下の島の海岸(揚陸地) */
const UPPER_BEACH: readonly GridPosition[] = [
  gridPosition(5, 16),
  gridPosition(6, 16),
  gridPosition(7, 16),
  gridPosition(8, 16),
  gridPosition(9, 16),
  gridPosition(10, 16),
];
const LOWER_BEACH: readonly GridPosition[] = [
  gridPosition(7, 20),
  gridPosition(8, 20),
  gridPosition(9, 20),
];

/** 上の島の南岸にある中立港(海峡を渡る輸送艦の生産拠点) */
const UPPER_NEUTRAL_PORT = gridPosition(4, 16);

/** 上の島(線路側)の中立都市 5 個 */
const WEST_CITIES: readonly GridPosition[] = [
  gridPosition(4, 9),
  gridPosition(3, 11),
  gridPosition(7, 11),
  gridPosition(4, 15),
  gridPosition(8, 15),
];

/** 上の島(街道側)の中立都市 7 個 */
const EAST_CITIES: readonly GridPosition[] = [
  gridPosition(18, 2),
  gridPosition(22, 5),
  gridPosition(18, 6),
  gridPosition(24, 9),
  gridPosition(17, 11),
  gridPosition(20, 12),
  gridPosition(19, 15),
];

/** 下の島の中立都市 7 個 */
const LOWER_CITIES: readonly GridPosition[] = [
  gridPosition(9, 21),
  gridPosition(9, 25),
  gridPosition(12, 24),
  gridPosition(13, 27),
  gridPosition(16, 22),
  gridPosition(19, 26),
  gridPosition(21, 21),
];

const map = MapManager.fromDefinition(TWIN_ISLAND_RAIL_MAP);

/** starts のどれかから target までの最小移動コスト(到達できなければ Infinity) */
function minCost(
  target: GridPosition,
  starts: readonly GridPosition[],
  movementType: MovementType,
): number {
  let best = Infinity;
  for (const start of starts) {
    const cost = distancesFrom(map, start, movementType).get(target);
    if (cost !== undefined) best = Math.min(best, cost);
  }
  return best;
}

/** 所有者ごとの拠点(占領可能地形)を集める */
function basesOf(owner: 'player' | 'enemy' | 'neutral'): GridPosition[] {
  const bases: GridPosition[] = [];
  map.forEachTile((tile) => {
    if (tile.owner === owner && getTerrainData(tile.terrainType).canCapture) {
      bases.push(tile.position);
    }
  });
  return bases;
}

/** 拠点の地形種別ごとの個数を数える */
function countByTerrain(positions: readonly GridPosition[]): Record<string, number> {
  return positions.reduce<Record<string, number>>((counts, pos) => {
    const terrain = map.getTile(pos)?.terrainType ?? '';
    counts[terrain] = (counts[terrain] ?? 0) + 1;
    return counts;
  }, {});
}

describe('二島鉄路マップの盤面', () => {
  it('30x32 の盤面が、海峡(row 17〜19)で上下 2 つの島に分かれている', () => {
    expect(map.cols).toBe(30);
    expect(map.rows).toBe(32);
    expect(map.name).toBe('二島鉄路マップ');
    // 海峡の 3 行は端から端まで海
    for (let row = 17; row <= 19; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('sea');
      }
    }
    // 地上ユニットはどうやっても相手の島へ渡れない(陸路は 1 本も無い)
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(minCost(ENEMY_HQ, PLAYER_BASES, movementType)).toBe(Infinity);
      expect(minCost(PLAYER_HQ, ENEMY_BASES, movementType)).toBe(Infinity);
    }
  });

  it('空港が 1 つも無いので、飛行ユニットは生産できない', () => {
    let airports = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'airport') airports += 1;
    });
    expect(airports).toBe(0);
  });

  it('拠点は盤面の端(最上段・最下段・左右の端の列)には 1 つも置かない', () => {
    const edges: GridPosition[] = [];
    for (let col = 0; col < map.cols; col += 1) {
      edges.push(gridPosition(col, 0), gridPosition(col, map.rows - 1));
    }
    for (let row = 0; row < map.rows; row += 1) {
      edges.push(gridPosition(0, row), gridPosition(map.cols - 1, row));
    }
    for (const pos of edges) {
      const terrain = map.getTile(pos)?.terrainType;
      expect(terrain).toBeDefined();
      expect(getTerrainData(terrain!).canCapture).toBe(false);
    }
  });
});

describe('二島鉄路マップの拠点', () => {
  it('先手は本拠地 1・工場 3・港 2・駅 1(収入 7000)、後手は本拠地 1・工場 3・港 2・都市 4(収入 10000)', () => {
    expect(new Set(basesOf('player').map((pos) => `${pos.col},${pos.row}`))).toEqual(
      new Set(PLAYER_BASES.map((pos) => `${pos.col},${pos.row}`)),
    );
    expect(new Set(basesOf('enemy').map((pos) => `${pos.col},${pos.row}`))).toEqual(
      new Set(ENEMY_BASES.map((pos) => `${pos.col},${pos.row}`)),
    );
    expect(countByTerrain(PLAYER_BASES)).toEqual({
      headquarters: 1,
      factory: 3,
      port: 2,
      station: 1,
    });
    expect(countByTerrain(ENEMY_BASES)).toEqual({
      headquarters: 1,
      factory: 3,
      port: 2,
      city: 4,
    });
    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(7000);
    expect(economy.getIncome('enemy', map)).toBe(10000);
  });

  it('開始時に駅を持つのは先手だけなので、列車砲を生産できるのも先手だけ', () => {
    expect(map.getTile(PLAYER_STATION)?.terrainType).toBe('station');
    expect(map.getTile(PLAYER_STATION)?.owner).toBe('player');
    // 敵軍の拠点に駅は 1 つも無い
    expect(
      ENEMY_BASES.filter((pos) => map.getTile(pos)?.terrainType === 'station'),
    ).toHaveLength(0);
    // 残る 2 つの駅は中立(占領すれば後手も列車砲を出せるようになる)
    for (const pos of [MID_STATION, LOW_STATION]) {
      expect(map.getTile(pos)?.terrainType).toBe('station');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
  });

  it('自軍の駅は陣地でただ 1 つ row 1 にあり、生産拠点を上から回る敵軍AIが最初に見る', () => {
    expect(PLAYER_STATION.row).toBe(1);
    for (const pos of PLAYER_BASES) {
      if (pos === PLAYER_STATION) continue;
      expect(pos.row).toBeGreaterThan(PLAYER_STATION.row);
    }
  });

  it('中立拠点は 25 個(都市 19・研究所 2・港 2・駅 2)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(25);
    expect(countByTerrain(neutral)).toEqual({
      city: 19,
      laboratory: 2,
      port: 2,
      station: 2,
    });
  });

  it('初期ユニットは置かず、初期資金 31000(列車砲 + 歩兵)から生産で戦力を用意する', () => {
    expect(TWIN_ISLAND_RAIL_MAP.units).toEqual([]);
    expect(TWIN_ISLAND_RAIL_MAP.initialFunds).toBe(
      getUnitData('railgun').cost + getUnitData('infantry').cost,
    );
  });
});

describe('二島鉄路マップの線路と 3 つの駅', () => {
  it('線路は陣地の駅から右下の中間駅へ、そこから左下の下の駅へ折り返す', () => {
    const rail = distancesFrom(map, PLAYER_STATION, 'rail');
    // 中間駅は陣地から見て右下、下の駅は中間駅から見て左下にある
    expect(MID_STATION.col).toBeGreaterThan(PLAYER_STATION.col);
    expect(MID_STATION.row).toBeGreaterThan(PLAYER_STATION.row);
    expect(LOW_STATION.col).toBeLessThan(MID_STATION.col);
    expect(LOW_STATION.row).toBeGreaterThan(MID_STATION.row);
    // 3 つの駅は 1 本の線路でつながっている
    expect(rail.get(MID_STATION)).toBe(15);
    expect(rail.get(LOW_STATION)).toBe(27);
    expect(distancesFrom(map, MID_STATION, 'rail').get(LOW_STATION)).toBe(12);
    // 駅は 3 つだけで、線路(軌道)はすべて陣地の駅からつながっている
    let stations = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'station') stations += 1;
    });
    expect(stations).toBe(3);
    map.forEachTile((tile) => {
      if (map.getMoveCost(tile.position, 'rail') === null) return;
      expect(rail.get(tile.position)).not.toBeUndefined();
    });
  });

  it('移動力 15 の列車砲は、駅から次の駅までをちょうど 1 ターンで進める', () => {
    const movement = getUnitData('railgun').movement;
    expect(movement).toBe(15);
    const fromCamp = distancesFrom(map, PLAYER_STATION, 'rail');
    // 陣地 → 中間駅がちょうど 1 ターンぶん、中間駅 → 下の駅も 1 ターンぶん
    expect(fromCamp.get(MID_STATION)!).toBe(movement);
    expect(distancesFrom(map, MID_STATION, 'rail').get(LOW_STATION)!).toBeLessThan(
      movement,
    );
    // 陣地から下の駅までは 1 ターンでは届かない(2 ターンぶん)
    expect(fromCamp.get(LOW_STATION)!).toBeGreaterThan(movement);
    expect(fromCamp.get(LOW_STATION)!).toBeLessThanOrEqual(movement * 2);
  });

  it('線路と街道のあいだは山の壁で、車両が通れるのは中間駅と南の峠だけ', () => {
    // 壁の代表点はすべて山
    for (const pos of [
      gridPosition(8, 1),
      gridPosition(11, 3),
      gridPosition(15, 6),
      gridPosition(15, 8),
      gridPosition(14, 10),
      gridPosition(11, 13),
      gridPosition(11, 16),
    ]) {
      expect(map.getTile(pos)?.terrainType).toBe('mountain');
    }
    // 2 つの門は駅と街道
    expect(map.getTile(MID_STATION)?.terrainType).toBe('station');
    expect(map.getTile(SOUTH_PASS)?.terrainType).toBe('road');
    // 街道側の代表点(東の街道の北東角)へは、ふだんは車両でたどり着ける
    const eastRoad = gridPosition(21, 3);
    expect(minCost(eastRoad, PLAYER_BASES, 'vehicle')).toBeLessThan(Infinity);
    expect(minCost(eastRoad, PLAYER_BASES, 'wheeled')).toBeLessThan(Infinity);
    // 2 つの門を山で塞ぐと、車両は島の東側へ 1 マスも回れなくなる
    const blocked = MapManager.fromDefinition({
      ...TWIN_ISLAND_RAIL_MAP,
      terrain: TWIN_ISLAND_RAIL_MAP.terrain.map((line, row) => {
        const gate = [MID_STATION, SOUTH_PASS].find((pos) => pos.row === row);
        if (!gate) return line;
        return `${line.slice(0, gate.col)}m${line.slice(gate.col + 1)}`;
      }),
    });
    for (const movementType of ['vehicle', 'wheeled'] as const) {
      expect(
        distancesFrom(blocked, PLAYER_HQ, movementType).get(eastRoad),
      ).toBeUndefined();
    }
    // 歩兵だけは山を越えて島の東側へ抜けられる
    expect(distancesFrom(blocked, PLAYER_HQ, 'infantry').get(eastRoad)).toBeLessThan(
      Infinity,
    );
  });

  it('街道は線路をぐるりと囲み、2 つの駅で線路とつながっている', () => {
    // 中間駅の東の支道と、下の駅の南の街道
    for (const pos of [gridPosition(15, 7), gridPosition(16, 7), gridPosition(8, 14)]) {
      expect(map.getTile(pos)?.terrainType).toBe('road');
    }
    // 西の街道(col 5)は陣地から下の駅の手前まで一本につながっている
    for (let row = 3; row <= 12; row += 1) {
      const terrain = map.getTile(gridPosition(5, row))?.terrainType;
      expect(['road', 'city']).toContain(terrain);
    }
    // 東の街道(row 14)は南の峠を通って下の駅の下まで届く
    for (let col = 8; col <= 21; col += 1) {
      expect(map.getTile(gridPosition(col, 14))?.terrainType).toBe('road');
    }
    // 街道づたいなら、装輪車両でも陣地から下の駅まで 14 で着ける
    expect(minCost(LOW_STATION, PLAYER_BASES, 'wheeled')).toBe(14);
  });

  it('研究所は中間駅のわきと、下の駅から右へ進んだところに 1 つずつある', () => {
    for (const pos of [MID_LABORATORY, SOUTH_LABORATORY]) {
      expect(map.getTile(pos)?.terrainType).toBe('laboratory');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 中間駅のわきの研究所は、駅から支道ごしに 3 マス
    expect(distancesFrom(map, MID_STATION, 'infantry').get(MID_LABORATORY)).toBe(3);
    // もう 1 つは下の駅から見て右(東)にある
    expect(SOUTH_LABORATORY.col).toBeGreaterThan(LOW_STATION.col);
    // 研究所を中立のうちに占領した歩兵は新型戦車へ進化する
    expect(getUnitData('newTank').movementType).toBe('vehicle');
  });
});

describe('二島鉄路マップの海峡', () => {
  it('下の駅から 3〜4 マス南はもう海で、海峡を渡ると敵軍の陣地の北隣に着く', () => {
    // 下の駅の真下は 3 マス先が海岸、4 マス先が海
    expect(map.getTile(gridPosition(8, 16))?.terrainType).toBe('beach');
    expect(map.getTile(gridPosition(8, 17))?.terrainType).toBe('sea');
    for (const pos of UPPER_BEACH) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    for (const pos of LOWER_BEACH) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    // 海峡の幅は 3 マス(輸送艦の移動力 5 で渡り切れる)
    const sea = distancesFrom(map, gridPosition(8, 16), 'sea');
    expect(sea.get(gridPosition(8, 20))).toBe(4);
    expect(getUnitData('transportShip').movement).toBeGreaterThanOrEqual(4);
    // 揚陸地点から敵軍の本拠地までは歩兵で 5
    expect(distancesFrom(map, gridPosition(8, 20), 'infantry').get(ENEMY_HQ)).toBe(5);
  });

  it('海峡を先に渡れるのは後手のほうで、自軍は南岸の中立港を取って追いつく', () => {
    // 敵軍の陣地の港から自軍の島の南岸までは海路 11、自軍の陣地の港からは 25
    expect(distancesFrom(map, ENEMY_PORTS[0], 'sea').get(gridPosition(8, 16))).toBe(11);
    expect(distancesFrom(map, PLAYER_PORTS[0], 'sea').get(gridPosition(8, 20))).toBe(25);
    // 南岸の中立港を取れば、そこから敵軍の浜までは海路 8
    expect(map.getTile(UPPER_NEUTRAL_PORT)?.terrainType).toBe('port');
    expect(map.getTile(UPPER_NEUTRAL_PORT)?.owner).toBe('neutral');
    expect(distancesFrom(map, UPPER_NEUTRAL_PORT, 'sea').get(gridPosition(8, 20))).toBe(
      8,
    );
    // 中立港は自軍の陣地から歩兵 15(乗船地のすぐわき)
    expect(minCost(UPPER_NEUTRAL_PORT, PLAYER_BASES, 'infantry')).toBe(15);
  });
});

describe('二島鉄路マップの中立都市と先手番ハンデ', () => {
  it('中立都市の総数は先手の島のほうが多い(上の島 12 個・下の島 7 個)', () => {
    for (const pos of [...WEST_CITIES, ...EAST_CITIES, ...LOWER_CITIES]) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    const neutralCities = basesOf('neutral').filter(
      (pos) => map.getTile(pos)?.terrainType === 'city',
    );
    const upper = neutralCities.filter((pos) => pos.row < 17);
    const lower = neutralCities.filter((pos) => pos.row > 19);
    expect(upper).toHaveLength(12);
    expect(lower).toHaveLength(7);
    expect(upper.length).toBeGreaterThan(lower.length);
    // 上の島の 12 個は、線路側 5 個・街道側 7 個に分かれている
    expect(WEST_CITIES).toHaveLength(5);
    expect(EAST_CITIES).toHaveLength(7);
  });

  it('先に占領を始められるのは後手(2 ターン)で、先手は 3 ターンかかる', () => {
    const nearestFor = (bases: readonly GridPosition[]): number =>
      Math.min(
        ...basesOf('neutral')
          .filter((pos) => map.getTile(pos)?.terrainType === 'city')
          .map((pos) => minCost(pos, bases, 'infantry')),
      );
    expect(nearestFor(ENEMY_BASES)).toBe(4);
    expect(nearestFor(PLAYER_BASES)).toBe(7);
    // 歩兵の移動力 3 で、後手は 2 ターン・先手は 3 ターン
    const movement = getUnitData('infantry').movement;
    expect(movement).toBe(3);
    expect(Math.ceil(4 / movement)).toBe(2);
    expect(Math.ceil(7 / movement)).toBe(3);
    // どちらの陣地の隣にも中立都市は無い(1 ターン目からは占領を始められない)
    expect(nearestFor(ENEMY_BASES)).toBeGreaterThan(movement);
  });

  it('街道側の中立都市は山の壁の向こうにあり、取りにいくには駅か峠を抜ける', () => {
    for (const pos of EAST_CITIES) {
      // 壁の向こうなので、どれも線路側の中立都市より遠い
      expect(minCost(pos, PLAYER_BASES, 'infantry')).toBeGreaterThan(
        Math.min(...WEST_CITIES.map((west) => minCost(west, PLAYER_BASES, 'infantry'))),
      );
      expect(minCost(pos, PLAYER_BASES, 'vehicle')).toBeLessThan(Infinity);
    }
  });
});

describe('二島鉄路マップの通行性と敵軍AI', () => {
  it('歩兵は、自分の島で進入できるマスすべてへ陣地からたどり着ける', () => {
    const islands = [
      { bases: PLAYER_BASES, rows: [0, 16] as const },
      { bases: ENEMY_BASES, rows: [20, 31] as const },
    ];
    for (const { bases, rows } of islands) {
      const fields = bases.map((base) => distancesFrom(map, base, 'infantry'));
      map.forEachTile((tile) => {
        if (tile.position.row < rows[0] || tile.position.row > rows[1]) return;
        if (map.getMoveCost(tile.position, 'infantry') === null) return;
        expect(fields.some((field) => field.get(tile.position) !== undefined)).toBe(true);
      });
    }
  });

  it('中立拠点は、どれも歩兵か輸送艦の海路で到達できる', () => {
    const groundBases = [...PLAYER_BASES, ...ENEMY_BASES];
    const seaFields = [...PLAYER_PORTS, ...ENEMY_PORTS].map((port) =>
      distancesFrom(map, port, 'sea'),
    );
    for (const pos of basesOf('neutral')) {
      const byLand = minCost(pos, groundBases, 'infantry') < Infinity;
      // 海上ユニットは拠点そのものか、隣接する海岸まで近づければ揚陸できる
      const neighbors = [
        gridPosition(pos.col + 1, pos.row),
        gridPosition(pos.col - 1, pos.row),
        gridPosition(pos.col, pos.row + 1),
        gridPosition(pos.col, pos.row - 1),
      ].filter((neighbor) => map.isInBounds(neighbor));
      const bySea = seaFields.some(
        (field) =>
          field.get(pos) !== undefined ||
          neighbors.some((neighbor) => field.get(neighbor) !== undefined),
      );
      expect(byLand || bySea).toBe(true);
    }
  });

  it('敵軍AIは中立都市の占領を進め、海を越える足(輸送艦)も用意できる', () => {
    const aiMap = MapManager.fromDefinition(TWIN_ISLAND_RAIL_MAP);
    const units = UnitManager.fromPlacements(TWIN_ISLAND_RAIL_MAP.units ?? [], aiMap);
    const economy = new EconomyManager({
      initialFunds: TWIN_ISLAND_RAIL_MAP.initialFunds,
    });
    const ai = new EnemyAi({
      map: aiMap,
      units,
      battle: new BattleManager(aiMap, units),
      capture: new CaptureSystem(),
      production: new ProductionManager(aiMap, units, economy),
    });

    // 収入 → 敵軍AIの手番 → 行動済みのリセット、を 10 ターンぶん繰り返す
    for (let turn = 0; turn < 10; turn += 1) {
      economy.collectIncome('enemy', aiMap);
      expect(() => ai.run()).not.toThrow();
      for (const unit of units.getUnitsByArmy('enemy')) unit.hasActed = false;
    }

    // 占領役の歩兵が出て、陣地の外の中立都市を実際に取れている
    expect(
      units.getUnitsByArmy('enemy').some((unit) => unit.unitType === 'infantry'),
    ).toBe(true);
    let captured = 0;
    aiMap.forEachTile((tile) => {
      if (tile.owner === 'enemy' && getTerrainData(tile.terrainType).canCapture) {
        captured += 1;
      }
    });
    expect(captured).toBeGreaterThan(ENEMY_BASES.length);
  });
});
