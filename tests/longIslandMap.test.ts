import { describe, expect, it } from 'vitest';
import type { GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { UnitManager } from '@/core/units/UnitManager';
import { LONG_ISLAND_MAP } from '@/data/maps/longIslandMap';
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

/**
 * start から pass を満たすマスだけを幅優先でたどり、到達できたマスの集合を返す。
 * 陸地が一つながりか、移動タイプ別にどこまで行けるかの検証に使う。
 */
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

/** 自軍本拠地・敵軍本拠地の位置(街道の両端) */
const PLAYER_HQ: GridPosition = { col: 1, row: 4 };
const ENEMY_HQ: GridPosition = { col: 38, row: 4 };

/** 島を東西に断ち切る中央の山地帯が占める列 */
const MOUNTAIN_BELT_COLS = [18, 19, 20, 21];

/** 山地帯を貫く峠道(row 4 の街道)。ここが装輪車両の唯一の通り道になる */
const MOUNTAIN_PASS: readonly GridPosition[] = MOUNTAIN_BELT_COLS.map((col) => ({
  col,
  row: 4,
}));

/** 山地帯を迂回する北の森の間道(row 1 の森)。歩兵と装軌車両だけが通れる */
const FOREST_BYPASS: readonly GridPosition[] = MOUNTAIN_BELT_COLS.map((col) => ({
  col,
  row: 1,
}));

/** 山地帯の両端の麓に置いた中立空港(西の麓・東の麓に 1 つずつ) */
const PASS_AIRPORTS: readonly GridPosition[] = [
  { col: 17, row: 3 },
  { col: 22, row: 5 },
];

/** 山地帯の両端の北岸・南岸に置いた中立港 4 つ */
const PASS_PORTS: readonly GridPosition[] = [
  { col: 17, row: 1 },
  { col: 17, row: 7 },
  { col: 22, row: 1 },
  { col: 22, row: 7 },
];

/**
 * 先手番ハンデとして、中央の山地帯より後手番側にだけ多く置いた中立拠点。
 * 中立都市 3 個と中立空港 1 個で、いずれも敵軍の陣地側にある。
 */
const HANDICAP_CITIES: readonly GridPosition[] = [
  { col: 38, row: 3 },
  { col: 37, row: 5 },
  { col: 38, row: 6 },
];
const HANDICAP_AIRPORT: GridPosition = { col: 34, row: 6 };

describe('LONG_ISLAND_MAP(長島街道マップ)', () => {
  it('縦10・横40 のかなりの横長サイズで生成できる', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    expect(map.cols).toBe(40);
    expect(map.rows).toBe(10);
    // 横が縦の 4 倍ある横長マップであること
    expect(map.cols).toBe(map.rows * 4);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const manager = UnitManager.fromPlacements(LONG_ISLAND_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0 で、開始時の収入 6000 だけで立ち上げる', () => {
    expect(LONG_ISLAND_MAP.initialFunds).toBe(0);
  });

  it('自軍・敵軍は本拠地 1・工場 2・空港 2・港 1 の計 6 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const owned = {
      player: { total: 0, headquarters: 0, factory: 0, airport: 0, port: 0 },
      enemy: { total: 0, headquarters: 0, factory: 0, airport: 0, port: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const side = owned[tile.owner];
      side.total += 1;
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
      if (tile.terrainType === 'port') side.port += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.total).toBe(6);
      expect(side.headquarters).toBe(1);
      expect(side.factory).toBe(2);
      expect(side.airport).toBe(2);
      expect(side.port).toBe(1);
    }
  });

  it('自軍は西端、敵軍は東端に陣地を構える', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const playerHq = map.getTile(PLAYER_HQ);
    expect(playerHq?.terrainType).toBe('headquarters');
    expect(playerHq?.owner).toBe('player');
    const enemyHq = map.getTile(ENEMY_HQ);
    expect(enemyHq?.terrainType).toBe('headquarters');
    expect(enemyHq?.owner).toBe('enemy');
  });

  it('盤面の外周はすべて海で、陸地は海に囲まれている', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      const onEdge =
        col === 0 || row === 0 || col === map.cols - 1 || row === map.rows - 1;
      if (onEdge) expect(tile.terrainType).toBe('sea');
    });
  });

  it('陸地は一つながりの島 1 つだけで、小島は存在しない', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const onLand = passable(map, 'infantry');
    const landTiles = collect(map, (tile) => onLand(tile.position));
    // 自軍本拠地から歩いてすべての陸マスへ到達できる = 陸地は 1 つの塊
    const island = floodFill(map, PLAYER_HQ, onLand);
    expect(island.size).toBe(landTiles.length);
    expect(island.has(key(ENEMY_HQ))).toBe(true);
  });

  it('街道は途切れず分かれ道もない一本道で、両端が両軍の本拠地に接する', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const roads = collect(map, (tile) => tile.terrainType === 'road');
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';

    // どの道路マスも隣接する道路が 1 本(端)か 2 本(途中)。3 本以上なら分かれ道になる。
    const ends: GridPosition[] = [];
    for (const pos of roads) {
      const linked = neighbors(pos).filter(
        (next) => map.isInBounds(next) && isRoad(next),
      );
      expect(linked.length).toBeGreaterThanOrEqual(1);
      expect(linked.length).toBeLessThanOrEqual(2);
      if (linked.length === 1) ends.push(pos);
    }
    // 端は 2 つだけ(1 本の線分)
    expect(ends).toHaveLength(2);
    // すべての道路がひとつながり(途切れていない)
    expect(floodFill(map, roads[0], isRoad).size).toBe(roads.length);
    // 両端はそれぞれ本拠地に接している = 街道が両拠点を結んでいる
    const hqOf = (pos: GridPosition): GridPosition | undefined =>
      neighbors(pos).find((next) => map.getTile(next)?.terrainType === 'headquarters');
    const linkedHqs = ends.map((end) => hqOf(end)).filter((pos) => pos !== undefined);
    expect(linkedHqs).toHaveLength(2);
    expect(new Set(linkedHqs.map((pos) => key(pos as GridPosition)))).toEqual(
      new Set([key(PLAYER_HQ), key(ENEMY_HQ)]),
    );
  });

  it('中央の山地帯が島を東西に断ち切り、塞ぐと歩兵でも往来できない', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const onLand = passable(map, 'infantry');
    const belt = new Set(MOUNTAIN_BELT_COLS);
    const blocked = (pos: GridPosition): boolean => onLand(pos) && !belt.has(pos.col);
    // 山地帯を通れないものとすると、西の自軍陣地から東の敵軍陣地へは行けない
    expect(floodFill(map, PLAYER_HQ, blocked).has(key(ENEMY_HQ))).toBe(false);
  });

  it('峠道を塞ぐと装輪車両は東西を行き来できないが、装軌車両は北の森を迂回できる', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const closed = new Set(MOUNTAIN_PASS.map(key));
    const withoutPass = (movementType: MovementType) => (pos: GridPosition) =>
      !closed.has(key(pos)) && passable(map, movementType)(pos);

    // 装輪車両(偵察車・ロケット砲)は森・山へ入れないため、峠道が唯一のルート
    expect(floodFill(map, PLAYER_HQ, withoutPass('wheeled')).has(key(ENEMY_HQ))).toBe(
      false,
    );
    // 装軌車両は北の森の間道(row 1)を通って迂回できる
    expect(floodFill(map, PLAYER_HQ, withoutPass('vehicle')).has(key(ENEMY_HQ))).toBe(
      true,
    );

    // 峠道と森の間道の両方を塞げば、装軌車両も東西を行き来できなくなる
    const bothClosed = new Set([...closed, ...FOREST_BYPASS.map(key)]);
    const withoutBoth = (pos: GridPosition): boolean =>
      !bothClosed.has(key(pos)) && passable(map, 'vehicle')(pos);
    expect(floodFill(map, PLAYER_HQ, withoutBoth).has(key(ENEMY_HQ))).toBe(false);
    // 歩兵は山を乗り越えられるので、両方塞がれても敵陣へ回り込める
    const withoutBothInfantry = (pos: GridPosition): boolean =>
      !bothClosed.has(key(pos)) && passable(map, 'infantry')(pos);
    expect(floodFill(map, PLAYER_HQ, withoutBothInfantry).has(key(ENEMY_HQ))).toBe(true);
  });

  it('山地帯を境に東西の地形を作り分けている(鏡写しではない)', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    // 左右反転して地形が一致するマスは半分程度しかない = 鏡写しの盤面ではない
    let mirrored = 0;
    let compared = 0;
    map.forEachTile((tile) => {
      if (tile.position.col >= map.cols / 2) return;
      compared += 1;
      const opposite = map.getTile({
        col: map.cols - 1 - tile.position.col,
        row: tile.position.row,
      });
      if (opposite?.terrainType === tile.terrainType) mirrored += 1;
    });
    expect(mirrored).toBeLessThan(compared * 0.7);

    // 西は森が多く、東は平地が多い。街道を外れたときの通りやすさが東西で変わる。
    const countIn = (from: number, to: number, terrain: string): number =>
      collect(
        map,
        (tile) =>
          tile.position.col >= from &&
          tile.position.col <= to &&
          tile.terrainType === terrain,
      ).length;
    const westForest = countIn(1, 17, 'forest');
    const eastForest = countIn(22, 38, 'forest');
    const westPlain = countIn(1, 17, 'plain');
    const eastPlain = countIn(22, 38, 'plain');
    expect(westForest).toBeGreaterThan(eastForest);
    expect(eastPlain).toBeGreaterThan(westPlain);
  });

  it('西の街道は折り返しの内側が森で、装輪車両は近道できない', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    // 九十九折りの内側。街道 2 本に挟まれた森で、装輪車両はここを突っ切れない。
    for (const pos of [
      { col: 5, row: 4 },
      { col: 9, row: 4 },
      { col: 13, row: 4 },
      { col: 15, row: 5 },
    ]) {
      expect(map.getTile(pos)?.terrainType).toBe('forest');
      expect(map.getMoveCost(pos, 'wheeled')).toBeNull();
      // 左右はどちらも街道(この森が無ければ 1 マスの近道になっていた)
      expect(map.getTile({ col: pos.col - 1, row: pos.row })?.terrainType).toBe('road');
      expect(map.getTile({ col: pos.col + 1, row: pos.row })?.terrainType).toBe('road');
    }
  });

  it('海は島をぐるりと一周する一続きで、両軍の港が同じ海域につながっている', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const onSea = passable(map, 'sea');
    // 自軍の港から出航して敵軍の港まで到達できる
    const reachable = floodFill(map, { col: 1, row: 7 }, onSea);
    expect(reachable.has(key({ col: 38, row: 7 }))).toBe(true);
    // 海・海岸・港はすべてこの一続きの海域に含まれる(閉じた湖を作らない)
    for (const pos of collect(map, (tile) => onSea(tile.position))) {
      expect(reachable.has(key(pos))).toBe(true);
    }
  });

  it('山地帯の両端の麓に中立空港を 1 つずつ置いている', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    for (const pos of PASS_AIRPORTS) {
      const tile = map.getTile(pos);
      expect(tile?.terrainType).toBe('airport');
      expect(tile?.owner).toBe('neutral');
      // 山地帯に隣接する麓の空港であること
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'mountain'),
      ).toBe(true);
    }
    // 西の麓・東の麓に 1 つずつ(山地帯を挟んで反対側にある)
    expect(PASS_AIRPORTS[0].col).toBeLessThan(MOUNTAIN_BELT_COLS[0]);
    expect(PASS_AIRPORTS[1].col).toBeGreaterThan(
      MOUNTAIN_BELT_COLS[MOUNTAIN_BELT_COLS.length - 1],
    );
  });

  it('山地帯の両端の北岸・南岸に中立港を 1 つずつ、計 4 つ置いている', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const neutralPorts = collect(
      map,
      (tile) => tile.terrainType === 'port' && tile.owner === 'neutral',
    );
    expect(neutralPorts).toHaveLength(4);
    expect(new Set(neutralPorts.map(key))).toEqual(new Set(PASS_PORTS.map(key)));
    for (const pos of PASS_PORTS) {
      // 山地帯のすぐ隣で、艦艇が出入りできる海に面していること
      expect(Math.min(...MOUNTAIN_BELT_COLS.map((col) => Math.abs(col - pos.col)))).toBe(
        1,
      );
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
    // 北岸(row 1)と南岸(row 7)に 2 つずつ
    expect(PASS_PORTS.filter((pos) => pos.row === 1)).toHaveLength(2);
    expect(PASS_PORTS.filter((pos) => pos.row === 7)).toHaveLength(2);
  });

  it('すべての港は海に隣接し、上陸地点となる海岸を南北の海岸線に配置している', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    for (const pos of collect(map, (tile) => tile.terrainType === 'port')) {
      const openToSea = neighbors(pos).some(
        (next) => map.getTile(next)?.terrainType === 'sea',
      );
      expect(openToSea).toBe(true);
    }
    const beaches = collect(map, (tile) => tile.terrainType === 'beach');
    expect(beaches.length).toBeGreaterThanOrEqual(12);
    for (const pos of beaches) {
      // 海岸は地上ユニットも海上ユニットも進入できる(輸送艦を着けて上陸・乗船できる)
      expect(map.getMoveCost(pos, 'infantry')).not.toBeNull();
      expect(map.getMoveCost(pos, 'sea')).not.toBeNull();
      // 海に面していない海岸は上陸地点にならない
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
  });

  it('中央の山地帯より後手番側に中立都市を 3 個・中立空港を 1 個多く置く(先手番ハンデ)', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const west = MOUNTAIN_BELT_COLS[0];
    const east = MOUNTAIN_BELT_COLS[MOUNTAIN_BELT_COLS.length - 1];
    const cities = collect(map, (tile) => tile.terrainType === 'city');
    expect(cities.filter((pos) => pos.col < west)).toHaveLength(11);
    expect(cities.filter((pos) => pos.col > east)).toHaveLength(14);
    // 山地帯の中に都市は置かない(関門は純粋な地形だけで作る)
    expect(cities).toHaveLength(25);

    const neutralAirports = collect(
      map,
      (tile) => tile.terrainType === 'airport' && tile.owner === 'neutral',
    );
    expect(neutralAirports).toHaveLength(3);
    expect(neutralAirports.filter((pos) => pos.col < west)).toHaveLength(1);
    expect(neutralAirports.filter((pos) => pos.col > east)).toHaveLength(2);

    // 多く置いた中立都市 3 個は、いずれも敵軍の生産拠点の隣にあり CPU が確実に取り切れる
    for (const pos of HANDICAP_CITIES) {
      const tile = map.getTile(pos);
      expect(tile?.terrainType).toBe('city');
      expect(tile?.owner).toBe('neutral');
      const nextToEnemyBase = neighbors(pos).some((next) => {
        const neighbor = map.getTile(next);
        return (
          neighbor?.owner === 'enemy' && getTerrainData(neighbor.terrainType).canProduce
        );
      });
      expect(nextToEnemyBase).toBe(true);
    }
    // 多く置いた中立空港は敵軍陣地の近く(自軍本拠地からは盤面の反対側)にある
    const handicapAirport = map.getTile(HANDICAP_AIRPORT);
    expect(handicapAirport?.terrainType).toBe('airport');
    expect(handicapAirport?.owner).toBe('neutral');
    expect(HANDICAP_AIRPORT.col).toBeGreaterThan(
      MOUNTAIN_BELT_COLS[MOUNTAIN_BELT_COLS.length - 1],
    );
    expect(Math.abs(HANDICAP_AIRPORT.col - ENEMY_HQ.col)).toBeLessThan(
      Math.abs(HANDICAP_AIRPORT.col - PLAYER_HQ.col),
    );
  });

  it('占領できる拠点を 44 個持ち、取り切れば高額ユニットに手が届く', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const capturable = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture,
    );
    expect(capturable).toHaveLength(44);
    // うち 32 個は中立(両軍の初期所有は 6 拠点ずつ)
    const neutral = capturable.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(neutral).toHaveLength(32);
  });
});
