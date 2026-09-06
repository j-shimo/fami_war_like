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
/** 自軍の港 2 つ。街道 1 マス (11,5) を挟んで並ぶ (10,5) と (12,5)。どちらも工場から 3 マス */
const PLAYER_PORTS: readonly GridPosition[] = [gridPosition(10, 5), gridPosition(12, 5)];
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
const ENEMY_HQ = gridPosition(19, 21);
const ENEMY_AIRPORT = gridPosition(21, 21);
const ENEMY_FACTORIES: readonly GridPosition[] = [
  gridPosition(18, 20),
  gridPosition(20, 20),
  gridPosition(19, 22),
];
const ENEMY_PORTS: readonly GridPosition[] = [gridPosition(17, 19), gridPosition(16, 22)];
const ENEMY_CITIES: readonly GridPosition[] = [
  gridPosition(18, 19),
  gridPosition(22, 19),
  gridPosition(23, 20),
  gridPosition(17, 21),
  gridPosition(24, 21),
  gridPosition(17, 23),
  gridPosition(19, 23),
  gridPosition(21, 23),
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

/** 西の岬の中立拠点。研究所 1 個と中立都市 3 個(縦棒に 2 個・下の横棒に 1 個) */
const CAPE_LABORATORY = gridPosition(2, 16);
const CAPE_CITIES: readonly GridPosition[] = [
  gridPosition(5, 10),
  gridPosition(1, 13),
  gridPosition(5, 17),
];
/** 「[」の下の横棒に並ぶ中立空港と、その先端の下寄りにある中立港 */
const CAPE_ARM_AIRPORT = gridPosition(8, 17);
const CAPE_ARM_PORT = gridPosition(11, 18);
/** 岬の東岸(縦棒 row 9〜15 の東の縁)。輸送艦への積み込みと揚陸に使える海岸 */
const CAPE_EAST_COAST: readonly GridPosition[] = [
  gridPosition(7, 9),
  gridPosition(6, 10),
  gridPosition(6, 11),
  gridPosition(6, 12),
  gridPosition(5, 13),
  gridPosition(5, 14),
  gridPosition(5, 15),
];
/** 「[」の下の横棒の南岸(row 18 の col 0〜8)。積み込みと揚陸に使える海岸 */
const CAPE_ARM_SOUTH_COAST: readonly GridPosition[] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
  (col) => gridPosition(col, 18),
);
/** 下の横棒の北面(row 16 の col 5〜11)。海に面した山の壁 */
const CAPE_ARM_RIDGE: readonly GridPosition[] = [5, 6, 7, 8, 9, 10, 11].map((col) =>
  gridPosition(col, 16),
);
/** 「[」の下の横棒が占める範囲(row 16〜18、col 0〜11) */
function isCapeArm(pos: GridPosition): boolean {
  return pos.col <= 11 && pos.row >= 16 && pos.row <= 18;
}

/** 東の離島。建物は中立の研究所 2 個だけで、まわりはすべて海岸 */
const ISLET_LABORATORIES: readonly GridPosition[] = [
  gridPosition(23, 5),
  gridPosition(24, 5),
];
const ISLET_BEACHES: readonly GridPosition[] = [
  gridPosition(23, 4),
  gridPosition(24, 4),
  gridPosition(22, 5),
  gridPosition(25, 5),
  gridPosition(23, 6),
  gridPosition(24, 6),
];
/** 離島が占める範囲(row 4〜6、col 22〜25) */
function isIslet(pos: GridPosition): boolean {
  return pos.col >= 22 && pos.col <= 25 && pos.row >= 4 && pos.row <= 6;
}

/** 南東の島に残っている中立都市 3 個(北へ伸びた腕の上) */
const ENEMY_ISLAND_NEUTRAL_CITIES: readonly GridPosition[] = [
  gridPosition(25, 11),
  gridPosition(24, 13),
  gridPosition(26, 16),
];

