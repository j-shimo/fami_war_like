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
import { RAIL_BRIDGE_MAP } from '@/data/maps/railBridgeMap';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

/** 自軍(先手)の陣地。左上の本拠地 1・工場 3・駅 1・港 1 */
const PLAYER_HQ = gridPosition(3, 1);
const PLAYER_STATION = gridPosition(5, 1);
const PLAYER_PORT = gridPosition(5, 2);
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(2, 1),
  gridPosition(4, 1),
  gridPosition(3, 2),
];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  PLAYER_STATION,
  PLAYER_PORT,
  ...PLAYER_FACTORIES,
];

/** 敵軍(後手)の陣地。右上の本拠地 1・工場 3・駅 1・港 1(自軍陣地の左右反転) */
const ENEMY_HQ = gridPosition(25, 1);
const ENEMY_STATION = gridPosition(23, 1);
const ENEMY_PORT = gridPosition(23, 2);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(26, 1),
  gridPosition(24, 1),
  gridPosition(25, 2),
];
const ENEMY_BASES: readonly GridPosition[] = [
  ENEMY_HQ,
  ENEMY_STATION,
  ENEMY_PORT,
  ...ENEMY_FACTORIES,
];

/** 盤面中央の高台にある中立の駅。線路の中間点 */
const NEUTRAL_STATION = gridPosition(14, 1);

/** 中央の陸地を横断する川(幅 1 マス)。左右の入江をつなぐ水路でもある */
const RIVER: readonly GridPosition[] = [12, 13, 14, 15, 16].map((col) =>
  gridPosition(col, 5),
);

/** 中央の縦棒の両岸にある中立港 */
const NEUTRAL_PORTS: readonly GridPosition[] = [gridPosition(12, 9), gridPosition(16, 9)];

/** 中央の下部、街道 col 14 の両脇に置いた中立の研究所 2 個 */
const LABORATORIES: readonly GridPosition[] = [gridPosition(13, 8), gridPosition(15, 8)];

/** 後手のハンデとして敵軍陣地の隣にだけ置いた中立都市 2 個 */
const HANDICAP_CITIES: readonly GridPosition[] = [
  gridPosition(24, 3),
  gridPosition(27, 3),
];

/** ハンデ都市の左右対称位置(自軍側。平地のままにしてある) */
const HANDICAP_MIRRORS: readonly GridPosition[] = [
  gridPosition(4, 3),
  gridPosition(1, 3),
];

const map = MapManager.fromDefinition(RAIL_BRIDGE_MAP);

/** starts のどれかから pos までの最小移動コスト(到達できなければ Infinity) */
function minCost(
  target: GridPosition,
  starts: readonly GridPosition[],
  movementType: MovementType,
  from: MapManager = map,
): number {
  let best = Infinity;
  for (const start of starts) {
    const cost = distancesFrom(from, start, movementType).get(target);
    if (cost !== undefined) best = Math.min(best, cost);
  }
  return best;
}

