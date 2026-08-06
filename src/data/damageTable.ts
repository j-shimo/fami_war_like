// ユニット相性ごとの基礎ダメージ表。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md「ダメージ相性の初期案」を参照。
//
// 値は 0-100 スケールの基礎ダメージ(仮値)。実 HP は 0-10 表記のため、
// 実際のダメージ計算(DamageCalculator)で 10 で割って HP スケールへ変換する。

import type { UnitType } from '@/core/units/UnitType';

/**
 * BASE_DAMAGE[攻撃側][防御側] = 基礎ダメージ(0-100)
 *
 * 相性の要点(docs/UnitSpec.md 参照):
 * - 戦闘ヘリ(attackHelicopter): 対歩兵に強く(80)、対戦車は五分(55)、
 *   自走砲には中程度(50)。対空戦車には不利(15)。
 * - 輸送ヘリ(transportHelicopter): 攻撃できないため全対象 0。
 * - 対空戦車(antiAirTank): 飛行ユニット・歩兵に強い(75〜90)が、戦車には不利(15)。
 * - 地上の非対空ユニット(戦車・自走砲)は飛行ユニットへの攻撃力が低い(10〜15)。
 */
export const BASE_DAMAGE: Readonly<Record<UnitType, Readonly<Record<UnitType, number>>>> =
  {
    infantry: {
      infantry: 45,
      tank: 10,
      artillery: 25,
      attackHelicopter: 25,
      transportHelicopter: 25,
      antiAirTank: 10,
    },
    tank: {
      infantry: 75,
      tank: 55,
      artillery: 65,
      attackHelicopter: 10,
      transportHelicopter: 10,
      antiAirTank: 55,
    },
    artillery: {
      infantry: 70,
      tank: 60,
      artillery: 55,
      attackHelicopter: 15,
      transportHelicopter: 15,
      antiAirTank: 60,
    },
    attackHelicopter: {
      infantry: 80,
      tank: 55,
      artillery: 50,
      attackHelicopter: 55,
      transportHelicopter: 80,
      antiAirTank: 15,
    },
    transportHelicopter: {
      infantry: 0,
      tank: 0,
      artillery: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
    },
    antiAirTank: {
      infantry: 80,
      tank: 15,
      artillery: 45,
      attackHelicopter: 85,
      transportHelicopter: 90,
      antiAirTank: 50,
    },
  };

/** 攻撃側・防御側の種別から基礎ダメージ(0-100)を返す */
export function getBaseDamage(attacker: UnitType, defender: UnitType): number {
  return BASE_DAMAGE[attacker][defender];
}
