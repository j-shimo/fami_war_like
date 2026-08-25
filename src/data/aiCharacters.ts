// 対戦する敵軍の指揮官(対戦キャラクター)の一覧。
// キャラクターごとに敵軍AIの思考パターン(AiBehavior)を紐づけ、マップ選択画面で選べるようにする。
// CLAUDE.md の方針に従い、キャラクターも思考パターンの数値もすべてオリジナルとする。
//
// 新しい思考パターンを増やすときは、AiBehavior のパラメータを組み合わせたキャラクターを
// この一覧へ追加すれば選択画面に並ぶ。

import type { AiBehavior } from '@/core/ai/AiBehavior';

/** 対戦キャラクター 1 人ぶんの定義 */
export interface AiCharacter {
  /** 内部識別子(シーン間の受け渡し・中断データの保存に使う) */
  readonly id: string;
  /** 表示名 */
  readonly name: string;
  /** 肩書(表示名の前に添える) */
  readonly title: string;
  /** 想定するプレイヤー層(選択画面での目安表示) */
  readonly difficulty: string;
  /**
   * 指揮官ごとの識別色(エンブレム)。対戦相手の選択ウィンドウと選択ボタンの丸印に使う。
   * 人数が増えたときに一覧から目当ての相手を見分けやすくするためのもので、
   * ゲームのルール(軍の色)とは関係しない。
   */
  readonly emblemColor: number;
  /** 思考パターンの説明(選択画面の対戦相手ウィンドウに表示する) */
  readonly description: string;
  /** この指揮官の思考パターン */
  readonly behavior: AiBehavior;
}

/**
 * 選択できる対戦キャラクターの一覧(表示順)。
 * 先頭が既定の対戦相手になる。
 */
export const AI_CHARACTERS: readonly AiCharacter[] = [
  {
    id: 'instructor',
    name: 'ノーラ',
    title: '教導官',
    difficulty: '初級〜中級',
    emblemColor: 0x6ec1a0,
    description:
      '目の前の敵と拠点を順に片づける、基本に忠実な指揮官。遠くを見ないぶん動きが読みやすく、まずはこの相手で戦い方を覚えられる。攻撃できる敵がいれば必ず攻撃し、移動できる範囲に拠点があれば占領する。生産は毎ターン、資金で買えるいちばん高価なユニットを選ぶ。',
    // 敵AIを導入した当初からの思考パターン。既定値そのままの素朴な方針。
    behavior: {
      production: 'strongest',
      infantryQuota: 0,
      powerCostRatio: 0,
      advance: 'nearestEnemy',
      routing: 'direct',
      preferNeutralCapture: false,
    },
  },
  {
    id: 'vanguard',
    name: 'ガルム',
    title: '突撃長',
    difficulty: '中級〜上級',
    emblemColor: 0xe8734a,
    description:
      'まず歩兵 6 体をそろえて中立都市を押さえ、伸ばした収入で重装備を整える指揮官。歩兵がそろうまでは歩兵だけを生産し、そのあとは安いユニットを買わずに資金を貯めて強力なユニットを狙う。戦闘ユニットは敵が 1 体も見えていなくても、通れるマスをたどって自軍の本拠地へ突き進む。',
    behavior: {
      // 序盤は歩兵で中立都市を取りに行き、収入を伸ばしてから戦力を整える
      production: 'infantryFirst',
      // 生産拠点 2〜3 か所で 2 ターンほど回すとそろう数。都市の制圧役として十分な頭数になる
      infantryQuota: 6,
      // その拠点で作れる最強ユニットの半額以上のものだけを買う。
      // 工場・本拠地なら最強は重戦車 18000 なので、9000 未満の安いユニットは見送って資金を貯める
      powerCostRatio: 0.5,
      advance: 'captureAndCharge',
      // 稜線や海に阻まれても、通れるマスをたどって回り込む
      routing: 'path',
      preferNeutralCapture: true,
    },
  },
];

/** 既定の対戦キャラクター(選択画面の初期選択) */
export const DEFAULT_AI_CHARACTER: AiCharacter = AI_CHARACTERS[0];

/**
 * 識別子から対戦キャラクターを引く。
 * 未知の識別子(古い中断データなど)の場合は既定のキャラクターを返す。
 */
export function getAiCharacter(id: string | undefined): AiCharacter {
  return AI_CHARACTERS.find((character) => character.id === id) ?? DEFAULT_AI_CHARACTER;
}

/** 肩書つきの表示名(例: 「教導官 ノーラ」)を返す */
export function aiCharacterLabel(character: AiCharacter): string {
  return `${character.title} ${character.name}`;
}
