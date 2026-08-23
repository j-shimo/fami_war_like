// 移動演出のタイムライン(ルートに沿って走らせ、必要なら遭遇演出を挟む段取り)を
// 組み立てる純粋モジュール。attackSequence と同じ考え方で、Phaser には依存させず
// 「何マス・何ミリ秒かけて見せるか」だけをデータとして扱えるようにしてある。
// 実際の描画は BattleEffects(Phaser 依存)が担い、MainScene が両者をつなぐ。
//
// 段取りの考え方:
//   ルートを 1 マスずつ走る → 夜戦で見えない敵に出くわしたら遭遇演出 → 強制待機の確定。

import type { GridPosition } from '@/core/map/GridPosition';

/** 移動演出で 1 マス進むのにかける時間(ミリ秒) */
export const MOVE_STEP_MS = 60;

/** 遭遇演出(「！」→「そうぐう！」)を見せてから強制待機を確定するまでの時間(ミリ秒) */
export const ENCOUNTER_HOLD_MS = 720;

/** 「！」を出してから「そうぐう！」を出すまでの遅れ(ミリ秒) */
export const ENCOUNTER_MARK_DELAY_MS = 150;

/** 移動演出のタイムライン。時間はすべてミリ秒 */
export interface MoveSequence {
  /** 実際に走るマス数(その場に留まるなら 0。0 のときは走る演出を省く) */
  readonly steps: number;
  /** ルートを走り終える(停止マスへ着く)までの時間 */
  readonly travelMs: number;
  /** 停止してから遭遇演出を見せる時間(見えない敵に出くわさなければ 0) */
  readonly encounterHoldMs: number;
  /** 演出全体にかかる時間(走り + 遭遇演出) */
  readonly endAt: number;
}

/**
 * 移動経路から演出のタイムラインを組み立てる。
 *
 * @param path 開始マスから停止マスまでの経路(先頭は開始マス)
 * @param blocked 夜戦で見えない敵に阻まれて停止したか(強制待機になるか)
 */
export function buildMoveSequence(
  path: readonly GridPosition[],
  blocked: boolean,
): MoveSequence {
  const steps = Math.max(0, path.length - 1);
  const travelMs = steps * MOVE_STEP_MS;
  const encounterHoldMs = blocked ? ENCOUNTER_HOLD_MS : 0;
  return { steps, travelMs, encounterHoldMs, endAt: travelMs + encounterHoldMs };
}
