// 敵軍AIの行動を情報パネル向けの文字列へ整形する。
// 表示ロジックのみを担い、Phaser には依存しない純粋な関数。
//
// 手番ぶんをまとめた集計(formatEnemyTurnSummary)と、
// 「敵の行動アニメ」で 1 行動ずつ見せるときの実況(formatEnemyActionLog)の 2 つを持つ。

import type { AiAction } from '@/core/ai/EnemyAi';

/** formatEnemyTurnSummary の表示オプション */
export interface EnemyTurnSummaryOptions {
  /**
   * 敵軍を率いている指揮官の表示名(例: 「教導官 ノーラ」)。
   * 渡すと見出しをその指揮官の名前にする。省略時は「敵軍の行動」と表示する。
   */
  readonly commander?: string;
}

/**
 * 敵軍の 1 手番ぶんの行動ログを、情報パネル用の複数行テキストに集計する。
 * 攻撃・占領・移動・輸送・生産の件数と、撃破・占領完了の数をまとめて表示する。
 * 夜戦で見えない自軍ユニットに出くわして強制待機した件数は「遭遇」として示す。
 */
export function formatEnemyTurnSummary(
  actions: readonly AiAction[],
  options: EnemyTurnSummaryOptions = {},
): string[] {
  let attack = 0;
  let capture = 0;
  let move = 0;
  let transport = 0;
  let produce = 0;
  let halt = 0;
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
      case 'board':
      case 'unload':
        // 搭乗と降車はどちらも「輸送」1 件として数える
        transport += 1;
        break;
      case 'halt':
        halt += 1;
        break;
      case 'produce':
        produce += 1;
        break;
      // wait は表示しない
    }
  }

  const lines = [options.commander ? `${options.commander} の行動` : '敵軍の行動'];
  if (attack > 0) {
    lines.push(`攻撃: ${attack}` + (defeated > 0 ? `(撃破 ${defeated})` : ''));
  }
  if (capture > 0) {
    lines.push(`占領: ${capture}` + (captured > 0 ? '(占領完了)' : ''));
  }
  if (move > 0) {
    lines.push(`移動: ${move}`);
  }
  if (transport > 0) {
    lines.push(`輸送: ${transport}`);
  }
  if (halt > 0) {
    lines.push(`遭遇: ${halt}(強制待機)`);
  }
  if (produce > 0) {
    lines.push(`生産: ${produce}`);
  }
  if (lines.length === 1) {
    lines.push('待機');
  }
  return lines;
}

/**
 * 敵軍の行動 1 件を、演出中の情報パネル用テキストへ整形する。
 * 「敵の行動アニメ」で 1 行動ずつ見せるあいだ、いま何をしているのかを示すために使う。
 *
 * 見出しは手番の集計と同じく指揮官名(省略時は「敵軍の行動」)にそろえ、
 * その下に行動の種別と対象を並べる。
 */
export function formatEnemyActionLog(
  action: AiAction,
  options: EnemyTurnSummaryOptions = {},
): string[] {
  const lines = [options.commander ? `${options.commander} の行動` : '敵軍の行動'];
  switch (action.kind) {
    case 'attack': {
      const { attacker, defender, damageDealt } = action.result;
      lines.push('攻撃', `${attacker.unitName} → ${defender.unitName}`);
      lines.push(`ダメージ: ${damageDealt}`);
      if (action.result.defenderDefeated) {
        lines.push(`${defender.unitName} を撃破`);
      }
      if (action.result.counterDamage > 0) {
        lines.push(`反撃: ${action.result.counterDamage}`);
      }
      if (action.result.attackerDefeated) {
        lines.push(`${attacker.unitName} を撃破`);
      }
      break;
    }
    case 'capture':
      lines.push('占領', `${action.result.unit.unitName} が占領`);
      lines.push(
        action.result.captured ? '占領完了' : `残り耐久: ${action.result.remainingHp}`,
      );
      break;
    case 'move':
      lines.push('移動', action.unit.unitName);
      break;
    case 'board':
      lines.push('搭乗', `${action.transport.unitName}に${action.unit.unitName}が搭乗`);
      break;
    case 'unload':
      lines.push('降ろす', `${action.unit.unitName}が${action.passenger.unitName}を配置`);
      break;
    case 'halt':
      lines.push('そうぐう！', `${action.unit.unitName} が停止`);
      break;
    case 'produce':
      lines.push('生産', `${action.result.unit.unitName} を生産`);
      lines.push(`消費資金: ${action.result.cost}`);
      break;
    case 'wait':
      lines.push('待機', action.unit.unitName);
      break;
  }
  return lines;
}
