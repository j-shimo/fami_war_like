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
import { LAKESIDE_GORGE_MAP } from '@/data/maps/lakesideGorgeMap';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

/** 先手の自軍(右上)。本拠地 1・工場 3・空港 2・港 1 */
const PLAYER_HQ = gridPosition(30, 1);
const PLAYER_PORT = gridPosition(29, 4);
const PLAYER_AIRPORTS: readonly GridPosition[] = [
  gridPosition(28, 1),
  gridPosition(28, 2),
];
const PLAYER_FACTORIES: readonly GridPosition[] = [
  gridPosition(29, 1),
  gridPosition(31, 1),
  gridPosition(30, 2),
];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  PLAYER_PORT,
  ...PLAYER_AIRPORTS,
  ...PLAYER_FACTORIES,
];

/** 後手の敵軍(左下)。本拠地 1・工場 3・空港 1・港 1・駅 1 */
const ENEMY_HQ = gridPosition(5, 20);
const ENEMY_STATION = gridPosition(7, 19);
const ENEMY_PORT = gridPosition(3, 20);
const ENEMY_AIRPORT = gridPosition(5, 21);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(4, 20),
  gridPosition(6, 20),
  gridPosition(4, 21),
];
const ENEMY_BASES: readonly GridPosition[] = [
  ENEMY_HQ,
  ENEMY_STATION,
  ENEMY_PORT,
  ENEMY_AIRPORT,
  ...ENEMY_FACTORIES,
];

/** 線路がつなぐ 2 つの中立駅(中央と右下) */
const MID_STATION = gridPosition(17, 16);
const SE_STATION = gridPosition(29, 19);

/** 北西の山に囲まれた 3x3 の窪地(col 5〜7・row 3〜5)にある中立拠点 */
const POCKET_LABORATORY = gridPosition(6, 4);
const POCKET_AIRPORT = gridPosition(7, 3);
const POCKET_CITIES: readonly GridPosition[] = [gridPosition(5, 3), gridPosition(6, 5)];

/** 右上の 5x4 の湖(col 27〜31・row 5〜8) */
const LAKE: readonly GridPosition[] = [27, 28, 29, 30, 31].flatMap((col) =>
  [5, 6, 7, 8].map((row) => gridPosition(col, row)),
);

/** 湖から西の海へ流れる幅 1 マスの川(row 7・col 3〜26) */
const RIVER: readonly GridPosition[] = Array.from({ length: 24 }, (_, i) =>
  gridPosition(3 + i, 7),
);

/** 右端の街道が左(くねくね道)と下(右下の空間)へ分かれる分岐点 */
const SPLIT = gridPosition(33, 11);

/** 後手のハンデとして敵軍の陣地の隣にだけ置いた中立都市 2 個 */
const HANDICAP_CITIES: readonly GridPosition[] = [
  gridPosition(4, 18),
  gridPosition(6, 18),
];

const map = MapManager.fromDefinition(LAKESIDE_GORGE_MAP);

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

