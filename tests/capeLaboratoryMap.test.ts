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

/** 自軍(先手)の陣地。北の島の真ん中に本拠地 1・工場 3・空港 1・港 2・都市 3 */
const PLAYER_HQ = gridPosition(14, 2);
const PLAYER_AIRPORT = gridPosition(14, 1);
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(13, 2),
  gridPosition(15, 2),
  gridPosition(14, 3),
];
const PLAYER_PORTS: readonly GridPosition[] = [gridPosition(11, 7), gridPosition(17, 6)];
const PLAYER_CITIES: readonly GridPosition[] = [
  gridPosition(12, 2),
  gridPosition(16, 2),
  gridPosition(14, 6),
];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  PLAYER_AIRPORT,
  ...PLAYER_FACTORIES,
  ...PLAYER_PORTS,
  ...PLAYER_CITIES,
];

/** 敵軍(後手)の陣地。南の島の左の海岸側に本拠地 1・工場 3・空港 1・港 2・都市 8 */
const ENEMY_HQ = gridPosition(4, 21);
const ENEMY_AIRPORT = gridPosition(6, 21);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(3, 20),
  gridPosition(5, 20),
  gridPosition(4, 22),
];
const ENEMY_PORTS: readonly GridPosition[] = [gridPosition(4, 18), gridPosition(2, 20)];
const ENEMY_CITIES: readonly GridPosition[] = [
  gridPosition(2, 19),
  gridPosition(6, 19),
  gridPosition(7, 20),
  gridPosition(8, 21),
  gridPosition(2, 22),
  gridPosition(3, 23),
  gridPosition(5, 23),
  gridPosition(7, 23),
];
const ENEMY_BASES: readonly GridPosition[] = [
  ENEMY_HQ,
  ENEMY_AIRPORT,
  ...ENEMY_FACTORIES,
  ...ENEMY_PORTS,
  ...ENEMY_CITIES,
];

/** 北の島の中立都市。陣地を挟んで西側 5 個・東側 5 個に分かれている */
const WEST_CITIES: readonly GridPosition[] = [
  gridPosition(6, 1),
  gridPosition(2, 2),
  gridPosition(8, 3),
  gridPosition(1, 4),
  gridPosition(5, 6),
];
const EAST_CITIES: readonly GridPosition[] = [
  gridPosition(21, 1),
  gridPosition(25, 2),
  gridPosition(19, 3),
  gridPosition(23, 4),
  gridPosition(20, 6),
];

/** 西の岬(島が左側だけ南へ伸びた部分)の中立拠点。研究所 1 個と中立都市 3 個 */
const CAPE_LABORATORY = gridPosition(2, 10);
const CAPE_CITIES: readonly GridPosition[] = [
  gridPosition(1, 9),
  gridPosition(5, 10),
  gridPosition(4, 11),
];
/** 岬の先端(row 12)。一面の海岸で、上陸作戦の起点になる */
const CAPE_TIP: readonly GridPosition[] = [1, 2, 3, 4, 5].map((col) =>
  gridPosition(col, 12),
);

/** 東の離島。建物は中立の研究所 2 個だけで、まわりはすべて海岸 */
const ISLET_LABORATORIES: readonly GridPosition[] = [
  gridPosition(24, 11),
  gridPosition(25, 11),
];
const ISLET_BEACHES: readonly GridPosition[] = [
  gridPosition(24, 10),
  gridPosition(25, 10),
  gridPosition(23, 11),
  gridPosition(26, 11),
  gridPosition(24, 12),
  gridPosition(25, 12),
];

/** 南の島に残っている中立都市 3 個(島の東端) */
const ENEMY_ISLAND_NEUTRAL_CITIES: readonly GridPosition[] = [
  gridPosition(21, 19),
  gridPosition(24, 21),
  gridPosition(22, 23),
];

