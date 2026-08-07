import { describe, expect, it } from 'vitest';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import { CAPTURE_MAP } from '@/data/maps/captureMap';
import { getTerrainData } from '@/data/terrainData';

describe('CAPTURE_MAP(拠点争奪マップ)', () => {
  it('縦10・横15 のサイズで生成できる', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
    expect(map.cols).toBe(15);
    expect(map.rows).toBe(10);
  });

  it('初期ユニットは配置しない(0 体で開始する)', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
    const manager = UnitManager.fromPlacements(CAPTURE_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(0);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(0);
  });

  it('初期資金は 0 に設定されている', () => {
    expect(CAPTURE_MAP.initialFunds).toBe(0);
  });

  it('自軍・敵軍は本拠地 1・工場 2 の計 3 拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
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
      expect(side.total).toBe(3);
      expect(side.factory).toBe(2);
      expect(side.headquarters).toBe(1);
      expect(side.airport).toBe(0);
    }
  });

  it('各軍は工場・本拠地の 3 生産拠点を所有して開始する', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
    let producibleTiles = 0;
    map.forEachTile((tile) => {
      if (tile.owner === 'player' && getTerrainData(tile.terrainType).canProduce) {
        producibleTiles += 1;
      }
    });
    expect(producibleTiles).toBe(3);
  });

  it('中央に取り合いの対象となる中立拠点が存在する', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
    let neutralBases = 0;
    map.forEachTile((tile) => {
      if (tile.owner === 'neutral' && getTerrainData(tile.terrainType).canCapture) {
        neutralBases += 1;
      }
    });
    // 中央工場 1 + 中立都市 6 = 7 拠点
    expect(neutralBases).toBe(7);
  });
});
