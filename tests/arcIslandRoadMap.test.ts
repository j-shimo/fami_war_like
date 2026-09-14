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
import { ARC_ISLAND_ROAD_MAP } from '@/data/maps/arcIslandRoadMap';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

/** 先手の自軍(下の腕の左端)。本拠地 1 + 工場 3 + 港 2 + 空港 1 */
const PLAYER_HQ = gridPosition(5, 18);
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(4, 18),
  gridPosition(6, 18),
  gridPosition(5, 19),
];
const PLAYER_PORTS: readonly GridPosition[] = [gridPosition(3, 18), gridPosition(5, 16)];
const PLAYER_AIRPORT = gridPosition(5, 20);
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  ...PLAYER_FACTORIES,
  ...PLAYER_PORTS,
  PLAYER_AIRPORT,
];

/** 後手の敵軍(上の腕の左端)。拠点の並びは自軍と上下対称 */
const ENEMY_HQ = gridPosition(5, 5);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(4, 5),
  gridPosition(6, 5),
  gridPosition(5, 4),
];
const ENEMY_PORTS: readonly GridPosition[] = [gridPosition(3, 5), gridPosition(5, 7)];
const ENEMY_AIRPORT = gridPosition(5, 3);
const ENEMY_BASES: readonly GridPosition[] = [
  ENEMY_HQ,
  ...ENEMY_FACTORIES,
  ...ENEMY_PORTS,
  ENEMY_AIRPORT,
];

/** 弧に沿った街道。上の腕(row 5)・下の腕(row 18)と、右の背を縦に走る col 23 */
const ROAD_TOP: readonly GridPosition[] = Array.from({ length: 17 }, (_, i) =>
  gridPosition(7 + i, 5),
);
const ROAD_BOTTOM: readonly GridPosition[] = Array.from({ length: 17 }, (_, i) =>
  gridPosition(7 + i, 18),
);
/** 敵軍側の縦棒(街道の終点は (23,9)) */
const ROAD_SPINE_NORTH: readonly GridPosition[] = Array.from({ length: 4 }, (_, i) =>
  gridPosition(23, 6 + i),
);
/** 自軍側の縦棒(街道の終点は (23,14)) */
const ROAD_SPINE_SOUTH: readonly GridPosition[] = Array.from({ length: 4 }, (_, i) =>
  gridPosition(23, 14 + i),
);
const ROAD_END_PLAYER = gridPosition(23, 14);
const ROAD_END_ENEMY = gridPosition(23, 9);

/** 右の背の真ん中を断ち切る 4 列の森・山地帯(row 10〜13・col 20〜26) */
const BELT: readonly GridPosition[] = Array.from({ length: 4 }, (_, row) =>
  Array.from({ length: 7 }, (_, col) => gridPosition(20 + col, 10 + row)),
).flat();

/** 自軍の街道の先、森・山地帯へ入る直前に固まっている中立拠点 7 個 */
const CLUSTER_LABORATORIES: readonly GridPosition[] = [
  gridPosition(21, 15),
  gridPosition(21, 17),
];
const CLUSTER_CITIES: readonly GridPosition[] = [
  gridPosition(21, 14),
  gridPosition(25, 15),
  gridPosition(24, 17),
];
const CLUSTER_AIRPORT = gridPosition(21, 16);
const CLUSTER_PORT = gridPosition(26, 15);
const CLUSTER: readonly GridPosition[] = [
  ...CLUSTER_LABORATORIES,
  ...CLUSTER_CITIES,
  CLUSTER_AIRPORT,
  CLUSTER_PORT,
];

/** 自軍の陣地の少し左上、湾の口にある中立港 */
const HOME_NEUTRAL_PORT = gridPosition(3, 16);

const map = MapManager.fromDefinition(ARC_ISLAND_ROAD_MAP);

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

/** 位置を比較しやすい文字列にする */
function key(pos: GridPosition): string {
  return `${pos.col},${pos.row}`;
}