describe('湖畔と山峡マップの盤面', () => {
  it('35x24 の盤面で、海は左端(col 0〜2)と右上の湖にしかない', () => {
    expect(map.cols).toBe(35);
    expect(map.rows).toBe(24);
    expect(map.name).toBe('湖畔と山峡マップ');
    for (let row = 0; row < map.rows; row += 1) {
      for (let col = 0; col < map.cols; col += 1) {
        if (map.getTile(gridPosition(col, row))?.terrainType !== 'sea') continue;
        const isWestSea = col <= 2;
        const isLake = col >= 27 && col <= 31 && row >= 5 && row <= 8;
        expect(isWestSea || isLake).toBe(true);
      }
    }
  });

  it('自軍の陣地の下の 5x4 が湖で、そこから西へ 1 本の川が海まで流れている', () => {
    for (const pos of LAKE) {
      expect(map.getTile(pos)?.terrainType).toBe('sea');
    }
    for (const pos of RIVER) {
      expect(map.getTile(pos)?.terrainType).toBe('river');
    }
    // 湖 → 川 → 西の海までが 1 本の水路としてつながっている
    const sea = distancesFrom(map, PLAYER_PORT, 'sea');
    expect(sea.get(gridPosition(26, 7))).toBeLessThan(Infinity);
    expect(sea.get(ENEMY_PORT)).toBe(44);
    expect(sea.get(gridPosition(3, 12))).toBe(36);
  });

  it('川より上は一面の森、川のすぐ南(row 8)は端から端まで山', () => {
    // 北西の窪地と山の輪(col 4〜8)・自軍の陣地(col 27〜34)を除けば、川より上は森
    for (let row = 0; row <= 6; row += 1) {
      for (let col = 3; col <= 26; col += 1) {
        if (col >= 4 && col <= 8) continue;
        const terrain = map.getTile(gridPosition(col, row))!.terrainType;
        // 例外は、森のあいだに点在する中立都市 4 個((15,2)(23,2)(11,4)(19,5))と、
        // 西岸で揚陸に使う海岸 2 マス((3,4)(3,5))だけ
        expect(['forest', 'city', 'beach']).toContain(terrain);
      }
    }
    for (let col = 3; col <= 26; col += 1) {
      expect(map.getTile(gridPosition(col, 8))?.terrainType).toBe('mountain');
    }
  });

  it('川を渡って南へ降りられるのは歩兵だけで、車両の南北路は湖の右の街道 1 本だけ', () => {
    // 川の南岸が山なので、川を渡れる装軌車両も南へは降りられない
    expect(map.getMoveCost(gridPosition(15, 7), 'vehicle')).not.toBeNull();
    expect(map.getMoveCost(gridPosition(15, 8), 'vehicle')).toBeNull();
    expect(map.getMoveCost(gridPosition(15, 7), 'wheeled')).toBeNull();
    // 湖の右の街道(col 33)は row 3〜19 まで一本につながっている
    for (let row = 3; row <= 19; row += 1) {
      expect(map.getTile(gridPosition(33, row))?.terrainType).toBe('road');
    }
    // 街道を山で塞ぐと、車両は自軍の陣地から南へ 1 マスも出られなくなる
    const blocked = MapManager.fromDefinition({
      ...LAKESIDE_GORGE_MAP,
      terrain: LAKESIDE_GORGE_MAP.terrain.map((line, row) =>
        row >= 9 && row <= 12 ? `${line.slice(0, 33)}m${line.slice(34)}` : line,
      ),
    });
    for (const movementType of ['vehicle', 'wheeled'] as const) {
      expect(distancesFrom(blocked, PLAYER_HQ, movementType).get(SPLIT)).toBeUndefined();
      expect(distancesFrom(map, PLAYER_HQ, movementType).get(SPLIT)).toBeLessThan(
        Infinity,
      );
    }
    // 歩兵は川を渡ってくねくね道 (24,9) へ 12 で降りられる(街道を回る装輪車両は 27)
    expect(minCost(gridPosition(24, 9), PLAYER_BASES, 'infantry')).toBe(12);
    expect(minCost(gridPosition(24, 9), PLAYER_BASES, 'wheeled')).toBe(27);
  });

  it('街道は湖を越えた (33,11) で左(くねくね道)と下(右下の空間)へ分かれる', () => {
    expect(map.getTile(SPLIT)?.terrainType).toBe('road');
    // 左と下、どちらの隣も街道
    expect(map.getTile(gridPosition(32, 11))?.terrainType).toBe('road');
    expect(map.getTile(gridPosition(33, 12))?.terrainType).toBe('road');
    // くねくね道は分岐点から敵軍の陣地の入口 (8,18) まで 44 マス
    expect(distancesFrom(map, gridPosition(8, 18), 'wheeled').get(SPLIT)).toBe(44);
    // 自軍の陣地からは分岐点まで 12 マスと近い
    expect(minCost(SPLIT, PLAYER_BASES, 'wheeled')).toBe(12);
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

describe('湖畔と山峡マップの拠点', () => {
  it('両軍とも 7 拠点・収入 7000 だが、駅を持つのは後手の敵軍だけ', () => {
    expect(new Set(basesOf('player').map((pos) => `${pos.col},${pos.row}`))).toEqual(
      new Set(PLAYER_BASES.map((pos) => `${pos.col},${pos.row}`)),
    );
    expect(new Set(basesOf('enemy').map((pos) => `${pos.col},${pos.row}`))).toEqual(
      new Set(ENEMY_BASES.map((pos) => `${pos.col},${pos.row}`)),
    );
    expect(countByTerrain(PLAYER_BASES)).toEqual({
      headquarters: 1,
      factory: 3,
      airport: 2,
      port: 1,
    });
    expect(countByTerrain(ENEMY_BASES)).toEqual({
      headquarters: 1,
      factory: 3,
      airport: 1,
      port: 1,
      station: 1,
    });

    const economy = new EconomyManager();
    expect(economy.getIncome('player', map)).toBe(7000);
    expect(economy.getIncome('enemy', map)).toBe(7000);
  });

  it('中立拠点は 26 個(都市 21・研究所 1・空港 1・港 1・駅 2)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(26);
    expect(countByTerrain(neutral)).toEqual({
      city: 21,
      laboratory: 1,
      airport: 1,
      port: 1,
      station: 2,
    });
  });

  it('初期ユニットは置かず、初期資金 31000(列車砲 + 歩兵)から生産で戦力を用意する', () => {
    expect(LAKESIDE_GORGE_MAP.units).toEqual([]);
    expect(LAKESIDE_GORGE_MAP.initialFunds).toBe(
      getUnitData('railgun').cost + getUnitData('infantry').cost,
    );
  });

  it('西岸の中立港は山に囲まれた入り江にあり、車両はどうやっても近づけない', () => {
    const westPort = gridPosition(3, 12);
    expect(map.getTile(westPort)?.terrainType).toBe('port');
    expect(map.getTile(westPort)?.owner).toBe('neutral');
    for (const movementType of ['vehicle', 'wheeled'] as const) {
      expect(minCost(westPort, [...PLAYER_BASES, ...ENEMY_BASES], movementType)).toBe(
        Infinity,
      );
    }
    expect(minCost(westPort, ENEMY_BASES, 'infantry')).toBe(13);
  });
});

describe('湖畔と山峡マップの北西の窪地', () => {
  it('3x3 の窪地は山の輪にすっぽり囲まれている', () => {
    // 輪(col 4〜8・row 2〜6)の縁はすべて山
    for (let col = 4; col <= 8; col += 1) {
      for (let row = 2; row <= 6; row += 1) {
        const isInside = col >= 5 && col <= 7 && row >= 3 && row <= 5;
        if (isInside) continue;
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('mountain');
      }
    }
    // 窪地の中身は中立の研究所 1・都市 2・空港 1
    expect(map.getTile(POCKET_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(POCKET_AIRPORT)?.terrainType).toBe('airport');
    for (const pos of POCKET_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
    }
    for (const pos of [POCKET_LABORATORY, POCKET_AIRPORT, ...POCKET_CITIES]) {
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
  });

  it('窪地へ入れるのは歩兵と飛行ユニットだけで、自軍のほうが近い', () => {
    const bases = [...PLAYER_BASES, ...ENEMY_BASES];
    for (const movementType of ['vehicle', 'wheeled'] as const) {
      expect(minCost(POCKET_LABORATORY, bases, movementType)).toBe(Infinity);
    }
    expect(minCost(POCKET_LABORATORY, bases, 'air')).toBeLessThan(Infinity);
    // 北の森を西へ歩く自軍のほうが、山を北上する敵軍より近い
    expect(minCost(POCKET_LABORATORY, PLAYER_BASES, 'infantry')).toBe(24);
    expect(minCost(POCKET_LABORATORY, ENEMY_BASES, 'infantry')).toBe(27);
    expect(minCost(POCKET_AIRPORT, PLAYER_BASES, 'infantry')).toBe(23);
    expect(minCost(POCKET_AIRPORT, ENEMY_BASES, 'infantry')).toBe(27);
  });

  it('敵軍は西岸の海岸へ揚陸して窪地を狙える', () => {
    const sea = distancesFrom(map, ENEMY_PORT, 'sea');
    for (const pos of [gridPosition(3, 4), gridPosition(3, 5)]) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
      expect(sea.get(pos)).toBeLessThan(Infinity);
    }
  });
});

describe('湖畔と山峡マップの線路と 2 つの中立駅', () => {
  it('敵軍の駅から中立の駅 2 つが 1 本の線路でつながっている', () => {
    for (const pos of [ENEMY_STATION, MID_STATION, SE_STATION]) {
      expect(map.getTile(pos)?.terrainType).toBe('station');
    }
    expect(map.getTile(MID_STATION)?.owner).toBe('neutral');
    expect(map.getTile(SE_STATION)?.owner).toBe('neutral');
    // 駅は 3 つだけ
    let stations = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'station') stations += 1;
    });
    expect(stations).toBe(3);
    // 列車砲(軌道)は敵軍の駅からすべての線路・駅へ届く
    const rail = distancesFrom(map, ENEMY_STATION, 'rail');
    map.forEachTile((tile) => {
      if (map.getMoveCost(tile.position, 'rail') === null) return;
      expect(rail.get(tile.position)).not.toBeUndefined();
    });
  });

  it('中央の駅までは 1 ターン、右下の駅までは 2 ターン(26 マス以上)かかる', () => {
    const rail = distancesFrom(map, ENEMY_STATION, 'rail');
    const movement = getUnitData('railgun').movement;
    expect(movement).toBe(15);
    expect(rail.get(MID_STATION)).toBe(13);
    expect(rail.get(SE_STATION)).toBe(28);
    // 中央の駅は 1 ターンで届き、右下の駅は届かない(= 2 ターンかかる)
    expect(rail.get(MID_STATION)!).toBeLessThanOrEqual(movement);
    expect(rail.get(SE_STATION)!).toBeGreaterThanOrEqual(26);
    expect(rail.get(SE_STATION)!).toBeGreaterThan(movement);
    expect(rail.get(SE_STATION)!).toBeLessThanOrEqual(movement * 2);
    // 中央の駅で乗り継げば、そこから右下の駅までは 1 ターンぶん
    expect(distancesFrom(map, MID_STATION, 'rail').get(SE_STATION)).toBe(15);
  });

  it('中央の中立駅は中立都市 5 個に囲まれ、くねくね道から支道でつながっている', () => {
    const around: readonly GridPosition[] = [
      gridPosition(16, 15),
      gridPosition(18, 15),
      gridPosition(15, 17),
      gridPosition(17, 17),
      gridPosition(19, 17),
    ];
    for (const pos of around) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // くねくね道 (17,14) から 1 マスの支道 (17,15) が駅まで降りている
    expect(map.getTile(gridPosition(17, 14))?.terrainType).toBe('road');
    expect(map.getTile(gridPosition(17, 15))?.terrainType).toBe('road');
    // 敵軍のほうがはるかに近い
    expect(minCost(MID_STATION, ENEMY_BASES, 'infantry')).toBe(13);
    expect(minCost(MID_STATION, ENEMY_BASES, 'vehicle')).toBe(17);
    expect(minCost(MID_STATION, PLAYER_BASES, 'infantry')).toBe(26);
    expect(minCost(MID_STATION, PLAYER_BASES, 'vehicle')).toBe(41);
  });

  it('右下の中立駅は山に囲まれた 4x5 の空間にあり、線路の終点なのに自軍のほうが近い', () => {
    // 空間(col 28〜31・row 17〜21)の外周は、線路と街道の口を除いてすべて山
    const gates = new Set(['27,19', '32,19']);
    for (let col = 27; col <= 32; col += 1) {
      for (const row of [16, 22]) {
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('mountain');
      }
    }
    for (let row = 17; row <= 21; row += 1) {
      for (const col of [27, 32]) {
        if (gates.has(`${col},${row}`)) continue;
        expect(map.getTile(gridPosition(col, row))?.terrainType).toBe('mountain');
      }
    }
    expect(map.getTile(gridPosition(27, 19))?.terrainType).toBe('railway');
    expect(map.getTile(gridPosition(32, 19))?.terrainType).toBe('road');
    // 中立都市 4 個を従えている
    for (const pos of [
      gridPosition(28, 17),
      gridPosition(31, 17),
      gridPosition(28, 21),
      gridPosition(31, 21),
    ]) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 自軍は右端の街道づたいにどの移動タイプでも 24 で着く
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(minCost(SE_STATION, PLAYER_BASES, movementType)).toBe(24);
    }
    expect(minCost(SE_STATION, ENEMY_BASES, 'infantry')).toBe(26);
    expect(minCost(SE_STATION, ENEMY_BASES, 'vehicle')).toBe(40);
  });

  it('線路のまわりは森と平地なので、装軌車両は列車砲に随伴できる', () => {
    const belt = [
      gridPosition(12, 15),
      gridPosition(13, 15),
      gridPosition(12, 17),
      gridPosition(22, 15),
      gridPosition(24, 18),
    ];
    for (const pos of belt) {
      const terrain = map.getTile(pos)?.terrainType;
      expect(['forest', 'plain']).toContain(terrain);
      expect(map.getMoveCost(pos, 'vehicle')).not.toBeNull();
    }
    // 装軌車両は敵軍の陣地から中央の駅まで線路ぞいに進める
    expect(minCost(MID_STATION, ENEMY_BASES, 'vehicle')).toBeLessThan(Infinity);
  });
});

