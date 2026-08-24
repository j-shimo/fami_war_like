import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { canAttackUnit } from '@/core/battle/AttackRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { canCarry } from '@/core/units/transport';
import { UNIT_TYPES } from '@/core/units/UnitType';
import { getBaseDamage } from '@/data/damageTable';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { canRepairAt, getTerrainData } from '@/data/terrainData';
import { getUnitData, isProducibleAt } from '@/data/unitData';

/** テスト用のユニットを 1 体作る */
function makeUnit(
  unitType: Parameters<typeof getUnitData>[0],
  army: 'player' | 'enemy',
  col = 0,
  row = 0,
): Unit {
  return new Unit({
    id: `${army}-${unitType}`,
    unitType,
    armyType: army,
    position: gridPosition(col, row),
  });
}

describe('偵察車の基本パラメータ', () => {
  it('ユニット種別の一覧に含まれる', () => {
    expect(UNIT_TYPES).toContain('recon');
  });

  it('コスト3500・移動力8・近接攻撃のみの地上ユニット', () => {
    const data = getUnitData('recon');
    expect(data.unitName).toBe('偵察車');
    expect(data.cost).toBe(3500);
    expect(data.movement).toBe(8);
    expect(data.movementType).toBe('wheeled');
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
    expect(data.canCapture).toBe(false);
  });

  it('夜戦では護衛艦と並ぶ最大の視界(5)を持つ', () => {
    expect(getUnitData('recon').vision).toBe(5);
    expect(getUnitData('recon').vision).toBe(getUnitData('escortShip').vision);
    // 山の視界ボーナスは歩兵だけのもので、偵察車は山へ入れない
    expect(getUnitData('recon').mountainVisionBonus).toBe(0);
  });

  it('工場・本拠地でのみ生産できる', () => {
    expect(isProducibleAt('factory', 'recon')).toBe(true);
    expect(isProducibleAt('headquarters', 'recon')).toBe(true);
    expect(isProducibleAt('airport', 'recon')).toBe(false);
    expect(isProducibleAt('port', 'recon')).toBe(false);
  });

  it('地上ユニットなので都市・工場・本拠地で修理できる', () => {
    expect(canRepairAt('city', 'wheeled')).toBe(true);
    expect(canRepairAt('factory', 'wheeled')).toBe(true);
    expect(canRepairAt('headquarters', 'wheeled')).toBe(true);
    expect(canRepairAt('airport', 'wheeled')).toBe(false);
    expect(canRepairAt('port', 'wheeled')).toBe(false);
  });

  it('輸送艦に積める地上ユニットに含まれる', () => {
    const transport = makeUnit('transportShip', 'player');
    expect(canCarry(transport, makeUnit('recon', 'player'))).toBe(true);
    // 輸送ヘリは歩兵しか運べない
    expect(
      canCarry(makeUnit('transportHelicopter', 'player'), makeUnit('recon', 'player')),
    ).toBe(false);
  });
});

describe('偵察車の地形移動コスト', () => {
  it('道路・占領できる地形は1、平地は2、海岸は4、森・山・海は進入不可', () => {
    const cost = (terrain: Parameters<typeof getTerrainData>[0]): number | null =>
      getTerrainData(terrain).moveCost.wheeled;

    expect(cost('road')).toBe(1);
    expect(cost('city')).toBe(1);
    expect(cost('factory')).toBe(1);
    expect(cost('airport')).toBe(1);
    expect(cost('port')).toBe(1);
    expect(cost('headquarters')).toBe(1);
    expect(cost('plain')).toBe(2);
    expect(cost('beach')).toBe(4);
    expect(cost('forest')).toBeNull();
    expect(cost('mountain')).toBeNull();
    expect(cost('sea')).toBeNull();
  });

  it('道路は移動力8ぶん進めるが、森・山は迂回する', () => {
    // 横一列: 道路が続き、途中に森を挟む
    const def: MapDefinition = { name: 'recon-road', terrain: ['rrrrfrrrr'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'recon', army: 'player' },
    ]);
    const recon = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(recon, map, units);
    // 道路はコスト 1 なので森の手前(3,0)までは到達できる
    expect(range.getCost(gridPosition(3, 0))).toBe(3);
    // 森は進入不可なので、その先へは回り込めない
    expect(range.canReach(gridPosition(4, 0))).toBe(false);
    expect(range.canReach(gridPosition(5, 0))).toBe(false);
  });

  it('平地はコスト2なので同じ移動力でも進める距離が半分になる', () => {
    const def: MapDefinition = { name: 'recon-plain', terrain: ['.........'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'recon', army: 'player' },
    ]);
    const recon = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(recon, map, units);
    // 平地コスト 2 × 4 マス = 8 でちょうど移動力ぶん
    expect(range.getCost(gridPosition(4, 0))).toBe(8);
    expect(range.canReach(gridPosition(5, 0))).toBe(false);
  });
});

describe('偵察車の攻撃相性', () => {
  it('対歩兵は6〜7割、戦車系とヘリ系には不利', () => {
    expect(getBaseDamage('recon', 'infantry')).toBeGreaterThanOrEqual(60);
    expect(getBaseDamage('recon', 'infantry')).toBeLessThanOrEqual(70);
    // 戦車系には不利(1〜2 割)
    for (const target of ['mediumTank', 'artillery', 'antiAirTank'] as const) {
      expect(getBaseDamage('recon', target)).toBeLessThanOrEqual(20);
      expect(getBaseDamage('recon', target)).toBeGreaterThan(0);
    }
    // ヘリ系は 1〜2 割で、特に戦闘ヘリには不利
    expect(getBaseDamage('recon', 'attackHelicopter')).toBeLessThanOrEqual(20);
    expect(getBaseDamage('recon', 'transportHelicopter')).toBeLessThanOrEqual(20);
    expect(getBaseDamage('recon', 'attackHelicopter')).toBeLessThan(
      getBaseDamage('recon', 'transportHelicopter'),
    );
  });

  it('海上ユニットには攻撃できない', () => {
    for (const target of [
      'battleship',
      'escortShip',
      'transportShip',
      'submarine',
    ] as const) {
      expect(getBaseDamage('recon', target)).toBe(0);
      expect(canAttackUnit(makeUnit('recon', 'player'), makeUnit(target, 'enemy'))).toBe(
        false,
      );
    }
  });

  it('すべてのユニットが偵察車への基礎ダメージを持つ', () => {
    for (const attacker of UNIT_TYPES) {
      expect(getBaseDamage(attacker, 'recon')).toBeGreaterThanOrEqual(0);
    }
    // 戦車は装甲の薄い偵察車に強い
    expect(getBaseDamage('mediumTank', 'recon')).toBeGreaterThan(
      getBaseDamage('recon', 'mediumTank'),
    );
  });
});