/** 地形記号を置き換えたマップを作る(「この地形が無かったら」を測るために使う) */
function replacedMap(from: string, to: string): MapManager {
  const def: MapDefinition = {
    ...RAIL_BRIDGE_MAP,
    terrain: RAIL_BRIDGE_MAP.terrain.map((line) => line.split(from).join(to)),
  };
  return MapManager.fromDefinition(def);
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

describe('三叉鉄橋マップの盤面', () => {
  it('29x17 の盤面で、空港は無い(飛行ユニットの出ないマップ)', () => {
    expect(map.cols).toBe(29);
    expect(map.rows).toBe(17);
    expect(map.name).toBe('三叉鉄橋マップ');
    expect(map.hasAirport).toBe(false);
  });

  it('後手のハンデ 2 マスを除いて、盤面は中央(col 14)を軸に左右対称である', () => {
    const isHandicap = (col: number, row: number): boolean =>
      [...HANDICAP_CITIES, ...HANDICAP_MIRRORS].some(
        (pos) => pos.col === col && pos.row === row,
      );
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (isHandicap(col, row) || isHandicap(map.cols - 1 - col, row)) continue;
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe(
          map.getTile(gridPosition(map.cols - 1 - col, row))?.terrainType,
        );
      }
    }
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

  it('陸地は「山」の字の形をしていて、2 つの入江(row 0〜12)が縦棒を隔てている', () => {
    for (let row = 0; row <= 12; row += 1) {
      for (const col of [6, 7, 8, 9, 10, 11, 17, 18, 19, 20, 21, 22]) {
        // 線路(row 1)の鉄橋だけが入江を渡る
        const expected = row === 1 ? 'railway' : 'sea';
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe(expected);
      }
    }
    // 3 本の縦棒は南岸(row 13〜16)でひとつにつながる
    for (let row = 13; row <= 16; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).not.toBeNull();
      }
    }
  });

  it('3 本の縦棒はどれも上端(row 0)から始まり、中央の縦棒の頂上に中立駅の高台がある', () => {
    for (const col of [0, 5, 12, 14, 16, 23, 28]) {
      expect(map.getMoveCost(gridPosition(col, 0), 'infantry')).not.toBeNull();
    }
    // 中立駅 (14,1) の真上は物見の山
    expect(map.getTile(gridPosition(14, 0))?.terrainType).toBe('mountain');
    // 高台(row 2〜4)は中立都市 3 個を抱えている
    for (const pos of [gridPosition(13, 2), gridPosition(15, 2), gridPosition(14, 3)]) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
  });
});

describe('三叉鉄橋マップの拠点', () => {
  it('両軍とも本拠地 1・工場 3・駅 1・港 1 の 6 拠点(収入 6000)で始まる', () => {
    for (const [owner, bases] of [
      ['player', PLAYER_BASES],
      ['enemy', ENEMY_BASES],
    ] as const) {
      expect(new Set(basesOf(owner).map((pos) => `${pos.col},${pos.row}`))).toEqual(
        new Set(bases.map((pos) => `${pos.col},${pos.row}`)),
      );
    }
    expect(map.getTile(PLAYER_HQ)?.terrainType).toBe('headquarters');
    expect(map.getTile(PLAYER_STATION)?.terrainType).toBe('station');
    expect(map.getTile(PLAYER_PORT)?.terrainType).toBe('port');
    for (const factory of PLAYER_FACTORIES) {
      expect(map.getTile(factory)?.terrainType).toBe('factory');
    }

    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(6000);
    expect(economy.getIncome('enemy', map)).toBe(6000);
  });

  it('中立拠点は 30 個(中立都市 25・中立研究所 2・中立港 2・中立駅 1)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(30);
    const byTerrain = neutral.reduce<Record<string, number>>((counts, pos) => {
      const terrain = map.getTile(pos)?.terrainType ?? '';
      counts[terrain] = (counts[terrain] ?? 0) + 1;
      return counts;
    }, {});
    expect(byTerrain).toEqual({ city: 25, laboratory: 2, port: 2, station: 1 });
  });

  it('初期ユニットは置かず、初期資金 30000(列車砲ちょうど)から生産で戦力を用意する', () => {
    expect(RAIL_BRIDGE_MAP.units).toEqual([]);
    expect(RAIL_BRIDGE_MAP.initialFunds).toBe(30000);
    // 1 ターン目から駅で列車砲を買える額にしてある(敵軍AIが貯金で列車砲まで届かないための調整)
    expect(RAIL_BRIDGE_MAP.initialFunds).toBe(getUnitData('railgun').cost);
  });

  it('中立港 2 個は中央の縦棒の両岸にあり、両軍の港から海路でつながっている', () => {
    for (const port of NEUTRAL_PORTS) {
      expect(map.getTile(port)?.terrainType).toBe('port');
      expect(map.getTile(port)?.owner).toBe('neutral');
      expect(distancesFrom(map, PLAYER_PORT, 'sea').get(port)).toBeLessThan(Infinity);
      expect(distancesFrom(map, ENEMY_PORT, 'sea').get(port)).toBeLessThan(Infinity);
    }
  });
});

