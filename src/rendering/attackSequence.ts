// 攻撃演出のタイムライン(どの演出を何ミリ秒後に出すか)を組み立てる純粋モジュール。
// Phaser には依存させず、演出の「段取り」だけをデータとして扱えるようにしてある。
// 実際の描画は BattleEffects(Phaser 依存)が担い、MainScene が両者をつなぐ。
//
// 段取りの考え方:
//   踏み込み → 着弾(ヒットストップ) → 引き戻し、の流れを軸に、
//   撃破の爆散と反撃のダメージ表示を差し込む。

import type { AttackResult } from '@/core/battle/BattleManager';

/** 攻撃側が対象へ踏み込むのにかける時間(ミリ秒) */
export const LUNGE_OUT_MS = 110;
/** 着弾の瞬間に動きを止める時間(ヒットストップ。ミリ秒) */
export const HIT_STOP_MS = 70;
/** 踏み込みから元の位置へ戻るのにかける時間(ミリ秒) */
export const LUNGE_BACK_MS = 110;

/** 撃破の爆散を着弾から遅らせる時間(ミリ秒) */
const BURST_DELAY_MS = 80;
/** 反撃のダメージ表示を踏み込み終了から遅らせる時間(ミリ秒) */
const COUNTER_DELAY_MS = 60;
/** 各演出を出しきってから演出終了とみなすまでの余韻(ミリ秒) */
const BURST_TAIL_MS = 220;
const DAMAGE_TAIL_MS = 200;

/**
 * 攻撃演出のタイムライン。時刻はすべて演出開始からのミリ秒。
 * 発生しない演出の時刻は null になる。
 */
export interface AttackSequence {
  /** 踏み込みが当たる瞬間(与ダメージの数字・画面の揺れ・打撃音) */
  readonly impactAt: number;
  /** 踏み込みから戻り終わる時刻 */
  readonly lungeEndAt: number;
  /** 防御側の撃破演出(爆散・撃破音)の時刻 */
  readonly defenderBurstAt: number | null;
  /** 反撃の被ダメージ表示の時刻 */
  readonly counterAt: number | null;
  /** 攻撃側が反撃で撃破される演出の時刻 */
  readonly attackerBurstAt: number | null;
  /** 演出全体の終了時刻(盤面の再描画と操作の再開に使う) */
  readonly endAt: number;
}

/** 攻撃結果から演出のタイムラインを組み立てる */
export function buildAttackSequence(result: AttackResult): AttackSequence {
  const impactAt = LUNGE_OUT_MS;
  const lungeEndAt = impactAt + HIT_STOP_MS + LUNGE_BACK_MS;

  const defenderBurstAt = result.defenderDefeated ? impactAt + BURST_DELAY_MS : null;
  // 反撃は防御側が生存しているときだけ起きるため、撃破の爆散とは同時に発生しない
  const counterAt = result.counterDamage > 0 ? lungeEndAt + COUNTER_DELAY_MS : null;
  const attackerBurstAt =
    result.attackerDefeated && counterAt !== null ? counterAt + BURST_DELAY_MS : null;

  const endAt = Math.max(
    lungeEndAt,
    defenderBurstAt === null ? 0 : defenderBurstAt + BURST_TAIL_MS,
    counterAt === null ? 0 : counterAt + DAMAGE_TAIL_MS,
    attackerBurstAt === null ? 0 : attackerBurstAt + BURST_TAIL_MS,
  );

  return { impactAt, lungeEndAt, defenderBurstAt, counterAt, attackerBurstAt, endAt };
}
