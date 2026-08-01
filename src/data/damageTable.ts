// ユニット相性ごとの基礎ダメージ表。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md「ダメージ相性の初期案」を参照。
//
// 値は 0-100 スケールの基礎ダメージ(仮値)。実 HP は 0-10 表記のため、
// 実際のダメージ計算(DamageCalculator)で 10 で割って HP スケールへ変換する。

import type { UnitType } from '@/core/units/UnitType';

/** BASE_DAMAGE[攻撃側][防御側] = 基礎ダメージ(0-100) */
export const BASE_DAMAGE: Readonly<Record<UnitType, Readonly<Record<UnitType, number>>>> =
  {
    infantry: { infantry: 45, tank: 10, artillery: 25 },
    tank: { infantry: 75, tank: 55, artillery: 65 },
    artillery: { infantry: 70, tank: 60, artillery: 55 },
  };

/** 攻撃側・防御側の種別から基礎ダメージ(0-100)を返す */
export function getBaseDamage(attacker: UnitType, defender: UnitType): number {
  return BASE_DAMAGE[attacker][defender];
}
