import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { canAttackUnit } from '@/core/battle/AttackRange';
import { canCarry } from '@/core/units/transport';
import { Unit } from '@/core/units/Unit';
import {
  GROUND_UNIT_TYPES,
  TANK_UNIT_TYPES,
  UNIT_TYPES,
  type UnitType,
} from '@/core/units/UnitType';
import { getBaseDamage } from '@/data/damageTable';
import { canRepairAt, getTerrainData } from '@/data/terrainData';
import { getUnitData, isProducibleAt, laboratoryEvolutionOf } from '@/data/unitData';
import { UNIT_DESCRIPTIONS } from '@/data/unitGuide';

/** テスト用のユニットを生成する */
function makeUnit(unitType: UnitType, army: 'player' | 'enemy' = 'player'): Unit {
  return new Unit({
    id: `${army}-${unitType}`,
    unitType,
    armyType: army,
    position: gridPosition(0, 0),
  });
}

describe('新型戦車の基本パラメータ', () => {
  it('ユニット一覧・地上ユニットに登録されている', () => {
    expect(UNIT_TYPES).toContain('newTank');
    expect(GROUND_UNIT_TYPES).toContain('newTank');
    // 生産できる戦車 3 種(軽・中・重)とは別枠のユニット
    expect(TANK_UNIT_TYPES).not.toContain('newTank');
  });

  it('軽戦車と同等の機動力を持ち、視界は 2', () => {
    const data = getUnitData('newTank');
    expect(data.unitName).toBe('新型戦車');
    expect(data.movement).toBe(getUnitData('lightTank').movement);
    expect(data.movementType).toBe('vehicle');
    expect(data.vision).toBe(2);
    // 近接攻撃のみ・占領はできない(戦車 3 種と同じ)
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
    expect(data.canCapture).toBe(false);
  });

  it('装軌車両なので森は通れるが山・海には入れない(戦車 3 種と同じ)', () => {
    const cost = (terrain: Parameters<typeof getTerrainData>[0]): number | null =>
      getTerrainData(terrain).moveCost.vehicle;
    expect(cost('forest')).toBe(2);
    expect(cost('mountain')).toBeNull();
    expect(cost('sea')).toBeNull();
  });

  it('どの生産拠点でも生産できない(研究所の占領でのみ手に入る)', () => {
    for (const terrain of ['factory', 'headquarters', 'airport', 'port'] as const) {
      expect(isProducibleAt(terrain, 'newTank')).toBe(false);
    }
    expect(laboratoryEvolutionOf('infantry')).toBe('newTank');
    // 歩兵以外は研究所を占領しても進化しない
    expect(laboratoryEvolutionOf('mediumTank')).toBeNull();
  });

  it('地上ユニットなので輸送艦で運べ、都市・研究所で修理できる', () => {
    expect(canCarry(makeUnit('transportShip'), makeUnit('newTank'))).toBe(true);
    expect(canRepairAt('city', 'vehicle')).toBe(true);
    expect(canRepairAt('laboratory', 'vehicle')).toBe(true);
  });

  it('ユニット説明が用意されている', () => {
    expect(UNIT_DESCRIPTIONS.newTank.length).toBeGreaterThan(0);
  });
});

describe('新型戦車の相性', () => {
  it('攻撃力は重戦車と同等(与ダメージが重戦車の行と同じ)', () => {
    for (const defender of UNIT_TYPES) {
      if (defender === 'newTank') {
        // 新型戦車どうしは、互いの装甲のぶん重戦車どうしより削り合いが鈍い
        continue;
      }
      expect(getBaseDamage('newTank', defender)).toBe(
        getBaseDamage('heavyTank', defender),
      );
    }
  });

  it('装甲は重戦車以上(どの攻撃側から見ても被ダメージが重戦車以下)', () => {
    for (const attacker of UNIT_TYPES) {
      expect(getBaseDamage(attacker, 'newTank')).toBeLessThanOrEqual(
        getBaseDamage(attacker, 'heavyTank'),
      );
    }
  });

  it('主力の攻撃手段に対しては重戦車より明確に硬い', () => {
    for (const attacker of [
      'lightTank',
      'mediumTank',
      'heavyTank',
      'artillery',
      'rocketArtillery',
      'bomber',
      'attackAircraft',
      'attackHelicopter',
      'battleship',
    ] as const) {
      expect(getBaseDamage(attacker, 'newTank')).toBeLessThan(
        getBaseDamage(attacker, 'heavyTank'),
      );
    }
  });

  it('重戦車と同じく、対空戦車からは攻撃されない', () => {
    expect(getBaseDamage('antiAirTank', 'newTank')).toBe(0);
    expect(canAttackUnit(makeUnit('antiAirTank'), makeUnit('newTank', 'enemy'))).toBe(
      false,
    );
  });

  it('固定翼機は撃てず、潜水艦も攻撃できない(重戦車と同じ)', () => {
    for (const target of ['fighter', 'bomber', 'attackAircraft', 'submarine'] as const) {
      expect(getBaseDamage('newTank', target)).toBe(0);
    }
  });
});