/** 敵軍の本土の北岸にある海岸。自軍の上陸地点になる */
const ENEMY_NORTH_BEACHES: readonly GridPosition[] = [
  gridPosition(2, 18),
  gridPosition(6, 18),
  gridPosition(10, 18),
  gridPosition(15, 18),
  gridPosition(20, 18),
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

  it('南北の島は海で完全に分断されていて、地上ユニットは相手の島へ渡れない', () => {
    // row 13〜17 は端から端まで海
    for (let row = 13; row <= 17; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('sea');
      }
    }
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(minCost(ENEMY_HQ, PLAYER_BASES, movementType)).toBe(Infinity);
      expect(minCost(PLAYER_HQ, ENEMY_BASES, movementType)).toBe(Infinity);
    }
    // 海上ユニットなら両軍の港はつながっている
    expect(minCost(ENEMY_PORTS[0], PLAYER_PORTS, 'sea')).toBeLessThan(Infinity);
  });

  it('自軍の島は西側だけが南へ伸びて岬になっている', () => {
    // row 9〜12 で陸が残っているのは西端(col 0〜7)だけ
    for (let row = 9; row <= 12; row += 1) {
      for (let col = 8; col < map.cols; col += 1) {
        // 例外は東の離島(row 10〜12、col 23〜26)
        const isIslet = row >= 10 && row <= 12 && col >= 23 && col <= 26;
        const passable = map.getMoveCost(gridPosition(col, row), 'infantry') !== null;
        expect(passable).toBe(isIslet && passable);
      }
    }
    // 岬は自軍の島と地続き(歩兵で岬の先端まで歩いて行ける)
    expect(minCostToAny(CAPE_TIP, PLAYER_BASES, 'infantry')).toBeLessThan(Infinity);
  });

  it('岬の先端から敵軍の島までは、海岸を挟んで 6 マスの近さしかない', () => {
    for (const pos of CAPE_TIP) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    // 岬の先端(row 12)と敵軍の島の北岸(row 18)のあいだは海 5 マス = 岸から岸まで 6
    expect(minCostToAny(ENEMY_NORTH_BEACHES, CAPE_TIP, 'sea')).toBe(6);
    // 自軍の港から敵軍の北岸まで直接向かうと 12 かかる(岬を足場にすると半分になる)
    expect(minCostToAny(ENEMY_NORTH_BEACHES, PLAYER_PORTS, 'sea')).toBe(12);
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

  it('両軍の港はどれも外洋へ出られて、南北の港どうしがつながっている', () => {
    for (const port of PLAYER_PORTS) {
      expect(minCost(port, [ENEMY_PORTS[0]], 'sea')).toBeLessThan(Infinity);
    }
    for (const port of ENEMY_PORTS) {
      expect(minCost(port, [PLAYER_PORTS[0]], 'sea')).toBeLessThan(Infinity);
    }
  });
});

describe('岬と研究島マップの中立拠点の分布', () => {
  it('北の島の中立都市 10 個は、陣地を挟んで西 5 個・東 5 個に分かれている', () => {
    for (const pos of [...WEST_CITIES, ...EAST_CITIES]) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 西の 5 個は陣地(col 12〜16)より西、東の 5 個は東にある
    for (const pos of WEST_CITIES) expect(pos.col).toBeLessThan(12);
    for (const pos of EAST_CITIES) expect(pos.col).toBeGreaterThan(16);
    // 北の島(row 0〜9)にある中立拠点はこの 10 個ですべて
    const onPlayerIsland = basesOf('neutral').filter((pos) => pos.row <= 8);
    expect(keys(onPlayerIsland)).toEqual(keys([...WEST_CITIES, ...EAST_CITIES]));
  });

  it('西の岬には中立の研究所 1 個と中立都市 3 個がある', () => {
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
  });

  it('東の離島に建つのは中立の研究所 2 個だけで、地上からはたどり着けない', () => {
    for (const pos of ISLET_LABORATORIES) {
      expect(map.getTile(pos)?.terrainType).toBe('laboratory');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 離島にある拠点は研究所 2 個だけ(都市も港も空港も無い)
    const onIslet = basesOf('neutral').filter(
      (pos) => pos.col >= 23 && pos.col <= 26 && pos.row >= 10 && pos.row <= 12,
    );
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
    // 海路は自軍の港から 11・敵軍の港から 26 と、自軍のほうがずっと近い
    expect(minCostToAny(ISLET_BEACHES, PLAYER_PORTS, 'sea')).toBe(11);
    expect(minCostToAny(ISLET_BEACHES, ENEMY_PORTS, 'sea')).toBe(26);
  });

  it('敵軍の島に残る中立都市は東端の 3 個だけで、敵軍の陣地からやや離れている', () => {
    const onEnemyIsland = basesOf('neutral').filter((pos) => pos.row >= 18);
    expect(keys(onEnemyIsland)).toEqual(keys(ENEMY_ISLAND_NEUTRAL_CITIES));
    for (const pos of ENEMY_ISLAND_NEUTRAL_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      // 街道づたいでも歩兵で 15〜16(移動力 3 なら 5〜6 ターン)かかる
      const cost = minCost(pos, ENEMY_BASES, 'infantry');
      expect(cost).toBeGreaterThanOrEqual(15);
      expect(cost).toBeLessThanOrEqual(16);
    }
  });

  it('中立拠点 19 個のうち 16 個は自軍側にあり、取り切れば収入で敵軍を追い越せる', () => {
    const forPlayer = basesOf('neutral').filter(
      (pos) => minCost(pos, PLAYER_BASES, 'infantry') < Infinity,
    );
    // 歩いて取れるのは北の島の 10 個と岬の 4 個
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
    const isIslet = (pos: GridPosition): boolean =>
      pos.col >= 23 && pos.col <= 26 && pos.row >= 10 && pos.row <= 12;
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
    // 島の東端に残る中立都市へ向かって、実際に占領を進められている
    let captured = 0;
    aiMap.forEachTile((tile) => {
      if (tile.owner === 'enemy' && getTerrainData(tile.terrainType).canCapture) {
        captured += 1;
      }
    });
    expect(captured).toBeGreaterThanOrEqual(ENEMY_BASES.length);
  });
});
