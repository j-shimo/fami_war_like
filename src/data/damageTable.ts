// ユニット相性ごとの基礎ダメージ表。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md「ダメージ相性の初期案」を参照。
//
// 値は 0-100 スケールの基礎ダメージ(仮値)。実 HP は 0-10 表記のため、
// 実際のダメージ計算(DamageCalculator)で 10 で割って HP スケールへ変換する。
//
// 0 は「その相手には攻撃できない」ことを表す。射程内にいても攻撃対象にならず、
// 反撃も発生しない(判定は AttackRange の canAttackUnit が担う)。

import type { UnitType } from '@/core/units/UnitType';

/**
 * BASE_DAMAGE[攻撃側][防御側] = 基礎ダメージ(0-100)
 *
 * 相性の要点(docs/UnitSpec.md 参照):
 * - 戦闘ヘリ(attackHelicopter): 対歩兵に強く(80)、対戦車は五分(55)、
 *   自走砲には中程度(50)。対空戦車には不利(15)。
 * - 輸送ヘリ(transportHelicopter)・輸送艦(transportShip): 攻撃できないため全対象 0。
 * - 対空戦車(antiAirTank): 飛行ユニット・歩兵に強い(75〜90)が、戦車には不利(15)。
 * - 偵察車(recon): 近接攻撃のみの軽装甲車両。対歩兵は 6〜7 割だが、戦車系(1〜2 割)と
 *   ヘリ系(1〜2 割、特に戦闘ヘリ)には不利で、海上ユニットには攻撃できない(0)。
 * - 地上の非対空ユニット(戦車・自走砲)は飛行ユニットへの攻撃力が低い(10〜15)。
 * - 戦艦(battleship): 射程 3〜6 の艦砲で地上・水上・上空を叩く主力。潜水艦だけは撃てない(0)。
 * - 護衛艦(escortShip): 対潜・近接対空の護衛役。潜水艦とヘリ以外は撃てない(0)。
 * - 潜水艦(submarine): 海上ユニットだけを狙う。護衛艦にだけは分が悪い(25)。
 * - 潜水艦を攻撃できるのは護衛艦と潜水艦のみ(他はすべて 0)。
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
      recon: 30,
      battleship: 5,
      escortShip: 10,
      transportShip: 15,
      submarine: 0,
    },
    tank: {
      infantry: 75,
      tank: 55,
      artillery: 65,
      attackHelicopter: 10,
      transportHelicopter: 10,
      antiAirTank: 55,
      recon: 80,
      battleship: 15,
      escortShip: 25,
      transportShip: 35,
      submarine: 0,
    },
    artillery: {
      infantry: 70,
      tank: 60,
      artillery: 55,
      attackHelicopter: 15,
      transportHelicopter: 15,
      antiAirTank: 60,
      recon: 70,
      battleship: 25,
      escortShip: 40,
      transportShip: 50,
      submarine: 0,
    },
    attackHelicopter: {
      infantry: 80,
      tank: 55,
      artillery: 50,
      attackHelicopter: 55,
      transportHelicopter: 80,
      antiAirTank: 15,
      recon: 75,
      battleship: 25,
      escortShip: 40,
      transportShip: 60,
      submarine: 0,
    },
    transportHelicopter: {
      infantry: 0,
      tank: 0,
      artillery: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
      recon: 0,
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 0,
    },
    antiAirTank: {
      infantry: 80,
      tank: 15,
      artillery: 45,
      attackHelicopter: 85,
      transportHelicopter: 90,
      antiAirTank: 50,
      recon: 65,
      battleship: 5,
      escortShip: 15,
      transportShip: 25,
      submarine: 0,
    },
    recon: {
      // 対歩兵は 6〜7 割。機関銃で歩兵を蹴散らす偵察車の主な攻撃対象。
      infantry: 65,
      // 戦車系(戦車・自走砲・対空戦車)には不利。装甲を抜けず 1〜2 割しか通らない。
      tank: 15,
      artillery: 20,
      antiAirTank: 15,
      // ヘリ系は 1〜2 割。特に戦闘ヘリには不利。
      attackHelicopter: 10,
      transportHelicopter: 20,
      // 同じ偵察車同士は装甲が薄いぶん撃ち合いになる。
      recon: 45,
      // 近接攻撃のみで対艦装備も持たないため、海上ユニットには攻撃できない。
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 0,
    },
    battleship: {
      // 対歩兵は 6 割、対戦車系(戦車・自走砲・対空戦車)は 7〜8 割。
      infantry: 60,
      tank: 80,
      artillery: 75,
      antiAirTank: 75,
      recon: 80,
      // 対空砲を備えており、飛行ユニットには 8〜9 割。
      // 今後追加する飛行ユニット(戦闘機・爆撃機など)もこの水準に合わせる。
      attackHelicopter: 85,
      transportHelicopter: 90,
      // 装甲の厚い戦艦同士の撃ち合いはやや削り合いになる。
      battleship: 70,
      // 対輸送艦・護衛艦は 9 割。
      escortShip: 90,
      transportShip: 90,
      // 潜水艦には攻撃できない。
      submarine: 0,
    },
    escortShip: {
      // ヘリ系と潜水艦だけを攻撃できる護衛役。それ以外の相手は撃てない。
      infantry: 0,
      tank: 0,
      artillery: 0,
      attackHelicopter: 75,
      transportHelicopter: 80,
      antiAirTank: 0,
      recon: 0,
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 90,
    },
    transportShip: {
      infantry: 0,
      tank: 0,
      artillery: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
      recon: 0,
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 0,
    },
    submarine: {
      // 海上ユニットのみを攻撃できる。地上・飛行ユニットには手が出せない。
      infantry: 0,
      tank: 0,
      artillery: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
      recon: 0,
      battleship: 90,
      // 対潜装備を持つ護衛艦にはほとんど通らない(2〜3 割)。
      escortShip: 25,
      transportShip: 85,
      submarine: 55,
    },
  };

/** 攻撃側・防御側の種別から基礎ダメージ(0-100)を返す */
export function getBaseDamage(attacker: UnitType, defender: UnitType): number {
  return BASE_DAMAGE[attacker][defender];
}

/**
 * 攻撃側が防御側の種別を攻撃対象にできるか。
 * 基礎ダメージが 1 以上の組み合わせだけを「攻撃できる」とみなす。
 * 戦艦から潜水艦、護衛艦から水上艦などの「撃てない相手」はここで弾く。
 */
export function canDamage(attacker: UnitType, defender: UnitType): boolean {
  return getBaseDamage(attacker, defender) > 0;
}
