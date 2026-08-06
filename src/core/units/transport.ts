// ユニットの輸送(輸送ヘリが歩兵を運ぶ)に関する純粋なロジック。Phaser には依存しない。
// 輸送ヘリに歩兵を「乗せる(搭乗)」ときの可否判定を提供する。
// 実際の搭乗・降車の状態更新は UnitManager が行う。詳細は docs/UnitSpec.md「輸送」を参照。

import type { Unit } from '@/core/units/Unit';

/**
 * transport(輸送ユニット)が passenger を搭乗させられるかを判定する。
 *
 * 条件:
 * - 別個体であること
 * - 同じ軍であること
 * - transport が輸送能力を持つ(capacity >= 1)こと
 * - transport が現在何も運んでいない(carried が null)こと
 * - passenger の種別が transport の輸送可能種別に含まれること
 * - passenger 自身が何かを運んでいない(運搬中のユニットを積み替えない)こと
 */
export function canCarry(transport: Unit, passenger: Unit): boolean {
  return (
    transport !== passenger &&
    transport.armyType === passenger.armyType &&
    transport.capacity >= 1 &&
    transport.carried === null &&
    transport.data.carriableTypes.includes(passenger.unitType) &&
    passenger.carried === null
  );
}