describe('弧島街道マップの盤面', () => {
  it('30x24 の盤面で、陸地は「C」を左右反転した弧になっている', () => {
    expect(map.cols).toBe(30);
    expect(map.rows).toBe(24);
    expect(map.name).toBe('弧島街道マップ');
    // 上の腕(row 4〜7)・下の腕(row 16〜19)は col 3〜26 がすべて陸
    for (const row of [4, 5, 6, 7, 16, 17, 18, 19]) {
      for (let col = 3; col <= 26; col += 1) {
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).not.toBeNull();
      }
    }
    // 右の背(row 8〜15)は col 20〜26 が陸
    for (let row = 8; row <= 15; row += 1) {
      for (let col = 20; col <= 26; col += 1) {
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).not.toBeNull();
      }
    }
    // 「C」の開き口にあたる左の真ん中(row 8〜15・col 0〜18)はすべて水
    for (let row = 8; row <= 15; row += 1) {
      for (let col = 0; col <= 18; col += 1) {
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('sea');
      }
    }
  });

  it('開き口から入り込んだ湾は外海とひと続きで、両軍の港はどちらも水に面している', () => {
    // 湾の真ん中から外海の四隅まで、海上ユニットが 1 つながりで進める
    const water = distancesFrom(map, gridPosition(10, 12), 'sea');
    for (const corner of [
      gridPosition(0, 0),
      gridPosition(29, 0),
      gridPosition(0, 23),
      gridPosition(29, 23),
    ]) {
      expect(water.get(corner)).toBeLessThan(Infinity);
    }
    // 開始時の港・中立港はどれも海に隣接している(船を出せる)
    for (const port of [
      ...PLAYER_PORTS,
      ...ENEMY_PORTS,
      HOME_NEUTRAL_PORT,
      CLUSTER_PORT,
    ]) {
      expect(map.getTile(port)?.terrainType).toBe('port');
      const neighbors = [
        gridPosition(port.col - 1, port.row),
        gridPosition(port.col + 1, port.row),
        gridPosition(port.col, port.row - 1),
        gridPosition(port.col, port.row + 1),
      ];
      expect(neighbors.some((pos) => map.getTile(pos)?.terrainType === 'sea')).toBe(true);
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
});

describe('弧島街道マップの街道と森・山地帯', () => {
  it('街道は両陣地から弧に沿って伸び、右の背の真ん中だけで途切れている', () => {
    for (const pos of [
      ...ROAD_TOP,
      ...ROAD_BOTTOM,
      ...ROAD_SPINE_NORTH,
      ...ROAD_SPINE_SOUTH,
    ]) {
      expect(map.getTile(pos)?.terrainType).toBe('road');
    }
    // 街道は両軍の工場のとなりから始まる
    expect(map.getTile(gridPosition(6, 5))?.terrainType).toBe('factory');
    expect(map.getTile(gridPosition(6, 18))?.terrainType).toBe('factory');
    // 森・山地帯(row 10〜13)には街道が 1 マスも無い
    for (const pos of BELT) {
      expect(map.getTile(pos)?.terrainType).not.toBe('road');
    }
    // 街道の終点までは両軍とも歩兵で 22 マスとまったく同じ
    expect(map.getTile(ROAD_END_PLAYER)?.terrainType).toBe('road');
    expect(map.getTile(ROAD_END_ENEMY)?.terrainType).toBe('road');
    expect(minCost(ROAD_END_PLAYER, PLAYER_BASES, 'infantry')).toBe(
      minCost(ROAD_END_ENEMY, ENEMY_BASES, 'infantry'),
    );
    expect(minCost(ROAD_END_PLAYER, PLAYER_BASES, 'infantry')).toBe(20);
  });

  it('森・山地帯は森と山だけでできていて、拠点も 1 つも無い', () => {
    for (const pos of BELT) {
      expect(['forest', 'mountain']).toContain(map.getTile(pos)!.terrainType);
    }
  });

  it('森・山地帯を越えられるのは歩兵と装軌車両だけで、装輪車両は 1 マスも入れない', () => {
    // col 23 が森でつながっているので、街道の終点どうしを縦断できる
    const fromSouth = distancesFrom(map, ROAD_END_PLAYER, 'infantry');
    expect(fromSouth.get(ROAD_END_ENEMY)).toBe(5);
    expect(distancesFrom(map, ROAD_END_PLAYER, 'vehicle').get(ROAD_END_ENEMY)).toBe(9);
    // 装輪車両は森にも山にも入れないので、地帯のどのマスへも進入できない
    for (const pos of BELT) {
      expect(map.getMoveCost(pos, 'wheeled')).toBeNull();
    }
    expect(
      distancesFrom(map, ROAD_END_PLAYER, 'wheeled').get(ROAD_END_ENEMY),
    ).toBeUndefined();
  });

  it('陸路は弧をぐるりと回る長旅で、装輪車両はそもそも相手の陣地へ行けない', () => {
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'infantry')).toBe(43);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'infantry')).toBe(43);
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'vehicle')).toBe(52);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'vehicle')).toBe(52);
    // 弧は左で切れていて迂回路が無いため、装輪車両の陸路は両軍とも存在しない
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'wheeled')).toBe(Infinity);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'wheeled')).toBe(Infinity);
  });

  it('湾を渡る海路と空路は、陸路よりはるかに短い', () => {
    // 湾ごしの直線距離は 13 マスしかない
    expect(
      Math.abs(PLAYER_HQ.col - ENEMY_HQ.col) + Math.abs(PLAYER_HQ.row - ENEMY_HQ.row),
    ).toBe(13);
    // 湾を突っ切る海路は港から港まで 9(輸送艦は移動力 5 なので 2 ターン)
    const seaFromPlayerPort = distancesFrom(map, gridPosition(5, 16), 'sea');
    expect(seaFromPlayerPort.get(gridPosition(5, 7))).toBe(9);
    expect(getUnitData('transportShip').movement).toBe(5);
    // 空路は自軍の空港から敵軍の本拠地まで 15(戦闘機は移動力 10 なので 2 ターン)
    expect(distancesFrom(map, PLAYER_AIRPORT, 'air').get(ENEMY_HQ)).toBe(15);
    expect(getUnitData('fighter').movement).toBe(10);
  });
});

