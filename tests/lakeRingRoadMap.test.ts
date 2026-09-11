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
import { LAKE_RING_ROAD_MAP } from '@/data/maps/lakeRingRoadMap';
import { getTerrainData } from '@/data/terrainData';

/** 先手の自軍(島の上の真ん中)。本拠地 1 + 工場 3 + 開始時の都市 3 */
const PLAYER_HQ = gridPosition(14, 4);
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(13, 4),
  gridPosition(15, 4),
  gridPosition(14, 3),
];
const PLAYER_CITIES: readonly GridPosition[] = [
  gridPosition(11, 3),
  gridPosition(17, 3),
  gridPosition(14, 7),
];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  ...PLAYER_FACTORIES,
  ...PLAYER_CITIES,
];

/** 後手の敵軍(「G」の横棒の先っちょ)。本拠地 1 + 工場 3 だけ */
const ENEMY_HQ = gridPosition(9, 12);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(10, 12),
  gridPosition(9, 11),
  gridPosition(9, 13),
];
const ENEMY_BASES: readonly GridPosition[] = [ENEMY_HQ, ...ENEMY_FACTORIES];

/** 「G」の字の街道。上・左・下・右の 4 本と、内側へ突き出す横棒 */
const ROAD_TOP: readonly GridPosition[] = Array.from({ length: 18 }, (_, i) =>
  gridPosition(4 + i, 5),
);
const ROAD_LEFT: readonly GridPosition[] = Array.from({ length: 15 }, (_, i) =>
  gridPosition(4, 5 + i),
);
const ROAD_BOTTOM: readonly GridPosition[] = Array.from({ length: 20 }, (_, i) =>
  gridPosition(4 + i, 19),
);
const ROAD_RIGHT: readonly GridPosition[] = Array.from({ length: 8 }, (_, i) =>
  gridPosition(23, 12 + i),
);
const ROAD_BAR: readonly GridPosition[] = Array.from({ length: 14 }, (_, i) =>
  gridPosition(10 + i, 12),
);

/** 「G」の切れ目にあたる右上の峠(山と森。街道は 1 マスも無い) */
const PASS: readonly GridPosition[] = [
  gridPosition(22, 5),
  gridPosition(22, 6),
  gridPosition(21, 7),
  gridPosition(22, 7),
  gridPosition(21, 8),
  gridPosition(22, 8),
  gridPosition(21, 9),
  gridPosition(22, 9),
  gridPosition(21, 10),
  gridPosition(22, 10),
  gridPosition(21, 11),
  gridPosition(22, 11),
];

/** 峠の真ん中の中立研究所と、橋の少し左上の中立研究所 */
const PASS_LABORATORY = gridPosition(22, 9);
const RIVER_LABORATORY = gridPosition(3, 17);

/** 湖から西の海へ抜ける幅 1 マスの川 */
const RIVER: readonly GridPosition[] = [
  gridPosition(6, 16),
  gridPosition(6, 17),
  gridPosition(5, 17),
  gridPosition(5, 18),
  gridPosition(3, 18),
  gridPosition(2, 18),
];

/** 川が街道を横切るただ 1 マスの橋 */
const BRIDGE = gridPosition(4, 18);

/** 「G」の右下に固まっている中立都市 10 個 */
const SE_CITIES: readonly GridPosition[] = [
  gridPosition(25, 13),
  gridPosition(21, 14),
  gridPosition(24, 14),
  gridPosition(22, 16),
  gridPosition(25, 16),
  gridPosition(21, 18),
  gridPosition(24, 18),
  gridPosition(25, 19),
  gridPosition(22, 20),
  gridPosition(24, 20),
];

/** 敵軍の陣地の目の前、「G」の横棒の上に並ぶ中立都市 5 個 */
const BAR_CITIES: readonly GridPosition[] = [
  gridPosition(11, 11),
  gridPosition(11, 13),
  gridPosition(14, 13),
  gridPosition(17, 11),
  gridPosition(19, 13),
];

const map = MapManager.fromDefinition(LAKE_RING_ROAD_MAP);

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

