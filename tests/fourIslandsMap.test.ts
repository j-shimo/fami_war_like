import { describe, expect, it } from 'vitest';
import type { GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { distancesFrom } from '@/core/movement/PathDistance';
import { UnitManager } from '@/core/units/UnitManager';
import { FOUR_ISLANDS_MAP } from '@/data/maps/fourIslandsMap';
import { getTerrainData } from '@/data/terrainData';

/** 指定マスが陸地(海以外)かどうか */
function isLand(map: MapManager, col: number, row: number): boolean {
  const tile = map.getTile({ col, row });
  return tile !== undefined && tile.terrainType !== 'sea';
}

/**
 * 陸続きに歩ける範囲を幅優先で塗りつぶし、到達したマスの集合を返す。
 * pass で「そのマスを通れるか」を判定する(島の切り分けと連結性チェックに使う)。
 */
function floodFill(
  map: MapManager,
  start: GridPosition,
  pass: (col: number, row: number) => boolean,
): Set<string> {
  const key = (col: number, row: number): string => `${col},${row}`;
  const seen = new Set<string>([key(start.col, start.row)]);
  const queue: GridPosition[] = [start];
  while (queue.length > 0) {
    const { col, row } = queue.pop() as GridPosition;
    for (const next of [
      { col, row: row - 1 },
      { col, row: row + 1 },
      { col: col - 1, row },
      { col: col + 1, row },
    ]) {
      if (!map.isInBounds(next)) continue;
      if (seen.has(key(next.col, next.row))) continue;
      if (!pass(next.col, next.row)) continue;
      seen.add(key(next.col, next.row));
      queue.push(next);
    }
  }
  return seen;
}

/** 盤面を陸の連結成分(島)ごとに切り分ける */
function islandsOf(map: MapManager): Set<string>[] {
  const islands: Set<string>[] = [];
  const visited = new Set<string>();
  map.forEachTile((tile) => {
    const { col, row } = tile.position;
    if (tile.terrainType === 'sea' || visited.has(`${col},${row}`)) return;
    const island = floodFill(map, tile.position, (c, r) => isLand(map, c, r));
    for (const member of island) visited.add(member);
    islands.push(island);
  });
  return islands;
}

/** 島に含まれるマスのうち、条件を満たすものを数える */
function countInIsland(
  map: MapManager,
  island: Set<string>,
  match: (tile: NonNullable<ReturnType<MapManager['getTile']>>) => boolean,
): number {
  let count = 0;
  for (const cell of island) {
    const [col, row] = cell.split(',').map(Number);
    const tile = map.getTile({ col, row });
    if (tile && match(tile)) count += 1;
  }
  return count;
}

/** 自軍の陣地(本拠地 1・工場 2・空港 2) */
const PLAYER_BASES: readonly GridPosition[] = [
  { col: 4, row: 8 }, // 本拠地
  { col: 5, row: 6 }, // 工場(北)
  { col: 5, row: 10 }, // 工場(南)
  { col: 8, row: 6 }, // 空港(北)
  { col: 8, row: 10 }, // 空港(南)
];

/** 両軍の空港(北・南の順)。北の空港は北の中立島、南の空港は南の中立島の担当になる */
const AIRPORTS = {
  player: [
    { col: 8, row: 6 },
    { col: 8, row: 10 },
  ],
  enemy: [
    { col: 26, row: 6 },
    { col: 26, row: 10 },
  ],
} as const;

/** 中立島の空港(北・南) */
const NEUTRAL_AIRPORTS: readonly GridPosition[] = [
  { col: 17, row: 3 },
  { col: 17, row: 13 },
];

/** 自軍・敵軍の本拠地 */
const PLAYER_HQ: GridPosition = { col: 4, row: 8 };
const ENEMY_HQ: GridPosition = { col: 30, row: 8 };

/**
 * 先手番ハンデの調整として、敵軍の島にだけ追加してある中立都市の位置。
 * 自軍の島の対称位置 (4,7) は平地のまま。
 */
const HANDICAP_CITIES: readonly GridPosition[] = [{ col: 30, row: 7 }];

describe('FOUR_ISLANDS_MAP(四島空戦マップ)', () => {
  it('縦17・横35 の横長サイズで生成できる', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    expect(map.cols).toBe(35);
    expect(map.rows).toBe(17);
    // 横長のマップであること
    expect(map.cols).toBeGreaterThan(map.rows);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const manager = UnitManager.fromPlacements(FOUR_ISLANDS_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0 で、収入だけで滑り出す(1 ターン目は輸送ヘリに 500 G 足りない)', () => {
    expect(FOUR_ISLANDS_MAP.initialFunds).toBe(0);
  });

  it('自軍・敵軍は本拠地 1・工場 2・空港 2 の計 5 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const owned = {
      player: { total: 0, airport: 0, factory: 0, headquarters: 0 },
      enemy: { total: 0, airport: 0, factory: 0, headquarters: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const side = owned[tile.owner];
      side.total += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.total).toBe(5);
      expect(side.airport).toBe(2);
      expect(side.factory).toBe(2);
      expect(side.headquarters).toBe(1);
    }
  });

  it('自軍は左の島、敵軍は右の島に本拠地を構える', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const playerHq = map.getTile(PLAYER_HQ);
    expect(playerHq?.terrainType).toBe('headquarters');
    expect(playerHq?.owner).toBe('player');
    const enemyHq = map.getTile(ENEMY_HQ);
    expect(enemyHq?.terrainType).toBe('headquarters');
    expect(enemyHq?.owner).toBe('enemy');
    expect(PLAYER_HQ.col).toBeLessThan(ENEMY_HQ.col);
  });

  it('港が 1 つも無く、海上ユニットは生産できない', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    let ports = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'port') ports += 1;
    });
    expect(ports).toBe(0);
  });

  it('陸地は平地・森と拠点だけでできている(道路も山も川も無い)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const allowed = new Set([
      'sea',
      'plain',
      'forest',
      'city',
      'airport',
      'factory',
      'headquarters',
    ]);
    map.forEachTile((tile) => {
      expect(allowed.has(tile.terrainType)).toBe(true);
    });
  });

  it('島は 4 つあり、どれも陸路ではつながっていない', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const islands = islandsOf(map);
    expect(islands).toHaveLength(4);
    // 自軍の島から歩いて行ける範囲に、敵軍の本拠地も中立島の空港も含まれない
    const reachable = floodFill(map, PLAYER_HQ, (col, row) => isLand(map, col, row));
    expect(reachable.has(`${ENEMY_HQ.col},${ENEMY_HQ.row}`)).toBe(false);
    for (const { col, row } of NEUTRAL_AIRPORTS) {
      expect(reachable.has(`${col},${row}`)).toBe(false);
    }
  });

  it('真ん中の上下に中立島が 1 つずつあり、それぞれ中立空港 1 個・中立都市 3 個を持つ', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    for (const airport of NEUTRAL_AIRPORTS) {
      const island = floodFill(map, airport, (col, row) => isLand(map, col, row));
      // 中立島は両軍の島(121 マス)より小さい
      expect(island.size).toBeLessThan(50);
      expect(
        countInIsland(
          map,
          island,
          (tile) => tile.terrainType === 'airport' && tile.owner === 'neutral',
        ),
      ).toBe(1);
      expect(
        countInIsland(
          map,
          island,
          (tile) => tile.terrainType === 'city' && tile.owner === 'neutral',
        ),
      ).toBe(3);
    }
    // 北の島は盤面の上半分、南の島は下半分にある
    expect(NEUTRAL_AIRPORTS[0].row).toBeLessThan(8);
    expect(NEUTRAL_AIRPORTS[1].row).toBeGreaterThan(8);
  });

  it('北と南の中立島は、形も都市の並べ方も別のものにしてある', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const [north, south] = NEUTRAL_AIRPORTS.map((airport) =>
      floodFill(map, airport, (col, row) => isLand(map, col, row)),
    );
    // 北は横長の砂州(9x4)・南は小さな菱形の岩島(5x5)で、広さも形も違う
    expect(north.size).not.toBe(south.size);
    const extent = (island: Set<string>): { cols: number; rows: number } => {
      const cells = [...island].map((cell) => cell.split(',').map(Number));
      const cols = cells.map(([col]) => col);
      const rows = cells.map(([, row]) => row);
      return {
        cols: Math.max(...cols) - Math.min(...cols) + 1,
        rows: Math.max(...rows) - Math.min(...rows) + 1,
      };
    };
    const northExtent = extent(north);
    const southExtent = extent(south);
    // 北は横長(幅 > 高さ)、南は正方形に近い縦長の島
    expect(northExtent.cols).toBeGreaterThan(northExtent.rows);
    expect(southExtent.cols).toBeLessThanOrEqual(southExtent.rows);

    // 都市の並びが、上下の反転でも平行移動でも重ならないこと(完全に別の配置)
    const cityOffsets = (island: Set<string>): string[] => {
      const cells = [...island]
        .map((cell) => cell.split(',').map(Number))
        .filter(([col, row]) => map.getTile({ col, row })?.terrainType === 'city');
      const baseCol = Math.min(...cells.map(([col]) => col));
      const baseRow = Math.min(...cells.map(([, row]) => row));
      return cells.map(([col, row]) => `${col - baseCol},${row - baseRow}`).sort();
    };
    const northCities = cityOffsets(north);
    const southCities = cityOffsets(south);
    expect(northCities).not.toEqual(southCities);
    // 上下に反転させても一致しない
    const flipped = [...south]
      .map((cell) => cell.split(',').map(Number))
      .filter(([col, row]) => map.getTile({ col, row })?.terrainType === 'city');
    const maxRow = Math.max(...flipped.map(([, row]) => row));
    const minCol = Math.min(...flipped.map(([col]) => col));
    const flippedOffsets = flipped
      .map(([col, row]) => `${col - minCol},${maxRow - row}`)
      .sort();
    expect(northCities).not.toEqual(flippedOffsets);
  });

  it('両軍の島の中立都市は自軍 5 個・敵軍 6 個(先手番ハンデの調整)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    for (const { hq, cities } of [
      { hq: PLAYER_HQ, cities: 5 },
      { hq: ENEMY_HQ, cities: 6 },
    ]) {
      const island = floodFill(map, hq, (col, row) => isLand(map, col, row));
      expect(
        countInIsland(
          map,
          island,
          (tile) => tile.terrainType === 'city' && tile.owner === 'neutral',
        ),
      ).toBe(cities);
    }
  });

  it('敵軍のハンデ都市は 1 個だけで、本拠地の隣にある', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    expect(HANDICAP_CITIES).toHaveLength(1);
    for (const pos of HANDICAP_CITIES) {
      const tile = map.getTile(pos);
      expect(tile?.terrainType).toBe('city');
      // 中立都市なので、敵軍が歩兵で占領して初めて収入になる
      expect(tile?.owner).toBe('neutral');
      // 敵軍本拠地 (30,8) の隣
      expect(Math.abs(pos.col - ENEMY_HQ.col) + Math.abs(pos.row - ENEMY_HQ.row)).toBe(1);
    }
  });

  it('自軍の島の中立都市は島の南北の端にあり、陣地から離れている', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const island = floodFill(map, { col: 4, row: 10 }, (col, row) =>
      isLand(map, col, row),
    );
    const fields = PLAYER_BASES.map((base) => distancesFrom(map, base, 'infantry'));
    for (const cell of island) {
      const [col, row] = cell.split(',').map(Number);
      if (map.getTile({ col, row })?.terrainType !== 'city') continue;
      // どの陣地からも歩兵で 5 マス以上(移動力 3 では 1 ターンで届かない)離れている
      const nearest = Math.min(
        ...fields.map((field) => field.get({ col, row }) ?? Number.POSITIVE_INFINITY),
      );
      expect(nearest).toBeGreaterThanOrEqual(5);
    }
  });

  it('両軍の空港から中立島の空港までの距離は等しい(12 マス・輸送ヘリで 2 ターン)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    for (const [north, south] of [AIRPORTS.player, AIRPORTS.enemy]) {
      // 北の空港からは北の中立島へ、南の空港からは南の中立島へ、どちらも 12 マス
      expect(distancesFrom(map, north, 'air').get(NEUTRAL_AIRPORTS[0])).toBe(12);
      expect(distancesFrom(map, south, 'air').get(NEUTRAL_AIRPORTS[1])).toBe(12);
    }
  });

  it('中立島へは輸送ヘリで必ず 2 ターン以上かかる(1 ターンでは歩兵を降ろせない)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    // 輸送ヘリの移動力。1 ターンで進めるのはこのコストぶんまで
    const transportHelicopterMovement = 6;
    for (const airports of [AIRPORTS.player, AIRPORTS.enemy]) {
      for (const airport of airports) {
        const byAir = distancesFrom(map, airport, 'air');
        for (const neutralAirport of NEUTRAL_AIRPORTS) {
          const island = floodFill(map, neutralAirport, (col, row) =>
            isLand(map, col, row),
          );
          // 島のどのマスへ降ろすにせよ、輸送ヘリはその隣まで飛ばないといけない。
          // 隣接マスまでの距離が移動力を超えていれば、1 ターン目には降ろせない
          const nearest = Math.min(
            ...[...island].map((cell) => {
              const [col, row] = cell.split(',').map(Number);
              return byAir.get({ col, row }) ?? Number.POSITIVE_INFINITY;
            }),
          );
          expect(nearest - 1).toBeGreaterThan(transportHelicopterMovement);
        }
      }
    }
  });

  it('盤面はハンデ都市の 1 マスを除いて左右対称である', () => {
    const rows = FOUR_ISLANDS_MAP.terrain.length;
    const cols = FOUR_ISLANDS_MAP.terrain[0].length;
    const handicap = new Set(HANDICAP_CITIES.map(({ col, row }) => `${col},${row}`));
    expect(cols).toBe(35);
    for (let row = 0; row < rows; row++) {
      expect(FOUR_ISLANDS_MAP.terrain[row]).toHaveLength(cols);
      for (let col = 0; col < cols; col++) {
        const mirrorCol = cols - 1 - col;
        if (handicap.has(`${col},${row}`) || handicap.has(`${mirrorCol},${row}`)) {
          // ハンデ都市は敵軍側だけが都市、自軍側の対称位置は平地
          expect(FOUR_ISLANDS_MAP.terrain[row][col]).toBe(
            handicap.has(`${col},${row}`) ? 'c' : '.',
          );
          continue;
        }
        expect(FOUR_ISLANDS_MAP.terrain[row][col]).toBe(
          FOUR_ISLANDS_MAP.terrain[row][mirrorCol],
        );
      }
    }
  });

  it('どの島も装輪車両が入れるマスがすべてつながっている(孤立地帯がない)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    // 装輪車両(偵察車・ロケット砲)は森へ入れない。森を避けても、島の中の
    // 進入できるマスへは一続きに到達できること
    const canDrive = (col: number, row: number): boolean => {
      const tile = map.getTile({ col, row });
      return (
        tile !== undefined && getTerrainData(tile.terrainType).moveCost.wheeled !== null
      );
    };
    for (const island of islandsOf(map)) {
      const drivable = [...island].filter((cell) => {
        const [col, row] = cell.split(',').map(Number);
        return canDrive(col, row);
      });
      expect(drivable.length).toBeGreaterThan(0);
      const [startCol, startRow] = drivable[0].split(',').map(Number);
      const reachable = floodFill(map, { col: startCol, row: startRow }, canDrive);
      for (const cell of drivable) {
        expect(reachable.has(cell)).toBe(true);
      }
    }
  });

  it('すべての島は海に面しており、飛行ユニットで行き来できる', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    for (const island of islandsOf(map)) {
      const hasCoast = [...island].some((cell) => {
        const [c, r] = cell.split(',').map(Number);
        return [
          { col: c, row: r - 1 },
          { col: c, row: r + 1 },
          { col: c - 1, row: r },
          { col: c + 1, row: r },
        ].some((p) => map.getTile(p)?.terrainType === 'sea');
      });
      expect(hasCoast).toBe(true);
    }
    // 飛行ユニットは自軍の空港から敵軍の本拠地まで海を越えて届く
    const byAir = distancesFrom(map, AIRPORTS.player[0], 'air');
    expect(byAir.get(ENEMY_HQ)).toBeDefined();
  });

  it('中立で占領可能な拠点が存在する(空港 2・都市 17)', () => {
    const map = MapManager.fromDefinition(FOUR_ISLANDS_MAP);
    const neutral = { airport: 0, city: 0 };
    map.forEachTile((tile) => {
      if (tile.owner !== 'neutral' || !getTerrainData(tile.terrainType).canCapture)
        return;
      if (tile.terrainType === 'airport') neutral.airport += 1;
      if (tile.terrainType === 'city') neutral.city += 1;
    });
    expect(neutral.airport).toBe(2);
    expect(neutral.city).toBe(17);
  });
});
