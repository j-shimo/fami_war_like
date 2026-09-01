import { describe, expect, it } from 'vitest';
import type { GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { swapMapSides } from '@/data/maps/sideSwap';
import { UnitManager } from '@/core/units/UnitManager';
import { MAP_LIST } from '@/data/maps';
import { DIAGONAL_SEA_MAP } from '@/data/maps/diagonalSeaMap';
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
      if (!map.isInBounds(next)) continue;
      if (seen.has(key(next))) continue;
      if (!pass(next)) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  return seen;
}

/** movementType のユニットが進入できるマスかどうか */
function passable(map: MapManager, movementType: MovementType) {
  return (pos: GridPosition): boolean => map.getMoveCost(pos, movementType) !== null;
}

/** 条件を満たすマスをすべて集める */
function collect(
  map: MapManager,
  predicate: (tile: ReturnType<MapManager['getTile']> & object) => boolean,
): GridPosition[] {
  const found: GridPosition[] = [];
  map.forEachTile((tile) => {
    if (predicate(tile)) found.push(tile.position);
  });
  return found;
}

/**
 * 本拠地。2P側は盤面を入れ替えて遊ぶため、定義上の enemy が遊ぶ人の自軍(右上)、
 * 定義上の player が CPU の敵軍(左下)になる。
 */
const ENEMY_HQ: GridPosition = { col: 1, row: 22 }; // 定義上の player(= 敵軍)
const PLAYER_HQ: GridPosition = { col: 38, row: 1 }; // 定義上の enemy(= 自軍)

/** 盤面を斜めに横切る海の帯(左の島 col <= 26-row / 右の島 col >= 36-row) */
const isLeft = (pos: GridPosition): boolean => pos.col <= 26 - pos.row;
const isRight = (pos: GridPosition): boolean => pos.col >= 36 - pos.row;
const isStrait = (pos: GridPosition): boolean => !isLeft(pos) && !isRight(pos);

/** 海に点在する小島(それぞれ港 1・空港 1 の 2 マスだけ) */
const ISLETS: readonly (readonly [GridPosition, GridPosition])[] = [
  [
    { col: 29, row: 2 },
    { col: 30, row: 2 },
  ],
  [
    { col: 23, row: 8 },
    { col: 24, row: 8 },
  ],
  [
    { col: 16, row: 15 },
    { col: 17, row: 15 },
  ],
  [
    { col: 9, row: 21 },
    { col: 10, row: 21 },
  ],
];

/** 左の島で中立のまま残る北東の端の 6 拠点(自軍の陣地から海を挟んで正面) */
const LEFT_NEUTRAL_BASES: readonly GridPosition[] = [
  { col: 21, row: 1 },
  { col: 17, row: 1 },
  { col: 19, row: 3 },
  { col: 16, row: 3 },
  { col: 15, row: 5 },
  { col: 26, row: 0 }, // 中立港
];

/** 敵軍の初期部隊が水際を固める海岸 */
const DEFENDED_BEACHES: readonly GridPosition[] = [
  { col: 23, row: 3 },
  { col: 19, row: 7 },
  { col: 15, row: 11 },
  { col: 10, row: 16 },
];