describe('環湖街道マップの盤面', () => {
  it('28x24 の盤面で、水は外周の海・中央の湖・右上の入り江だけ', () => {
    expect(map.cols).toBe(28);
    expect(map.rows).toBe(24);
    expect(map.name).toBe('環湖街道マップ');
    // 中央の湖(col 7〜20・row 8〜16)は、地上ユニットがまったく入れない
    for (let row = 9; row <= 15; row += 1) {
      for (let col = 9; col <= 19; col += 1) {
        if (col >= 9 && col <= 20 && row >= 11 && row <= 13) continue; // 「G」の横棒
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('sea');
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).toBeNull();
      }
    }
  });

  it('陸地は湖を囲む輪で、右中ほどから内側へ「G」の横棒が突き出している', () => {
    // 横棒(col 9〜20・row 11〜13)はすべて陸
    for (let row = 11; row <= 13; row += 1) {
      for (let col = 9; col <= 20; col += 1) {
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).not.toBeNull();
      }
    }
    // 横棒の先っちょ(敵軍の本拠地)の西・北西・南西は湖
    for (const row of [11, 12, 13]) {
      expect(map.getTile(gridPosition(8, row))?.terrainType).toBe('sea');
    }
    // 湖は横棒の先を回り込んで上下につながっている(海上ユニットは出せないが 1 続きの水面)
    const lake = distancesFrom(map, gridPosition(10, 9), 'sea');
    expect(lake.get(gridPosition(10, 15))).toBeLessThan(Infinity);
  });

  it('街道も「G」の字で、右上だけが途切れている', () => {
    for (const pos of [...ROAD_TOP, ...ROAD_LEFT, ...ROAD_BOTTOM, ...ROAD_RIGHT]) {
      expect(map.getTile(pos)?.terrainType).toBe('road');
    }
    // 横棒の街道は敵軍の工場 (10,12) までつながっている
    for (const pos of ROAD_BAR.slice(1)) {
      expect(map.getTile(pos)?.terrainType).toBe('road');
    }
    expect(map.getTile(gridPosition(10, 12))?.terrainType).toBe('factory');
    // 「G」の切れ目: 上の街道の東端 (21,5) と右の街道の北端 (23,12) のあいだに街道は無い
    expect(map.getTile(gridPosition(21, 5))?.terrainType).toBe('road');
    expect(map.getTile(gridPosition(22, 5))?.terrainType).not.toBe('road');
    for (let row = 6; row <= 11; row += 1) {
      for (let col = 21; col <= 25; col += 1) {
        expect(map.getTile(gridPosition(col, row))?.terrainType).not.toBe('road');
      }
    }
    // 街道は 1 本につながっている(装輪車両が上の街道の端から横棒の端まで通れる)
    const road = distancesFrom(map, gridPosition(4, 5), 'wheeled');
    expect(road.get(gridPosition(23, 12))).toBeLessThan(Infinity);
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

describe('環湖街道マップの右上の峠', () => {
  it('峠は山と森だけでできていて、街道も都市も 1 つも無い', () => {
    for (const pos of PASS) {
      const terrain = map.getTile(pos)!.terrainType;
      expect(['forest', 'mountain', 'laboratory']).toContain(terrain);
    }
    // 峠のまわり(col 20〜25・row 6〜11)に都市は 1 個も無い
    for (let row = 6; row <= 11; row += 1) {
      for (let col = 20; col <= 25; col += 1) {
        expect(map.getTile(gridPosition(col, row))?.terrainType).not.toBe('city');
      }
    }
    // 真ん中の中立研究所だけが拠点
    expect(map.getTile(PASS_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(PASS_LABORATORY)?.owner).toBe('neutral');
  });

  it('峠は両軍を最短で結ぶ道だが、装輪車両はまったく通れない', () => {
    // 歩兵・装軌車両は峠を抜けて相手の本拠地へ向かえる
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'infantry')).toBe(25);
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'vehicle')).toBe(31);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'infantry')).toBe(27);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'vehicle')).toBe(33);
    // 装輪車両は森にも山にも入れないので、「G」の街道を大きく回るしかない
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'wheeled')).toBe(64);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'wheeled')).toBe(64);
    // 峠のマスは研究所を除いてすべて森か山で、装輪車両は 1 マスも入れない
    for (const pos of PASS) {
      if (pos.col === PASS_LABORATORY.col && pos.row === PASS_LABORATORY.row) continue;
      expect(map.getMoveCost(pos, 'wheeled')).toBeNull();
    }
    // 研究所そのものは移動コスト 1 だが、まわりが森と山なので装輪車両はたどり着けない
    expect(minCost(PASS_LABORATORY, [...PLAYER_BASES, ...ENEMY_BASES], 'wheeled')).toBe(
      Infinity,
    );
    // 峠を山で塞ぐと、装軌車両は 31 から「G」の街道を回る 62 まで遠くなる
    const blocked = MapManager.fromDefinition({
      ...LAKE_RING_ROAD_MAP,
      terrain: LAKE_RING_ROAD_MAP.terrain.map((line, row) =>
        row >= 6 && row <= 11 ? `${line.slice(0, 21)}mm${line.slice(23)}` : line,
      ),
    });
    expect(distancesFrom(blocked, PLAYER_HQ, 'vehicle').get(ENEMY_HQ)).toBe(62);
  });

  it('峠の研究所は自軍のほうが近く、先手の新型戦車 1 両ぶんになる', () => {
    expect(minCost(PASS_LABORATORY, PLAYER_BASES, 'infantry')).toBe(10);
    expect(minCost(PASS_LABORATORY, ENEMY_BASES, 'infantry')).toBe(15);
  });
});

