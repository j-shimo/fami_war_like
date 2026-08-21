import { describe, expect, it } from 'vitest';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import { SEA_MAP } from '@/data/maps/seaMap';
import { getTerrainData } from '@/data/terrainData';

describe('SEA_MAP(沿岸対角マップ)', () => {
  it('縦20・横20 のサイズで生成できる', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    expect(map.cols).toBe(20);
    expect(map.rows).toBe(20);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    const manager = UnitManager.fromPlacements(SEA_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('自軍・敵軍は本拠地 1・工場 2・空港 1・港 1 の計 5 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    const owned = {
      player: { total: 0, factory: 0, headquarters: 0, airport: 0, port: 0 },
      enemy: { total: 0, factory: 0, headquarters: 0, airport: 0, port: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const side = owned[tile.owner];
      side.total += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
      if (tile.terrainType === 'port') side.port += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.total).toBe(5);
      expect(side.factory).toBe(2);
      expect(side.headquarters).toBe(1);
      expect(side.airport).toBe(1);
      expect(side.port).toBe(1);
    }
  });

  it('自軍は左下、敵軍は右上に本拠地を構える', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    // 左下(row 19・col 0)が自軍本拠地
    const playerHq = map.getTile({ col: 0, row: 19 });
    expect(playerHq?.terrainType).toBe('headquarters');
    expect(playerHq?.owner).toBe('player');
    // 右上(row 0・col 19)が敵軍本拠地
    const enemyHq = map.getTile({ col: 19, row: 0 });
    expect(enemyHq?.terrainType).toBe('headquarters');
    expect(enemyHq?.owner).toBe('enemy');
  });

  it('海が盤面の大きな割合(1/4 以上)を占める', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    let seaTiles = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'sea') seaTiles += 1;
    });
    // 20x20 = 400 マスのうち海が 100 マス(1/4)以上。海主体のマップである。
    expect(seaTiles).toBeGreaterThanOrEqual(100);
  });

  it('飛行ユニットで奪い合う中立の空港が存在する', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    let neutralAirports = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType === 'airport' && tile.owner === 'neutral') {
        neutralAirports += 1;
      }
    });
    // 海に囲まれた島の中立空港。飛行ユニットの前進生産拠点として争う対象。
    expect(neutralAirports).toBeGreaterThanOrEqual(2);
  });

  it('中立の島の空港は「連続 2 マス」の陸地で、海に囲まれた孤島になっている', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    const isLand = (col: number, row: number): boolean => {
      const t = map.getTile({ col, row });
      return t !== undefined && t.terrainType !== 'sea';
    };
    const landNeighbors = (col: number, row: number): { col: number; row: number }[] =>
      [
        { col, row: row - 1 },
        { col, row: row + 1 },
        { col: col - 1, row },
        { col: col + 1, row },
      ].filter((p) => isLand(p.col, p.row));

    map.forEachTile((tile) => {
      if (tile.terrainType !== 'airport' || tile.owner !== 'neutral') return;
      const { col, row } = tile.position;
      // 空港マスに隣接する陸地はちょうど 1 マス(相方の平地)。これで「連続 2 マス」の島になる。
      // 1 マスだけの島だと、降ろした歩兵が海上の輸送ヘリに乗り込めず詰むため、必ず 2 マス確保する。
      const airportLand = landNeighbors(col, row);
      expect(airportLand).toHaveLength(1);
      // 相方の平地マスは、空港マス以外の隣接がすべて海(=島全体が海に囲まれ孤立している)。
      const partner = airportLand[0];
      const partnerLand = landNeighbors(partner.col, partner.row);
      expect(partnerLand).toHaveLength(1);
      expect(partnerLand[0]).toEqual({ col, row });
    });
  });

  it('すべての港は海に隣接し、陸からも歩兵で到達できる(艦隊の出港と占領ができる)', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    const neighbors = (col: number, row: number) => [
      { col, row: row - 1 },
      { col, row: row + 1 },
      { col: col - 1, row },
      { col: col + 1, row },
    ];

    let ports = 0;
    map.forEachTile((tile) => {
      if (tile.terrainType !== 'port') return;
      ports += 1;
      const { col, row } = tile.position;
      const around = neighbors(col, row)
        .map((p) => map.getTile(p))
        .filter((t) => t !== undefined);
      // 海上ユニットが出港できるよう、必ず海のマスに面している
      expect(around.some((t) => t.terrainType === 'sea')).toBe(true);
      // 歩兵が占領しに来られるよう、陸(歩兵が進入できる地形)にも面している
      expect(
        around.some((t) => getTerrainData(t.terrainType).moveCost.infantry !== null),
      ).toBe(true);
    });
    // 自軍 1・敵軍 1・中立 2 の計 4 つ
    expect(ports).toBe(4);
  });

  it('海は中央の地峡で 2 つの水域に分かれ、どちらの水域にも港がある', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    // 海マスを 4 近傍で連結成分に分ける
    const key = (col: number, row: number) => `${col},${row}`;
    const seaKeys = new Set<string>();
    map.forEachTile((tile) => {
      if (tile.terrainType === 'sea')
        seaKeys.add(key(tile.position.col, tile.position.row));
    });

    const visited = new Set<string>();
    const components: Set<string>[] = [];
    for (const start of seaKeys) {
      if (visited.has(start)) continue;
      const component = new Set<string>();
      const stack = [start];
      visited.add(start);
      while (stack.length > 0) {
        const current = stack.pop()!;
        component.add(current);
        const [col, row] = current.split(',').map(Number);
        for (const next of [
          key(col, row - 1),
          key(col, row + 1),
          key(col - 1, row),
          key(col + 1, row),
        ]) {
          if (seaKeys.has(next) && !visited.has(next)) {
            visited.add(next);
            stack.push(next);
          }
        }
      }
      components.push(component);
    }
    expect(components).toHaveLength(2);

    // 各水域に、そこから出港できる港が 2 つずつ面している
    for (const component of components) {
      let portsOnSea = 0;
      map.forEachTile((tile) => {
        if (tile.terrainType !== 'port') return;
        const { col, row } = tile.position;
        const touches = [
          key(col, row - 1),
          key(col, row + 1),
          key(col - 1, row),
          key(col + 1, row),
        ].some((k) => component.has(k));
        if (touches) portsOnSea += 1;
      });
      expect(portsOnSea).toBe(2);
    }
  });

  it('中立で占領可能な拠点が存在する', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    let neutralBases = 0;
    map.forEachTile((tile) => {
      if (tile.owner === 'neutral' && getTerrainData(tile.terrainType).canCapture) {
        neutralBases += 1;
      }
    });
    expect(neutralBases).toBeGreaterThan(0);
  });
});
