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
import { CAPE_LABORATORY_MAP } from '@/data/maps/capeLaboratoryMap';
import { getTerrainData } from '@/data/terrainData';

/** 自軍(先手)の陣地。北西の島の真ん中に本拠地 1・工場 3・空港 1・港 2・都市 3 */
const PLAYER_HQ = gridPosition(11, 2);
const PLAYER_AIRPORT = gridPosition(11, 1);
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(10, 2),
  gridPosition(12, 2),
  gridPosition(11, 3),
];
const PLAYER_PORTS: readonly GridPosition[] = [gridPosition(11, 7), gridPosition(17, 6)];
const PLAYER_CITIES: readonly GridPosition[] = [
  gridPosition(9, 2),
  gridPosition(13, 2),
  gridPosition(11, 6),
];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  PLAYER_AIRPORT,
  ...PLAYER_FACTORIES,
  ...PLAYER_PORTS,
  ...PLAYER_CITIES,
];

/** 敵軍(後手)の陣地。南東の島の西端に本拠地 1・工場 3・空港 1・港 2・都市 8 */
const ENEMY_HQ = gridPosition(13, 21);
const ENEMY_AIRPORT = gridPosition(15, 21);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(12, 20),
  gridPosition(14, 20),
  gridPosition(13, 22),
];
const ENEMY_PORTS: readonly GridPosition[] = [gridPosition(11, 19), gridPosition(10, 22)];
const ENEMY_CITIES: readonly GridPosition[] = [
  gridPosition(12, 19),
  gridPosition(16, 19),
  gridPosition(17, 20),
  gridPosition(11, 21),
  gridPosition(18, 21),
  gridPosition(11, 23),
  gridPosition(13, 23),
  gridPosition(15, 23),
];
const ENEMY_BASES: readonly GridPosition[] = [
  ENEMY_HQ,
  ENEMY_AIRPORT,
  ...ENEMY_FACTORIES,
  ...ENEMY_PORTS,
  ...ENEMY_CITIES,
];

/** 北西の島の中立都市。陣地を挟んで西側 5 個・東側 5 個に分かれている */
const WEST_CITIES: readonly GridPosition[] = [
  gridPosition(6, 1),
  gridPosition(2, 2),
  gridPosition(8, 3),
  gridPosition(1, 4),
  gridPosition(5, 6),
];
const EAST_CITIES: readonly GridPosition[] = [
  gridPosition(16, 1),
  gridPosition(18, 2),
  gridPosition(14, 3),
  gridPosition(17, 4),
  gridPosition(15, 6),
];
/** 自軍の島の本体(row 0〜8)がいちばん東まで届く列 */
const PLAYER_ISLAND_EAST_EDGE = 19;

/** 西の岬(島が左側だけ南へ長く伸びた部分)の中立拠点。研究所 1 個と中立都市 3 個 */
const CAPE_LABORATORY = gridPosition(2, 16);
const CAPE_CITIES: readonly GridPosition[] = [
  gridPosition(5, 10),
  gridPosition(1, 13),
  gridPosition(4, 19),
];
/** 岬の東岸(row 13〜20 の col 5)。敵軍の本土と真正面から向かい合う海岸 */
const CAPE_EAST_COAST: readonly GridPosition[] = [13, 14, 15, 16, 17, 18, 19, 20].map(
  (row) => gridPosition(5, row),
);
/** 岬の先端(row 21)。一面の海岸で、上陸作戦の起点になる */
const CAPE_TIP: readonly GridPosition[] = [0, 1, 2, 3, 4].map((col) =>
  gridPosition(col, 21),
);

/** 東の離島。建物は中立の研究所 2 個だけで、まわりはすべて海岸 */
const ISLET_LABORATORIES: readonly GridPosition[] = [
  gridPosition(23, 8),
  gridPosition(24, 8),
];
const ISLET_BEACHES: readonly GridPosition[] = [
  gridPosition(23, 7),
  gridPosition(24, 7),
  gridPosition(22, 8),
  gridPosition(25, 8),
  gridPosition(23, 9),
  gridPosition(24, 9),
];
/** 離島が占める範囲(row 7〜9、col 22〜25) */
function isIslet(pos: GridPosition): boolean {
  return pos.col >= 22 && pos.col <= 25 && pos.row >= 7 && pos.row <= 9;
}

