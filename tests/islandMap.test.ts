import { describe, expect, it } from 'vitest';
import type { GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import { ISLAND_MAP } from '@/data/maps/islandMap';
import { getTerrainData } from '@/data/terrainData';

/** 指定マスが陸地(海以外)かどうか */
function isLand(map: MapManager, col: number, row: number): boolean {
  const tile = map.getTile({ col, row });
  return tile !== undefined && tile.terrainType !== 'sea';
}

/**
 * 陸続きに歩ける範囲を幅優先で塗りつぶし、到達したマスの集合を返す。
 * pass で「そのマスを通れるか」を判定する(地上ユニットの連結性チェックに使う)。
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

/**
 * 先手番ハンデの調整として、敵軍本土にだけ追加してある中立都市の位置。
 * 自軍本土の対称位置(点対称)は平地のまま。
 */
const HANDICAP_CITIES: readonly GridPosition[] = [
  { col: 12, row: 22 },
  { col: 14, row: 21 },
];

describe('ISLAND_MAP(分断列島マップ)', () => {
  it('縦24・横20 のサイズで生成できる', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    expect(map.cols).toBe(20);
    expect(map.rows).toBe(24);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const manager = UnitManager.fromPlacements(ISLAND_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0 で、収入だけで滑り出す', () => {
    expect(ISLAND_MAP.initialFunds).toBe(0);
  });

  it('自軍・敵軍は本拠地 1・工場 1・港 1 の計 3 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const owned = {
      player: { total: 0, factory: 0, headquarters: 0, port: 0 },
      enemy: { total: 0, factory: 0, headquarters: 0, port: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const side = owned[tile.owner];
      side.total += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'port') side.port += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.total).toBe(3);
      expect(side.factory).toBe(1);
      expect(side.headquarters).toBe(1);
      expect(side.port).toBe(1);
    }
  });

  it('自軍は上側、敵軍は下側に本拠地を構える', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const playerHq = map.getTile({ col: 7, row: 2 });
    expect(playerHq?.terrainType).toBe('headquarters');
    expect(playerHq?.owner).toBe('player');
    const enemyHq = map.getTile({ col: 12, row: 21 });
    expect(enemyHq?.terrainType).toBe('headquarters');
    expect(enemyHq?.owner).toBe('enemy');
  });

  it('飛行ユニットの生産拠点(空港)は存在しない', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    let airports = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'airport') airports += 1;
    });
    expect(airports).toBe(0);
  });

  it('自軍本土と敵軍本土は海で完全に分断されており、陸路でつながっていない', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    // 自軍本拠地から陸続きに歩ける範囲に、敵軍本拠地は含まれない
    const reachable = floodFill(map, { col: 7, row: 2 }, (col, row) =>
      isLand(map, col, row),
    );
    expect(reachable.has('7,2')).toBe(true);
    expect(reachable.has('12,21')).toBe(false);
  });

  it('本土は大きな島で、中立都市を自軍 10・敵軍 12 個抱える(先手番ハンデの調整)', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    // 先手の自軍が 1 ターン早く占領・生産を始められるぶん、後手の敵軍本土だけ
    // 中立都市を 2 個多く置いて収入で釣り合わせる
    for (const { hq, cities: expected } of [
      { hq: { col: 7, row: 2 }, cities: 10 },
      { hq: { col: 12, row: 21 }, cities: 12 },
    ]) {
      const mainland = floodFill(map, hq, (col, row) => isLand(map, col, row));
      // 本土の広さ。小島(数マス)とは桁違いの大きさであること
      expect(mainland.size).toBeGreaterThanOrEqual(100);
      let cities = 0;
      for (const cell of mainland) {
        const [col, row] = cell.split(',').map(Number);
        const tile = map.getTile({ col, row });
        if (tile?.terrainType === 'city' && tile.owner === 'neutral') cities += 1;
      }
      expect(cities).toBe(expected);
    }
  });

  it('敵軍のハンデ都市は本拠地の目の前にあり、序盤に確実に取り切れる', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    for (const pos of HANDICAP_CITIES) {
      const tile = map.getTile(pos);
      expect(tile?.terrainType).toBe('city');
      // 中立都市なので、敵軍が歩兵で占領して初めて収入になる
      expect(tile?.owner).toBe('neutral');
      // 敵軍本拠地 (12,21) からのマンハッタン距離が 2 以内
      expect(Math.abs(pos.col - 12) + Math.abs(pos.row - 21)).toBeLessThanOrEqual(2);
    }
  });

  it('開始時の所有拠点数は両軍とも 3 で等しい(ハンデは中立都市の数だけ)', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const owned = { player: 0, enemy: 0 };
    map.forEachTile((tile) => {
      if (tile.owner === 'player') owned.player += 1;
      if (tile.owner === 'enemy') owned.enemy += 1;
    });
    expect(owned.player).toBe(3);
    expect(owned.enemy).toBe(3);
  });

  it('本土は車両が進入できるマスがすべてつながっている(孤立地帯がない)', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    // 車両は山に進入できない。山を避けても、車両が入れるマスへは
    // 本拠地から一続きに到達できること(山で分断された飛び地を作らない)
    const canDrive = (col: number, row: number): boolean => {
      const tile = map.getTile({ col, row });
      return (
        tile !== undefined && getTerrainData(tile.terrainType).moveCost.vehicle !== null
      );
    };
    for (const hq of [
      { col: 7, row: 2 },
      { col: 12, row: 21 },
    ]) {
      const mainland = floodFill(map, hq, (col, row) => isLand(map, col, row));
      const byVehicle = floodFill(map, hq, canDrive);
      for (const cell of mainland) {
        const [col, row] = cell.split(',').map(Number);
        if (!canDrive(col, row)) continue;
        expect(byVehicle.has(cell)).toBe(true);
      }
    }
  });

  it('すべての島に海岸があり、上陸した歩兵が輸送艦へ戻れる', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const visited = new Set<string>();
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      if (tile.terrainType === 'sea' || visited.has(`${col},${row}`)) return;
      const island = floodFill(map, tile.position, (c, r) => isLand(map, c, r));
      for (const member of island) visited.add(member);
      // 海岸が 1 マスも無い島だと、降ろした歩兵が海上の輸送艦へ乗り込めず取り残される
      const beaches = [...island].filter((cell) => {
        const [c, r] = cell.split(',').map(Number);
        return map.getTile({ col: c, row: r })?.terrainType === 'beach';
      });
      expect(beaches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('海岸はすべて海に面しており、艦艇が着けられる', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    map.forEachTile((tile) => {
      if (tile.terrainType !== 'beach') return;
      const { col, row } = tile.position;
      const facesSea = [
        { col, row: row - 1 },
        { col, row: row + 1 },
        { col: col - 1, row },
        { col: col + 1, row },
      ].some((p) => map.getTile(p)?.terrainType === 'sea');
      expect(facesSea).toBe(true);
    });
  });

  it('分断帯には中立都市を持つ小島が点在する', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const mainlands = [
      floodFill(map, { col: 7, row: 2 }, (col, row) => isLand(map, col, row)),
      floodFill(map, { col: 12, row: 21 }, (col, row) => isLand(map, col, row)),
    ];
    const onMainland = (cell: string): boolean =>
      mainlands.some((mainland) => mainland.has(cell));

    const islands: Set<string>[] = [];
    const visited = new Set<string>();
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      const cell = `${col},${row}`;
      if (tile.terrainType === 'sea' || visited.has(cell) || onMainland(cell)) return;
      const island = floodFill(map, tile.position, (c, r) => isLand(map, c, r));
      for (const member of island) visited.add(member);
      islands.push(island);
    });

    // 本土以外に複数の小島があり、いずれも数マスの小さな島であること
    expect(islands.length).toBeGreaterThanOrEqual(3);
    let islandCities = 0;
    for (const island of islands) {
      expect(island.size).toBeLessThanOrEqual(4);
      for (const cell of island) {
        const [col, row] = cell.split(',').map(Number);
        const tile = map.getTile({ col, row });
        if (tile?.terrainType === 'city') {
          expect(tile.owner).toBe('neutral');
          islandCities += 1;
        }
      }
    }
    expect(islandCities).toBeGreaterThanOrEqual(4);
  });

  it('両軍の港は同じ海でつながっており、艦隊が行き来できる', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    // 港は海上ユニットが進入できる拠点なので、港を起点に海マスをたどれる
    const sailable = floodFill(map, { col: 8, row: 4 }, (col, row) => {
      const terrainType = map.getTile({ col, row })?.terrainType;
      // 海上ユニットは海・港・海岸に進入できる
      return terrainType === 'sea' || terrainType === 'port' || terrainType === 'beach';
    });
    expect(sailable.has('11,19')).toBe(true);

    // 行き止まりの内海(艦艇が入れない海)を作らない。全海マスが港からたどれること
    map.forEachTile((tile) => {
      if (tile.terrainType !== 'sea') return;
      expect(sailable.has(`${tile.position.col},${tile.position.row}`)).toBe(true);
    });
  });

  it('すべての島は海に面しており、輸送艦から上陸できる', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    const visited = new Set<string>();
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      if (tile.terrainType === 'sea' || visited.has(`${col},${row}`)) return;
      const island = floodFill(map, tile.position, (c, r) => isLand(map, c, r));
      for (const member of island) visited.add(member);
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
    });
  });

  it('盤面はハンデ都市の 2 マスを除いて中心点対称である', () => {
    const rows = ISLAND_MAP.terrain.length;
    const cols = ISLAND_MAP.terrain[0].length;
    const handicap = new Set(HANDICAP_CITIES.map(({ col, row }) => `${col},${row}`));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const mirrorCol = cols - 1 - col;
        const mirrorRow = rows - 1 - row;
        if (handicap.has(`${col},${row}`) || handicap.has(`${mirrorCol},${mirrorRow}`)) {
          // ハンデ都市は敵軍側だけが都市、自軍側の対称位置は平地
          expect(ISLAND_MAP.terrain[row][col]).toBe(
            handicap.has(`${col},${row}`) ? 'c' : '.',
          );
          continue;
        }
        expect(ISLAND_MAP.terrain[row][col]).toBe(
          ISLAND_MAP.terrain[mirrorRow][mirrorCol],
        );
      }
    }
  });

  it('中立で占領可能な拠点が存在する', () => {
    const map = MapManager.fromDefinition(ISLAND_MAP);
    let neutralBases = 0;
    map.forEachTile((tile) => {
      if (tile.owner === 'neutral' && getTerrainData(tile.terrainType).canCapture) {
        neutralBases += 1;
      }
    });
    expect(neutralBases).toBeGreaterThan(0);
  });
});
