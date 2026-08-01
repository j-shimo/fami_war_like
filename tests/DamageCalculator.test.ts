import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';

/** テスト用にユニットを 1 体生成する */
function makeUnit(unitType: UnitType, currentHp?: number): Unit {
  return new Unit({
    id: `${unitType}-test`,
    unitType,
    armyType: 'player',
    position: gridPosition(0, 0),
    currentHp,
  });
}

describe('calculateDamage', () => {
  it('相性表と HP スケール変換で基礎ダメージを算出する', () => {
    // 戦車→歩兵: 基礎75、満HP、防御0 → 75 × 1.0 × 1.0 / 10 = 7.5 → 8
    const tank = makeUnit('tank');
    const infantry = makeUnit('infantry');
    expect(calculateDamage(tank, infantry, 0)).toBe(8);
  });

  it('地形防御値でダメージが軽減される', () => {
    // 戦車→歩兵: 防御3 → 75 × 1.0 × (1 - 0.3) / 10 = 5.25 → 5
    const tank = makeUnit('tank');
    const infantry = makeUnit('infantry');
    expect(calculateDamage(tank, infantry, 3)).toBe(5);
  });

  it('攻撃側の残 HP 割合に応じて火力が低下する', () => {
    // 戦車(HP5/10)→歩兵: 75 × 0.5 × 1.0 / 10 = 3.75 → 4
    const tank = makeUnit('tank', 5);
    const infantry = makeUnit('infantry');
    expect(calculateDamage(tank, infantry, 0)).toBe(4);
  });

  it('相性が悪くても最低 1 ダメージは保証される', () => {
    // 歩兵→戦車: 基礎10、満HP、防御2 → 10 × 1.0 × 0.8 / 10 = 0.8 → round 1
    // さらに低 HP でも 0 にはならないことを確認する
    const infantry = makeUnit('infantry', 1);
    const tank = makeUnit('tank');
    expect(calculateDamage(infantry, tank, 2)).toBe(1);
  });

  it('攻撃側が HP0 なら火力は 0 になる', () => {
    const tank = makeUnit('tank', 0);
    const infantry = makeUnit('infantry');
    expect(calculateDamage(tank, infantry, 0)).toBe(0);
  });
});
