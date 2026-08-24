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
 * - 戦車 3 種(軽・中・重): 装甲と火力が軽 < 中 < 重の順に上がり、上位の戦車には
 *   正面から撃ち勝てない。いずれも近接攻撃のみで、ヘリ系には 1〜2 割しか通らず、
 *   潜水艦は攻撃できない。
 * - 自走砲(artillery): 射程 2〜3 の間接攻撃。地上ユニットに広く効く。
 * - ロケット砲(rocketArtillery): 射程 3〜5 の間接攻撃。地上ユニットへの火力は高いが、
 *   飛行ユニットには攻撃できない(0)。地上ユニットの中で最も打たれ弱く、
 *   どの攻撃側から見ても「地上ユニットで最大の被ダメージ」を受ける。
 * - 戦闘ヘリ(attackHelicopter): 対歩兵に強く(80)、戦車は軽 65・中 55・重 45 と
 *   重くなるほど分が悪い。対空戦車には不利(15)。
 * - 輸送ヘリ(transportHelicopter)・輸送艦(transportShip): 攻撃できないため全対象 0。
 * - 対空戦車(antiAirTank): 飛行ユニット・歩兵に強い(80〜90)が、戦車には不利(10〜20)。
 * - 偵察車(recon): 近接攻撃のみの軽装甲車両。対歩兵は 6〜7 割だが、戦車系(1〜2 割)と
 *   ヘリ系(1〜2 割、特に戦闘ヘリ)には不利で、海上ユニットには攻撃できない(0)。
 * - 戦艦(battleship): 射程 3〜6 の艦砲で地上・水上・上空を叩く主力。潜水艦だけは撃てない(0)。
 * - 護衛艦(escortShip): 対潜・近接対空の護衛役。潜水艦とヘリ以外は撃てない(0)。
 * - 潜水艦(submarine): 海上ユニットだけを狙う。護衛艦にだけは分が悪い(25)。
 * - 潜水艦を攻撃できるのは護衛艦と潜水艦のみ(他はすべて 0)。
 */
