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
import { computeRiverLinks } from '@/rendering/roadLinks';

/** 地形 1 マスぶんの移動コストを移動タイプ別に取り出す */
function cost(
  terrain: Parameters<typeof getTerrainData>[0],
  movementType: MovementType,
): number | null {
  return getTerrainData(terrain).moveCost[movementType];
}

describe('地形「川」(river)のパラメータ', () => {
  it('マップ記号 w は川に対応する', () => {
    expect(SYMBOL_TO_TERRAIN.w).toBe('river');
    const map = MapManager.fromDefinition({ name: 'river', terrain: ['w'] });
    expect(map.getTile(gridPosition(0, 0))?.terrainType).toBe('river');
  });

  it('歩兵はコスト 2、装軌車両はコスト 3 で渡れる', () => {
    expect(cost('river', 'infantry')).toBe(2);
    expect(cost('river', 'vehicle')).toBe(3);
  });

  it('装輪車両(偵察車・ロケット砲)と列車砲(軌道)は渡れない', () => {
    expect(cost('river', 'wheeled')).toBeNull();
    expect(cost('river', 'rail')).toBeNull();
  });

  it('海上ユニットは海と同じコスト 1 で遡上でき、飛行ユニットも通れる', () => {
    expect(cost('river', 'sea')).toBe(cost('sea', 'sea'));
    expect(cost('river', 'air')).toBe(1);
  });

  it('遮蔽の無い浅瀬なので防御値は 0(海・海岸と同じ)', () => {
    expect(getTerrainData('river').defense).toBe(0);
    expect(getTerrainData('river').defense).toBe(getTerrainData('beach').defense);
  });

  it('占領・生産・修理はできない自然地形である', () => {
    const data = getTerrainData('river');
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
      expect(canRepairAt('river', movementType)).toBe(false);
    }
  });

  it('占領できない地形なので、マップ定義で所有者を指定するとエラーになる', () => {
    expect(() =>
      MapManager.fromDefinition({
        name: 'river',
        terrain: ['w'],
        owners: [{ col: 0, row: 0, owner: 'player' }],
      }),
    ).toThrow();
  });

  it('海と違って地上ユニットが渡れる(そこが海との唯一の違いになる)', () => {
    for (const movementType of ['infantry', 'vehicle'] as const) {
      expect(cost('sea', movementType)).toBeNull();
      expect(cost('river', movementType)).not.toBeNull();
    }
  });
});

describe('川の渡河(幅 1 マスの川を挟んだ盤面)', () => {
  // 横一列: 平地・川・平地。川 1 マスで左右の陸地が隔てられている
  const def: MapDefinition = { name: 'river', terrain: ['.w.'] };

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
    expect(range.canReach(gridPosition(2, 0))).toBe(true);
    expect(range.getCost(gridPosition(2, 0))).toBe(3);
  });

  it('装軌車両(中戦車)はコスト 3 で渡れる', () => {
    const range = rangeFrom('mediumTank');
    expect(range.getCost(gridPosition(1, 0))).toBe(3);
    expect(range.canReach(gridPosition(2, 0))).toBe(true);
  });

  it('装輪車両(偵察車)は移動力 8 でも渡れない', () => {
    const range = rangeFrom('recon');
    expect(range.canReach(gridPosition(1, 0))).toBe(false);
    expect(range.canReach(gridPosition(2, 0))).toBe(false);
  });
});

describe('川を通る海上ユニット', () => {
  // 海 → 川(3 マス)→ 海。川が 2 つの海をつなぐ水路になっている
  const def: MapDefinition = { name: 'river', terrain: ['~www~'] };

  it('海上ユニットは川を遡上して、川の向こうの海へ抜けられる', () => {
    const map = MapManager.fromDefinition(def);
    const distances = distancesFrom(map, gridPosition(0, 0), 'sea');
    // 川 3 マス + 海 1 マスで、すべてコスト 1 ずつ進める
    expect(distances.get(gridPosition(4, 0))).toBe(4);
  });

  it('海上ユニットの移動範囲にも川が含まれる', () => {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'escortShip', army: 'player' }],
      map,
    );
    const escortShip = units.getUnitAt(gridPosition(0, 0));
    if (!escortShip) throw new Error('護衛艦が配置されていない');

    const range = calculateMovementRange(escortShip, map, units);
    for (let col = 1; col <= 4; col += 1) {
      expect(range.canReach(gridPosition(col, 0))).toBe(true);
    }
  });
});

describe('computeRiverLinks', () => {
  function linksAt(def: MapDefinition, col: number, row: number) {
    const map = MapManager.fromDefinition(def);
    return computeRiverLinks(map, gridPosition(col, row));
  }

  it('川・海・海岸・港へはつながり、陸地へはつながらない', () => {
    // row0: 平地 / 川 / 平地
    // row1: 海岸 / 川 / 森
    // row2: 平地 / 海  / 平地
    const def: MapDefinition = { name: '川の連結', terrain: ['.w.', 'bwf', '.~.'] };
    // 中央 (1,1): 上=川 / 下=海 / 左=海岸 → true、右=森 → false
    expect(linksAt(def, 1, 1)).toEqual({
      up: true,
      down: true,
      left: true,
      right: false,
    });
  });

  it('港も水面としてつながる(川が港へ注ぐ描画のため)', () => {
    const def: MapDefinition = { name: '川と港', terrain: ['Pw.'] };
    const links = linksAt(def, 1, 0);
    expect(links.left).toBe(true);
    expect(links.right).toBe(false);
  });

  it('マップ外に面した方向と、陸地に囲まれた川はつながらない', () => {
    const def: MapDefinition = { name: '孤立した川', terrain: ['w'] };
    expect(linksAt(def, 0, 0)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });
});
