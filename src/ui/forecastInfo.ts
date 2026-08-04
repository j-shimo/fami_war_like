// 戦闘予測を表示用テキストに整形する。Phaser には依存しない純粋な関数。
// docs/DevelopmentPlan.md Phase 10「ダメージ予測UIを作る」を参照。

import type { BattleForecast } from '@/core/battle/BattleForecast';
import type { Unit } from '@/core/units/Unit';

/** 「a→b」形式で HP の変化を表す */
function hpChange(before: number, after: number): string {
  return `HP ${before}→${after}`;
}

/**
 * 戦闘予測を複数行のテキストとして返す。ダメージ予測ポップアップに使う。
 * 与ダメージと撃破可否、反撃の有無と被害を簡潔に示す。
 */
export function formatBattleForecast(
  forecast: BattleForecast,
  attacker: Unit,
  defender: Unit,
): string[] {
  const lines = ['戦闘予測', `${attacker.unitName} → ${defender.unitName}`];

  // 与ダメージと防御側の HP 変化(撃破できる見込みなら明示する)
  const dealt = `与ダメージ: ${forecast.damageDealt} (${hpChange(
    forecast.defenderHpBefore,
    forecast.defenderHpAfter,
  )})`;
  lines.push(forecast.defenderDefeated ? `${dealt} 撃破!` : dealt);

  // 反撃の見込み
  if (forecast.willCounter) {
    const counter = `反撃: ${forecast.counterDamage} (${hpChange(
      forecast.attackerHpBefore,
      forecast.attackerHpAfter,
    )})`;
    lines.push(forecast.attackerDefeated ? `${counter} 被撃破!` : counter);
  } else {
    lines.push('反撃: なし');
  }

  return lines;
}