export const BASE_DAMAGE: Readonly<Record<UnitType, Readonly<Record<UnitType, number>>>> =
  {
    infantry: {
      infantry: 45,
      lightTank: 15,
      mediumTank: 10,
      heavyTank: 5,
      artillery: 25,
      rocketArtillery: 50,
      attackHelicopter: 25,
      transportHelicopter: 25,
      antiAirTank: 10,
      recon: 30,
      battleship: 5,
      escortShip: 10,
      transportShip: 15,
      submarine: 0,
    },
    lightTank: {
      // 対歩兵は 6 割。数を揃えて前線を押し上げる、戦車 3 種で最も安価な 1 台。
      infantry: 60,
      lightTank: 55,
      // 装甲の厚い中戦車・重戦車には正面から撃ち勝てない(相手からの被弾のほうが大きい)。
      mediumTank: 40,
      heavyTank: 25,
      // 自走砲・対空戦車には 6 割で有利。
      artillery: 60,
      rocketArtillery: 80,
      // ヘリ系は 1〜2 割。特に戦闘ヘリには不利(戦闘ヘリ側の 65 に対して 10)。
      attackHelicopter: 10,
      transportHelicopter: 15,
      antiAirTank: 60,
      recon: 75,
      // 対艦装備を持たないため、水上艦には 1 割しか通らない。潜水艦は攻撃できない。
      battleship: 10,
      escortShip: 10,
      transportShip: 10,
      submarine: 0,
    },
    mediumTank: {
      // 対歩兵は 7〜8 割。直接戦闘の主力となる標準の戦車。
      infantry: 75,
      lightTank: 60,
      mediumTank: 55,
      // 重戦車には不利。
      heavyTank: 40,
      artillery: 75,
      rocketArtillery: 90,
      // ヘリ系は 1〜2 割。戦闘ヘリとは五分五分(戦闘ヘリ側も 55)。
      attackHelicopter: 15,
      transportHelicopter: 20,
      antiAirTank: 75,
      recon: 80,
      battleship: 15,
      escortShip: 15,
      transportShip: 20,
      submarine: 0,
    },
    heavyTank: {
      // 対歩兵は 8〜9 割。鈍重だが正面からの撃ち合いでは戦車 3 種で最強。
      infantry: 85,
      lightTank: 80,
      mediumTank: 65,
      heavyTank: 50,
      artillery: 80,
      rocketArtillery: 95,
      // ヘリ系は 1〜2 割。戦闘ヘリには若干有利(戦闘ヘリ側の 45 に対して 20)。
      attackHelicopter: 20,
      transportHelicopter: 20,
      // 対空戦車には 8〜9 割。加えて反撃を受けない(COUNTER_SUPPRESSED_DEFENDERS)。
      antiAirTank: 85,
      recon: 85,
      battleship: 20,
      escortShip: 20,
      transportShip: 20,
      submarine: 0,
    },
    artillery: {
      infantry: 70,
      lightTank: 65,
      mediumTank: 60,
      heavyTank: 50,
      artillery: 55,
      rocketArtillery: 75,
      attackHelicopter: 15,
      transportHelicopter: 15,
      antiAirTank: 60,
      recon: 70,
      battleship: 25,
      escortShip: 40,
      transportShip: 50,
      submarine: 0,
    },
    rocketArtillery: {
      // 対歩兵は 8〜9 割。射程 3〜5 から地上部隊を一方的に削る後方支援ユニット。
      infantry: 85,
      // 戦車は装甲が厚くなるほど通りにくくなる(軽 8 割 → 中 6〜7 割 → 重 4〜5 割)。
      lightTank: 80,
      mediumTank: 65,
      heavyTank: 45,
      artillery: 65,
      rocketArtillery: 90,
      // 飛行ユニットは狙えない(仰角を取れないロケット発射機)。
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 80,
      recon: 85,
      // 装甲の厚い戦艦には 3〜4 割、護衛艦・輸送艦には 6 割。潜水艦は攻撃できない。
      battleship: 35,
      escortShip: 60,
      transportShip: 60,
      submarine: 0,
    },
    attackHelicopter: {
      infantry: 80,
      // 戦車は装甲が厚くなるほど分が悪い(軽には有利・中は五分・重には若干不利)。
      lightTank: 65,
      mediumTank: 55,
      heavyTank: 45,
      artillery: 50,
      rocketArtillery: 85,
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
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
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
      // 戦車には不利。装甲が厚くなるほど通らない(軽 20 → 中 15 → 重 10)。
      lightTank: 20,
      mediumTank: 15,
      heavyTank: 10,
      artillery: 45,
      rocketArtillery: 85,
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
      // 戦車系(軽・中・重戦車、自走砲、対空戦車)には不利。装甲を抜けず 1〜2 割しか通らない。
      lightTank: 20,
      mediumTank: 15,
      heavyTank: 10,
      artillery: 20,
      // 装甲の薄いロケット砲だけは、偵察車の機関銃でも 7 割を削れる。
      rocketArtillery: 70,
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
      // 対歩兵は 6 割、対戦車系は 7〜9 割(装甲が薄いほど大きく削れる)。
      infantry: 60,
      lightTank: 85,
      mediumTank: 80,
      heavyTank: 75,
      artillery: 75,
      rocketArtillery: 90,
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
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
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
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
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
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
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

/**
 * 反撃を封じる組み合わせ。
 * COUNTER_SUPPRESSED_DEFENDERS[攻撃側] = その攻撃側に殴られると反撃できない防御側の一覧。
 *
 * 相性表の 0(そもそも攻撃できない)とは別のルールで、「攻撃はできるが、
 * この相手に殴られたときだけは撃ち返せない」ことを表す。
 * 重戦車の正面装甲は対空戦車の機関砲では抜けない、という位置づけ。
 * 詳細は docs/UnitSpec.md「反撃ルール」を参照。
 */
export const COUNTER_SUPPRESSED_DEFENDERS: Readonly<
  Partial<Record<UnitType, readonly UnitType[]>>
> = {
  heavyTank: ['antiAirTank'],
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

/**
 * この攻撃側に攻撃されたとき、防御側の反撃が封じられるか。
 * true の組み合わせでは、隣接した直接攻撃であっても反撃が発生しない
 * (例: 重戦車 → 対空戦車)。
 */
export function suppressesCounterattack(attacker: UnitType, defender: UnitType): boolean {
  return COUNTER_SUPPRESSED_DEFENDERS[attacker]?.includes(defender) ?? false;
}