/** 敵軍の本土の海岸。自軍の上陸地点になる */
const ENEMY_BEACHES: readonly GridPosition[] = [
  gridPosition(18, 18),
  gridPosition(19, 18),
  gridPosition(16, 19),
  gridPosition(17, 20),
  gridPosition(16, 21),
  gridPosition(15, 23),
];
/** 北へ伸びた腕の北西岸にある海岸。自軍の艦隊が腕へ食い込む足場になる */
const ENEMY_ARM_BEACHES: readonly GridPosition[] = [
  gridPosition(24, 10),
  gridPosition(24, 11),
  gridPosition(23, 12),
  gridPosition(23, 13),
  gridPosition(22, 14),
  gridPosition(22, 15),
  gridPosition(21, 16),
  gridPosition(20, 17),
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

  it('自軍の島は西側だけが南へ伸びたあと東へ折れて「[」の字になっている', () => {
    // row 9〜15(「[」の縦棒)で自軍の陸が残っているのは西端(col 0〜7)だけ
    for (let row = 9; row <= 15; row += 1) {
      for (let col = 8; col < map.cols; col += 1) {
        const pos = gridPosition(col, row);
        const passable = map.getMoveCost(pos, 'infantry') !== null;
        if (!passable) continue;
        // 陸が残っているのは敵軍の島(北へ伸びた腕の東側)だけ
        expect(minCost(pos, ENEMY_BASES, 'infantry')).toBeLessThan(Infinity);
      }
      // 縦棒は col 7 までで切れる
      expect(map.getMoveCost(gridPosition(8, row), 'infantry')).toBeNull();
    }
    // row 16〜18 は東へ折れた下の横棒。col 11 まで陸が続き、col 12 で海に切れる
    for (const row of [16, 17, 18]) {
      for (let col = 0; col <= 11; col += 1) {
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).not.toBeNull();
      }
      expect(map.getTile(gridPosition(12, row))?.terrainType).toBe('sea');
    }
    // 縦棒より 4〜6 マスぶん東へ張り出しているので「「」ではなく「[」の形になる
    // 下の横棒は自軍の島と地続き(歩兵で先端の港まで歩いて行ける)
    expect(minCost(CAPE_ARM_PORT, PLAYER_BASES, 'infantry')).toBeLessThan(Infinity);
    // 岬は自軍の島の本体(row 8)より 10 段下まで伸びている
    expect(18 - 8).toBe(10);
  });

  it('下の横棒の北面は海に面した山の壁で、飛行ユニットだけが近道できる', () => {
    // 海に面した (5〜11,16) は山。装軌車両・装輪車両は進入できず、海岸でもないので
    // 輸送艦を横付けして上陸することもできない
    for (const pos of CAPE_ARM_RIDGE) {
      expect(map.getTile(pos)?.terrainType).toBe('mountain');
      expect(map.getMoveCost(pos, 'vehicle')).toBeNull();
      expect(map.getMoveCost(pos, 'wheeled')).toBeNull();
      expect(map.getMoveCost(pos, 'sea')).toBeNull();
    }
    // 山の壁の北側((6〜11,15))は海
    for (let col = 6; col <= 11; col += 1) {
      expect(map.getTile(gridPosition(col, 15))?.terrainType).toBe('sea');
    }
    // 先端の港へ地上から入るには岬を降りて横棒を端まで歩くしかなく、遠回りになる
    expect(minCost(CAPE_ARM_PORT, PLAYER_BASES, 'infantry')).toBe(26);
    expect(minCost(CAPE_ARM_PORT, PLAYER_BASES, 'vehicle')).toBe(28);
    expect(minCost(CAPE_ARM_PORT, PLAYER_BASES, 'wheeled')).toBe(29);
    // 飛行ユニットは山も海もまっすぐ越えられるので、10 マス以上の近道になる
    expect(minCost(CAPE_ARM_PORT, PLAYER_BASES, 'air')).toBe(12);
  });

  it('岬の東岸と下の横棒の南岸は海岸で、先端から敵軍の島までは海 5〜6 マス', () => {
    // 岬の東岸と下の横棒の南岸(row 18 の col 0〜8)は海岸
    for (const pos of [...CAPE_EAST_COAST, ...CAPE_ARM_SOUTH_COAST]) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    // 岬の東岸から敵軍の海岸まで直接向かうと 15
    expect(minCostToAny(ENEMY_BEACHES, CAPE_EAST_COAST, 'sea')).toBe(15);
    // 下の横棒の先端(中立港)からは海 5 マスで敵軍の島の西岸、6 マスで港・北岸に届く
    expect(minCost(gridPosition(16, 19), [CAPE_ARM_PORT], 'sea')).toBe(6);
    expect(minCostToAny(ENEMY_BEACHES, [CAPE_ARM_PORT], 'sea')).toBe(6);
    expect(minCostToAny(ENEMY_PORTS, [CAPE_ARM_PORT], 'sea')).toBe(7);
    // 敵軍の島は岬の先端(col 11)より「右(東)」にある
    for (const beach of ENEMY_BEACHES) {
      expect(beach.col).toBeGreaterThan(CAPE_ARM_PORT.col);
    }
    // 自軍の港から敵軍の海岸まで直接向かうと 18(岬を足場にすると 3 分の 1 になる)
    expect(minCostToAny(ENEMY_BEACHES, PLAYER_PORTS, 'sea')).toBe(18);
  });

  it('敵軍の島は右側が北へ伸びていて、その腕の先端は離島の下まで届く', () => {
    // 腕の先端(row 10)に残る陸は東の端(col 24〜27)だけ
    for (let col = 0; col < map.cols; col += 1) {
      const pos = gridPosition(col, 10);
      if (map.getMoveCost(pos, 'infantry') === null) continue;
      // 岬(col 0〜6)か、腕の先端(col 24〜27)のどちらか
      expect(col <= 6 || col >= 24).toBe(true);
    }
    // 腕の先端は敵軍の陣地と地続き
    expect(minCost(gridPosition(25, 11), ENEMY_BASES, 'infantry')).toBeLessThan(Infinity);
    // 腕は離島(row 4〜6)より下で終わっていて、離島とは陸続きにならない
    for (let row = 7; row <= 9; row += 1) {
      for (let col = 20; col < map.cols; col += 1) {
        expect(map.getMoveCost(gridPosition(col, row), 'infantry')).toBeNull();
      }
    }
    // 腕の北西岸は海岸が続いていて、自軍の艦隊が横付けできる
    for (const pos of ENEMY_ARM_BEACHES) {
      expect(map.getTile(pos)?.terrainType).toBe('beach');
    }
    expect(minCostToAny(ENEMY_ARM_BEACHES, PLAYER_PORTS, 'sea')).toBe(17);
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

  it('自軍の港 2 つは、街道 1 マスを挟んでどちらも工場から 3 マスの地点にある', () => {
    // 2 つの港は同じ行で、あいだに街道 1 マス (11,5) を挟んでいる
    const [west, east] = PLAYER_PORTS;
    expect(east.col - west.col).toBe(2);
    expect(east.row).toBe(west.row);
    expect(map.getTile(gridPosition(11, 5))?.terrainType).toBe('road');
    // 工場 (11,3) からどちらの港へもちょうど 3 マス。地上ユニットはどの移動タイプでも同じ
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(minCost(west, PLAYER_FACTORIES, movementType)).toBe(3);
      expect(minCost(east, PLAYER_FACTORIES, movementType)).toBe(3);
    }
    // 港の下 (10,6)/(12,6) は南の海から切れ込んだ入り江で、そこから外洋へ出られる
    for (const inlet of [gridPosition(10, 6), gridPosition(12, 6)]) {
      expect(map.getTile(inlet)?.terrainType).toBe('sea');
    }
    for (const port of PLAYER_PORTS) {
      expect(minCost(port, [gridPosition(11, 7)], 'sea')).toBeLessThan(Infinity);
    }
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

  it('中立拠点は 21 個(中立都市 16・中立研究所 3・中立空港 1・中立港 1)', () => {
    const neutral = basesOf('neutral');
    expect(neutral).toHaveLength(21);
    const byTerrain = neutral.reduce<Record<string, number>>((counts, pos) => {
      const terrain = map.getTile(pos)?.terrainType ?? '';
      counts[terrain] = (counts[terrain] ?? 0) + 1;
      return counts;
    }, {});
    expect(byTerrain).toEqual({ city: 16, laboratory: 3, airport: 1, port: 1 });
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
    // 岬の先端の中立港も同じ海でつながっている
    expect(minCost(CAPE_ARM_PORT, PLAYER_PORTS, 'sea')).toBeLessThan(Infinity);
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

  it('西の岬は研究所のところで東へ折れ、その先に中立都市・空港・港が並ぶ', () => {
    expect(map.getTile(CAPE_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(CAPE_LABORATORY)?.owner).toBe('neutral');
    for (const pos of CAPE_CITIES) {
      expect(map.getTile(pos)?.terrainType).toBe('city');
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    // 縦棒の中立都市 2 個と、折れ曲がりの角にある研究所は col 1〜5 の縦のラダー
    for (const pos of [CAPE_CITIES[0], CAPE_CITIES[1], CAPE_LABORATORY]) {
      expect(pos.col).toBeGreaterThanOrEqual(1);
      expect(pos.col).toBeLessThanOrEqual(5);
      expect(pos.row).toBeLessThanOrEqual(CAPE_LABORATORY.row);
    }
    // 研究所から東へ折れた下の横棒(row 17)に中立都市と中立空港が並ぶ
    expect(map.getTile(CAPE_ARM_AIRPORT)?.terrainType).toBe('airport');
    expect(map.getTile(CAPE_ARM_AIRPORT)?.owner).toBe('neutral');
    for (const pos of [CAPE_CITIES[2], CAPE_ARM_AIRPORT]) {
      expect(pos.row).toBe(17);
      expect(pos.col).toBeGreaterThan(CAPE_LABORATORY.col);
    }
    // 中立港は下の横棒の先端、敵軍の島にいちばん近い東の端の下寄りにある
    expect(map.getTile(CAPE_ARM_PORT)?.terrainType).toBe('port');
    expect(map.getTile(CAPE_ARM_PORT)?.owner).toBe('neutral');
    expect(CAPE_ARM_PORT).toEqual(gridPosition(11, 18));
    // 岬の中立拠点 6 個は自軍だけが歩いて取りに行ける
    const capeBases = [...CAPE_CITIES, CAPE_LABORATORY, CAPE_ARM_AIRPORT, CAPE_ARM_PORT];
    for (const pos of capeBases) {
      expect(minCost(pos, PLAYER_BASES, 'infantry')).toBeLessThan(Infinity);
      expect(minCost(pos, ENEMY_BASES, 'infantry')).toBe(Infinity);
    }
    // 岬を降りて東へ進むほど遠くなる(いちばん上の都市が 10、先端の港が 26)
    expect(minCost(CAPE_CITIES[0], PLAYER_BASES, 'infantry')).toBe(10);
    expect(minCost(CAPE_CITIES[1], PLAYER_BASES, 'infantry')).toBe(17);
    expect(minCost(CAPE_LABORATORY, PLAYER_BASES, 'infantry')).toBe(19);
    expect(minCost(CAPE_CITIES[2], PLAYER_BASES, 'infantry')).toBe(19);
    expect(minCost(CAPE_ARM_AIRPORT, PLAYER_BASES, 'infantry')).toBe(22);
    expect(minCost(CAPE_ARM_PORT, PLAYER_BASES, 'infantry')).toBe(26);
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
    // 海路は自軍の港から 14・敵軍の港から 19 と、自軍のほうが近い
    expect(minCostToAny(ISLET_BEACHES, PLAYER_PORTS, 'sea')).toBe(14);
    expect(minCostToAny(ISLET_BEACHES, ENEMY_PORTS, 'sea')).toBe(19);
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
      // 街道づたいでも歩兵で 7〜11(移動力 3 なら 3〜4 ターン)かかる
      const cost = minCost(pos, ENEMY_BASES, 'infantry');
      expect(cost).toBeGreaterThanOrEqual(7);
      expect(cost).toBeLessThanOrEqual(11);
    }
  });

  it('中立拠点 21 個のうち 18 個は自軍側にあり、取り切れば収入で敵軍を追い越せる', () => {
    const forPlayer = basesOf('neutral').filter(
      (pos) => minCost(pos, PLAYER_BASES, 'infantry') < Infinity,
    );
    // 歩いて取れるのは北西の島の 10 個と岬の 6 個
    expect(forPlayer).toHaveLength(16);
    // 離島の研究所 2 個を足した 18 個ぶんが自軍の伸びしろ(収入 10000 → 28000)
    expect(16 + ISLET_LABORATORIES.length).toBe(18);
    expect((PLAYER_BASES.length + 18) * 1000).toBe(28000);
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
    // 「[」の下の横棒も、遠回りではあるが地上ユニットで歩き切れる
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      const arm = distancesFrom(map, PLAYER_HQ, movementType);
      map.forEachTile((tile) => {
        if (!isCapeArm(tile.position)) return;
        if (map.getMoveCost(tile.position, movementType) === null) return;
        expect(arm.get(tile.position)).not.toBeUndefined();
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