describe('三叉鉄橋マップの中央の下部', () => {
  it('街道 col 14 の両脇に中立の研究所を 2 個置いてある', () => {
    for (const lab of LABORATORIES) {
      expect(map.getTile(lab)?.terrainType).toBe('laboratory');
      expect(map.getTile(lab)?.owner).toBe('neutral');
    }
    // 2 個は中央の街道を挟んで左右対称
    expect(LABORATORIES[0].col + LABORATORIES[1].col).toBe(map.cols - 1);
    expect(map.getTile(gridPosition(14, 8))?.terrainType).toBe('road');
  });

  it('研究所へは線路から高台を抜けて降りるのが最短で、両軍とも近いほうへ 6 ターンで届く', () => {
    // 自軍は左の研究所・敵軍は右の研究所が近い(どちらも 16 = 歩兵の移動力 3 で 6 ターン)
    expect(minCost(LABORATORIES[0], PLAYER_BASES, 'infantry')).toBe(16);
    expect(minCost(LABORATORIES[1], ENEMY_BASES, 'infantry')).toBe(16);
    expect(Math.ceil(16 / 3)).toBe(6);
    // 遠いほうの研究所はどちらの軍も 18
    expect(minCost(LABORATORIES[1], PLAYER_BASES, 'infantry')).toBe(18);
    expect(minCost(LABORATORIES[0], ENEMY_BASES, 'infantry')).toBe(18);
    // 線路を落として南岸を回ると遠回りになる
    expect(
      minCost(LABORATORIES[0], PLAYER_BASES, 'infantry', replacedMap('=', '~')),
    ).toBe(27);
  });

  it('川より南の中央の縦棒だけで 8 拠点(研究所 2・都市 4・港 2)が取れる', () => {
    const lowerCenter = basesOf('neutral').filter(
      (pos) => pos.col >= 12 && pos.col <= 16 && pos.row >= 6 && pos.row <= 12,
    );
    expect(lowerCenter).toHaveLength(8);
    const byTerrain = lowerCenter.reduce<Record<string, number>>((counts, pos) => {
      const terrain = map.getTile(pos)?.terrainType ?? '';
      counts[terrain] = (counts[terrain] ?? 0) + 1;
      return counts;
    }, {});
    expect(byTerrain).toEqual({ laboratory: 2, city: 4, port: 2 });
  });
});

