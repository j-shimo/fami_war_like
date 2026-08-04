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

  it('初期配置をマップ上に矛盾なく展開できる', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
    const manager = UnitManager.fromPlacements(CAPTURE_MAP.units ?? [], map);
    expect(manager.getUnitsByArmy('player')).toHaveLength(3);
    expect(manager.getUnitsByArmy('enemy')).toHaveLength(3);
  });

  it('初期資金は 0 に設定されている', () => {
    expect(CAPTURE_MAP.initialFunds).toBe(0);
  });

  it('自軍・敵軍は本拠地・工場・都市を 1 つずつ所有して開始する', () => {
    const map = MapManager.fromDefinition(CAPTURE_MAP);
    const owned = { player: 0, enemy: 0 };
    map.forEachTile((tile) => {
      if (tile.owner === 'player') owned.player += 1;
      if (tile.owner === 'enemy') owned.enemy += 1;
    });
    expect(owned.player).toBe(3);
    expect(owned.enemy).toBe(3);
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
