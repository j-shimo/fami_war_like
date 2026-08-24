import { describe, expect, it } from 'vitest';
import type { AttackResult } from '@/core/battle/BattleManager';
import { gridPosition } from '@/core/map/GridPosition';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';
import { buildAttackSequence } from '@/rendering/attackSequence';

/** テスト用にユニットを 1 体生成する */
function makeUnit(unitType: UnitType): Unit {
  return new Unit({
    id: `${unitType}-test`,
    unitType,
    armyType: 'player',
    position: gridPosition(0, 0),
  });
}

/** 攻撃結果の雛形。テストごとに必要な項目だけ上書きする */
function makeResult(overrides: Partial<AttackResult> = {}): AttackResult {
  return {
    attacker: makeUnit('mediumTank'),
    defender: makeUnit('infantry'),
    damageDealt: 5,
    counterDamage: 0,
    defenderDefeated: false,
    attackerDefeated: false,
    lostPassengers: [],
    ...overrides,
  };
}

describe('buildAttackSequence', () => {
  it('撃破も反撃もなければ踏み込みだけで終わる', () => {
    const sequence = buildAttackSequence(makeResult());

    expect(sequence.impactAt).toBeGreaterThan(0);
    expect(sequence.lungeEndAt).toBeGreaterThan(sequence.impactAt);
    expect(sequence.defenderBurstAt).toBeNull();
    expect(sequence.counterAt).toBeNull();
    expect(sequence.attackerBurstAt).toBeNull();
    expect(sequence.endAt).toBe(sequence.lungeEndAt);
  });

  it('防御側を撃破すると、着弾の後に爆散を出して余韻ぶん長くなる', () => {
    const sequence = buildAttackSequence(makeResult({ defenderDefeated: true }));

    expect(sequence.defenderBurstAt).not.toBeNull();
    expect(sequence.defenderBurstAt!).toBeGreaterThan(sequence.impactAt);
    expect(sequence.endAt).toBeGreaterThan(sequence.defenderBurstAt!);
  });

  it('反撃があると、踏み込みが終わってから被ダメージを出す', () => {
    const sequence = buildAttackSequence(makeResult({ counterDamage: 3 }));

    expect(sequence.counterAt).not.toBeNull();
    expect(sequence.counterAt!).toBeGreaterThan(sequence.lungeEndAt);
    expect(sequence.attackerBurstAt).toBeNull();
    expect(sequence.endAt).toBeGreaterThan(sequence.counterAt!);
  });

  it('反撃で撃破されると、被ダメージの後に攻撃側の爆散を出す', () => {
    const sequence = buildAttackSequence(
      makeResult({ counterDamage: 4, attackerDefeated: true }),
    );

    expect(sequence.attackerBurstAt).not.toBeNull();
    expect(sequence.attackerBurstAt!).toBeGreaterThan(sequence.counterAt!);
    expect(sequence.endAt).toBeGreaterThan(sequence.attackerBurstAt!);
  });

  it('反撃がなければ、撃破されたことになっていても攻撃側の爆散は出さない', () => {
    // counterDamage が 0 のまま attackerDefeated だけ立つことは通常ないが、
    // 時刻が null のまま計算に混ざらないことを保証しておく
    const sequence = buildAttackSequence(makeResult({ attackerDefeated: true }));

    expect(sequence.counterAt).toBeNull();
    expect(sequence.attackerBurstAt).toBeNull();
  });
});
