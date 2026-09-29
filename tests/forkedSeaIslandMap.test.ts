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
import { FORKED_SEA_ISLAND_MAP } from '@/data/maps/forkedSeaIslandMap';
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

const ARMIES: readonly TurnArmy[] = ['player', 'enemy', 'third', 'fourth'];

/** 各軍の本拠地 */
const HQ: Readonly<Record<TurnArmy, GridPosition>> = {
  player: gridPosition(4, 2),
  enemy: gridPosition(24, 4),
  third: gridPosition(4, 22),
  fourth: gridPosition(25, 22),
};

/** 橋(海の上の道路) */
const BRIDGES: readonly GridPosition[] = [
  // 上の線が上の腕を渡る橋
  gridPosition(10, 6),
  gridPosition(11, 6),
  // 右の縦線が右の腕を渡る橋
  gridPosition(25, 9),
  gridPosition(25, 10),
  // 真ん中の線が下の軸を渡る橋
  gridPosition(13, 14),
  gridPosition(14, 14),
  // 下の線が下の軸を渡る橋
  gridPosition(11, 21),
  gridPosition(12, 21),
];

const TOP_LABORATORY = gridPosition(12, 6);
const MIDDLE_LABORATORY = gridPosition(16, 14);

describe('叉海大島マップ(4P マップ)', () => {
  const map = MapManager.fromDefinition(FORKED_SEA_ISLAND_MAP);

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

  const isSea = (pos: GridPosition): boolean => map.getTile(pos)?.terrainType === 'sea';
  const isBridge = (pos: GridPosition): boolean =>
    BRIDGES.some((bridge) => key(bridge) === key(pos));
  const isRoadLike = (pos: GridPosition): boolean => {
    const terrain = map.getTile(pos)?.terrainType;
    return terrain === 'road' || terrain === 'laboratory';
  };

  it('30x26 の 4P マップとして一覧に登録されている', () => {
    expect(map.cols).toBe(30);
    expect(map.rows).toBe(26);
    const entry = MAP_LIST.find((item) => item.id === 'forkedSeaIsland');
    expect(entry?.group).toBe('four');
    expect(entry?.category).toBe('normal');
    expect(mapsInGroup(MAP_LIST, 'four')).toContain(entry);
  });

  it('初期の拠点は 1P が最少・4P が最多(1P 左上・2P 右上・3P 左下・4P 右下)', () => {
    const holdings = (army: TurnArmy): Record<string, number> => {
      const counts: Record<string, number> = {};
      map.forEachTile((tile) => {
        if (tile.owner === army) {
          counts[tile.terrainType] = (counts[tile.terrainType] ?? 0) + 1;
        }
      });
      return counts;
    };
    expect(holdings('player')).toEqual({ headquarters: 1, factory: 3, airport: 2 });
    expect(holdings('enemy')).toEqual({ headquarters: 1, factory: 4, airport: 2 });
    expect(holdings('third')).toEqual({ headquarters: 1, factory: 4, airport: 2 });
    expect(holdings('fourth')).toEqual({
      headquarters: 1,
      factory: 4,
      airport: 2,
      city: 4,
    });
    for (const army of ARMIES) {
      expect(map.getTile(HQ[army])?.terrainType).toBe('headquarters');
      expect(map.getTile(HQ[army])?.owner).toBe(army);
    }
    const midCol = map.cols / 2;
    const midRow = map.rows / 2;
    expect(HQ.player.col).toBeLessThan(midCol);
    expect(HQ.player.row).toBeLessThan(midRow);
    expect(HQ.enemy.col).toBeGreaterThan(midCol);
    expect(HQ.enemy.row).toBeLessThan(midRow);
    expect(HQ.third.col).toBeLessThan(midCol);
    expect(HQ.third.row).toBeGreaterThan(midRow);
    expect(HQ.fourth.col).toBeGreaterThan(midCol);
    expect(HQ.fourth.row).toBeGreaterThan(midRow);
  });

  it('初期ユニットは無く、初期資金は 0。収入は 1P 6000・2P と 3P 7000・4P 11000', () => {
    expect(FORKED_SEA_ISLAND_MAP.units ?? []).toHaveLength(0);
    expect(FORKED_SEA_ISLAND_MAP.initialFunds).toBe(0);
    const economy = new EconomyManager({ initialFunds: 0 });
    expect(economy.getIncome('player', map)).toBe(6000);
    expect(economy.getIncome('enemy', map)).toBe(7000);
    expect(economy.getIncome('third', map)).toBe(7000);
    expect(economy.getIncome('fourth', map)).toBe(11000);
  });

  it('中立の拠点は研究所 2・空港 3・都市 29(港と駅は無い)', () => {
    const neutral = (terrain: TerrainType): GridPosition[] =>
      tilesOf(map, terrain).filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(tilesOf(map, 'laboratory')).toHaveLength(2);
    expect(neutral('laboratory')).toHaveLength(2);
    expect(neutral('airport')).toHaveLength(3);
    expect(neutral('city')).toHaveLength(29);
    expect(neutral('factory')).toHaveLength(0);
    expect(tilesOf(map, 'port')).toHaveLength(0);
    expect(tilesOf(map, 'station')).toHaveLength(0);
  });

  it('1 つの島で、外周はすべて海', () => {
    for (let col = 0; col < map.cols; col += 1) {
      expect(isSea(gridPosition(col, 0))).toBe(true);
      expect(isSea(gridPosition(col, map.rows - 1))).toBe(true);
    }
    for (let row = 0; row < map.rows; row += 1) {
      expect(isSea(gridPosition(0, row))).toBe(true);
      expect(isSea(gridPosition(map.cols - 1, row))).toBe(true);
    }
    // 橋を通れば、歩兵で 4 軍の陣地がすべて行き来できる
    const land = floodFill(map, HQ.player, (pos) => !isSea(pos));
    for (const army of ARMIES) {
      expect(land.has(key(HQ[army]))).toBe(true);
    }
  });

  it('Y 字の海が上辺の左寄り・右辺の上寄り・下辺の左寄りへ抜け、陸を 3 つに割る', () => {
    const inner = (pos: GridPosition): boolean =>
      pos.col > 0 && pos.row > 0 && pos.col < map.cols - 1 && pos.row < map.rows - 1;
    // 外周より内側の海は、橋の下も含めてひとつながりの Y 字の海峡だけ
    const innerSeas = tilesOf(map, 'sea').filter(inner);
    const strait = floodFill(
      map,
      gridPosition(13, 11),
      (pos) => inner(pos) && (isSea(pos) || isBridge(pos)),
    );
    expect(strait.size).toBe(innerSeas.length + BRIDGES.length);
    // 3 つの先端が外周の海へ出る位置
    const touches = innerSeas.filter((pos) =>
      neighbors(pos).some((next) => !inner(next)),
    );
    const top = touches.filter((pos) => pos.row === 1);
    const right = touches.filter((pos) => pos.col === map.cols - 2);
    const bottom = touches.filter((pos) => pos.row === map.rows - 2);
    expect(top.length + right.length + bottom.length).toBe(touches.length);
    // 上辺の真ん中より左
    for (const pos of top) expect(pos.col).toBeLessThan(map.cols / 2);
    // 右辺の上寄り(上半分)
    for (const pos of right) expect(pos.row).toBeLessThan(map.rows / 2);
    // 下辺の真ん中より左
    for (const pos of bottom) expect(pos.col).toBeLessThan(map.cols / 2);
    expect(top.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(bottom.length).toBeGreaterThan(0);

    // 橋を除いた陸は 3 つに分かれる(1P と 3P が同じ陸・2P と 4P はそれぞれ別の陸)
    const landOf = (army: TurnArmy): Set<string> =>
      floodFill(map, HQ[army], (pos) => !isSea(pos) && !isBridge(pos));
    const west = landOf('player');
    const northEast = landOf('enemy');
    const southEast = landOf('fourth');
    expect(west.has(key(HQ.third))).toBe(true);
    expect(west.has(key(HQ.enemy))).toBe(false);
    expect(west.has(key(HQ.fourth))).toBe(false);
    expect(northEast.has(key(HQ.fourth))).toBe(false);
    // 陸はこの 3 つだけで、4P の南東の陸がいちばん広い
    let landTiles = 0;
    map.forEachTile((tile) => {
      if (!isSea(tile.position) && !isBridge(tile.position)) landTiles += 1;
    });
    expect(west.size + northEast.size + southEast.size).toBe(landTiles);
    expect(southEast.size).toBeGreaterThan(northEast.size);
    expect(southEast.size).toBeGreaterThan(west.size / 2);
  });

  it('Y 字の海の幅はどこも 2〜3 マス', () => {
    /** 指定した行で、col の範囲にある海の連なりの長さ */
    const horizontalRuns = (row: number, from: number, to: number): number[] => {
      const runs: number[] = [];
      let run = 0;
      for (let col = from; col <= to; col += 1) {
        if (isSea(gridPosition(col, row)) || isBridge(gridPosition(col, row))) {
          run += 1;
        } else if (run > 0) {
          runs.push(run);
          run = 0;
        }
      }
      if (run > 0) runs.push(run);
      return runs;
    };
    const verticalRuns = (col: number, from: number, to: number): number[] => {
      const runs: number[] = [];
      let run = 0;
      for (let row = from; row <= to; row += 1) {
        if (isSea(gridPosition(col, row)) || isBridge(gridPosition(col, row))) {
          run += 1;
        } else if (run > 0) {
          runs.push(run);
          run = 0;
        }
      }
      if (run > 0) runs.push(run);
      return runs;
    };
    // 上の腕(row 1〜10)と下の軸(row 13〜24)は横幅で測る
    for (const row of [...range(1, 10), ...range(13, 24)]) {
      const runs = horizontalRuns(row, 1, 16);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toBeGreaterThanOrEqual(2);
      expect(runs[0]).toBeLessThanOrEqual(3);
    }
    // 右の腕(col 15〜28)は縦幅で測る
    for (const col of range(15, 28)) {
      const runs = verticalRuns(col, 5, 13);
      expect(runs).toHaveLength(1);
      expect(runs[0]).toBeGreaterThanOrEqual(2);
      expect(runs[0]).toBeLessThanOrEqual(3);
    }
  });

  it('道路は「日」の字で、2P のまわりだけ右上の角の代わりに「口」の字になる', () => {
    // 左の縦線 col 4・右の縦線 col 25(「口」の下辺から)
    for (const row of range(6, 21)) {
      expect(isRoadLike(gridPosition(4, row))).toBe(true);
    }
    for (const row of range(7, 21)) {
      expect(isRoadLike(gridPosition(25, row))).toBe(true);
    }
    // 上の線 row 6(「口」の左辺まで)・真ん中の線 row 14・下の線 row 21
    for (const col of range(4, 21)) {
      expect(isRoadLike(gridPosition(col, 6))).toBe(true);
    }
    for (const col of range(4, 25)) {
      expect(isRoadLike(gridPosition(col, 14))).toBe(true);
      expect(isRoadLike(gridPosition(col, 21))).toBe(true);
    }
    // 「日」の右上の角 (25,6) は道路ではなく、代わりに 2P の陣地を「口」の字の道路が囲む
    expect(isRoadLike(gridPosition(25, 6))).toBe(false);
    for (const col of range(21, 27)) {
      expect(isRoadLike(gridPosition(col, 2))).toBe(true);
      expect(isRoadLike(gridPosition(col, 7))).toBe(true);
    }
    for (const row of range(2, 7)) {
      expect(isRoadLike(gridPosition(21, row))).toBe(true);
      expect(isRoadLike(gridPosition(27, row))).toBe(true);
    }
    // 「口」の内側に 2P の陣地がある
    map.forEachTile((tile) => {
      if (tile.owner !== 'enemy') return;
      expect(tile.position.col).toBeGreaterThan(21);
      expect(tile.position.col).toBeLessThan(27);
      expect(tile.position.row).toBeGreaterThan(2);
      expect(tile.position.row).toBeLessThan(7);
    });
    // 3P・4P の本拠地は「日」の下の角のすぐ下
    expect(key(HQ.third)).toBe('4,22');
    expect(key(HQ.fourth)).toBe('25,22');
    // 海を渡るところは道路の橋
    for (const bridge of BRIDGES) {
      expect(map.getTile(bridge)?.terrainType).toBe('road');
    }
    // 道路と陣地の拠点だけを通って 4 軍の本拠地がすべてつながる
    const network = floodFill(map, HQ.player, (pos) => {
      const terrain = map.getTile(pos)?.terrainType;
      return isRoadLike(pos) || terrain === 'headquarters' || terrain === 'factory';
    });
    for (const army of ARMIES) {
      expect(network.has(key(HQ[army]))).toBe(true);
    }
  });

  it('1P の本拠地からの道路は、やや下へ伸びてから「日」の左上の角へ合流する', () => {
    // 本拠地の真下から「日」の左上の角 (4,6) まで道路が伸びる
    for (const row of range(3, 5)) {
      const pos = gridPosition(HQ.player.col, row);
      expect(map.getTile(pos)?.terrainType).toBe('road');
      // 途中で横へ枝分かれしない
      expect(isRoadLike(gridPosition(pos.col - 1, row))).toBe(false);
      expect(isRoadLike(gridPosition(pos.col + 1, row))).toBe(false);
    }
    expect(HQ.player.row).toBeLessThan(6);
    // 1P の陣地は「日」の枠の外(上の線より北)
    map.forEachTile((tile) => {
      if (tile.owner === 'player') expect(tile.position.row).toBeLessThan(6);
    });
  });

  it('研究所は「日」の上の線の真ん中と、真ん中の線の真ん中あたりにある', () => {
    expect(map.getTile(TOP_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(MIDDLE_LABORATORY)?.terrainType).toBe('laboratory');
    // 上の線(col 4〜21)と真ん中の線(col 4〜25)の真ん中から 2 マス以内
    expect(TOP_LABORATORY.row).toBe(6);
    expect(Math.abs(TOP_LABORATORY.col - (4 + 21) / 2)).toBeLessThanOrEqual(2);
    expect(MIDDLE_LABORATORY.row).toBe(14);
    expect(Math.abs(MIDDLE_LABORATORY.col - (4 + 25) / 2)).toBeLessThanOrEqual(2);
  });

  it('上の研究所へは、最速で向かえば 1P が 2P より先に辿り着く', () => {
    // 歩兵の移動力は 3。生産した次のターンから歩いて何ターンで着くか
    const turns = (army: TurnArmy): number =>
      Math.ceil(costFromCamp(army, TOP_LABORATORY) / 3);
    expect(costFromCamp('player', TOP_LABORATORY)).toBe(11);
    expect(costFromCamp('enemy', TOP_LABORATORY)).toBe(13);
    expect(turns('player')).toBeLessThan(turns('enemy'));
    for (const army of ['third', 'fourth'] as const) {
      expect(turns('player')).toBeLessThan(turns(army));
    }
  });

  it('中立空港は上・中・下に 1 個ずつ、どれも道路沿い', () => {
    const airports = tilesOf(map, 'airport')
      .filter((pos) => map.getTile(pos)?.owner === 'neutral')
      .sort((a, b) => a.row - b.row);
    const band = map.rows / 3;
    expect(airports[0].row).toBeLessThan(band);
    expect(airports[1].row).toBeGreaterThanOrEqual(band);
    expect(airports[1].row).toBeLessThan(band * 2);
    expect(airports[2].row).toBeGreaterThanOrEqual(band * 2);
    for (const airport of airports) {
      expect(neighbors(airport).some(isRoadLike)).toBe(true);
    }
  });

  it('中立都市はどれも道路沿いにあり、1 個か 2 個の塊で置いてある', () => {
    const cities = tilesOf(map, 'city');
    for (const city of cities) {
      expect(neighbors(city).some(isRoadLike)).toBe(true);
    }
    const cityKeys = new Set(cities.map(key));
    const seen = new Set<string>();
    for (const city of cities) {
      if (seen.has(key(city))) continue;
      const cluster = floodFill(map, city, (pos) => cityKeys.has(key(pos)));
      cluster.forEach((cell) => seen.add(cell));
      expect(cluster.size).toBeLessThanOrEqual(2);
    }
  });

  it('開始直後の都市は、1P より 2P・3P より 4P のほうが占領しやすい', () => {
    const neutralCities = tilesOf(map, 'city').filter(
      (pos) => map.getTile(pos)?.owner === 'neutral',
    );
    const nearest = (army: TurnArmy): number[] =>
      neutralCities.map((city) => costFromCamp(army, city)).sort((a, b) => a - b);
    const [p1, p2, p3, p4] = ARMIES.map(nearest);
    // 1P・3P は最寄りの都市でも 2 ターン(移動コスト 4〜6)、2P・4P は 1 ターン(3 以下)で 2 個に届く
    expect(p1[0]).toBeGreaterThan(3);
    expect(p3[0]).toBeGreaterThan(3);
    expect(p2.filter((cost) => cost <= 3)).toHaveLength(2);
    expect(p4.filter((cost) => cost <= 3)).toHaveLength(2);
    // 2 ターンまでに届く都市の数も 2P・4P のほうが多いか同じ
    expect(p2.filter((cost) => cost <= 6).length).toBeGreaterThanOrEqual(
      p1.filter((cost) => cost <= 6).length,
    );
    expect(p4.filter((cost) => cost <= 6).length).toBeGreaterThanOrEqual(
      p3.filter((cost) => cost <= 6).length,
    );
  });

  it('いちばん近い中立拠点の数は 4P が最多・1P が最少', () => {
    const targets: GridPosition[] = [];
    map.forEachTile((tile) => {
      if (tile.owner === 'neutral' && getTerrainData(tile.terrainType).canCapture) {
        targets.push(tile.position);
      }
    });
    const nearestCount: Record<TurnArmy, number> = {
      player: 0,
      enemy: 0,
      third: 0,
      fourth: 0,
    };
    for (const target of targets) {
      const costs = ARMIES.map((army) => costFromCamp(army, target));
      const min = Math.min(...costs);
      // 同じ距離なら手番の早い軍が先に着く
      nearestCount[ARMIES[costs.indexOf(min)]] += 1;
    }
    for (const army of ['enemy', 'third'] as const) {
      expect(nearestCount.player).toBeLessThan(nearestCount[army]);
      expect(nearestCount.fourth).toBeGreaterThan(nearestCount[army]);
    }
  });

  it('森がいちばん多く、4P の陣地のまわりは山地帯', () => {
    const count = (terrain: TerrainType): number => tilesOf(map, terrain).length;
    expect(count('forest')).toBeGreaterThan(count('plain'));
    expect(count('forest')).toBeGreaterThan(count('mountain'));
    // 本拠地から 6 マス以内(チェビシェフ距離)の山の数は 4P がほかの 3 軍よりずっと多い
    const mountainsNear = (army: TurnArmy): number =>
      tilesOf(map, 'mountain').filter(
        (pos) =>
          Math.max(Math.abs(pos.col - HQ[army].col), Math.abs(pos.row - HQ[army].row)) <=
          6,
      ).length;
    for (const army of ['player', 'enemy', 'third'] as const) {
      expect(mountainsNear('fourth')).toBeGreaterThan(mountainsNear(army) * 3);
    }
  });

  it('「なし」を選んだ軍勢の陣地は中立(本拠地は都市)になる', () => {
    const setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'fourth', { control: 'none' });
    const def = removeAbsentArmies(FORKED_SEA_ISLAND_MAP, absentArmies(setup));
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
    const def = FORKED_SEA_ISLAND_MAP;
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

    // どの軍も生産して拠点を取りに出ている
    for (const army of order) {
      if (!turn.isEliminated(army)) {
        expect(economy.countBases(army, aiMap)).toBeGreaterThan(
          initialBases.get(army) ?? 0,
        );
      }
    }
  });
});

/** from から to まで(両端を含む)の整数の並び */
function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
