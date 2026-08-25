// ユニット相性ごとの基礎ダメージ表。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md「ダメージ相性の初期案」を参照。
//
// 値は 0-100 スケールの基礎ダメージ(仮値)。実 HP は 0-10 表記のため、
// 実際のダメージ計算(DamageCalculator)で 10 で割って HP スケールへ変換する。
//
// 0 は「その相手には攻撃できない」ことを表す。射程内にいても攻撃対象にならず、
// 反撃も発生しない(判定は AttackRange の canAttackUnit が担う)。
//
// 防御力を他ユニットとそろえる対応づけ(対空自走砲 = 自走砲、対空ロケット砲 = ロケット砲)は
// 「防御側の列の値がまったく同じ」ことで表す。列の値を変えるときは対応する 2 種をそろえること。

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
 *   飛行ユニットには攻撃できない(0)。対空ロケット砲と並んで地上ユニットの中で最も打たれ弱く、
 *   どの攻撃側から見ても「地上ユニットで最大の被ダメージ」を受ける。
 * - 戦闘機(fighter): 飛行ユニットだけを攻撃する制空ユニット。対飛行ユニットでは最強で、
 *   地上ユニット・海上ユニットには攻撃できない(0)。
 * - 爆撃機(bomber): 地上ユニット全てに 8〜9 割。飛行ユニットと潜水艦には攻撃できない(0)。
 * - 攻撃機(attackAircraft): 戦闘機と爆撃機の中間。空・陸・海のすべてを攻撃でき、
 *   とくに海上ユニットに強い。戦闘機には分が悪い(35)。潜水艦だけは攻撃できない。
 * - 戦闘ヘリ(attackHelicopter): 対歩兵に強く(80)、戦車は軽 65・中 55・重 45 と
 *   重くなるほど分が悪い。対空戦車には不利(15)。
 * - 輸送ヘリ(transportHelicopter)・輸送艦(transportShip): 攻撃できないため全対象 0。
 * - 対空 3 種(antiAirTank・antiAirArtillery・antiAirRocketArtillery): 固定翼機
 *   (戦闘機・爆撃機・攻撃機)を攻撃できる地上ユニットはこの 3 種だけ。対空戦車は歩兵・車両も撃てるが、
 *   対空自走砲(射程 2〜3)・対空ロケット砲(射程 3〜5)は飛行ユニット以外を攻撃できない(0)。
 * - 防御力(被ダメージの列)は、対空自走砲が自走砲と、対空ロケット砲がロケット砲と同じ値になる。
 * - 偵察車(recon): 近接攻撃のみの軽装甲車両。対歩兵は 6〜7 割だが、戦車系(1〜2 割)と
 *   ヘリ系(1〜2 割、特に戦闘ヘリ)には不利で、海上ユニットには攻撃できない(0)。
 * - 輸送車(transportVehicle): 歩兵を 1 体運ぶ地上の輸送ユニット。相性は偵察車と同じ
 *   (攻撃側の行・防御側の列とも偵察車と同じ値)。
 * - 戦艦(battleship): 射程 3〜6 の艦砲で地上・水上・上空を叩く主力。潜水艦だけは撃てない(0)。
 * - 護衛艦(escortShip): 対潜・近接対空の護衛役。潜水艦と飛行ユニット以外は撃てない(0)。
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
      // 固定翼機(戦闘機・爆撃機・攻撃機)は、対空ユニット以外の地上ユニットからは攻撃できない。
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      attackHelicopter: 25,
      transportHelicopter: 25,
      antiAirTank: 10,
      // 対空自走砲は自走砲、対空ロケット砲はロケット砲と同じ防御力(被ダメージ)を持つ。
      antiAirArtillery: 25,
      antiAirRocketArtillery: 50,
      recon: 30,
      transportVehicle: 30,
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
      // 固定翼機は速すぎて戦車の主砲では狙えない(対空ユニット以外の地上ユニットは攻撃できない)。
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      // ヘリ系は 1〜2 割。特に戦闘ヘリには不利(戦闘ヘリ側の 65 に対して 10)。
      attackHelicopter: 10,
      transportHelicopter: 15,
      antiAirTank: 60,
      antiAirArtillery: 60,
      antiAirRocketArtillery: 80,
      recon: 75,
      transportVehicle: 75,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      // ヘリ系は 1〜2 割。戦闘ヘリとは五分五分(戦闘ヘリ側も 55)。
      attackHelicopter: 15,
      transportHelicopter: 20,
      antiAirTank: 75,
      antiAirArtillery: 75,
      antiAirRocketArtillery: 90,
      recon: 80,
      transportVehicle: 80,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      // ヘリ系は 1〜2 割。戦闘ヘリには若干有利(戦闘ヘリ側の 45 に対して 20)。
      attackHelicopter: 20,
      transportHelicopter: 20,
      // 対空戦車には 8〜9 割。加えて反撃を受けない(COUNTER_SUPPRESSED_DEFENDERS)。
      antiAirTank: 85,
      antiAirArtillery: 80,
      antiAirRocketArtillery: 95,
      recon: 85,
      transportVehicle: 85,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      attackHelicopter: 15,
      transportHelicopter: 15,
      antiAirTank: 60,
      antiAirArtillery: 55,
      antiAirRocketArtillery: 75,
      recon: 70,
      transportVehicle: 70,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      // 飛行ユニットは狙えない(仰角を取れないロケット発射機)。
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 80,
      antiAirArtillery: 65,
      antiAirRocketArtillery: 90,
      recon: 85,
      transportVehicle: 85,
      // 装甲の厚い戦艦には 3〜4 割、護衛艦・輸送艦には 6 割。潜水艦は攻撃できない。
      battleship: 35,
      escortShip: 60,
      transportShip: 60,
      submarine: 0,
    },
    /**
     * 戦闘機: 空だけを狙う制空ユニット。対飛行ユニットでは最強で、
     * ヘリ系は 9〜10 割・爆撃機は 8〜9 割・攻撃機は 7 割で撃ち落とす。
     * 地上ユニット・海上ユニットにはまったく攻撃できない(0)。
     */
    fighter: {
      // 地上ユニットには攻撃できない(空対空専門)。
      infantry: 0,
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
      // 同じ戦闘機同士は五分の空中戦になる。
      fighter: 55,
      bomber: 85,
      attackAircraft: 70,
      // ヘリ系は 9〜10 割。逃げ足のない相手を一方的に叩ける。
      attackHelicopter: 90,
      transportHelicopter: 95,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
      // 海上ユニットにも攻撃できない。
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 0,
    },
    /**
     * 爆撃機: 地上ユニットへの絨毯爆撃を担う。地上ユニット全てに 8〜9 割、
     * 護衛艦・輸送艦にも 7 割が通るが、飛行ユニットはまったく攻撃できない(0)。
     * 潜水艦も攻撃できない。
     */
    bomber: {
      // 地上ユニットは装甲を問わず 8〜9 割。地上部隊の天敵。
      infantry: 85,
      lightTank: 85,
      mediumTank: 85,
      heavyTank: 80,
      artillery: 85,
      rocketArtillery: 90,
      // 飛行ユニットには攻撃できない(自衛の空対空装備を持たない)。
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 85,
      antiAirArtillery: 85,
      antiAirRocketArtillery: 90,
      recon: 85,
      transportVehicle: 85,
      // 装甲の厚い戦艦には 4〜5 割、護衛艦・輸送艦には 7 割。潜水艦は攻撃できない。
      battleship: 45,
      escortShip: 70,
      transportShip: 70,
      submarine: 0,
    },
    /**
     * 攻撃機: 戦闘機と爆撃機の中間の性能を持つ万能機。空・陸・海のすべてを攻撃でき、
     * とくに海上ユニットへの火力が高い(護衛艦・輸送艦に 9 割)。
     * 制空戦では戦闘機に分が悪い(3〜4 割)。潜水艦だけは攻撃できない。
     */
    attackAircraft: {
      // 歩兵・偵察車・輸送車・自走砲は 7 割、戦車は装甲が厚いほど通らない。
      infantry: 70,
      lightTank: 85,
      mediumTank: 75,
      heavyTank: 55,
      artillery: 70,
      rocketArtillery: 90,
      // 戦闘機には 3〜4 割で不利。爆撃機・ヘリ系には有利。
      fighter: 35,
      bomber: 75,
      attackAircraft: 65,
      attackHelicopter: 85,
      transportHelicopter: 90,
      antiAirTank: 70,
      antiAirArtillery: 70,
      antiAirRocketArtillery: 90,
      recon: 70,
      transportVehicle: 70,
      // 海上ユニットへの火力が高い(戦艦 6〜7 割・護衛艦/輸送艦 9 割)。潜水艦は不可。
      battleship: 65,
      escortShip: 90,
      transportShip: 90,
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
      // 固定翼機とも撃ち合えるが、速さで勝る戦闘機にはほとんど通らない。
      fighter: 25,
      bomber: 50,
      attackAircraft: 40,
      attackHelicopter: 55,
      transportHelicopter: 80,
      antiAirTank: 15,
      antiAirArtillery: 50,
      antiAirRocketArtillery: 85,
      recon: 75,
      transportVehicle: 75,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
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
      // 固定翼機を撃てる 3 種の対空ユニットのひとつ。射程 1 のかわりに火力が高い。
      fighter: 70,
      bomber: 85,
      attackAircraft: 80,
      attackHelicopter: 85,
      transportHelicopter: 90,
      antiAirTank: 50,
      antiAirArtillery: 45,
      antiAirRocketArtillery: 85,
      recon: 65,
      transportVehicle: 65,
      battleship: 5,
      escortShip: 15,
      transportShip: 25,
      submarine: 0,
    },
    /**
     * 対空自走砲: 射程 2〜3 の間接攻撃で飛行ユニットだけを狙う安価な対空ユニット。
     * 飛行ユニット全てに 6〜7 割。飛行ユニット以外にはまったく攻撃できない(0)。
     * 間接攻撃なので反撃を受けないかわりに、移動したターンは攻撃できない。
     */
    antiAirArtillery: {
      // 飛行ユニット以外には攻撃できない。
      infantry: 0,
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
      // 飛行ユニット全てに 6〜7 割。火力は対空戦車に劣るが、射程 2〜3 で先に撃てる。
      fighter: 60,
      bomber: 70,
      attackAircraft: 65,
      attackHelicopter: 65,
      transportHelicopter: 70,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 0,
    },
    /**
     * 対空ロケット砲: 射程 3〜5 の間接攻撃で飛行ユニットだけを狙う長射程の対空ユニット。
     * 戦闘機には 7〜8 割、それ以外の飛行ユニットには 8〜9 割。
     * 飛行ユニット以外にはまったく攻撃できない(0)。
     */
    antiAirRocketArtillery: {
      // 飛行ユニット以外には攻撃できない。
      infantry: 0,
      lightTank: 0,
      mediumTank: 0,
      heavyTank: 0,
      artillery: 0,
      rocketArtillery: 0,
      // 高速の戦闘機は捉えにくく 7〜8 割。それ以外の飛行ユニットには 8〜9 割。
      fighter: 75,
      bomber: 85,
      attackAircraft: 85,
      attackHelicopter: 85,
      transportHelicopter: 90,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      antiAirTank: 15,
      antiAirArtillery: 20,
      antiAirRocketArtillery: 70,
      // ヘリ系は 1〜2 割。特に戦闘ヘリには不利。
      attackHelicopter: 10,
      transportHelicopter: 20,
      // 同じ偵察車同士は装甲が薄いぶん撃ち合いになる。
      recon: 45,
      transportVehicle: 45,
      // 近接攻撃のみで対艦装備も持たないため、海上ユニットには攻撃できない。
      battleship: 0,
      escortShip: 0,
      transportShip: 0,
      submarine: 0,
    },
    // 輸送車は偵察車とまったく同じ相性(与ダメージ・被ダメージとも)を持つ。
    // 自衛用の機関銃しか積んでいない軽装甲車両、という位置づけをそろえるため。
    transportVehicle: {
      // 対歩兵は 6〜7 割。自衛用の機関銃が最も効く相手。
      infantry: 65,
      // 戦車系(軽・中・重戦車、自走砲、対空戦車)には不利。装甲を抜けず 1〜2 割しか通らない。
      lightTank: 20,
      mediumTank: 15,
      heavyTank: 10,
      artillery: 20,
      // 装甲の薄いロケット砲だけは、機関銃でも 7 割を削れる。
      rocketArtillery: 70,
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      antiAirTank: 15,
      antiAirArtillery: 20,
      antiAirRocketArtillery: 70,
      // ヘリ系は 1〜2 割。特に戦闘ヘリには不利。
      attackHelicopter: 10,
      transportHelicopter: 20,
      // 装甲の薄い偵察車・輸送車同士は撃ち合いになる。
      recon: 45,
      transportVehicle: 45,
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
      // 飛行ユニットには 8〜9 割。固定翼機もヘリ系と同じ水準で撃ち落とす。
      fighter: 85,
      bomber: 90,
      attackAircraft: 85,
      antiAirTank: 75,
      antiAirArtillery: 75,
      antiAirRocketArtillery: 90,
      recon: 80,
      transportVehicle: 80,
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
      // 近接対空の護衛役。ヘリ系だけでなく固定翼機も撃てる。
      fighter: 75,
      bomber: 80,
      attackAircraft: 80,
      attackHelicopter: 75,
      transportHelicopter: 80,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
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
      fighter: 0,
      bomber: 0,
      attackAircraft: 0,
      attackHelicopter: 0,
      transportHelicopter: 0,
      antiAirTank: 0,
      antiAirArtillery: 0,
      antiAirRocketArtillery: 0,
      recon: 0,
      transportVehicle: 0,
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
