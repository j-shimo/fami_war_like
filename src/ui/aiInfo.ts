// 敵軍AIの行動を情報パネル向けの文字列へ整形する。
// 表示ロジックのみを担い、Phaser には依存しない純粋な関数。

import type { AiAction } from '@/core/ai/EnemyAi';

/**
 * 敵軍の 1 手番ぶんの行動ログを、情報パネル用の複数行テキストに集計する。
 * 攻撃・占領・移動・生産の件数と、撃破・占領完了の数をまとめて表示する。
 */
export function formatEnemyTurnSummary(actions: readonly AiAction[]): string[] {
  let attack = 0;
  let capture = 0;
  let move = 0;
  let produce = 0;
  let defeated = 0;
  let captured = 0;

  for (const action of actions) {
    switch (action.kind) {
      case 'attack':
        attack += 1;
        if (action.result.defenderDefeated) {
          defeated += 1;
        }
        break;
      case 'capture':
        capture += 1;
        if (action.result.captured) {
          captured += 1;
        }
        break;
      case 'move':
        move += 1;
        break;
      case 'produce':
        produce += 1;
        break;
      // wait は表示しない
    }
  }

  const lines = ['敵軍の行動'];
  if (attack > 0) {
    lines.push(`攻撃: ${attack}` + (defeated > 0 ? `(撃破 ${defeated})` : ''));
  }
  if (capture > 0) {
    lines.push(`占領: ${capture}` + (captured > 0 ? '(占領完了)' : ''));
  }
  if (move > 0) {
    lines.push(`移動: ${move}`);
  }
  if (produce > 0) {
    lines.push(`生産: ${produce}`);
  }
  if (lines.length === 1) {
    lines.push('待機');
  }
  return lines;
}