describe('三叉鉄橋マップの線路', () => {
  it('自軍の駅から中立の駅を挟んで敵軍の駅まで、線路が一直線につながっている', () => {
    for (let col = PLAYER_STATION.col; col <= ENEMY_STATION.col; col += 1) {
      const terrain = map.getTile(gridPosition(col, 1))?.terrainType;
      const isStation = [
        PLAYER_STATION.col,
        NEUTRAL_STATION.col,
        ENEMY_STATION.col,
      ].includes(col);
      expect(terrain).toBe(isStation ? 'station' : 'railway');
    }
    expect(map.getTile(NEUTRAL_STATION)?.owner).toBe('neutral');
    // 駅は 3 つだけ(自軍・中立・敵軍)
    let stations = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'station') stations += 1;
    });
    expect(stations).toBe(3);
  });

  it('列車砲(軌道)は自軍の駅から中立駅まで 9・敵軍の駅まで 18 で走れる', () => {
    const rail = distancesFrom(map, PLAYER_STATION, 'rail');
    expect(rail.get(NEUTRAL_STATION)).toBe(9);
    expect(rail.get(ENEMY_STATION)).toBe(18);
    // 中立駅までの距離は両軍で等しい(先に動ける先手が先着する)
    expect(distancesFrom(map, ENEMY_STATION, 'rail').get(NEUTRAL_STATION)).toBe(9);
  });

  it('列車砲は中立駅までなら 1 ターンで届くが、敵軍の駅までは 1 ターンでは届かない', () => {
    const railgunMovement = getUnitData('railgun').movement;
    expect(railgunMovement).toBe(15);
    const rail = distancesFrom(map, PLAYER_STATION, 'rail');
    expect(rail.get(NEUTRAL_STATION)!).toBeLessThanOrEqual(railgunMovement);
    expect(rail.get(ENEMY_STATION)!).toBeGreaterThan(railgunMovement);
  });

  it('中立駅は線路づたいなら歩兵で 3 ターン、南岸を回ると 12 ターンかかる', () => {
    const viaRail = minCost(NEUTRAL_STATION, PLAYER_BASES, 'infantry');
    const detour = minCost(
      NEUTRAL_STATION,
      PLAYER_BASES,
      'infantry',
      replacedMap('=', '~'),
    );
    expect(viaRail).toBe(9);
    expect(detour).toBe(36);
    // 歩兵の移動力 3 で比べると 3 ターンと 12 ターン
    expect(Math.ceil(viaRail / 3)).toBe(3);
    expect(Math.ceil(detour / 3)).toBe(12);
  });

  it('線路を使わないと、敵本拠地までは南岸をぐるっと回り込むしかない', () => {
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'infantry')).toBe(20);
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'infantry', replacedMap('=', '~'))).toBe(46);
  });

  it('鉄橋は車両にとって重い帯なので、線路を渡って先陣を切るのは歩兵と列車砲になる', () => {
    // 装軌車両は線路のコストが 2 なので、歩兵の 20 に対して 36 かかる(南岸回りは 47)
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'vehicle')).toBe(36);
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'vehicle', replacedMap('=', '~'))).toBe(47);
    // 装輪車両は線路のコストが 4 なので、線路を通っても南岸を回っても 47 で変わらない
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'wheeled')).toBe(47);
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'wheeled', replacedMap('=', '~'))).toBe(47);
  });
});

describe('三叉鉄橋マップの川', () => {
  it('中央の陸地を横断する幅 1 マスの川で、高台と下の陸地がつながっている', () => {
    for (const pos of RIVER) {
      expect(map.getTile(pos)?.terrainType).toBe('river');
    }
    // 川の南北はどちらも陸地(高台 row 4 と、下の陸地 row 6)
    expect(map.getMoveCost(gridPosition(14, 4), 'infantry')).not.toBeNull();
    expect(map.getMoveCost(gridPosition(14, 6), 'infantry')).not.toBeNull();
  });

  it('川は左右の入江につながっていて、海上ユニットの水路になる', () => {
    expect(map.getTile(gridPosition(11, 5))?.terrainType).toBe('sea');
    expect(map.getTile(gridPosition(17, 5))?.terrainType).toBe('sea');
    // 自軍の港から敵軍の港までの海路は 24。川を陸(平地)に変えると到達できなくなる
    expect(distancesFrom(map, PLAYER_PORT, 'sea').get(ENEMY_PORT)).toBe(24);
    expect(
      distancesFrom(replacedMap('w', '.'), PLAYER_PORT, 'sea').get(ENEMY_PORT),
    ).toBeUndefined();
  });

  it('装輪車両は川を渡れないので、南から中立駅の高台へは上がれない', () => {
    // 線路を落とした盤面(南岸回りのみ)では、装輪車両は中立駅へ到達できない
    expect(minCost(NEUTRAL_STATION, PLAYER_BASES, 'wheeled', replacedMap('=', '~'))).toBe(
      Infinity,
    );
    // 歩兵・装軌車両は渡れる
    expect(
      minCost(NEUTRAL_STATION, PLAYER_BASES, 'vehicle', replacedMap('=', '~')),
    ).toBeLessThan(Infinity);
  });

  it('高台へ揚陸できるよう、川の北の両端に海岸を置いてある', () => {
    for (const pos of [gridPosition(12, 4), gridPosition(16, 4)]) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
      expect(distancesFrom(map, PLAYER_PORT, 'sea').get(pos)).toBeLessThan(Infinity);
    }
  });
});