/** 南東の島に残っている中立都市 3 個(北へ伸びた腕の上) */
const ENEMY_ISLAND_NEUTRAL_CITIES: readonly GridPosition[] = [
  gridPosition(25, 13),
  gridPosition(24, 15),
  gridPosition(26, 18),
];

/** 敵軍の本土の海岸。自軍の上陸地点になる */
const ENEMY_BEACHES: readonly GridPosition[] = [
  gridPosition(11, 20),
  gridPosition(10, 21),
  gridPosition(9, 23),
  gridPosition(13, 18),
  gridPosition(14, 18),
];
/** 北へ伸びた腕の北西岸にある海岸。自軍の艦隊が腕へ食い込む足場になる */
const ENEMY_ARM_BEACHES: readonly GridPosition[] = [
  gridPosition(24, 13),
  gridPosition(23, 14),
  gridPosition(21, 15),
  gridPosition(19, 16),
  gridPosition(16, 17),
];

const map = MapManager.fromDefinition(CAPE_LABORATORY_MAP);

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

/** starts から targets のどれかまでの最小移動コスト */
function minCostToAny(
  targets: readonly GridPosition[],
  starts: readonly GridPosition[],
  movementType: MovementType,
): number {
  return Math.min(...targets.map((target) => minCost(target, starts, movementType)));
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

/** 位置の集合を比較しやすい文字列の Set にする */
function keys(positions: readonly GridPosition[]): Set<string> {
  return new Set(positions.map((pos) => `${pos.col},${pos.row}`));
}

describe('岬と研究島マップの盤面', () => {
  it('28x25 の盤面で、空港がある(飛行ユニットの出るマップ)', () => {
    expect(map.cols).toBe(28);
    expect(map.rows).toBe(25);
    expect(map.name).toBe('岬と研究島マップ');
    expect(map.hasAirport).toBe(true);
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

  it('2 つの島は海で完全に分断されていて、地上ユニットは相手の島へ渡れない', () => {
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(minCost(ENEMY_HQ, PLAYER_BASES, movementType)).toBe(Infinity);
      expect(minCost(PLAYER_HQ, ENEMY_BASES, movementType)).toBe(Infinity);
    }
    // 海上ユニットなら両軍の港はつながっている
    expect(minCost(ENEMY_PORTS[0], PLAYER_PORTS, 'sea')).toBeLessThan(Infinity);
  });

  it('自軍の島は西側だけが盤面の下端近くまで南へ伸びて岬になっている', () => {
    // row 9〜21 で自軍の陸が残っているのは西端(col 0〜7)だけ
    for (let row = 9; row <= 21; row += 1) {
      for (let col = 8; col < map.cols; col += 1) {
        const pos = gridPosition(col, row);
        const passable = map.getMoveCost(pos, 'infantry') !== null;
        if (!passable) continue;
        // 陸が残っているのは東の離島か、敵軍の島(row 13 以降の東側)だけ
        const onEnemyIsland = minCost(pos, ENEMY_BASES, 'infantry') < Infinity;
        expect(isIslet(pos) || onEnemyIsland).toBe(true);
      }
    }
    // 岬は自軍の島と地続き(歩兵で岬の先端まで歩いて行ける)
    expect(minCostToAny(CAPE_TIP, PLAYER_BASES, 'infantry')).toBeLessThan(Infinity);
    // 岬は自軍の島の本体(row 8)より 13 段も下まで伸びている
    expect(CAPE_TIP[0].row - 8).toBe(13);
  });

  it('岬の東岸から敵軍の島までは、海岸を挟んで右へ 6 マスの近さしかない', () => {
    // 岬の東岸(col 5)と先端(row 21)は一面の海岸
    for (const pos of [...CAPE_EAST_COAST, ...CAPE_TIP]) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    // 岬の東岸(col 5)と敵軍の島の西岸(col 11)のあいだは海 5 マス = 岸から岸まで 6
    expect(minCostToAny(ENEMY_BEACHES, CAPE_EAST_COAST, 'sea')).toBe(6);
    expect(minCostToAny(ENEMY_BEACHES, CAPE_TIP, 'sea')).toBe(6);
    // 敵軍の島は岬の「右(東)」にある
    for (const beach of ENEMY_BEACHES) {
      expect(beach.col).toBeGreaterThan(5);
    }
    // 自軍の港から敵軍の海岸まで直接向かうと 13 かかる(岬を足場にすると半分以下になる)
    expect(minCostToAny(ENEMY_BEACHES, PLAYER_PORTS, 'sea')).toBe(13);
  });

  it('敵軍の島は右側が北へ伸びていて、その腕の先端は盤面の上下のまんなかまで届く', () => {
    // 腕の先端(row 13)に残る陸は東の端(col 24〜27)だけ
    for (let col = 0; col < map.cols; col += 1) {
      const pos = gridPosition(col, 13);
      if (map.getMoveCost(pos, 'infantry') === null) continue;
      // 岬(col 0〜5)か、腕の先端(col 24〜27)のどちらか
      expect(col <= 5 || col >= 24).toBe(true);
    }
    // 腕の先端は敵軍の陣地と地続き
    expect(minCost(gridPosition(25, 13), ENEMY_BASES, 'infantry')).toBeLessThan(Infinity);
    // 腕の北西岸は海岸が続いていて、自軍の艦隊が横付けできる
    for (const pos of ENEMY_ARM_BEACHES) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    expect(minCostToAny(ENEMY_ARM_BEACHES, PLAYER_PORTS, 'sea')).toBe(12);
  });
});

describe('岬と研究島マップの拠点', () => {
  it('自軍は本拠地 1・工場 3・空港 1・港 2・都市 3 の 10 拠点(収入 10000)で始まる', () => {
    expect(keys(basesOf('player'))).toEqual(keys(PLAYER_BASES));
    expect(map.getTile(PLAYER_HQ)?.terrainType).toBe('headquarters');
    expect(map.getTile(PLAYER_AIRPORT)?.terrainType).toBe('airport');
    for (const factory of PLAYER_FACTORIES) {
      expect(map.getTile(factory)?.terrainType).toBe('factory');
    }
    for (const port of PLAYER_PORTS) {
      expect(map.getTile(port)?.terrainType).toBe('port');
    }
    for (const city of PLAYER_CITIES) {
      expect(map.getTile(city)?.terrainType).toBe('city');
    }
    expect(new EconomyManager().getIncome('player', map)).toBe(10000);
  });

  it('敵軍は本拠地 1・工場 3・空港 1・港 2・都市 8 の 15 拠点(収入 15000)で始まる', () => {
    expect(keys(basesOf('enemy'))).toEqual(keys(ENEMY_BASES));
    expect(map.getTile(ENEMY_HQ)?.terrainType).toBe('headquarters');
    expect(map.getTile(ENEMY_AIRPORT)?.terrainType).toBe('airport');
    for (const factory of ENEMY_FACTORIES) {
      expect(map.getTile(factory)?.terrainType).toBe('factory');
    }
    for (const port of ENEMY_PORTS) {
      expect(map.getTile(port)?.terrainType).toBe('port');
    }
    for (const city of ENEMY_CITIES) {
      expect(map.getTile(city)?.terrainType).toBe('city');
    }
    expect(new EconomyManager().getIncome('enemy', map)).toBe(15000);
  });

  it('中立拠点は 19 個(中立都市 16・中立研究所 3)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(19);
    const byTerrain = neutral.reduce<Record<string, number>>((counts, pos) => {
      const terrain = map.getTile(pos)?.terrainType ?? '';
      counts[terrain] = (counts[terrain] ?? 0) + 1;
      return counts;
    }, {});
    expect(byTerrain).toEqual({ city: 16, laboratory: 3 });
  });

  it('初期ユニットは置かず、初期資金 0 から収入だけで立ち上げる', () => {
    expect(CAPE_LABORATORY_MAP.units).toEqual([]);
    expect(CAPE_LABORATORY_MAP.initialFunds).toBe(0);
  });

  it('両軍の港はどれも外洋へ出られて、2 つの島の港どうしがつながっている', () => {
    for (const port of PLAYER_PORTS) {
      expect(minCost(port, [ENEMY_PORTS[0]], 'sea')).toBeLessThan(Infinity);
    }
    for (const port of ENEMY_PORTS) {
      expect(minCost(port, [PLAYER_PORTS[0]], 'sea')).toBeLessThan(Infinity);
    }
  });
});

describe('岬と研究島マップの中立拠点の分布', () => {
  it('北西の島の中立都市 10 個は、陣地を挟んで西 5 個・東 5 個に分かれている', () => {
    for (const pos of [...WEST_CITIES, ...EAST_CITIES]) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 西の 5 個は陣地(col 9〜13)より西、東の 5 個は東にある
    for (const pos of WEST_CITIES) expect(pos.col).toBeLessThan(9);
    for (const pos of EAST_CITIES) expect(pos.col).toBeGreaterThan(13);
    // 島の本体(row 0〜8)にある中立拠点はこの 10 個ですべて
    const onIslandBody = basesOf('neutral').filter(
      (pos) => pos.row <= 8 && !isIslet(pos),
    );
    expect(keys(onIslandBody)).toEqual(keys([...WEST_CITIES, ...EAST_CITIES]));
  });

  it('西の岬には中立の研究所 1 個と中立都市 3 個が縦に点在する', () => {
    expect(map.getTile(CAPE_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(CAPE_LABORATORY)?.owner).toBe('neutral');
    for (const pos of CAPE_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 岬の中立拠点は自軍だけが歩いて取りに行ける
    for (const pos of [CAPE_LABORATORY, ...CAPE_CITIES]) {
      expect(minCost(pos, PLAYER_BASES, 'infantry')).toBeLessThan(Infinity);
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBe(Infinity);
    }
    // 岬を降りるほど遠くなる(いちばん上の都市が 10、いちばん下の都市が 20)
    expect(minCost(CAPE_CITIES[0], PLAYER_BASES, 'infantry')).toBe(10);
    expect(minCost(CAPE_LABORATORY, PLAYER_BASES, 'infantry')).toBe(19);
    expect(minCost(CAPE_CITIES[2], PLAYER_BASES, 'infantry')).toBe(20);
  });

  it('東の離島は自軍の島の東端より右にあり、建つのは中立の研究所 2 個だけ', () => {
    for (const pos of ISLET_LABORATORIES) {
      expect(map.getTile(pos)?.terrainType).toBe('laboratory');
      expect(map.getTile(pos)?.owner).toBe('neutral');
      // 自軍の島の本体がいちばん東まで届く列(col 19)より、さらに右にある
      expect(pos.col).toBeGreaterThan(PLAYER_ISLAND_EAST_EDGE);
    }
    // 自軍の島の本体(row 0〜8)に col 19 より東の陸は無い
    for (let row = 0; row <= 8; row += 1) {
      for (let col = PLAYER_ISLAND_EAST_EDGE + 1; col < map.cols; col += 1) {
        const pos = gridPosition(col, row);
        if (map.getMoveCost(pos, 'infantry') === null) continue;
        expect(isIslet(pos)).toBe(true);
      }
    }
    // 離島にある拠点は研究所 2 個だけ(都市も港も空港も無い)
    const onIslet = basesOf('neutral').filter(isIslet);
    expect(keys(onIslet)).toEqual(keys(ISLET_LABORATORIES));
    // まわりはすべて海岸なので、輸送艦を横付けすれば歩兵を上げられる
    for (const pos of ISLET_BEACHES) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    // どちらの軍からも地上では届かない
    for (const pos of ISLET_LABORATORIES) {
      expect(minCost(pos, PLAYER_BASES, 'infantry')).toBe(Infinity);
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBe(Infinity);
    }
    // 海路は自軍の港から 7・敵軍の港から 22 と、自軍のほうがずっと近い
    expect(minCostToAny(ISLET_BEACHES, PLAYER_PORTS, 'sea')).toBe(7);
    expect(minCostToAny(ISLET_BEACHES, ENEMY_PORTS, 'sea')).toBe(22);
  });

  it('敵軍の島に残る中立都市 3 個は、北へ伸びた腕の上にまとまっている', () => {
    const onEnemyIsland = basesOf('neutral').filter(
      (pos) => minCost(pos, ENEMY_BASES, 'infantry') < Infinity,
    );
    expect(keys(onEnemyIsland)).toEqual(keys(ENEMY_ISLAND_NEUTRAL_CITIES));
    for (const pos of ENEMY_ISLAND_NEUTRAL_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      // 3 個とも腕の上(row 18 以北)にある
      expect(pos.row).toBeLessThanOrEqual(18);
      // 街道づたいでも歩兵で 11〜15(移動力 3 なら 4〜5 ターン)かかる
      const cost = minCost(pos, ENEMY_BASES, 'infantry');
      expect(cost).toBeGreaterThanOrEqual(11);
      expect(cost).toBeLessThanOrEqual(15);
    }
  });

  it('中立拠点 19 個のうち 16 個は自軍側にあり、取り切れば収入で敵軍を追い越せる', () => {
    const forPlayer = basesOf('neutral').filter(
      (pos) => minCost(pos, PLAYER_BASES, 'infantry') < Infinity,
    );
    // 歩いて取れるのは北西の島の 10 個と岬の 4 個
    expect(forPlayer).toHaveLength(14);
    // 離島の研究所 2 個を足した 16 個ぶんが自軍の伸びしろ(収入 10000 → 26000)
    expect(14 + ISLET_LABORATORIES.length).toBe(16);
    expect((PLAYER_BASES.length + 16) * 1000).toBe(26000);
    // 敵軍の伸びしろは島に残る 3 個ぶんだけ(収入 15000 → 18000)
    expect((ENEMY_BASES.length + ENEMY_ISLAND_NEUTRAL_CITIES.length) * 1000).toBe(18000);
  });
});

describe('岬と研究島マップの通行性と敵軍AI', () => {
  it('進入できるマスに、どちらの陣地からもたどり着けない袋小路は無い(離島を除く)', () => {
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      const fields = [...PLAYER_BASES, ...ENEMY_BASES].map((base) =>
        distancesFrom(map, base, movementType),
      );
      map.forEachTile((tile) => {
        if (map.getMoveCost(tile.position, movementType) === null) return;
        // 離島は輸送艦・輸送ヘリでしか行けないので対象外
        if (isIslet(tile.position)) return;
        expect(fields.some((field) => field.get(tile.position) !== undefined)).toBe(true);
      });
    }
    // 海上ユニットは盤面の海をすべて行き来できる
    const sea = distancesFrom(map, PLAYER_PORTS[0], 'sea');
    map.forEachTile((tile) => {
      if (map.getMoveCost(tile.position, 'sea') === null) return;
      expect(sea.get(tile.position)).not.toBeUndefined();
    });
  });

  it('敵軍AIは生産と中立拠点の占領を進められる', () => {
    const aiMap = MapManager.fromDefinition(CAPE_LABORATORY_MAP);
    const units = UnitManager.fromPlacements(CAPE_LABORATORY_MAP.units ?? [], aiMap);
    const economy = new EconomyManager({
      initialFunds: CAPE_LABORATORY_MAP.initialFunds,
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

    expect(units.getUnitsByArmy('enemy').length).toBeGreaterThan(0);
    // 腕の上に残る中立都市へ向かって、実際に占領を進められている
    let captured = 0;
    aiMap.forEachTile((tile) => {
      if (tile.owner === 'enemy' && getTerrainData(tile.terrainType).canCapture) {
        captured += 1;
      }
    });
    expect(captured).toBeGreaterThanOrEqual(ENEMY_BASES.length);
  });
});
