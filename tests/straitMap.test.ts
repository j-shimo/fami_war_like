import { describe, expect, it } from 'vitest';
import type { GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { UnitManager } from '@/core/units/UnitManager';
import { STRAIT_MAP } from '@/data/maps/straitMap';
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
 * 移動タイプ別の連結性(地上部隊が歩いて行けるか・艦艇が航行できるか)の検証に使う。
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

/** 自軍本拠地・敵軍本拠地の位置(陣地の起点として使う) */
const PLAYER_HQ: GridPosition = { col: 0, row: 7 };
const ENEMY_HQ: GridPosition = { col: 25, row: 6 };

/**
 * 先手番ハンデの調整として、敵軍陣地の隣にだけ追加してある中立都市の位置。
 * 自軍側の点対称位置((1,9)・(1,4))は平地のままで、盤面はこの 2 マスだけ非対称になる。
 */
const HANDICAP_CITIES: readonly GridPosition[] = [
  { col: 24, row: 4 },
  { col: 24, row: 9 },
];

/** 南北をつなぐ地峡がある列(自軍陣地・敵軍陣地)。ここを塞ぐと北と南の大陸は分断される */
const ISTHMUS_COLS = (col: number): boolean => col <= 4 || col >= 21;

describe('STRAIT_MAP(海空回廊マップ)', () => {
  it('縦14・横26 の横長サイズで生成できる', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    expect(map.cols).toBe(26);
    expect(map.rows).toBe(14);
    // 横が縦より長い「横長マップ」であること
    expect(map.cols).toBeGreaterThan(map.rows);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const manager = UnitManager.fromPlacements(STRAIT_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金 20000 で、1 ターン目から艦艇・航空機に手が届く', () => {
    // 収入 5000(5 拠点)と合わせて 25000。護衛艦 22000・戦闘機 20000 を初回から選べる。
    expect(STRAIT_MAP.initialFunds).toBe(20000);
  });

  it('先手番ハンデの 2 マスを除けば盤面は中心点対称', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const exempt = new Set(
      HANDICAP_CITIES.flatMap((pos) => [
        key(pos),
        key({ col: map.cols - 1 - pos.col, row: map.rows - 1 - pos.row }),
      ]),
    );
    map.forEachTile((tile) => {
      if (exempt.has(key(tile.position))) return;
      const mirrored = map.getTile({
        col: map.cols - 1 - tile.position.col,
        row: map.rows - 1 - tile.position.row,
      });
      expect(mirrored?.terrainType).toBe(tile.terrainType);
    });
  });

  it('後手の敵軍だけが陣地の隣に中立都市を 2 個多く持つ(先手番ハンデ)', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    for (const pos of HANDICAP_CITIES) {
      const tile = map.getTile(pos);
      // 敵軍が 2 ターンで取り切れる位置にある中立都市
      expect(tile?.terrainType).toBe('city');
      expect(tile?.owner).toBe('neutral');
      // 自軍側の点対称位置は平地のままで、同じ収入は得られない
      const mirrored = map.getTile({
        col: map.cols - 1 - pos.col,
        row: map.rows - 1 - pos.row,
      });
      expect(mirrored?.terrainType).toBe('plain');
    }
  });

  it('自軍・敵軍は本拠地 1・工場 2・港 1・空港 1 の計 5 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const owned = {
      player: { total: 0, headquarters: 0, factory: 0, port: 0, airport: 0 },
      enemy: { total: 0, headquarters: 0, factory: 0, port: 0, airport: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const side = owned[tile.owner];
      side.total += 1;
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'port') side.port += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.total).toBe(5);
      expect(side.headquarters).toBe(1);
      expect(side.factory).toBe(2);
      expect(side.port).toBe(1);
      expect(side.airport).toBe(1);
    }
  });

  it('自軍は西端、敵軍は東端に陣地を構える', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const playerHq = map.getTile(PLAYER_HQ);
    expect(playerHq?.terrainType).toBe('headquarters');
    expect(playerHq?.owner).toBe('player');
    const enemyHq = map.getTile(ENEMY_HQ);
    expect(enemyHq?.terrainType).toBe('headquarters');
    expect(enemyHq?.owner).toBe('enemy');
  });

  it('海峡が北の大陸と南の大陸を分け、陸路でつながるのは両軍の陣地だけ', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const onLand = passable(map, 'infantry');
    // 両軍の陣地(地峡)を通れないものとして塗りつぶすと、北の大陸から南の大陸へは行けない。
    const blocked = (pos: GridPosition): boolean => onLand(pos) && !ISTHMUS_COLS(pos.col);
    const north = floodFill(map, { col: 12, row: 2 }, blocked);
    expect(north.has(key({ col: 13, row: 11 }))).toBe(false);
    // 中央付近の大陸マスはすべて row 0〜4(北)に収まっている
    for (const pos of north) {
      const [, row] = pos.split(',').map(Number);
      expect(row).toBeLessThanOrEqual(4);
    }
    // 地峡を通れば北と南はつながっている(自軍陣地を経由した迂回路がある)
    const whole = floodFill(map, { col: 12, row: 2 }, onLand);
    expect(whole.has(key({ col: 13, row: 11 }))).toBe(true);
    expect(whole.has(key(PLAYER_HQ))).toBe(true);
    expect(whole.has(key(ENEMY_HQ))).toBe(true);
  });

  it('海峡は一続きで、両軍の港と海峡の島がすべて同じ海域でつながっている', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const onSea = passable(map, 'sea');
    // 自軍の港(湾の奥)から出航して、敵軍の港まで到達できる
    const reachable = floodFill(map, { col: 2, row: 7 }, onSea);
    expect(reachable.has(key({ col: 23, row: 6 }))).toBe(true);
    // 海・海岸・港はすべてこの一続きの海域に含まれる(閉じた湖を作らない)
    for (const pos of collect(map, (tile) => onSea(tile.position))) {
      expect(reachable.has(key(pos))).toBe(true);
    }
  });

  it('中立の港 6・中立の空港 4 を争点として配置している', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const neutralPorts = collect(
      map,
      (tile) => tile.terrainType === 'port' && tile.owner === 'neutral',
    );
    const neutralAirports = collect(
      map,
      (tile) => tile.terrainType === 'airport' && tile.owner === 'neutral',
    );
    expect(neutralPorts).toHaveLength(6);
    expect(neutralAirports).toHaveLength(4);
  });

  it('すべての港は海に隣接し、艦艇が出入りできる', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    for (const pos of collect(map, (tile) => tile.terrainType === 'port')) {
      const openToSea = neighbors(pos).some(
        (next) => map.getTile(next)?.terrainType === 'sea',
      );
      expect(openToSea).toBe(true);
    }
  });

  it('海峡の島は陸路から孤立しており、輸送艦か輸送ヘリでしか歩兵を送り込めない', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const onLand = passable(map, 'infantry');
    const mainland = floodFill(map, PLAYER_HQ, onLand);
    const islandTiles = collect(
      map,
      (tile) => onLand(tile.position) && !mainland.has(key(tile.position)),
    );
    // 双子空港島(2x2)と中立港の小島 2 つ(各 2 マス)で計 8 マス
    expect(islandTiles).toHaveLength(8);
    // 島には空港 2・港 2 があり、前線の生産拠点として奪い合う対象になる
    const islandBases = islandTiles.map((pos) => map.getTile(pos)?.terrainType);
    expect(islandBases.filter((t) => t === 'airport')).toHaveLength(2);
    expect(islandBases.filter((t) => t === 'port')).toHaveLength(2);
  });

  it('島はどれも 2 マス以上あり、揚陸した歩兵が輸送艦へ乗り直せる', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const onLand = passable(map, 'infantry');
    const onSea = passable(map, 'sea');
    const mainland = floodFill(map, PLAYER_HQ, onLand);
    const islandTiles = collect(
      map,
      (tile) => onLand(tile.position) && !mainland.has(key(tile.position)),
    );

    const visited = new Set<string>();
    for (const pos of islandTiles) {
      if (visited.has(key(pos))) continue;
      const island = floodFill(map, pos, (next) => onLand(next));
      for (const tile of island) visited.add(tile);
      // 1 マスだけの島だと、降ろした歩兵が海上の輸送艦に乗り込めず詰んでしまう
      expect(island.size).toBeGreaterThanOrEqual(2);
      // 島には必ず「地上ユニットと海上ユニットが同じマスに入れる」港か海岸がある
      const boardable = [...island].filter((k) => {
        const [col, row] = k.split(',').map(Number);
        return onSea({ col, row });
      });
      expect(boardable.length).toBeGreaterThan(0);
    }
  });

  it('大陸の中立空港は海峡から近く、敵戦艦の艦砲射撃(射程 6)に晒される', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const seaTiles = collect(map, (tile) => tile.terrainType === 'sea');
    for (const airport of [
      { col: 12, row: 2 },
      { col: 13, row: 11 },
    ]) {
      expect(map.getTile(airport)?.terrainType).toBe('airport');
      const nearest = Math.min(
        ...seaTiles.map(
          (sea) => Math.abs(sea.col - airport.col) + Math.abs(sea.row - airport.row),
        ),
      );
      expect(nearest).toBeLessThanOrEqual(6);
    }
  });

  it('両軍の陣地はすべて敵戦艦の射程内にあり、制海権を失うと生産拠点を削られる', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const onSea = passable(map, 'sea');
    // 戦艦が停泊できるマス(海・海岸・港)から、射程 3〜6 で狙える拠点かどうかを見る
    const anchorages = collect(map, (tile) => onSea(tile.position));
    const bases = collect(
      map,
      (tile) => tile.owner === 'player' || tile.owner === 'enemy',
    );
    expect(bases).toHaveLength(10);
    for (const base of bases) {
      const bombardable = anchorages.some((sea) => {
        const distance = Math.abs(sea.col - base.col) + Math.abs(sea.row - base.row);
        return distance >= 3 && distance <= 6;
      });
      expect(bombardable).toBe(true);
    }
  });

  it('占領できる拠点を 44 個持ち、収入を伸ばせば高額な艦艇・航空機を運用できる', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const capturable = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture,
    );
    expect(capturable).toHaveLength(44);
    // うち 34 個は中立(両軍の初期所有は 5 拠点ずつ)
    const neutral = capturable.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(neutral).toHaveLength(34);
  });

  it('上陸地点となる海岸を両大陸の海岸線に配置している', () => {
    const map = MapManager.fromDefinition(STRAIT_MAP);
    const beaches = collect(map, (tile) => tile.terrainType === 'beach');
    expect(beaches.length).toBeGreaterThanOrEqual(12);
    // 海岸は地上ユニットも海上ユニットも進入できる(輸送艦を着けて上陸・乗船できる)
    for (const pos of beaches) {
      expect(map.getMoveCost(pos, 'infantry')).not.toBeNull();
      expect(map.getMoveCost(pos, 'sea')).not.toBeNull();
    }
  });
});