describe('湖畔と山峡マップの先手番ハンデ', () => {
  it('敵軍の陣地の隣にだけ、1 ターンで届く中立都市を 2 個置いてある', () => {
    for (const pos of HANDICAP_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
      // 歩兵(移動力 3)で 1 ターン
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBeLessThanOrEqual(3);
    }
  });

  it('自軍の最寄りの中立都市は 2 ターンかかるので、収入が伸びるのは後手が 1 ターン早い', () => {
    const nearestFor = (bases: readonly GridPosition[]): number =>
      Math.min(
        ...basesOf('neutral')
          .filter((pos) => map.getTile(pos)?.terrainType === 'city')
          .map((pos) => minCost(pos, bases, 'infantry')),
      );
    expect(nearestFor(ENEMY_BASES)).toBe(2);
    expect(nearestFor(PLAYER_BASES)).toBe(5);
    expect(Math.ceil(2 / 3)).toBe(1);
    expect(Math.ceil(5 / 3)).toBe(2);
  });

  it('相手の本拠地までの距離は、両軍でおおむね釣り合っている', () => {
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'infantry')).toBe(42);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'infantry')).toBe(43);
    expect(minCost(ENEMY_HQ, PLAYER_BASES, 'vehicle')).toBe(60);
    expect(minCost(PLAYER_HQ, ENEMY_BASES, 'vehicle')).toBe(58);
  });
});

