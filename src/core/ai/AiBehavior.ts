// 敵軍AIの思考パターン(行動方針)を表すパラメータ。Phaser には依存しない純粋な型定義。
//
// EnemyAi の判断は「生産で何を買うか」「どこへ向かうか」の 2 つに大きく分かれる。
// その方針をここで切り替えられるようにし、対戦キャラクターごとの実際の値は
// src/data/aiCharacters.ts にデータとして分離する(CLAUDE.md の方針)。

import type { UnitType } from '@/core/units/UnitType';

/** 生産の方針 */
export type AiProductionPolicy =
  /** 買える中で最も高価(強力)なユニットをその都度生産する */
  | 'strongest'
  /** 歩兵が infantryQuota に届くまでは歩兵をそろえ、その後に強力なユニットを狙う */
  | 'infantryFirst'
  /** 編成表(roster)で決めた最低限の頭数をそろえ、その後に強力なユニットを狙う */
  | 'roster';

/** 攻撃も占領もできないユニットが、どこへ向かうかの方針 */
export type AiAdvancePolicy =
  /** 見えている最寄りの敵へ近づく(敵が見えなければ自軍所有でない最寄りの拠点へ) */
  | 'nearestEnemy'
  /** 占領できるユニットは未所有の拠点(中立優先)へ、それ以外は敵本拠地へ突き進む */
  | 'captureAndCharge';

/** 目標までの距離の測り方 */
export type AiRouting =
  /** 直線距離(マンハッタン距離)で測る。山や海に阻まれると目標の手前で足踏みしやすい */
  | 'direct'
  /** 実際に通れるマスをたどった経路の長さで測る。障害物があれば回り道して向かう */
  | 'path';

/**
 * 編成表(roster)の 1 行。「この種別を最低 count 体はそろえる」という指定。
 * production が 'roster' のときだけ使い、一覧の先頭にあるものほど優先して生産する。
 */
export interface AiRosterEntry {
  /** そろえたいユニット種別 */
  readonly unitType: UnitType;
  /** そろえたい体数(生存数がこれを下回っているあいだは、この種別を優先して生産する) */
  readonly count: number;
}

/** 思考パターン 1 つぶんのパラメータ */
export interface AiBehavior {
  /** 生産の方針 */
  readonly production: AiProductionPolicy;
  /**
   * そろえたい歩兵の数(production が 'infantryFirst' のときだけ使う)。
   * 生存している歩兵がこの数に届くまでは、生産拠点では歩兵だけを生産する。
   * 歩兵が撃破されて数が減れば、また歩兵の生産に戻る。
   */
  readonly infantryQuota: number;
  /**
   * 最低限そろえたい編成(production が 'roster' のときだけ使う)。
   * 先頭から順に「生存数が count を下回っている種別」を探し、その拠点で生産できて
   * 資金が足りるものを優先して生産する。撃破されて数が減れば、また補充に戻る。
   */
  readonly roster: readonly AiRosterEntry[];
  /**
   * 歩兵がそろったあとの生産で、その拠点で生産できる最強ユニットのコストに対して
   * 何割以上のユニットだけを買うか(0 なら買えるものは何でも買う)。
   * これを下回るユニットしか買えないターンは生産を見送り、資金を貯めて次のターンに備える。
   */
  readonly powerCostRatio: number;
  /**
   * 「同じ種別をもう持っているなら、より強い種別のために資金を貯める」かどうか。
   *
   * true のとき、いま買える中で最強の種別をすでに 1 体以上持っていて、なおかつ
   * その拠点で作れる「より高価でまだ 1 体も持っていない種別」が残っていれば生産を見送る。
   * 同じユニットを並べるのではなく、ターンを重ねるごとに一段ずつ戦力を引き上げる。
   */
  readonly saveForUpgrade: boolean;
  /** 進軍の方針 */
  readonly advance: AiAdvancePolicy;
  /** 目標までの距離の測り方 */
  readonly routing: AiRouting;
  /**
   * 移動可能範囲内に複数の拠点があるとき、中立の拠点を優先して占領するか。
   * true でも敵本拠地の占領(勝利に直結する)より優先することはない。
   */
  readonly preferNeutralCapture: boolean;
  /**
   * 間接攻撃(遠距離)ユニットが間合いを取るかどうか。
   *
   * 間接攻撃ユニットは移動したターンは攻撃できず、最小射程より近づくと撃てなくなる。
   * true のとき、見えている敵がいれば「敵へ近づく」のではなく
   * 「その敵を射程(最小〜最大)に収めるマス」へ構え、次のターンから一方的に撃つ。
   * false では従来どおり敵へ近づき、隣接して撃てなくなることがある。
   */
  readonly indirectStandoff: boolean;
  /**
   * 夜戦で生産するユニットに求める視界の下限(マス)。0 なら視界を気にしない。
   *
   * 夜戦では視界の狭いユニットは自力で敵を見つけられず、高価でも持て余す
   * (重戦車・自走砲・ロケット砲・対空自走砲・対空ロケット砲・輸送車の視界は 1)。
   * 1 以上のとき、夜戦の生産候補からこの値に満たない種別を外し、
   * 目の利くユニットで編成をそろえる。候補が 1 つも残らない場合は外さない。
   * 昼戦ではマップ全体が明るいため参照しない。
   */
  readonly nightVisionFloor: number;
  /**
   * 味方と固まって進む距離(マス)。0 なら単独でも構わず前進する。
   *
   * 1 以上のとき、前進先はこの距離以内に味方がいるマスから選ぶ。
   * 足の速いユニットが 1 体だけ突出して各個撃破されるのを防ぎ、隊列を保って前線を押し上げる。
   * 条件を満たすマスが 1 つも無い(孤立している)場合は、従来どおり移動範囲全体から選ぶ。
   */
  readonly regroupRadius: number;
}

/**
 * 思考パターンを指定しなかった場合の既定値。
 * 「目の前の敵と拠点を順に処理する」もっとも素朴な方針で、
 * 敵AIを導入した当初(docs/GameDesign.md「敵AI(簡易)」)の挙動そのものにあたる。
 */
export const DEFAULT_AI_BEHAVIOR: AiBehavior = {
  production: 'strongest',
  infantryQuota: 0,
  roster: [],
  powerCostRatio: 0,
  saveForUpgrade: false,
  advance: 'nearestEnemy',
  routing: 'direct',
  preferNeutralCapture: false,
  indirectStandoff: false,
  nightVisionFloor: 0,
  regroupRadius: 0,
};