describe('環湖街道マップの湖と川と橋', () => {
  it('湖の水は左下の隅から幅 1 マスの川になって西の海へ抜ける', () => {
    for (const pos of RIVER) {
      expect(map.getTile(pos)?.terrainType).toBe('river');
    }
    // 湖から川づたいに橋の手前 (5,18) までが 1 本の水面としてつながっている
    // (橋は道路なので、水面としてはそこで途切れる。このマップに海上ユニットは出てこない)
    const water = distancesFrom(map, gridPosition(10, 15), 'sea');
    expect(water.get(gridPosition(5, 18))).toBeLessThan(Infinity);
    expect(water.get(gridPosition(2, 18))).toBeUndefined();
    // 装輪車両は川を渡れない
    for (const pos of RIVER) {
      expect(map.getMoveCost(pos, 'wheeled')).toBeNull();
    }
  });

  it('街道で川を渡れるのは橋 (4,18) の 1 マスだけ', () => {
    expect(map.getTile(BRIDGE)?.terrainType).toBe('road');
    // 橋の左右が川で、街道は橋の上下へつながっている
    expect(map.getTile(gridPosition(3, 18))?.terrainType).toBe('river');
    expect(map.getTile(gridPosition(5, 18))?.terrainType).toBe('river');
    expect(map.getTile(gridPosition(4, 17))?.terrainType).toBe('road');
    expect(map.getTile(gridPosition(4, 19))?.terrainType).toBe('road');
    expect(
      distancesFrom(map, gridPosition(4, 17), 'wheeled').get(gridPosition(4, 19)),
    ).toBe(2);
    // 峠を通れない装輪車両にとって、橋は盤面の南北をつなぐ唯一の関門になる。
    // 橋を川に変えると、装輪車両は自軍の陣地から敵軍の陣地へまったく行けなくなる
    const broken = MapManager.fromDefinition({
      ...LAKE_RING_ROAD_MAP,
      terrain: LAKE_RING_ROAD_MAP.terrain.map((line, row) =>
        row === 18 ? `${line.slice(0, 4)}w${line.slice(5)}` : line,
      ),
    });
    expect(distancesFrom(broken, PLAYER_HQ, 'wheeled').get(ENEMY_HQ)).toBeUndefined();
    expect(distancesFrom(broken, PLAYER_HQ, 'infantry').get(ENEMY_HQ)).toBeLessThan(
      Infinity,
    );
  });

  it('橋の少し左上の北岸に、もう 1 個の中立研究所がある', () => {
    expect(map.getTile(RIVER_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(RIVER_LABORATORY)?.owner).toBe('neutral');
    expect(RIVER_LABORATORY.col).toBeLessThan(BRIDGE.col);
    expect(RIVER_LABORATORY.row).toBeLessThan(BRIDGE.row);
    // 街道のすぐ隣なので装輪車両でも取りにいけるが、自軍のほうがはるかに近い
    expect(minCost(RIVER_LABORATORY, PLAYER_BASES, 'infantry')).toBe(21);
    expect(minCost(RIVER_LABORATORY, ENEMY_BASES, 'infantry')).toBe(36);
    expect(minCost(RIVER_LABORATORY, PLAYER_BASES, 'wheeled')).toBeLessThan(Infinity);
  });
});

describe('環湖街道マップの拠点', () => {
  it('自軍は本拠地 1 + 工場 3 + 都市 3(収入 7000)、敵軍は本拠地 1 + 工場 3(収入 4000)', () => {
    expect(new Set(basesOf('player').map((pos) => `${pos.col},${pos.row}`))).toEqual(
      new Set(PLAYER_BASES.map((pos) => `${pos.col},${pos.row}`)),
    );
    expect(new Set(basesOf('enemy').map((pos) => `${pos.col},${pos.row}`))).toEqual(
      new Set(ENEMY_BASES.map((pos) => `${pos.col},${pos.row}`)),
    );
    expect(countByTerrain(PLAYER_BASES)).toEqual({
      headquarters: 1,
      factory: 3,
      city: 3,
    });
    expect(countByTerrain(ENEMY_BASES)).toEqual({ headquarters: 1, factory: 3 });

    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(7000);
    expect(economy.getIncome('enemy', map)).toBe(4000);
  });

  it('両軍とも本拠地に工場 3 個が隣接している', () => {
    for (const [hq, factories] of [
      [PLAYER_HQ, PLAYER_FACTORIES],
      [ENEMY_HQ, ENEMY_FACTORIES],
    ] as const) {
      for (const factory of factories) {
        const distance = Math.abs(factory.col - hq.col) + Math.abs(factory.row - hq.row);
        expect(distance).toBe(1);
      }
    }
  });

  it('自軍の開始時の都市 3 個は、どれも工場から 3〜5 マスの位置にある', () => {
    for (const city of PLAYER_CITIES) {
      const cost = minCost(city, PLAYER_FACTORIES, 'infantry');
      expect(cost).toBeGreaterThanOrEqual(3);
      expect(cost).toBeLessThanOrEqual(5);
    }
  });

  it('中立拠点は 29 個(都市 27・研究所 2)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(29);
    expect(countByTerrain(neutral)).toEqual({ city: 27, laboratory: 2 });
  });

  it('初期ユニットは置かず、初期資金 0 から収入だけで立ち上がる', () => {
    expect(LAKE_RING_ROAD_MAP.units).toEqual([]);
    expect(LAKE_RING_ROAD_MAP.initialFunds).toBe(0);
  });
});