describe('弧島街道マップの拠点', () => {
  it('両軍とも本拠地 1 + 工場 3 + 港 2 + 空港 1 の 7 拠点(収入 7000)で対等に始まる', () => {
    expect(new Set(basesOf('player').map(key))).toEqual(new Set(PLAYER_BASES.map(key)));
    expect(new Set(basesOf('enemy').map(key))).toEqual(new Set(ENEMY_BASES.map(key)));
    const expected = { headquarters: 1, factory: 3, port: 2, airport: 1 };
    expect(countByTerrain(PLAYER_BASES)).toEqual(expected);
    expect(countByTerrain(ENEMY_BASES)).toEqual(expected);

    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(7000);
    expect(economy.getIncome('enemy', map)).toBe(7000);
  });

  it('工場 3 個は本拠地に隣接し、港 2 個と空港 1 個は本拠地から 1 マス離れている', () => {
    for (const [hq, factories, ports, airport] of [
      [PLAYER_HQ, PLAYER_FACTORIES, PLAYER_PORTS, PLAYER_AIRPORT],
      [ENEMY_HQ, ENEMY_FACTORIES, ENEMY_PORTS, ENEMY_AIRPORT],
    ] as const) {
      const distance = (pos: GridPosition) =>
        Math.abs(pos.col - hq.col) + Math.abs(pos.row - hq.row);
      for (const factory of factories) {
        expect(distance(factory)).toBe(1);
      }
      for (const port of [...ports, airport]) {
        expect(distance(port)).toBe(2);
      }
    }
  });

  it('中立拠点は 38 個(都市 33・研究所 2・港 2・空港 1)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(38);
    expect(countByTerrain(neutral)).toEqual({
      city: 33,
      laboratory: 2,
      port: 2,
      airport: 1,
    });
  });

  it('初期ユニットは置かず、初期資金 0 から収入だけで立ち上がる', () => {
    expect(ARC_ISLAND_ROAD_MAP.units).toEqual([]);
    expect(ARC_ISLAND_ROAD_MAP.initialFunds).toBe(0);
  });
});

