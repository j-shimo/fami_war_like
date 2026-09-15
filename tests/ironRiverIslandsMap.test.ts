import { describe, expect, it } from 'vitest';
import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { distancesFrom } from '@/core/movement/PathDistance';
import { UnitManager } from '@/core/units/UnitManager';
import { MAP_LIST } from '@/data/maps';
import { IRON_RIVER_ISLANDS_MAP } from '@/data/maps/ironRiverIslandsMap';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData } from '@/data/unitData';

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

/** movementType のユニットが進入できるマスかどうか */
function passable(map: MapManager, movementType: MovementType) {
  return (pos: GridPosition): boolean => map.getMoveCost(pos, movementType) !== null;
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

/** 条件を満たすマスをすべて集める */
function collect(
  map: MapManager,
  predicate: (tile: NonNullable<ReturnType<MapManager['getTile']>>) => boolean,
): GridPosition[] {
  const found: GridPosition[] = [];
  map.forEachTile((tile) => {
    if (predicate(tile)) found.push(tile.position);
  });
  return found;
}

/** マンハッタン距離(砲撃の射程判定に使う) */
function manhattan(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** 自軍の陣地(「 の横棒の真ん中)。本拠地 1・駅 1・工場 3・空港 2・港 2 */
const PLAYER_HQ = gridPosition(17, 2);
const PLAYER_STATION = gridPosition(18, 2);
const PLAYER_PORTS: readonly GridPosition[] = [gridPosition(17, 4), gridPosition(19, 4)];
const PLAYER_BASES: readonly GridPosition[] = [
  PLAYER_HQ,
  PLAYER_STATION,
  gridPosition(16, 1),
  gridPosition(18, 1),
  gridPosition(20, 1),
  gridPosition(15, 2),
  gridPosition(20, 2),
  ...PLAYER_PORTS,
];

/** 敵軍の陣地(大きい島の右下)。自軍とまったく同じ 9 拠点の構成 */
const ENEMY_HQ = gridPosition(35, 21);
const ENEMY_STATION = gridPosition(35, 20);

/** 真ん中の島の中立拠点(駅・空港・港) */
const MID_STATION = gridPosition(18, 9);
const MID_AIRPORT = gridPosition(15, 9);
const MID_PORT = gridPosition(23, 10);

/** 敵軍の線路の終点にある 2 つの駅(上の駅・左の駅) */
const ENEMY_NORTH_STATION = gridPosition(35, 15);
const ENEMY_WEST_STATION = gridPosition(20, 16);

/** 自軍の線路の南端(真ん中の島の南の端)。列車砲の前進位置になる */
const PLAYER_RAIL_END = gridPosition(18, 12);

/** 海の上を渡る幅 1 マスの鉄橋(自軍の島 → 真ん中の島) */
const RAIL_BRIDGE: readonly GridPosition[] = [
  gridPosition(18, 5),
  gridPosition(18, 6),
  gridPosition(18, 7),
];

/** 敵軍の陣地へ通じる 2 本の川の末端 */
const RIVER_NORTH_END = gridPosition(34, 19);
const RIVER_WEST_END = gridPosition(33, 22);

/** 「 の右上(横棒の東の端)と、右端の小島の西の端 */
const PLAYER_ARM_EAST_TOP = gridPosition(30, 1);
const EAST_ISLET_WEST = gridPosition(34, 2);

/** 自軍の島(「 の縦棒)の左下にある中立の研究所 */
const PLAYER_LABORATORY = gridPosition(4, 12);

/** 各島の代表マス */
const MID_ISLAND = gridPosition(20, 10);
const SOUTHWEST_ISLAND = gridPosition(3, 21);

describe('IRON_RIVER_ISLANDS_MAP(鉄河列島マップ)', () => {
  it('縦26・横40 の盤面で生成でき、盤面の外周はすべて海', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    expect(map.cols).toBe(40);
    expect(map.rows).toBe(26);
    map.forEachTile((tile) => {
      const { col, row } = tile.position;
      const onEdge =
        col === 0 || row === 0 || col === map.cols - 1 || row === map.rows - 1;
      if (onEdge) expect(tile.terrainType).toBe('sea');
    });
  });

  it('新マップ(group: new)の激ムズマップとして、1P側の一覧に登録されている', () => {
    const entry = MAP_LIST.find((item) => item.id === 'ironRiverIslands');
    expect(entry?.category).toBe('extra');
    expect(entry?.group).toBe('new');
    expect(entry?.side).toBe('1p');
    expect(entry?.definition).toBe(IRON_RIVER_ISLANDS_MAP);
  });

  it('初期資金は列車砲 1 門ぶんの 30000 で、自軍は収入 9000・敵軍は収入 24000 で始まる', () => {
    expect(IRON_RIVER_ISLANDS_MAP.initialFunds).toBe(30000);
    expect(IRON_RIVER_ISLANDS_MAP.initialFunds).toBe(getUnitData('railgun').cost);
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const owned = { player: 0, enemy: 0 };
    map.forEachTile((tile) => {
      if (tile.owner === 'player') owned.player += 1;
      if (tile.owner === 'enemy') owned.enemy += 1;
    });
    expect(owned.player).toBe(9);
    expect(owned.enemy).toBe(24);
  });

  it('両軍とも本拠地 1・駅 1・工場 3・空港 2・港 2 の陣地を持ち、生産力は同じ', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const inBase = (pos: GridPosition): boolean =>
      (pos.row <= 4 && pos.col >= 15 && pos.col <= 20) ||
      (pos.row >= 20 && pos.col >= 33);
    const owned = {
      player: { headquarters: 0, station: 0, factory: 0, airport: 0, port: 0 },
      enemy: { headquarters: 0, station: 0, factory: 0, airport: 0, port: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      if (!inBase(tile.position)) return;
      const side = owned[tile.owner];
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'station') side.station += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
      if (tile.terrainType === 'port') side.port += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.headquarters).toBe(1);
      expect(side.station).toBe(1);
      expect(side.factory).toBe(3);
      expect(side.airport).toBe(2);
      expect(side.port).toBe(2);
    }
    // 陣地の 9 拠点だけを持ち、都市は 1 個も占領していない
    for (const pos of PLAYER_BASES) {
      expect(map.getTile(pos)?.owner).toBe('player');
    }
    expect(
      collect(map, (tile) => tile.terrainType === 'city' && tile.owner === 'player'),
    ).toHaveLength(0);
    expect(map.getTile(ENEMY_HQ)?.owner).toBe('enemy');
    expect(map.getTile(ENEMY_STATION)?.terrainType).toBe('station');
  });

  it('敵軍は大きい島の拠点 40 個のうち 6 割にあたる 24 個を占領済みで始まる', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const onEnemyIsland = (pos: GridPosition): boolean => pos.row >= 14 && pos.col >= 9;
    const islandBases = collect(
      map,
      (tile) =>
        onEnemyIsland(tile.position) && getTerrainData(tile.terrainType).canCapture,
    );
    expect(islandBases).toHaveLength(40);
    const enemyOwned = islandBases.filter((pos) => map.getTile(pos)?.owner === 'enemy');
    expect(enemyOwned).toHaveLength(24);
    expect(enemyOwned.length / islandBases.length).toBeCloseTo(0.6, 5);
    // 残る 4 割(16 個)は中立のまま。研究所 2 個と西の駅もそこに含まれる
    const neutral = islandBases.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(neutral).toHaveLength(16);
    expect(
      neutral.filter((pos) => map.getTile(pos)?.terrainType === 'laboratory'),
    ).toHaveLength(2);
    expect(map.getTile(ENEMY_WEST_STATION)?.owner).toBe('neutral');
  });

  it('陸地は 4 つの島に分かれ、相手の陣地へ通じる陸路は 1 本も無い', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const onLand = passable(map, 'infantry');
    const fromPlayer = floodFill(map, PLAYER_HQ, onLand);
    const fromEnemy = floodFill(map, ENEMY_HQ, onLand);
    expect(fromPlayer.has(key(ENEMY_HQ))).toBe(false);
    expect(fromEnemy.has(key(PLAYER_HQ))).toBe(false);
    // 左下の島と右端の小島も、どちらの陣地からも歩いては行けない
    for (const island of [SOUTHWEST_ISLAND, EAST_ISLET_WEST]) {
      expect(fromPlayer.has(key(island))).toBe(false);
      expect(fromEnemy.has(key(island))).toBe(false);
    }
    // 真ん中の島だけは、鉄橋を渡って自軍だけが歩いて行ける
    expect(fromPlayer.has(key(MID_ISLAND))).toBe(true);
    expect(fromEnemy.has(key(MID_ISLAND))).toBe(false);
  });

  it('自軍の線路は本拠地の 1 列右を真下へ伸び、海の上は幅 1 マスの鉄橋になる', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    expect(map.getTile(PLAYER_STATION)?.terrainType).toBe('station');
    // 駅は本拠地の右どなりで、線路はその 1 列(col 18)を真下へ進む
    expect(PLAYER_STATION.col).toBe(PLAYER_HQ.col + 1);
    for (let row = 3; row <= 12; row += 1) {
      const pos = gridPosition(18, row);
      const terrain = map.getTile(pos)?.terrainType;
      expect(terrain === 'railway' || terrain === 'station').toBe(true);
    }
    // 鉄橋の 3 マスは両どなりが海(幅 1 マスで海を渡っている)
    for (const pos of RAIL_BRIDGE) {
      expect(map.getTile(pos)?.terrainType).toBe('railway');
      for (const side of [
        { col: pos.col - 1, row: pos.row },
        { col: pos.col + 1, row: pos.row },
      ]) {
        expect(map.getTile(side)?.terrainType).toBe('sea');
      }
    }
    // 鉄橋を落とすと、自軍は真ん中の島へ歩いて渡れなくなる
    const closed = new Set(RAIL_BRIDGE.map(key));
    const withoutBridge = (pos: GridPosition): boolean =>
      passable(map, 'infantry')(pos) && !closed.has(key(pos));
    expect(floodFill(map, PLAYER_HQ, withoutBridge).has(key(MID_STATION))).toBe(false);
  });

  it('真ん中の島は中立の駅・都市 5・空港・港を持ち、自軍だけが陸で取りにいける', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const island = floodFill(map, MID_ISLAND, passable(map, 'infantry'));
    const tiles = [...island]
      .map((k) => {
        const [col, row] = k.split(',').map(Number);
        return map.getTile({ col, row });
      })
      .filter((tile) => tile !== undefined);
    const bases = tiles.filter((tile) => getTerrainData(tile.terrainType).canCapture);
    // 鉄橋づたいに自軍の島ともつながっているため、島の拠点だけを座標で絞り込む
    const onMidIsland = bases.filter(
      (tile) =>
        tile.position.row >= 8 &&
        tile.position.row <= 12 &&
        tile.position.col >= 14 &&
        tile.position.col <= 23,
    );
    expect(onMidIsland).toHaveLength(8);
    expect(onMidIsland.filter((tile) => tile.terrainType === 'city')).toHaveLength(5);
    for (const tile of onMidIsland) {
      expect(tile.owner).toBe('neutral');
    }
    expect(map.getTile(MID_STATION)?.terrainType).toBe('station');
    expect(map.getTile(MID_AIRPORT)?.terrainType).toBe('airport');
    expect(map.getTile(MID_PORT)?.terrainType).toBe('port');

    // 自軍の本拠地から中立の駅まで歩兵の移動コスト 8(3 ターンで届く)
    const distances = distancesFrom(map, PLAYER_HQ, 'infantry');
    expect(distances.get(MID_STATION)).toBe(8);
  });

  it('両軍の線路はつながっておらず、列車砲は自分の島から出られない', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const onRail = passable(map, 'rail');
    const playerRail = floodFill(map, PLAYER_STATION, onRail);
    const enemyRail = floodFill(map, ENEMY_STATION, onRail);
    // 自軍の線路は駅 (18,2) から南端 (18,12) までの 11 マス
    expect(playerRail.size).toBe(11);
    expect(playerRail.has(key(MID_STATION))).toBe(true);
    expect(playerRail.has(key(PLAYER_RAIL_END))).toBe(true);
    // 敵軍の線路は「上」と「左」の 2 本で、終点にそれぞれ駅がある
    expect(enemyRail.has(key(ENEMY_NORTH_STATION))).toBe(true);
    expect(enemyRail.has(key(ENEMY_WEST_STATION))).toBe(true);
    expect(map.getTile(ENEMY_NORTH_STATION)?.terrainType).toBe('station');
    expect(map.getTile(ENEMY_WEST_STATION)?.terrainType).toBe('station');
    // 上の駅は陣地の真上、左の駅は陣地より左にある
    expect(ENEMY_NORTH_STATION.col).toBe(ENEMY_STATION.col);
    expect(ENEMY_NORTH_STATION.row).toBeLessThan(ENEMY_STATION.row);
    expect(ENEMY_WEST_STATION.col).toBeLessThan(ENEMY_STATION.col);
    // 2 つの線路網は交わらない
    for (const pos of playerRail) {
      expect(enemyRail.has(pos)).toBe(false);
    }
  });

  it('両軍の線路の端どうしは 6 マスで、列車砲(射程 2〜6)が撃ち合える', () => {
    const railgun = getUnitData('railgun');
    expect(railgun.minAttackRange).toBe(2);
    expect(railgun.maxAttackRange).toBe(6);
    // 自軍の線路の南端 ←→ 敵軍の左の駅
    const between = manhattan(PLAYER_RAIL_END, ENEMY_WEST_STATION);
    expect(between).toBe(6);
    expect(between).toBeGreaterThanOrEqual(railgun.minAttackRange);
    expect(between).toBeLessThanOrEqual(railgun.maxAttackRange);
    // 敵軍の左の駅からは、真ん中の島の南の端も射程に入る
    const toIsland = manhattan(ENEMY_WEST_STATION, gridPosition(20, 12));
    expect(toIsland).toBeGreaterThanOrEqual(railgun.minAttackRange);
    expect(toIsland).toBeLessThanOrEqual(railgun.maxAttackRange);
  });

  it('敵軍の陣地へは上と左から川が 1 本ずつ流れ込み、戦艦の射程が本拠地に届く', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const onSea = passable(map, 'sea');
    const ocean = floodFill(map, gridPosition(0, 0), onSea);
    const rivers = collect(map, (tile) => tile.terrainType === 'river');
    // 川はすべて幅 1 マスで、外洋から遡上できる
    expect(rivers.length).toBeGreaterThan(0);
    for (const pos of rivers) {
      expect(ocean.has(key(pos))).toBe(true);
    }
    // 2 本の川はどちらも敵軍の本拠地から 3 マスで終わる(戦艦の最小射程)
    const battleship = getUnitData('battleship');
    expect(battleship.minAttackRange).toBe(3);
    for (const end of [RIVER_NORTH_END, RIVER_WEST_END]) {
      expect(map.getTile(end)?.terrainType).toBe('river');
      const range = manhattan(end, ENEMY_HQ);
      expect(range).toBeGreaterThanOrEqual(battleship.minAttackRange);
      expect(range).toBeLessThanOrEqual(battleship.maxAttackRange);
    }
    // 北の川は島の上側から、西の川は島の左側から入ってくる
    expect(
      collect(map, (tile) => tile.terrainType === 'river' && tile.position.row === 14),
    ).toHaveLength(1);
    expect(map.getTile(gridPosition(9, 22))?.terrainType).toBe('river');
    // 装輪車両は川を渡れない
    expect(map.getMoveCost(RIVER_WEST_END, 'wheeled')).toBeNull();
  });

  it('「 の右上から右端の小島までは輸送ヘリで 1 ターン', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const helicopter = getUnitData('transportHelicopter');
    const distances = distancesFrom(map, PLAYER_ARM_EAST_TOP, 'air');
    const reach = distances.get(EAST_ISLET_WEST);
    expect(reach).toBeDefined();
    expect(reach as number).toBeLessThanOrEqual(helicopter.movement);
    // 小島は盤面の右端にあり、中立都市 3 個だけでできている
    const islet = floodFill(map, EAST_ISLET_WEST, passable(map, 'infantry'));
    expect(islet.size).toBe(15);
    expect(Math.max(...[...islet].map((k) => Number(k.split(',')[0])))).toBe(
      map.cols - 2,
    );
    const cities = [...islet]
      .map((k) => {
        const [col, row] = k.split(',').map(Number);
        return map.getTile({ col, row });
      })
      .filter((tile) => tile && getTerrainData(tile.terrainType).canCapture);
    expect(cities).toHaveLength(3);
    for (const tile of cities) {
      expect(tile?.terrainType).toBe('city');
      expect(tile?.owner).toBe('neutral');
    }
  });

  it('左下の島は中立の空港 1・都市 4 を持つ', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const island = floodFill(map, SOUTHWEST_ISLAND, passable(map, 'infantry'));
    const bases = [...island]
      .map((k) => {
        const [col, row] = k.split(',').map(Number);
        return map.getTile({ col, row });
      })
      .filter((tile) => tile && getTerrainData(tile.terrainType).canCapture);
    expect(bases).toHaveLength(5);
    expect(bases.filter((tile) => tile?.terrainType === 'airport')).toHaveLength(1);
    expect(bases.filter((tile) => tile?.terrainType === 'city')).toHaveLength(4);
    for (const tile of bases) {
      expect(tile?.owner).toBe('neutral');
    }
  });

  it('自軍の港は線路の左と右に 1 つずつあり、すべての港は外洋とつながっている', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const [west, east] = PLAYER_PORTS;
    expect(west.col).toBe(PLAYER_STATION.col - 1);
    expect(east.col).toBe(PLAYER_STATION.col + 1);
    expect(west.row).toBe(east.row);
    const ocean = floodFill(map, gridPosition(0, 0), passable(map, 'sea'));
    for (const pos of collect(map, (tile) => tile.terrainType === 'port')) {
      expect(ocean.has(key(pos))).toBe(true);
      expect(
        neighbors(pos).some((next) => map.getTile(next)?.terrainType === 'sea'),
      ).toBe(true);
    }
  });

  it('占領できる拠点は 79 個で、敵の島へ渡らずに取り切れるだけでも収入で上回れる', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const capturable = collect(
      map,
      (tile) => getTerrainData(tile.terrainType).canCapture,
    );
    expect(capturable).toHaveLength(79);
    const neutral = capturable.filter((pos) => map.getTile(pos)?.owner === 'neutral');
    expect(neutral).toHaveLength(46);
    // 敵の島の外にある中立拠点は 30 個。自軍の 9 拠点と合わせて 39 拠点で、敵軍の 24 を超える
    const outsideEnemyIsland = neutral.filter((pos) => !(pos.row >= 14 && pos.col >= 9));
    expect(outsideEnemyIsland).toHaveLength(30);
    expect(9 + outsideEnemyIsland.length).toBeGreaterThan(24);
  });

  it('自軍の島の縦棒の左下に、敵の島へ渡らずに取れるただ 1 つの中立研究所がある', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    expect(map.getTile(PLAYER_LABORATORY)?.terrainType).toBe('laboratory');
    expect(map.getTile(PLAYER_LABORATORY)?.owner).toBe('neutral');
    // 自軍が歩いて行ける範囲(「 の島 + 真ん中の島)にある研究所はこの 1 個だけ
    const reachable = floodFill(map, PLAYER_HQ, passable(map, 'infantry'));
    const laboratories = collect(map, (tile) => tile.terrainType === 'laboratory');
    expect(laboratories).toHaveLength(3);
    expect(laboratories.filter((pos) => reachable.has(key(pos)))).toEqual([
      PLAYER_LABORATORY,
    ]);
    // 縦棒(cols 3〜7)のいちばん下の行にあり、街道・中立港・中立都市がとなり合う
    expect(PLAYER_LABORATORY.row).toBe(12);
    expect(
      neighbors(PLAYER_LABORATORY).some(
        (pos) => map.getTile(pos)?.terrainType === 'road',
      ),
    ).toBe(true);
    expect(map.getTile(gridPosition(3, 11))?.terrainType).toBe('port');
    expect(map.getTile(gridPosition(6, 12))?.terrainType).toBe('city');
    // 本拠地からは縦棒の街道づたいに歩兵の移動コスト 23(真ん中の島の駅 8 の 3 倍近い遠征)
    const distances = distancesFrom(map, PLAYER_HQ, 'infantry');
    expect(distances.get(PLAYER_LABORATORY)).toBe(23);
  });

  it('敵軍だけが初期部隊を持ち、輸送艦は中戦車と対空戦車を積んだまま始まる', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const manager = UnitManager.fromPlacements(IRON_RIVER_ISLANDS_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);

    const enemies = manager.getUnitsByArmy('enemy');
    expect(enemies).toHaveLength(5);
    const countOf = (unitType: string): number =>
      enemies.filter((unit) => unit.unitType === unitType).length;
    expect(countOf('fighter')).toBe(1);
    expect(countOf('bomber')).toBe(1);
    expect(countOf('battleship')).toBe(1);
    expect(countOf('escortShip')).toBe(1);
    expect(countOf('transportShip')).toBe(1);

    // 航空機は敵軍の空港に置いてあり、そこで修理できる
    for (const unit of enemies.filter(
      (item) => item.unitType === 'fighter' || item.unitType === 'bomber',
    )) {
      const tile = map.getTile(unit.position);
      expect(tile?.terrainType).toBe('airport');
      expect(tile?.owner).toBe('enemy');
    }

    // 輸送艦は定員いっぱいの 2 体(中戦車・対空戦車)を搭乗済みで持つ
    const transport = enemies.find((unit) => unit.unitType === 'transportShip');
    expect(transport?.carried.map((unit) => unit.unitType)).toEqual([
      'mediumTank',
      'antiAirTank',
    ]);
    expect(transport?.freeCapacity).toBe(0);
    for (const passenger of transport?.carried ?? []) {
      expect(passenger.armyType).toBe('enemy');
      // 積荷は盤面には出ていない(輸送艦の中にいる)
      expect(manager.getUnitById(passenger.id)).toBeUndefined();
    }
  });

  it('敵軍の艦隊は真ん中の島を初期位置から射程に収めている', () => {
    const map = MapManager.fromDefinition(IRON_RIVER_ISLANDS_MAP);
    const manager = UnitManager.fromPlacements(IRON_RIVER_ISLANDS_MAP.units ?? [], map);
    const ships = manager
      .getUnitsByArmy('enemy')
      .filter((unit) => getUnitData(unit.unitType).movementType === 'sea');
    expect(ships).toHaveLength(3);
    for (const ship of ships) {
      expect(map.getTile(ship.position)?.terrainType).toBe('sea');
      expect(ship.position.row).toBe(13);
    }
    const battleship = ships.find((unit) => unit.unitType === 'battleship');
    const data = getUnitData('battleship');
    // 真ん中の島の東半分に、初期位置のまま届くマスがある
    const inRange = collect(map, (tile) => {
      const range = manhattan(tile.position, battleship!.position);
      return (
        tile.position.row >= 8 &&
        tile.position.row <= 12 &&
        range >= data.minAttackRange &&
        range <= data.maxAttackRange
      );
    });
    expect(inRange.length).toBeGreaterThan(0);
  });
});
