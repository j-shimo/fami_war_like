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

/**
 * 先手番ハンデとして、中央の山地帯より後手番側(東)にだけ多く置いた中立都市。
 * 左右対称位置((2,3)・(2,5)・(1,6))は平地のままで、盤面はこの 3 マスだけ非対称になる。
 */
const HANDICAP_CITIES: readonly GridPosition[] = [
  { col: 37, row: 3 },
  { col: 37, row: 5 },
  { col: 38, row: 6 },
];

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
    // 歩兵は山を乗り越えられるので、両方塞がれても east へ回り込める
    const withoutBothInfantry = (pos: GridPosition): boolean =>
      !bothClosed.has(key(pos)) && passable(map, 'infantry')(pos);
    expect(floodFill(map, PLAYER_HQ, withoutBothInfantry).has(key(ENEMY_HQ))).toBe(true);
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

  it('中央の山地帯より後手番側に中立都市を 3 個多く置く(先手番ハンデ)', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const cities = collect(map, (tile) => tile.terrainType === 'city');
    const west = cities.filter((pos) => pos.col < MOUNTAIN_BELT_COLS[0]);
    const east = cities.filter(
      (pos) => pos.col > MOUNTAIN_BELT_COLS[MOUNTAIN_BELT_COLS.length - 1],
    );
    expect(west).toHaveLength(11);
    expect(east).toHaveLength(14);
    // 山地帯の中に都市は置かない(関門は純粋な地形だけで作る)
    expect(cities).toHaveLength(west.length + east.length);

    for (const pos of HANDICAP_CITIES) {
      const tile = map.getTile(pos);
      expect(tile?.terrainType).toBe('city');
      expect(tile?.owner).toBe('neutral');
      // どれも敵軍の生産拠点に隣接していて、生産した歩兵がすぐ占領に入れる
      const nextToEnemyBase = neighbors(pos).some((next) => {
        const neighbor = map.getTile(next);
        return (
          neighbor?.owner === 'enemy' && getTerrainData(neighbor.terrainType).canProduce
        );
      });
      expect(nextToEnemyBase).toBe(true);
      // 自軍側の左右対称位置は平地のままで、同じ収入は得られない
      expect(
        map.getTile({ col: map.cols - 1 - pos.col, row: pos.row })?.terrainType,
      ).toBe('plain');
    }
  });

  it('ハンデの 3 マスを除けば盤面は左右対称', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const exempt = new Set(
      HANDICAP_CITIES.flatMap((pos) => [
        key(pos),
        key({ col: map.cols - 1 - pos.col, row: pos.row }),
      ]),
    );
    map.forEachTile((tile) => {
      if (exempt.has(key(tile.position))) return;
      const mirrored = map.getTile({
        col: map.cols - 1 - tile.position.col,
        row: tile.position.row,
      });
      expect(mirrored?.terrainType).toBe(tile.terrainType);
    });
  });

  it('占領できる拠点を 37 個持ち、取り切れば高額ユニットに手が届く', () => {
    const map = MapManager.fromDefinition(LONG_ISLAND_MAP);
    const capturable = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture,
    );
    expect(capturable).toHaveLength(37);
    // うち 25 個は中立(両軍の初期所有は 6 拠点ずつ)
    const neutral = capturable.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(neutral).toHaveLength(25);
  });
});