describe('弧島街道マップの街道の先の中立拠点', () => {
  it('自軍の街道の終点のまわりに、研究所 2・都市 3・空港 1・港 1 が固まっている', () => {
    expect(countByTerrain(CLUSTER)).toEqual({
      laboratory: 2,
      city: 3,
      airport: 1,
      port: 1,
    });
    for (const pos of CLUSTER) {
      expect(map.getTile(pos)?.owner).toBe('neutral');
      // どれも街道の終点 (23,14) から 5 マス以内、森・山地帯(row 10〜13)の南
      expect(
        Math.abs(pos.col - ROAD_END_PLAYER.col) + Math.abs(pos.row - ROAD_END_PLAYER.row),
      ).toBeLessThanOrEqual(5);
      expect(pos.row).toBeGreaterThan(13);
    }
    // 研究所・空港・研究所が col 21 に縦 3 マスで並ぶ
    expect(map.getTile(gridPosition(21, 15))?.terrainType).toBe('laboratory');
    expect(map.getTile(gridPosition(21, 16))?.terrainType).toBe('airport');
    expect(map.getTile(gridPosition(21, 17))?.terrainType).toBe('laboratory');
  });

  it('固まりはどれも自軍のほうが近いが、陣地からは歩兵 6 ターン以上かかる', () => {
    for (const pos of CLUSTER) {
      const byPlayer = minCost(pos, PLAYER_BASES, 'infantry');
      const byEnemy = minCost(pos, ENEMY_BASES, 'infantry');
      expect(byPlayer).toBeLessThan(byEnemy);
      // 歩兵の移動力は 3。16 マス以上あるので、着くまでに 6 ターン以上かかる
      expect(byPlayer).toBeGreaterThanOrEqual(16);
    }
    expect(minCost(CLUSTER_LABORATORIES[0], PLAYER_BASES, 'infantry')).toBe(17);
    expect(minCost(CLUSTER_LABORATORIES[1], PLAYER_BASES, 'infantry')).toBe(16);
    expect(minCost(CLUSTER_LABORATORIES[0], ENEMY_BASES, 'infantry')).toBe(25);
    expect(minCost(CLUSTER_LABORATORIES[1], ENEMY_BASES, 'infantry')).toBe(27);
  });

  it('陣地の少し左上の湾口には中立港があり、自軍が歩兵 1 ターンで届く', () => {
    expect(map.getTile(HOME_NEUTRAL_PORT)?.terrainType).toBe('port');
    expect(map.getTile(HOME_NEUTRAL_PORT)?.owner).toBe('neutral');
    // 自軍の本拠地から見て左上
    expect(HOME_NEUTRAL_PORT.col).toBeLessThan(PLAYER_HQ.col);
    expect(HOME_NEUTRAL_PORT.row).toBeLessThan(PLAYER_HQ.row);
    // 自軍は移動コスト 2(歩兵 1 ターン)、敵軍は陸路 43
    expect(minCost(HOME_NEUTRAL_PORT, PLAYER_BASES, 'infantry')).toBe(2);
    expect(minCost(HOME_NEUTRAL_PORT, ENEMY_BASES, 'infantry')).toBe(43);
  });
});

describe('弧島街道マップの先手番ハンデ', () => {
  it('先に届く中立拠点は自軍 17 個・敵軍 21 個で、後手のほうが 4 個多い', () => {
    let player = 0;
    let enemy = 0;
    for (const pos of basesOf('neutral')) {
      const byPlayer = minCost(pos, PLAYER_BASES, 'infantry');
      const byEnemy = minCost(pos, ENEMY_BASES, 'infantry');
      if (byPlayer < byEnemy) player += 1;
      if (byEnemy < byPlayer) enemy += 1;
    }
    expect(player).toBe(17);
    expect(enemy).toBe(21);
  });

  it('研究所 2 個はどちらも自軍が先に届く(先手は新型戦車 2 両ぶんを受け取る)', () => {
    for (const pos of CLUSTER_LABORATORIES) {
      expect(map.getTile(pos)?.terrainType).toBe('laboratory');
      expect(minCost(pos, PLAYER_BASES, 'infantry')).toBeLessThan(
        minCost(pos, ENEMY_BASES, 'infantry'),
      );
    }
  });

  it('陣地のいちばん近くの中立拠点までは、両軍とも歩兵 1 ターン(移動コスト 1)', () => {
    const neutral = basesOf('neutral');
    expect(
      Math.min(...neutral.map((pos) => minCost(pos, PLAYER_BASES, 'infantry'))),
    ).toBe(1);
    expect(Math.min(...neutral.map((pos) => minCost(pos, ENEMY_BASES, 'infantry')))).toBe(
      1,
    );
  });
});

describe('弧島街道マップの通行性と敵軍AI', () => {
  it('歩兵は、進入できるマスすべてへ両軍の陣地からたどり着ける', () => {
    for (const bases of [PLAYER_BASES, ENEMY_BASES]) {
      const fields = bases.map((base) => distancesFrom(map, base, 'infantry'));
      map.forEachTile((tile) => {
        if (map.getMoveCost(tile.position, 'infantry') === null) return;
        expect(fields.some((field) => field.get(tile.position) !== undefined)).toBe(true);
      });
    }
  });

  it('中立拠点は、どれも両軍の歩兵が歩いて取りにいける', () => {
    for (const pos of basesOf('neutral')) {
      expect(minCost(pos, PLAYER_BASES, 'infantry')).toBeLessThan(Infinity);
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBeLessThan(Infinity);
    }
  });

  it('敵軍AIは収入 7000 から生産を回し、目の前の中立拠点を占領できる', () => {
    const aiMap = MapManager.fromDefinition(ARC_ISLAND_ROAD_MAP);
    const units = UnitManager.fromPlacements(ARC_ISLAND_ROAD_MAP.units ?? [], aiMap);
    const economy = new EconomyManager({
      initialFunds: ARC_ISLAND_ROAD_MAP.initialFunds,
    });
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
