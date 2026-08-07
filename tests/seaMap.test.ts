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

  it('自軍・敵軍は本拠地 1・工場 2・空港 1 の計 4 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    const owned = {
      player: { total: 0, factory: 0, headquarters: 0, airport: 0 },
      enemy: { total: 0, factory: 0, headquarters: 0, airport: 0 },
    };
    map.forEachTile((tile) => {
      if (tile.owner !== 'player' && tile.owner !== 'enemy') return;
      const side = owned[tile.owner];
      side.total += 1;
      if (tile.terrainType === 'factory') side.factory += 1;
      if (tile.terrainType === 'headquarters') side.headquarters += 1;
      if (tile.terrainType === 'airport') side.airport += 1;
    });
    for (const side of [owned.player, owned.enemy]) {
      expect(side.total).toBe(4);
      expect(side.factory).toBe(2);
      expect(side.headquarters).toBe(1);
      expect(side.airport).toBe(1);
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

  it('中立の島の空港は海に囲まれ、地上ユニットが進入できない', () => {
    const map = MapManager.fromDefinition(SEA_MAP);
    map.forEachTile((tile) => {
      if (tile.terrainType !== 'airport' || tile.owner !== 'neutral') return;
      const { col, row } = tile.position;
      const neighbors = [
        { col, row: row - 1 },
        { col, row: row + 1 },
        { col: col - 1, row },
        { col: col + 1, row },
      ];
      for (const pos of neighbors) {
        const adjacent = map.getTile(pos);
        // 盤内の隣接マスはすべて海(=島)。歩兵・車両は海に進入できないため到達できない。
        if (adjacent) expect(adjacent.terrainType).toBe('sea');
      }
    });
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