describe('環湖街道マップの先手番ハンデ', () => {
  it('先に届く中立拠点は自軍 12 個・敵軍 17 個で、後手のほうが 5 個多い', () => {
    let player = 0;
    let enemy = 0;
    for (const pos of basesOf('neutral')) {
      const byPlayer = minCost(pos, PLAYER_BASES, 'infantry');
      const byEnemy = minCost(pos, ENEMY_BASES, 'infantry');
      if (byPlayer < byEnemy) player += 1;
      if (byEnemy < byPlayer) enemy += 1;
    }
    expect(player).toBe(12);
    expect(enemy).toBe(17);
  });

  it('横棒の上の中立都市 5 個は敵軍の目の前で、2 個は歩兵 1 ターンで届く', () => {
    for (const pos of BAR_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBeLessThan(
        minCost(pos, PLAYER_BASES, 'infantry'),
      );
    }
    const oneTurn = BAR_CITIES.filter(
      (pos) => minCost(pos, ENEMY_BASES, 'infantry') <= 3,
    );
    expect(oneTurn).toHaveLength(2);
    // 自軍の最寄りの中立都市も歩兵 1 ターン(移動コスト 2)なので、収入が伸び始めるターンはそろう
    expect(
      Math.min(
        ...basesOf('neutral')
          .filter((pos) => map.getTile(pos)?.terrainType === 'city')
          .map((pos) => minCost(pos, PLAYER_BASES, 'infantry')),
      ),
    ).toBe(2);
  });

  it('「G」の右下の中立都市 10 個は敵軍のほうが近い', () => {
    for (const pos of SE_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBeLessThan(
        minCost(pos, PLAYER_BASES, 'infantry'),
      );
    }
  });
});

describe('環湖街道マップの通行性と敵軍AI', () => {
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

  it('敵軍AIは収入 4000 から生産を回し、目の前の中立都市を占領できる', () => {
    const aiMap = MapManager.fromDefinition(LAKE_RING_ROAD_MAP);
    const units = UnitManager.fromPlacements(LAKE_RING_ROAD_MAP.units ?? [], aiMap);
    const economy = new EconomyManager({ initialFunds: LAKE_RING_ROAD_MAP.initialFunds });
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
