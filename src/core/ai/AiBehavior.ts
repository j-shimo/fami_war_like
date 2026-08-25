// 敵軍AIの思考パターン(行動方針)を表すパラメータ。Phaser には依存しない純粋な型定義。
//
// EnemyAi の判断は「生産で何を買うか」「どこへ向かうか」の 2 つに大きく分かれる。
// その方針をここで切り替えられるようにし、対戦キャラクターごとの実際の値は
// src/data/aiCharacters.ts にデータとして分離する(CLAUDE.md の方針)。

/** 生産の方針 */
export type AiProductionPolicy =
  /** 買える中で最も高価(強力)なユニットをその都度生産する */
  | 'strongest'
  /** 歩兵が infantryQuota に届くまでは歩兵をそろえ、その後に強力なユニットを狙う */
  | 'infantryFirst';

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
   * 歩兵がそろったあとの生産で、その拠点で生産できる最強ユニットのコストに対して
   * 何割以上のユニットだけを買うか(0 なら買えるものは何でも買う)。
   * これを下回るユニットしか買えないターンは生産を見送り、資金を貯めて次のターンに備える。
   */
  readonly powerCostRatio: number;
  /** 進軍の方針 */
  readonly advance: AiAdvancePolicy;
  /** 目標までの距離の測り方 */
  readonly routing: AiRouting;
  /**
   * 移動可能範囲内に複数の拠点があるとき、中立の拠点を優先して占領するか。
   * true でも敵本拠地の占領(勝利に直結する)より優先することはない。
   */
  readonly preferNeutralCapture: boolean;
}

/**
 * 思考パターンを指定しなかった場合の既定値。
 * 「目の前の敵と拠点を順に処理する」もっとも素朴な方針で、
 * 敵AIを導入した当初(docs/GameDesign.md「敵AI(簡易)」)の挙動そのものにあたる。
 */
export const DEFAULT_AI_BEHAVIOR: AiBehavior = {
  production: 'strongest',
  infantryQuota: 0,
  powerCostRatio: 0,
  advance: 'nearestEnemy',
  routing: 'direct',
  preferNeutralCapture: false,
};
