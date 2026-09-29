import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import {
  applyDamagePoints,
  calculateDamagePoints,
  dealDamagePoints,
} from '@/core/battle/DamageCalculator';
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

describe('calculateDamagePoints', () => {
  it('相性表の値をそのままポイント(1/10 HP 単位)として算出する', () => {
    // 戦車→歩兵: 基礎75、満HP、防御0 → 75 ポイント(HP 7.5 相当)
    const tank = makeUnit('mediumTank');
    const infantry = makeUnit('infantry');
    expect(calculateDamagePoints(tank, infantry, 0)).toBe(75);
  });

  it('地形防御値でダメージが軽減される', () => {
    // 戦車→歩兵: 防御3 → 75 × 1.0 × (1 - 0.3) = 52.5 → 53
    const tank = makeUnit('mediumTank');
    const infantry = makeUnit('infantry');
    expect(calculateDamagePoints(tank, infantry, 3)).toBe(53);
  });

  it('攻撃側の残 HP 割合に応じて火力が低下する', () => {
    // 戦車(HP5/10)→歩兵: 75 × 0.5 = 37.5 → 38
    const tank = makeUnit('mediumTank', 5);
    const infantry = makeUnit('infantry');
    expect(calculateDamagePoints(tank, infantry, 0)).toBe(38);
  });

  it('HP1 未満の小さなダメージも一律に丸めず区別する', () => {
    // 歩兵→重戦車(基礎5)・歩兵→列車砲(基礎2)・歩兵→中戦車(基礎10)
    const infantry = makeUnit('infantry');
    expect(calculateDamagePoints(infantry, makeUnit('heavyTank'), 0)).toBe(5);
    expect(calculateDamagePoints(infantry, makeUnit('railgun'), 0)).toBe(2);
    expect(calculateDamagePoints(infantry, makeUnit('mediumTank'), 0)).toBe(10);
  });

  it('相性があれば最低 1 ポイントは保証される', () => {
    // 歩兵(HP1)→列車砲: 2 × 0.1 × 0.8 = 0.16 → 最低保証で 1
    const infantry = makeUnit('infantry', 1);
    expect(calculateDamagePoints(infantry, makeUnit('railgun'), 2)).toBe(1);
  });

  it('攻撃側が HP0 なら火力は 0 になる', () => {
    const tank = makeUnit('mediumTank', 0);
    const infantry = makeUnit('infantry');
    expect(calculateDamagePoints(tank, infantry, 0)).toBe(0);
  });
});

describe('applyDamagePoints', () => {
  it('10 ポイントごとに HP を 1 減らし、余りを端数として残す', () => {
    expect(applyDamagePoints(10, 0, 75)).toEqual({ hp: 3, remainder: 5, hpLoss: 7 });
  });

  it('端数と合わせて 10 に達したら HP が 1 減る', () => {
    // 端数 8 に 5 ポイント → 13 → HP -1・端数 3
    expect(applyDamagePoints(10, 8, 5)).toEqual({ hp: 9, remainder: 3, hpLoss: 1 });
  });

  it('10 に満たなければ HP は減らず、端数だけが増える', () => {
    expect(applyDamagePoints(10, 2, 5)).toEqual({ hp: 10, remainder: 7, hpLoss: 0 });
  });

  it('HP が 0 になったら端数は 0 に戻る', () => {
    expect(applyDamagePoints(1, 5, 7)).toEqual({ hp: 0, remainder: 0, hpLoss: 1 });
    expect(applyDamagePoints(2, 0, 80)).toEqual({ hp: 0, remainder: 0, hpLoss: 2 });
  });
});

describe('dealDamagePoints', () => {
  it('歩兵 → 重戦車(5 ポイント)は 2 回で HP が 1 減る', () => {
    const infantry = makeUnit('infantry');
    const heavy = makeUnit('heavyTank');
    const points = calculateDamagePoints(infantry, heavy, 0);

    expect(dealDamagePoints(heavy, points)).toBe(0);
    expect(heavy.currentHp).toBe(10);
    expect(heavy.damageRemainder).toBe(5);

    expect(dealDamagePoints(heavy, points)).toBe(1);
    expect(heavy.currentHp).toBe(9);
    expect(heavy.damageRemainder).toBe(0);
  });

  it('歩兵 → 列車砲(2 ポイント)は 5 回で HP が 1 減る', () => {
    const infantry = makeUnit('infantry');
    const railgun = makeUnit('railgun');
    const points = calculateDamagePoints(infantry, railgun, 0);

    for (let i = 0; i < 4; i++) {
      dealDamagePoints(railgun, points);
    }
    expect(railgun.currentHp).toBe(railgun.maxHp);
    expect(railgun.damageRemainder).toBe(8);

    dealDamagePoints(railgun, points);
    expect(railgun.currentHp).toBe(railgun.maxHp - 1);
    expect(railgun.damageRemainder).toBe(0);
  });
});