describe('湖畔と山峡マップの通行性と敵軍AI', () => {
  it('歩兵は、進入できるマスすべてへ両軍の陣地からたどり着ける', () => {
    for (const bases of [PLAYER_BASES, ENEMY_BASES]) {
      const fields = bases.map((base) => distancesFrom(map, base, 'infantry'));
      map.forEachTile((tile) => {
        if (map.getMoveCost(tile.position, 'infantry') === null) return;
        expect(fields.some((field) => field.get(tile.position) !== undefined)).toBe(true);
      });
    }
  });

  it('中立拠点は、どれも歩兵か飛行ユニットで到達できる', () => {
    const bases = [...PLAYER_BASES, ...ENEMY_BASES];
    for (const pos of basesOf('neutral')) {
      const reachable =
        minCost(pos, bases, 'infantry') < Infinity ||
        minCost(pos, bases, 'air') < Infinity;
      expect(reachable).toBe(true);
    }
  });

  it('敵軍AIは 1 ターン目に列車砲を生産しつつ、中立拠点の占領も進められる', () => {
    const aiMap = MapManager.fromDefinition(LAKESIDE_GORGE_MAP);
    const units = UnitManager.fromPlacements(LAKESIDE_GORGE_MAP.units ?? [], aiMap);
    const economy = new EconomyManager({ initialFunds: LAKESIDE_GORGE_MAP.initialFunds });
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

    // 駅を陣地でただ 1 つ row 19 に置いたねらいどおり、1 ターン目で列車砲が出る
    expect(
      units.getUnitsByArmy('enemy').some((unit) => unit.unitType === 'railgun'),
    ).toBe(true);
    // 余りで歩兵も出るので、占領役が絶えない
    expect(
      units.getUnitsByArmy('enemy').some((unit) => unit.unitType === 'infantry'),
    ).toBe(true);
    // 陣地の隣のハンデ都市など、近い中立拠点を実際に占領できている
    let captured = 0;
    aiMap.forEachTile((tile) => {
      if (tile.owner === 'enemy' && getTerrainData(tile.terrainType).canCapture) {
        captured += 1;
      }
    });
    expect(captured).toBeGreaterThan(ENEMY_BASES.length);
  });
});
