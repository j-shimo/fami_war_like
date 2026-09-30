import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { distancesFrom } from '@/core/movement/PathDistance';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { SYMBOL_TO_TERRAIN } from '@/data/maps/mapDefinition';
import { canRepairAt, getTerrainData } from '@/data/terrainData';

/** 地形 1 マスぶんの移動コストを移動タイプ別に取り出す */
function cost(
  terrain: Parameters<typeof getTerrainData>[0],
  movementType: MovementType,
): number | null {
  return getTerrainData(terrain).moveCost[movementType];
}

describe('地形「浅瀬」(shoal)のパラメータ', () => {
  it('マップ記号 s は浅瀬に対応する', () => {
    expect(SYMBOL_TO_TERRAIN.s).toBe('shoal');
    const map = MapManager.fromDefinition({ name: 'shoal', terrain: ['s'] });
    expect(map.getTile(gridPosition(0, 0))?.terrainType).toBe('shoal');
  });

  it('歩兵はコスト 2(川と同じ)で渡れる', () => {
    expect(cost('shoal', 'infantry')).toBe(2);
    expect(cost('shoal', 'infantry')).toBe(cost('river', 'infantry'));
  });

  it('装軌車両(戦車系)は平地と同じコスト 1 で渡れる', () => {
    expect(cost('shoal', 'vehicle')).toBe(1);
    expect(cost('shoal', 'vehicle')).toBe(cost('plain', 'vehicle'));
  });

  it('装輪車両(偵察車・ロケット砲)はコスト 4(海岸と同じ)で渡れる', () => {
    expect(cost('shoal', 'wheeled')).toBe(4);
    expect(cost('shoal', 'wheeled')).toBe(cost('beach', 'wheeled'));
  });

  it('列車砲(軌道)は渡れない', () => {
    expect(cost('shoal', 'rail')).toBeNull();
  });

  it('海上ユニットは海と同じコスト 1 で進め、飛行ユニットも通れる', () => {
    expect(cost('shoal', 'sea')).toBe(cost('sea', 'sea'));
    expect(cost('shoal', 'air')).toBe(1);
  });

  it('遮蔽の無い水面なので防御値は 0(川・海岸と同じ)', () => {
    expect(getTerrainData('shoal').defense).toBe(0);
    expect(getTerrainData('shoal').defense).toBe(getTerrainData('river').defense);
  });

  it('占領・生産・修理はできない自然地形である', () => {
    const data = getTerrainData('shoal');
    expect(data.canCapture).toBe(false);
    expect(data.canProduce).toBe(false);
    expect(data.canRepair).toBe(false);
    for (const movementType of [
      'infantry',
      'vehicle',
      'wheeled',
      'air',
      'sea',
    ] as const) {
      expect(canRepairAt('shoal', movementType)).toBe(false);
    }
  });

  it('川と違って車両(装軌・装輪)も渡れる', () => {
    for (const movementType of ['vehicle', 'wheeled'] as const) {
      expect(cost('river', movementType)).toBeNull();
      expect(cost('shoal', movementType)).not.toBeNull();
    }
  });

  it('川と見分けられるよう、描画色が川と異なる', () => {
    expect(getTerrainData('shoal').color).not.toBe(getTerrainData('river').color);
  });
});

describe('浅瀬の渡渉(幅 1 マスの浅瀬を挟んだ盤面)', () => {
  // 横一列: 平地・浅瀬・平地。浅瀬 1 マスで左右の陸地が隔てられている
  const def: MapDefinition = { name: 'shoal', terrain: ['.s.'] };

  /** 指定種別のユニットを (0,0) に置いて移動範囲を求める */
  function rangeFrom(
    unitType: Parameters<typeof UnitManager.fromPlacements>[0][number]['unitType'],
  ) {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType, army: 'player' }],
      map,
    );
    const unit = units.getUnitAt(gridPosition(0, 0));
    if (!unit) throw new Error('ユニットが配置されていない');
    return calculateMovementRange(unit, map, units);
  }

  it('歩兵はコスト 2 で渡り、対岸(コスト 3)まで届く', () => {
    const range = rangeFrom('infantry');
    expect(range.getCost(gridPosition(1, 0))).toBe(2);
    expect(range.getCost(gridPosition(2, 0))).toBe(3);
  });

  it('装軌車両(中戦車)はコスト 1 で渡り、対岸(コスト 2)まで届く', () => {
    const range = rangeFrom('mediumTank');
    expect(range.getCost(gridPosition(1, 0))).toBe(1);
    expect(range.getCost(gridPosition(2, 0))).toBe(2);
  });

  it('装輪車両(偵察車)はコスト 4 で渡り、対岸(平地 2 を足してコスト 6)まで届く', () => {
    const range = rangeFrom('recon');
    expect(range.getCost(gridPosition(1, 0))).toBe(4);
    expect(range.getCost(gridPosition(2, 0))).toBe(6);
  });

  it('装輪車両(ロケット砲)もコスト 4 で浅瀬へ入れる', () => {
    const range = rangeFrom('rocketArtillery');
    expect(range.getCost(gridPosition(1, 0))).toBe(4);
  });
});

describe('浅瀬を通る海上ユニット', () => {
  it('海上ユニットは浅瀬を通って、向こうの海へ抜けられる', () => {
    const map = MapManager.fromDefinition({ name: 'shoal', terrain: ['~sss~'] });
    const distances = distancesFrom(map, gridPosition(0, 0), 'sea');
    expect(distances.get(gridPosition(4, 0))).toBe(4);
  });
});
