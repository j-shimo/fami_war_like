import { describe, expect, it } from 'vitest';
import type { GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { UnitManager } from '@/core/units/UnitManager';
import { MAP_LIST } from '@/data/maps';
import { TWIN_CONTINENTS_MAP } from '@/data/maps/twinContinentsMap';
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

/** 自軍本拠地(西の島)・敵軍本拠地(東の島) */
const PLAYER_HQ: GridPosition = { col: 2, row: 13 };
const ENEMY_HQ: GridPosition = { col: 39, row: 13 };

/** 中央の海峡が占める列(row 11〜14 だけ col 20〜21 まで狭まる) */
const STRAIT_COLS = [18, 19, 20, 21, 22, 23];

/** 海峡に架かる 3 本の橋(北・中央・南)。地上ユニットが東西を行き来できる唯一の道 */
const BRIDGE_ROWS = [8, 12, 17];
const BRIDGES: readonly (readonly GridPosition[])[] = BRIDGE_ROWS.map((row) =>
  STRAIT_COLS.map((col) => ({ col, row })),
);

/** 北の橋・南の橋で、実際に海の上を渡る区間(両岸の岬に挟まれた col 19〜22 の 4 マス) */
const OUTER_BRIDGE_SEA_COLS = [19, 20, 21, 22];
/** 北の橋・南の橋の両岸から海峡へ張り出した岬(橋を短くしている陸地) */
const CAPES: readonly GridPosition[] = [
  { col: 18, row: 7 },
  { col: 23, row: 7 },
  { col: 18, row: 9 },
  { col: 23, row: 9 },
  { col: 18, row: 16 },
  { col: 23, row: 16 },
  { col: 18, row: 18 },
  { col: 23, row: 18 },
];

/** 盤面の上下の端に浮かぶ 2 島(北の島・南の島)の代表マス */
const NORTH_ISLAND: GridPosition = { col: 20, row: 2 };
const SOUTH_ISLAND: GridPosition = { col: 20, row: 23 };

/** 東の島で北岸沿いを走る街道のうち、海に近い区間(row 4 の東進と col 39 の南下) */
const COASTAL_ROAD: readonly GridPosition[] = [
  ...[32, 33, 34, 35, 36, 37, 38, 39].map((col) => ({ col, row: 4 })),
  ...[5, 6, 7, 8, 9, 10].map((row) => ({ col: 39, row })),
];

/** 東の島で 3 ルートが 1 本に合流する地点 */
const JUNCTION: GridPosition = { col: 29, row: 12 };

/** 西の島の中立拠点(都市 19・空港 1・港 2) */
const LEFT_NEUTRAL_AIRPORT: GridPosition = { col: 14, row: 11 };
const LEFT_NEUTRAL_PORTS: readonly GridPosition[] = [
  { col: 9, row: 1 },
  { col: 11, row: 24 },
];

/** 東の島で道路から離れた場所に点在する敵軍の都市 */
const OFF_ROAD_ENEMY_CITIES: readonly GridPosition[] = [
  { col: 26, row: 3 },
  { col: 30, row: 4 },
  { col: 34, row: 6 },
  { col: 36, row: 8 },
  { col: 26, row: 21 },
  { col: 33, row: 21 },
  { col: 37, row: 20 },
];

/** 西の島(col 1〜17)・東の島(col 24〜40) */
const isWest = (pos: GridPosition): boolean => pos.col <= 17;
const isEast = (pos: GridPosition): boolean => pos.col >= 24;
const isStrait = (pos: GridPosition): boolean => pos.col >= 18 && pos.col <= 23;

describe('TWIN_CONTINENTS_MAP(双大陸マップ)', () => {
  it('縦26・横42 の既存マップで最大の盤面で生成できる', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    expect(map.cols).toBe(42);
    expect(map.rows).toBe(26);
    // 横幅も総マス数も、ほかのどのマップより広いこと
    // (縦だけは、上下に島を並べる二島鉄路マップ(30x32)のほうが長い)
    for (const entry of MAP_LIST) {
      if (entry.id === 'twinContinents') continue;
      const other = MapManager.fromDefinition(entry.definition);
      expect(map.cols).toBeGreaterThan(other.cols);
      expect(map.cols * map.rows).toBeGreaterThan(other.cols * other.rows);
    }
  });

  it('激ムズマップ(extra)として一覧に登録されている', () => {
    const entry = MAP_LIST.find((item) => item.id === 'twinContinents');
    expect(entry?.category).toBe('extra');
    expect(entry?.definition).toBe(TWIN_CONTINENTS_MAP);
  });

  it('初期資金は 20000 で、自軍は収入 8000・敵軍は収入 29000 で始まる', () => {
    expect(TWIN_CONTINENTS_MAP.initialFunds).toBe(20000);
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const owned = { player: 0, enemy: 0 };
    map.forEachTile((tile) => {
      if (tile.owner === 'player') owned.player += 1;
      if (tile.owner === 'enemy') owned.enemy += 1;
    });
    expect(owned.player).toBe(8);
    expect(owned.enemy).toBe(29);
  });

  it('両軍とも本拠地 1・工場 3・空港 2・港 2 の陣地を持ち、生産力は同じ', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const owned = {
      player: { headquarters: 0, factory: 0, airport: 0, port: 0 },
      enemy: { headquarters: 0, factory: 0, airport: 0, port: 0 },
    };
    // 陣地(自軍は col 1〜4、敵軍は col 37〜40 の row 11〜15)だけを数える。
    // 東の島には敵軍が占領済みの空港・港がほかにもあるため、範囲を区切って比べる。
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const { col, row } = tile.position;
      const inBase = row >= 11 && row <= 15 && (col <= 4 || col >= 37);
      if (!inBase) return;
      const side = owned[tile.owner];
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
      if (tile.terrainType === 'port') side.port += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.headquarters).toBe(1);
      expect(side.factory).toBe(3);
      expect(side.airport).toBe(2);
      expect(side.port).toBe(2);
    }
    // 自軍は西の島、敵軍は東の島に陣地を構える
    expect(map.getTile(PLAYER_HQ)?.owner).toBe('player');
    expect(map.getTile(ENEMY_HQ)?.owner).toBe('enemy');
  });

  it('自軍は都市を 1 個も占領していない', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const playerCities = collect(
      map,
      (tile) => tile.terrainType === 'city' && tile.owner === 'player',
    );
    expect(playerCities).toHaveLength(0);
  });

  it('盤面の外周はすべて海で、陸地は外洋に囲まれている', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      const onEdge =
        col === 0 || row === 0 || col === map.cols - 1 || row === map.rows - 1;
      if (onEdge) expect(tile.terrainType).toBe('sea');
    });
  });

  it('中央の海峡が本島を東西に断ち切り、3 本の橋を落とすと歩兵でも渡れない', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const onLand = passable(map, 'infantry');
    const closed = new Set(BRIDGES.flat().map(key));
    const withoutBridges = (pos: GridPosition): boolean =>
      onLand(pos) && !closed.has(key(pos));
    expect(floodFill(map, PLAYER_HQ, withoutBridges).has(key(ENEMY_HQ))).toBe(false);
    // 橋がそろっていれば、装輪車両(森・山に入れない)でも東西を行き来できる
    expect(floodFill(map, PLAYER_HQ, passable(map, 'wheeled')).has(key(ENEMY_HQ))).toBe(
      true,
    );
  });

  it('橋は 3 本あり、1 本を塞がれても残り 2 本で進軍できる', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    for (const bridge of BRIDGES) {
      // 橋はすべて道路(防御 0)で、海の上を一直線に渡る
      for (const pos of bridge) {
        expect(map.getTile(pos)?.terrainType).toBe('road');
      }
      const closed = new Set(bridge.map(key));
      const detour = (pos: GridPosition): boolean =>
        passable(map, 'wheeled')(pos) && !closed.has(key(pos));
      expect(floodFill(map, PLAYER_HQ, detour).has(key(ENEMY_HQ))).toBe(true);
    }
    // 海峡を渡る道路はこの 3 本だけ(4 本目の抜け道はない)
    const straitRoads = collect(
      map,
      (tile) => isStrait(tile.position) && tile.terrainType === 'road',
    );
    expect(new Set(straitRoads.map((pos) => pos.row))).toEqual(new Set(BRIDGE_ROWS));
  });

  it('北と南の橋は両岸の岬に挟まれ、海の上を渡るのは 4 マスだけ', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const isSea = (pos: GridPosition): boolean => map.getTile(pos)?.terrainType === 'sea';
    // 岬(col 18・col 23)は陸で、橋の袂を支えている
    for (const pos of CAPES) {
      expect(isSea(pos)).toBe(false);
      expect(map.getMoveCost(pos, 'infantry')).not.toBeNull();
    }
    for (const row of [8, 17]) {
      // 橋の下が海なのは col 19〜22 の 4 マス。両端の col 18・col 23 は岬の上を走る
      const overSea = STRAIT_COLS.filter((col) =>
        [
          { col, row: row - 1 },
          { col, row: row + 1 },
        ].every((pos) => isSea(pos)),
      );
      expect(overSea).toEqual(OUTER_BRIDGE_SEA_COLS);
    }
    // 中央の橋はさらに短く、海の上を渡るのは col 20〜21 の 2 マス
    const centerOverSea = STRAIT_COLS.filter((col) =>
      [
        { col, row: 11 },
        { col, row: 13 },
      ].every((pos) => isSea(pos)),
    );
    expect(centerOverSea).toEqual([20, 21]);
  });

  it('海峡は北口と南口だけが外洋につながり、橋に挟まれた水域は内海になる', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const onSea = passable(map, 'sea');
    const ocean = floodFill(map, { col: 0, row: 0 }, onSea);
    // 両軍の港・中立港はすべて外洋につながっている(閉じ込められる港はない)
    for (const pos of collect(map, (tile) => tile.terrainType === 'port')) {
      expect(ocean.has(key(pos))).toBe(true);
    }
    // 橋と橋に挟まれた水域(row 9〜11・13〜16)は外洋から切り離されている
    const inner = collect(map, (tile) => onSea(tile.position)).filter(
      (pos) => !ocean.has(key(pos)),
    );
    expect(inner).toHaveLength(26);
    for (const pos of inner) {
      expect(isStrait(pos)).toBe(true);
      expect(pos.row > 8 && pos.row < 17).toBe(true);
    }
  });

  it('盤面の上下の 2 島は橋とつながっておらず、輸送でしか渡れない中立拠点を持つ', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const onLand = passable(map, 'infantry');
    for (const start of [NORTH_ISLAND, SOUTH_ISLAND]) {
      const island = floodFill(map, start, onLand);
      // 盤面の端に張り付いた横長(5x3)の独立した島で、どちらの本島ともつながっていない
      expect(island.size).toBe(15);
      expect(
        Math.max(...[...island].map((k) => Number(k.split(',')[1]))) -
          Math.min(...[...island].map((k) => Number(k.split(',')[1]))),
      ).toBe(2);
      expect(island.has(key(PLAYER_HQ))).toBe(false);
      expect(island.has(key(ENEMY_HQ))).toBe(false);

      const tiles = [...island].map((k) => {
        const [col, row] = k.split(',').map(Number);
        return map.getTile({ col, row });
      });
      // 中立都市 3・中立空港 1・中立港 1 と、東西の端に上陸用の海岸を 1 マスずつ持つ
      expect(tiles.filter((tile) => tile?.terrainType === 'city')).toHaveLength(3);
      expect(tiles.filter((tile) => tile?.terrainType === 'airport')).toHaveLength(1);
      expect(tiles.filter((tile) => tile?.terrainType === 'port')).toHaveLength(1);
      expect(tiles.filter((tile) => tile?.terrainType === 'beach')).toHaveLength(2);
      for (const tile of tiles) {
        if (tile && getTerrainData(tile.terrainType).canCapture) {
          expect(tile.owner).toBe('neutral');
        }
      }
    }
  });

  it('西の島は中立都市 19・中立空港 1・中立港 2 をすべて中立のまま持つ', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const westNeutral = collect(
      map,
      (tile) =>
        isWest(tile.position) &&
        tile.owner === 'neutral' &&
        getTerrainData(tile.terrainType).canCapture,
    );
    expect(
      westNeutral.filter((pos) => map.getTile(pos)?.terrainType === 'city'),
    ).toHaveLength(19);
    expect(
      westNeutral.filter((pos) => map.getTile(pos)?.terrainType === 'airport'),
    ).toHaveLength(1);
    expect(
      westNeutral.filter((pos) => map.getTile(pos)?.terrainType === 'port'),
    ).toHaveLength(2);
    expect(westNeutral).toHaveLength(22);

    // 中立空港は山に囲まれた盆地、中立港は島の北の岬と南の岬にある
    expect(map.getTile(LEFT_NEUTRAL_AIRPORT)?.terrainType).toBe('airport');
    expect(
      neighbors(LEFT_NEUTRAL_AIRPORT).some(
        (pos) => map.getTile(pos)?.terrainType === 'mountain',
      ),
    ).toBe(true);
    const ports = LEFT_NEUTRAL_PORTS.map((pos) => map.getTile(pos));
    expect(ports.every((tile) => tile?.terrainType === 'port')).toBe(true);
    expect(LEFT_NEUTRAL_PORTS[0].row).toBeLessThan(LEFT_NEUTRAL_PORTS[1].row);
  });

  it('西の島の道路網はひとつながりで、中立都市はすべて道路に隣接している', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    const roads = collect(map, (tile) => tile.terrainType === 'road');
    // 橋でつながっているため、盤面の道路はすべて 1 つの路線網になる
    expect(floodFill(map, roads[0], isRoad).size).toBe(roads.length);

    const westCities = collect(
      map,
      (tile) => isWest(tile.position) && tile.terrainType === 'city',
    );
    expect(westCities).toHaveLength(19);
    for (const pos of westCities) {
      expect(neighbors(pos).some((next) => isRoad(next))).toBe(true);
    }
  });

  it('東の島は敵軍が都市 17・空港 2・港 2 を占領済みで、中立拠点は残っていない', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const eastCapturable = collect(
      map,
      (tile) => isEast(tile.position) && getTerrainData(tile.terrainType).canCapture,
    );
    for (const pos of eastCapturable) {
      expect(map.getTile(pos)?.owner).toBe('enemy');
    }
    // 陣地(本拠地 1・工場 3・空港 2・港 2)を除いた島の拠点が 21 個
    const cities = eastCapturable.filter(
      (pos) => map.getTile(pos)?.terrainType === 'city',
    );
    const airports = eastCapturable.filter(
      (pos) => map.getTile(pos)?.terrainType === 'airport',
    );
    const ports = eastCapturable.filter(
      (pos) => map.getTile(pos)?.terrainType === 'port',
    );
    expect(cities).toHaveLength(17);
    expect(airports).toHaveLength(4); // 島の 2 個 + 陣地の 2 個
    expect(ports).toHaveLength(4); // 島の 2 個 + 陣地の 2 個
  });

  it('東の島は 3 ルートが 1 本に合流してから敵陣地へつながる', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    expect(isRoad(JUNCTION)).toBe(true);

    // 合流点を塞ぐと、どの橋から入っても道路だけでは敵陣地へたどり着けない
    const closed = new Set([key(JUNCTION)]);
    const roadOnly = (pos: GridPosition): boolean => isRoad(pos) && !closed.has(key(pos));
    for (const row of BRIDGE_ROWS) {
      const entrance = { col: 24, row };
      expect(isRoad(entrance)).toBe(true);
      expect(floodFill(map, entrance, roadOnly).has(key({ col: 38, row: 13 }))).toBe(
        false,
      );
    }
    // 合流点を通れば 3 本ともつながっている
    for (const row of BRIDGE_ROWS) {
      expect(
        floodFill(map, { col: 24, row }, isRoad).has(key({ col: 38, row: 13 })),
      ).toBe(true);
    }
  });

  it('東の島の街道は合流点から北岸沿いを回って敵陣地へ入る', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    const onSea = passable(map, 'sea');
    // 海までの距離(海上ユニットからどれだけ近いか)を幅優先で測る
    const seaDistance = (from: GridPosition): number => {
      const seen = new Set([key(from)]);
      let frontier: GridPosition[] = [from];
      for (let distance = 0; distance < 10; distance += 1) {
        const next: GridPosition[] = [];
        for (const pos of frontier) {
          if (onSea(pos)) return distance;
          for (const around of neighbors(pos)) {
            if (!map.isInBounds(around) || seen.has(key(around))) continue;
            seen.add(key(around));
            next.push(around);
          }
        }
        frontier = next;
      }
      return Infinity;
    };
    for (const pos of COASTAL_ROAD) {
      expect(isRoad(pos)).toBe(true);
      // 街道は海から 3 マス以内。戦艦(射程 3〜6)の射程に入る位置を通る
      expect(seaDistance(pos)).toBeLessThanOrEqual(3);
    }
    // 合流点から敵陣地までの道路は、この北岸ルートを通らないとつながらない
    const closed = new Set(COASTAL_ROAD.map(key));
    const detour = (pos: GridPosition): boolean => isRoad(pos) && !closed.has(key(pos));
    expect(floodFill(map, JUNCTION, detour).has(key({ col: 38, row: 13 }))).toBe(false);
  });

  it('東の島は内陸を山の背骨が塞ぎ、地上部隊は北岸か南岸を回るしかない', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    // 内陸(row 6〜15)だけを通って敵陣地へ抜けることはできない
    const inland = (pos: GridPosition): boolean =>
      passable(map, 'vehicle')(pos) && pos.row >= 6 && pos.row <= 15;
    for (const row of BRIDGE_ROWS) {
      if (row < 6 || row > 15) continue;
      expect(floodFill(map, { col: 24, row }, inland).has(key(ENEMY_HQ))).toBe(false);
    }
    // 北岸(row 5 以北)を通れば、南回りを封じられていても敵陣地へたどり着ける
    const northOnly = (pos: GridPosition): boolean =>
      passable(map, 'vehicle')(pos) && pos.row < 16;
    expect(floodFill(map, { col: 24, row: 8 }, northOnly).has(key(ENEMY_HQ))).toBe(true);
    // 南回り(row 16 以南)だけでも同じくたどり着ける
    const southOnly = (pos: GridPosition): boolean =>
      passable(map, 'vehicle')(pos) && pos.row > 5;
    expect(floodFill(map, { col: 24, row: 8 }, southOnly).has(key(ENEMY_HQ))).toBe(true);
  });

  it('東の島の都市は道路から離れた場所にも点在する', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const isRoad = (pos: GridPosition): boolean =>
      map.getTile(pos)?.terrainType === 'road';
    const eastCities = collect(
      map,
      (tile) => isEast(tile.position) && tile.terrainType === 'city',
    );
    const offRoad = eastCities.filter(
      (pos) => !neighbors(pos).some((next) => isRoad(next)),
    );
    expect(new Set(offRoad.map(key))).toEqual(new Set(OFF_ROAD_ENEMY_CITIES.map(key)));
    expect(offRoad).toHaveLength(7);
  });

  it('西の島は山・森・平地をバランスよく持ち、東の島は平地が多い', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const countIn = (within: (pos: GridPosition) => boolean, terrain: string): number =>
      collect(map, (tile) => within(tile.position) && tile.terrainType === terrain)
        .length;

    // 西は森・山が厚く、東は平地が広い(同じ 17 列ぶんの島で比べる)
    expect(countIn(isWest, 'forest')).toBeGreaterThan(countIn(isEast, 'forest') * 2);
    expect(countIn(isWest, 'mountain')).toBeGreaterThan(countIn(isEast, 'mountain'));
    expect(countIn(isEast, 'plain')).toBeGreaterThan(countIn(isWest, 'plain') * 1.5);
    // 西の島にも平地は十分ある(森と山だけの島ではない)
    expect(countIn(isWest, 'plain')).toBeGreaterThan(100);
  });

  it('すべての港・海岸は海に面しており、上陸地点として機能する', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    for (const pos of collect(map, (tile) => tile.terrainType === 'port')) {
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
    const beaches = collect(map, (tile) => tile.terrainType === 'beach');
    expect(beaches.length).toBeGreaterThanOrEqual(30);
    for (const pos of beaches) {
      expect(map.getMoveCost(pos, 'infantry')).not.toBeNull();
      expect(map.getMoveCost(pos, 'sea')).not.toBeNull();
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
  });

  it('敵軍だけが初期部隊を持ち、10 体すべてが東の島に配置されている', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const manager = UnitManager.fromPlacements(TWIN_CONTINENTS_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);

    const enemies = manager.getUnitsByArmy('enemy');
    expect(enemies).toHaveLength(10);
    for (const unit of enemies) {
      expect(isEast(unit.position)).toBe(true);
    }
    const countOf = (unitType: string): number =>
      enemies.filter((unit) => unit.unitType === unitType).length;
    expect(countOf('infantry')).toBe(5);
    expect(countOf('mediumTank')).toBe(2);
    expect(countOf('rocketArtillery')).toBe(1);
    expect(countOf('fighter')).toBe(1);
    expect(countOf('bomber')).toBe(1);
  });

  it('敵軍の歩兵が 3 本の橋の出口を塞ぎ、航空機は自軍の空港を持つ島まで届く', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const manager = UnitManager.fromPlacements(TWIN_CONTINENTS_MAP.units ?? [], map);
    for (const row of BRIDGE_ROWS) {
      const unit = manager.getUnitAt({ col: 24, row });
      expect(unit?.unitType).toBe('infantry');
      expect(unit?.armyType).toBe('enemy');
    }
    // 戦闘機・爆撃機は敵軍の空港に置いてあり、そこで修理できる
    for (const unit of manager
      .getUnitsByArmy('enemy')
      .filter((item) => item.unitType === 'fighter' || item.unitType === 'bomber')) {
      const tile = map.getTile(unit.position);
      expect(tile?.terrainType).toBe('airport');
      expect(tile?.owner).toBe('enemy');
    }
  });

  it('占領できる拠点を 69 個持ち、西の島を取り切れば収入で並べる', () => {
    const map = MapManager.fromDefinition(TWIN_CONTINENTS_MAP);
    const capturable = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture,
    );
    expect(capturable).toHaveLength(69);
    const neutral = capturable.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    // 西の島 22 + 海峡の 2 島 10 = 32 個が中立
    expect(neutral).toHaveLength(32);
    // 自軍 8 + 西の島 22 = 30 拠点で、敵軍の 29 拠点に並ぶ
    expect(8 + neutral.filter(isWest).length).toBeGreaterThan(29);
  });
});
