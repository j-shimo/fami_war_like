import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { INITIAL_CAPTURE_HP } from '@/core/map/TileData';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { TEST_MAP } from '@/data/maps/testMap';

describe('MapManager', () => {
  it('マップ定義から正しいサイズで生成される', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(map.cols).toBe(10);
    expect(map.rows).toBe(10);
  });

  it('地形記号を地形種別へ変換する', () => {
    const def: MapDefinition = {
      name: 'mini',
      terrain: ['.fm', 'rcF'],
    };
    const map = MapManager.fromDefinition(def);
    expect(map.getTile(gridPosition(0, 0))?.terrainType).toBe('plain');
    expect(map.getTile(gridPosition(1, 0))?.terrainType).toBe('forest');
    expect(map.getTile(gridPosition(2, 0))?.terrainType).toBe('mountain');
    expect(map.getTile(gridPosition(0, 1))?.terrainType).toBe('road');
    expect(map.getTile(gridPosition(1, 1))?.terrainType).toBe('city');
    expect(map.getTile(gridPosition(2, 1))?.terrainType).toBe('factory');
  });

  it('海・空港の地形記号を地形種別へ変換する', () => {
    const def: MapDefinition = { name: 'mini2', terrain: ['~A'] };
    const map = MapManager.fromDefinition(def);
    expect(map.getTile(gridPosition(0, 0))?.terrainType).toBe('sea');
    expect(map.getTile(gridPosition(1, 0))?.terrainType).toBe('airport');
  });

  it('海は地上ユニット(歩兵・車両)ともに進入不可', () => {
    const def: MapDefinition = { name: 'sea', terrain: ['~'] };
    const map = MapManager.fromDefinition(def);
    expect(map.getMoveCost(gridPosition(0, 0), 'infantry')).toBeNull();
    expect(map.getMoveCost(gridPosition(0, 0), 'vehicle')).toBeNull();
  });

  it('空港は占領可能地形なので所有者を指定できる', () => {
    const def: MapDefinition = {
      name: 'airport',
      terrain: ['A'],
      owners: [{ col: 0, row: 0, owner: 'player' }],
    };
    const map = MapManager.fromDefinition(def);
    expect(map.getTile(gridPosition(0, 0))?.owner).toBe('player');
  });

  it('占領可能地形の初期所有者は中立で占領耐久値は初期値', () => {
    const def: MapDefinition = { name: 'c', terrain: ['c'] };
    const map = MapManager.fromDefinition(def);
    const tile = map.getTile(gridPosition(0, 0));
    expect(tile?.owner).toBe('neutral');
    expect(tile?.captureHp).toBe(INITIAL_CAPTURE_HP);
  });

  it('所有者オーバーライドが適用される', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(map.getTile(gridPosition(3, 0))?.owner).toBe('enemy');
    expect(map.getTile(gridPosition(6, 9))?.owner).toBe('player');
  });

  it('範囲外の座標には undefined を返す', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(map.getTile(gridPosition(-1, 0))).toBeUndefined();
    expect(map.getTile(gridPosition(10, 0))).toBeUndefined();
    expect(map.getTerrainData(gridPosition(0, 10))).toBeUndefined();
  });

  it('移動コストを地形と移動タイプに応じて返す', () => {
    const def: MapDefinition = { name: 'mv', terrain: ['.fm'] };
    const map = MapManager.fromDefinition(def);
    // 平地
    expect(map.getMoveCost(gridPosition(0, 0), 'infantry')).toBe(1);
    expect(map.getMoveCost(gridPosition(0, 0), 'vehicle')).toBe(1);
    // 森は車両コスト2
    expect(map.getMoveCost(gridPosition(1, 0), 'vehicle')).toBe(2);
    // 山は車両進入不可
    expect(map.getMoveCost(gridPosition(2, 0), 'infantry')).toBe(2);
    expect(map.getMoveCost(gridPosition(2, 0), 'vehicle')).toBeNull();
  });

  it('範囲外の移動コストは null を返す', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    expect(map.getMoveCost(gridPosition(-1, 0), 'infantry')).toBeNull();
  });

  it('forEachTile で全マスを走査する', () => {
    const map = MapManager.fromDefinition(TEST_MAP);
    let count = 0;
    map.forEachTile(() => {
      count += 1;
    });
    expect(count).toBe(100);
  });

  it('行の長さが不揃いなら例外を投げる', () => {
    const def: MapDefinition = { name: 'bad', terrain: ['..', '...'] };
    expect(() => MapManager.fromDefinition(def)).toThrow();
  });

  it('未知の地形記号なら例外を投げる', () => {
    const def: MapDefinition = { name: 'bad', terrain: ['x'] };
    expect(() => MapManager.fromDefinition(def)).toThrow();
  });

  it('占領できない地形への所有者指定は例外を投げる', () => {
    const def: MapDefinition = {
      name: 'bad',
      terrain: ['.'],
      owners: [{ col: 0, row: 0, owner: 'player' }],
    };
    expect(() => MapManager.fromDefinition(def)).toThrow();
  });
});
