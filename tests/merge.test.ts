import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { Unit } from '@/core/units/Unit';
import { canMerge, mergedHp } from '@/core/units/merge';
import type { UnitType } from '@/core/units/UnitType';

/** テスト用に HP を指定したユニットを作る */
function makeUnit(
  id: string,
  unitType: UnitType,
  army: 'player' | 'enemy',
  currentHp: number,
): Unit {
  return new Unit({
    id,
    unitType,
    armyType: army,
    position: gridPosition(0, 0),
    currentHp,
  });
}

describe('canMerge', () => {
  it('同じ軍・同じ種別で双方 HP が減っていれば合流できる', () => {
    const a = makeUnit('a', 'infantry', 'player', 4);
    const b = makeUnit('b', 'infantry', 'player', 5);
    expect(canMerge(a, b)).toBe(true);
  });

  it('自分自身には合流できない', () => {
    const a = makeUnit('a', 'infantry', 'player', 4);
    expect(canMerge(a, a)).toBe(false);
  });

  it('種別が異なると合流できない', () => {
    const a = makeUnit('a', 'infantry', 'player', 4);
    const b = makeUnit('b', 'tank', 'player', 5);
    expect(canMerge(a, b)).toBe(false);
  });

  it('軍が異なると合流できない', () => {
    const a = makeUnit('a', 'infantry', 'player', 4);
    const b = makeUnit('b', 'infantry', 'enemy', 5);
    expect(canMerge(a, b)).toBe(false);
  });

  it('合流元が満タンなら合流できない', () => {
    const a = makeUnit('a', 'infantry', 'player', 10);
    const b = makeUnit('b', 'infantry', 'player', 5);
    expect(canMerge(a, b)).toBe(false);
  });

  it('合流先が満タンなら合流できない', () => {
    const a = makeUnit('a', 'infantry', 'player', 4);
    const b = makeUnit('b', 'infantry', 'player', 10);
    expect(canMerge(a, b)).toBe(false);
  });
});

describe('mergedHp', () => {
  it('現在 HP を合算する(HP4 + HP5 = HP9)', () => {
    const a = makeUnit('a', 'infantry', 'player', 4);
    const b = makeUnit('b', 'infantry', 'player', 5);
    expect(mergedHp(a, b)).toBe(9);
  });

  it('最大 HP を超えるぶんは頭打ちにする(HP7 + HP6 = HP10)', () => {
    const a = makeUnit('a', 'infantry', 'player', 7);
    const b = makeUnit('b', 'infantry', 'player', 6);
    expect(mergedHp(a, b)).toBe(10);
  });
});