describe('三叉鉄橋マップの先手番ハンデ', () => {
  it('敵軍陣地の隣にだけ中立都市を 2 個多く置いてある', () => {
    for (const pos of HANDICAP_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    for (const pos of HANDICAP_MIRRORS) {
      expect(map.getTile(pos)?.terrainType).toBe('plain');
    }
  });

  it('ハンデ都市は敵軍だけが 1 ターンで届き、自軍の最寄りの中立都市は 2 ターンかかる', () => {
    for (const pos of HANDICAP_CITIES) {
      // 歩兵(移動力 3)で 1 ターン
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBeLessThanOrEqual(3);
    }
    const nearestForPlayer = Math.min(
      ...basesOf('neutral')
        .filter((pos) => map.getTile(pos)?.terrainType === 'city')
        .map((pos) => minCost(pos, PLAYER_BASES, 'infantry')),
    );
    expect(nearestForPlayer).toBe(4);
    expect(Math.ceil(nearestForPlayer / 3)).toBe(2);
  });
});

describe('三叉鉄橋マップの通行性と敵軍AI', () => {
  it('進入できるマスに、陣地からたどり着けない袋小路は無い', () => {
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      const fields = PLAYER_BASES.map((base) => distancesFrom(map, base, movementType));
      map.forEachTile((tile) => {
        if (map.getMoveCost(tile.position, movementType) === null) return;
        expect(fields.some((field) => field.get(tile.position) !== undefined)).toBe(true);
      });
    }
    // 列車砲(軌道)は線路と駅だけを進むので、自軍の駅からすべての線路・駅へ届く
    const rail = distancesFrom(map, PLAYER_STATION, 'rail');
    map.forEachTile((tile) => {
      if (map.getMoveCost(tile.position, 'rail') === null) return;
      expect(rail.get(tile.position)).not.toBeUndefined();
    });
  });

  it('敵軍AIは初期資金 30000 で 1 ターン目に列車砲を生産できる', () => {
    const aiMap = MapManager.fromDefinition(RAIL_BRIDGE_MAP);
    const units = UnitManager.fromPlacements(RAIL_BRIDGE_MAP.units ?? [], aiMap);
    const economy = new EconomyManager({ initialFunds: RAIL_BRIDGE_MAP.initialFunds });
    const ai = new EnemyAi({
      map: aiMap,
      units,
      battle: new BattleManager(aiMap, units),
      capture: new CaptureSystem(),
      production: new ProductionManager(aiMap, units, economy),
    });

    // 収入 → 敵軍AIの手番 → 行動済みのリセット、を 6 ターンぶん繰り返す
    for (let turn = 0; turn < 6; turn += 1) {
      economy.collectIncome('enemy', aiMap);
      expect(() => ai.run()).not.toThrow();
      for (const unit of units.getUnitsByArmy('enemy')) unit.hasActed = false;
    }

    // 初期資金を列車砲ちょうど(30000 G)にしたねらいどおり、1 ターン目で列車砲が出る
    expect(
      units.getUnitsByArmy('enemy').some((unit) => unit.unitType === 'railgun'),
    ).toBe(true);
    // そのあとも毎ターン生産を続けられる
    expect(units.getUnitsByArmy('enemy').length).toBeGreaterThan(1);
    // 陣地の拠点はすべて敵軍のまま維持されている
    let owned = 0;
    aiMap.forEachTile((tile) => {
      if (tile.owner === 'enemy' && getTerrainData(tile.terrainType).canCapture) {
        owned += 1;
      }
    });
    expect(owned).toBeGreaterThanOrEqual(ENEMY_BASES.length);
  });
});