describe('DIAGONAL_SEA_MAP(対角海マップ)', () => {
  it('縦24・横40 の盤面で生成できる', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    expect(map.cols).toBe(40);
    expect(map.rows).toBe(24);
  });

  it('2P側の激ムズマップ(extra)として一覧に登録されている', () => {
    const entry = MAP_LIST.find((item) => item.id === 'diagonalSea');
    expect(entry?.category).toBe('extra');
    expect(entry?.side).toBe('2p');
    expect(entry?.definition).toBe(DIAGONAL_SEA_MAP);
  });

  it('海が右上から左下へ幅 9 マスで斜めに横切り、両端が盤面の外へ抜けている', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    for (let row = 0; row < map.rows; row += 1) {
      const seaCols: number[] = [];
      for (let col = 0; col < map.cols; col += 1) {
        if (isStrait({ col, row })) seaCols.push(col);
      }
      // どの行でも海の帯は幅 9 マスで、1 行ごとに 1 マスずつ左へずれる(45 度の帯)
      expect(seaCols).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => 27 - row + i));
      for (const col of seaCols) {
        // 小島の 2 マスを除いて、帯の中はすべて海
        const tile = map.getTile({ col, row });
        const onIslet = ISLETS.flat().some((pos) => pos.col === col && pos.row === row);
        expect(tile?.terrainType === 'sea').toBe(!onIslet);
      }
    }
    // 帯は北の端(row 0)と南の端(row 23)で盤面の外へ抜けている
    expect(map.getTile({ col: 27, row: 0 })?.terrainType).toBe('sea');
    expect(map.getTile({ col: 12, row: 23 })?.terrainType).toBe('sea');
  });

  it('海の左上と右下に同じ大きさ(372 マス)の三角形の島が 1 つずつ残る', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const onLand = passable(map, 'infantry');
    const left = floodFill(map, ENEMY_HQ, onLand);
    const right = floodFill(map, PLAYER_HQ, onLand);
    expect(left.size).toBe(372);
    expect(right.size).toBe(372);
    for (const k of left) {
      const [col, row] = k.split(',').map(Number);
      expect(isLeft({ col, row })).toBe(true);
    }
    for (const k of right) {
      const [col, row] = k.split(',').map(Number);
      expect(isRight({ col, row })).toBe(true);
    }
  });

  it('島をつなぐ陸路は 1 本も無く、歩兵でも歩いて渡れない', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const reachable = floodFill(map, PLAYER_HQ, passable(map, 'infantry'));
    expect(reachable.has(key(ENEMY_HQ))).toBe(false);
    // 道路も海を渡らない(橋にあたる地形は無い)
    const straitRoads = collect(
      map,
      (tile) => isStrait(tile.position) && tile.terrainType === 'road',
    );
    expect(straitRoads).toHaveLength(0);
  });

  it('海はひとつながりで、すべての港へ艦艇が入れる', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const ocean = floodFill(map, { col: 31, row: 0 }, passable(map, 'sea'));
    for (const pos of collect(map, (tile) => tile.terrainType === 'sea')) {
      expect(ocean.has(key(pos))).toBe(true);
    }
    for (const pos of collect(map, (tile) => tile.terrainType === 'port')) {
      expect(ocean.has(key(pos))).toBe(true);
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
  });

  it('海に浮かぶ小島 4 つは、中立の港と空港だけの 2 マスで陸から孤立している', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const onLand = passable(map, 'infantry');
    for (const [port, airport] of ISLETS) {
      expect(map.getTile(port)?.terrainType).toBe('port');
      expect(map.getTile(airport)?.terrainType).toBe('airport');
      expect(map.getTile(port)?.owner).toBe('neutral');
      expect(map.getTile(airport)?.owner).toBe('neutral');
      // 島は 2 マスきり。歩いてはどちらの本島へも行けない
      expect(floodFill(map, port, onLand)).toEqual(new Set([key(port), key(airport)]));
    }
    // 中立空港・中立港は 4 個ずつ = 8 拠点ぶんの収入になる
    expect(ISLETS).toHaveLength(4);
  });

  it('両軍とも本拠地 1・工場 2・空港 2・港 2 の陣地を持ち、生産力は同じ', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const owned = {
      player: { headquarters: 0, factory: 0, airport: 0, port: 0 },
      enemy: { headquarters: 0, factory: 0, airport: 0, port: 0 },
    };
    // 陣地(敵軍は左下 col 0〜4、自軍は右上 col 35〜39)だけを数える。
    // 左の島には敵軍が占領済みの空港・港がほかにもあるため、範囲を区切って比べる。
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const { col, row } = tile.position;
      const inBase = (col <= 4 && row >= 20) || (col >= 35 && row <= 3);
      if (!inBase) return;
      const side = owned[tile.owner];
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
      if (tile.terrainType === 'port') side.port += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.headquarters).toBe(1);
      expect(side.factory).toBe(2);
      expect(side.airport).toBe(2);
      expect(side.port).toBe(2);
    }
    expect(map.getTile(ENEMY_HQ)?.owner).toBe('player');
    expect(map.getTile(PLAYER_HQ)?.owner).toBe('enemy');
  });

  it('初期資金は 20000 で、自軍は収入 7000・敵軍は収入 31000 で始まる', () => {
    expect(DIAGONAL_SEA_MAP.initialFunds).toBe(20000);
    // 2P側は盤面を入れ替えて遊ぶので、遊ぶ人の自軍は定義上の enemy になる
    const map = MapManager.fromDefinition(swapMapSides(DIAGONAL_SEA_MAP));
    const owned = { player: 0, enemy: 0 };
    map.forEachTile((tile) => {
      if (tile.owner === 'player') owned.player += 1;
      if (tile.owner === 'enemy') owned.enemy += 1;
    });
    expect(owned.player).toBe(7); // 入れ替え後の player = 遊ぶ人の自軍
    expect(owned.enemy).toBe(31); // 入れ替え後の enemy = CPU の敵軍
  });

  it('自軍は都市を 1 個も持たず、右の島の拠点はすべて中立で始まる', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    // 定義上の enemy(= 自軍)が持つ都市は 0 個
    expect(
      collect(map, (tile) => tile.terrainType === 'city' && tile.owner === 'enemy'),
    ).toHaveLength(0);
    // 右の島で陣地(col 35〜39・row 0〜3)以外の拠点はすべて中立
    const rightBases = collect(
      map,
      (tile) => isRight(tile.position) && getTerrainData(tile.terrainType).canCapture,
    );
    const outsideBase = rightBases.filter((pos) => !(pos.col >= 35 && pos.row <= 3));
    expect(outsideBase).toHaveLength(16);
    for (const pos of outsideBase) {
      expect(map.getTile(pos)?.owner).toBe('neutral');
    }
    expect(
      outsideBase.filter((pos) => map.getTile(pos)?.terrainType === 'city'),
    ).toHaveLength(14);
    expect(
      outsideBase.filter((pos) => map.getTile(pos)?.terrainType === 'airport'),
    ).toHaveLength(1);
    expect(
      outsideBase.filter((pos) => map.getTile(pos)?.terrainType === 'port'),
    ).toHaveLength(1);
  });

  it('左の島は 30 拠点のうち 8 割(24 個)が敵軍の占領下にある', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const islandBases = collect(
      map,
      (tile) =>
        isLeft(tile.position) &&
        getTerrainData(tile.terrainType).canCapture &&
        // 陣地(col 0〜4・row 20〜23)は島の拠点とは別に数える
        !(tile.position.col <= 4 && tile.position.row >= 20),
    );
    expect(islandBases).toHaveLength(30);
    const occupied = islandBases.filter((pos) => map.getTile(pos)?.owner === 'player');
    expect(occupied).toHaveLength(24);
    expect(occupied.length / islandBases.length).toBeCloseTo(0.8);
    // 中立で残るのは、敵軍の陣地から最も遠い北東の端の 6 拠点だけ
    const neutral = islandBases.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(new Set(neutral.map(key))).toEqual(new Set(LEFT_NEUTRAL_BASES.map(key)));
  });

  it('左の島は都市と森が広く分布し、右の島は平地と山ばかりで拠点が少ない', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const countIn = (within: (pos: GridPosition) => boolean, terrain: string): number =>
      collect(map, (tile) => within(tile.position) && tile.terrainType === terrain)
        .length;

    // 同じ 372 マスの島どうしで比べる
    expect(countIn(isLeft, 'city')).toBe(26);
    expect(countIn(isRight, 'city')).toBe(14);
    expect(countIn(isLeft, 'forest')).toBeGreaterThan(countIn(isRight, 'forest') * 2);
    expect(countIn(isRight, 'plain')).toBeGreaterThan(countIn(isLeft, 'plain') * 1.5);
    expect(countIn(isRight, 'mountain')).toBeGreaterThan(countIn(isLeft, 'mountain'));
  });

  it('左の島の都市はすべて道路に隣接し、道路網はひとつながりになっている', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    for (const side of [isLeft, isRight]) {
      const roads = collect(map, (tile) => side(tile.position) && isRoad(tile.position));
      // 島ごとに道路は 1 つの路線網になる(島同士は海で切れているのでつながらない)
      expect(floodFill(map, roads[0], isRoad).size).toBe(roads.length);
      const cities = collect(
        map,
        (tile) => side(tile.position) && tile.terrainType === 'city',
      );
      for (const pos of cities) {
        expect(neighbors(pos).some((next) => isRoad(next))).toBe(true);
      }
    }
  });

  it('島の中はどこへでも歩兵・装軌車両・装輪車両で行き来できる', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    for (const [start, side] of [
      [ENEMY_HQ, isLeft],
      [PLAYER_HQ, isRight],
    ] as const) {
      const bases = collect(
        map,
        (tile) => side(tile.position) && getTerrainData(tile.terrainType).canCapture,
      );
      for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
        const reachable = floodFill(map, start, passable(map, movementType));
        for (const pos of bases) {
          expect(reachable.has(key(pos))).toBe(true);
        }
      }
    }
  });

  it('すべての海岸は上陸地点として機能する', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const beaches = collect(map, (tile) => tile.terrainType === 'beach');
    expect(beaches).toHaveLength(16);
    for (const pos of beaches) {
      expect(map.getMoveCost(pos, 'infantry')).not.toBeNull();
      expect(map.getMoveCost(pos, 'sea')).not.toBeNull();
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
  });

  it('敵軍だけが初期部隊を持ち、11 体すべてが左の島に配置されている', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const manager = UnitManager.fromPlacements(DIAGONAL_SEA_MAP.units ?? [], map);
    // 定義上の enemy(= 遊ぶ人の自軍)は 1 体も持たない
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);

    const enemies = manager.getUnitsByArmy('player');
    expect(enemies).toHaveLength(11);
    for (const unit of enemies) {
      expect(isLeft(unit.position)).toBe(true);
    }
    const countOf = (unitType: string): number =>
      enemies.filter((unit) => unit.unitType === unitType).length;
    expect(countOf('infantry')).toBe(4);
    expect(countOf('mediumTank')).toBe(2);
    expect(countOf('antiAirTank')).toBe(1);
    expect(countOf('fighter')).toBe(1);
    expect(countOf('bomber')).toBe(1);
    expect(countOf('battleship')).toBe(1);
    expect(countOf('escortShip')).toBe(1);
  });

  it('敵軍の歩兵が海岸の水際を固め、航空機と艦艇は自軍の拠点から出撃する', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const manager = UnitManager.fromPlacements(DIAGONAL_SEA_MAP.units ?? [], map);
    for (const beach of DEFENDED_BEACHES) {
      expect(map.getTile(beach)?.terrainType).toBe('beach');
      const guard = neighbors(beach)
        .map((pos) => manager.getUnitAt(pos))
        .find((unit) => unit?.unitType === 'infantry');
      expect(guard?.armyType).toBe('player');
    }
    // 戦闘機・爆撃機は空港、戦艦・護衛艦は港に置いてあり、そこで修理できる
    for (const unit of manager.getUnitsByArmy('player')) {
      const tile = map.getTile(unit.position);
      if (unit.unitType === 'fighter' || unit.unitType === 'bomber') {
        expect(tile?.terrainType).toBe('airport');
        expect(tile?.owner).toBe('player');
      }
      if (unit.unitType === 'battleship' || unit.unitType === 'escortShip') {
        expect(tile?.terrainType).toBe('port');
        expect(tile?.owner).toBe('player');
      }
    }
  });

  it('占領できる拠点を 68 個持ち、自軍の島と小島を取り切って敵軍の収入に並ぶ', () => {
    const map = MapManager.fromDefinition(DIAGONAL_SEA_MAP);
    const capturable = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture,
    );
    expect(capturable).toHaveLength(68);
    const neutral = capturable.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    // 右の島 16 + 海の小島 8 + 左の島の北東の端 6 = 30 個が中立
    expect(neutral).toHaveLength(30);
    // 自軍の陣地 7 + 右の島 16 + 小島 8 = 31 拠点でちょうど敵軍の 31 拠点に並ぶ
    const reachableWithoutInvasion = 7 + neutral.filter((pos) => !isLeft(pos)).length;
    expect(reachableWithoutInvasion).toBe(31);
  });
});
