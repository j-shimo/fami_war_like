// ユニットの合流(2 体を 1 体にまとめる)に関する純粋なロジック。Phaser には依存しない。
// 耐久値(HP)が減った同じユニット同士を合流させ、HP を合算して 1 体にまとめる。

import type { Unit } from '@/core/units/Unit';

/**
 * 2 体のユニットを合流できるかを判定する。
 *
 * 条件:
 * - 別個体であること(自分自身には合流できない)
 * - 同じ軍であること
 * - 同じユニット種別であること
 * - 双方とも HP が減っている(現在 HP < 最大 HP)こと
 *
 * 双方が減っていることを条件にするのは、満タンのユニットへ合流しても
 * HP が最大値で頭打ちになって無駄になるため(「耐久値が減った同士」をまとめる)。
 */
export function canMerge(source: Unit, target: Unit): boolean {
  return (
    source !== target &&
    source.armyType === target.armyType &&
    source.unitType === target.unitType &&
    source.currentHp < source.maxHp &&
    target.currentHp < target.maxHp
  );
}

/**
 * 合流後の HP を返す。source と target の現在 HP を合算し、最大 HP で頭打ちにする。
 * (例: HP4 + HP5 = HP9、HP7 + HP6 = HP10)
 * 最大 HP を超えるぶんは切り捨てる(MVP では資金への払い戻しは行わない)。
 */
export function mergedHp(source: Unit, target: Unit): number {
  return Math.min(target.maxHp, source.currentHp + target.currentHp);
}
