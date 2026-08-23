// 戦闘予測を表示用データに整形する。Phaser には依存しない純粋な関数。
// docs/GameDesign.md「戦闘予測の表示」、docs/DevelopmentPlan.md Phase 10 を参照。
//
// 予測ポップアップは「自軍ユニットで攻撃対象を選んでいるとき」だけ出るため、
// 攻撃側 = プレイヤー、防御側 = 敵とみなして「自HP / 敵HP」と表記する。

import type { BattleForecast } from '@/core/battle/BattleForecast';
import type { Unit } from '@/core/units/Unit';

/**
 * 予測結果の危険度。ポップアップの配色・強調行・警告音の出し分けに使う。
 * - 'danger': 反撃でこちらが撃破される(いちばん伝えたい情報)
 * - 'kill'  : この攻撃で敵を撃破できる
 * - 'none'  : どちらも撃破に至らない
 */
export type ForecastAlert = 'danger' | 'kill' | 'none';

/** ダメージ予測ポップアップの表示内容 */
export interface BattleForecastView {
  /** 本文(通常色で表示する複数行) */
  readonly lines: readonly string[];
  /** 危険度 */
  readonly alert: ForecastAlert;
  /** 本文の下に大きく出す強調行。alert が 'none' なら null */
  readonly alertText: string | null;
}

/** 危険度ごとの強調行。「やられる」ことを一目で分かる言葉で伝える */
const ALERT_TEXT: Record<ForecastAlert, string | null> = {
  danger: 'やられる！ 反撃で撃破される',
  kill: '撃破できる！',
  none: null,
};

/** 「a→b」形式で HP の変化を表す */
function hpChange(label: string, before: number, after: number): string {
  return `${label}HP ${before}→${after}`;
}

/**
 * 戦闘予測をポップアップ用の表示データへ整形する。
 * 本文で数値を示し、撃破・被撃破は強調行と危険度で別扱いにする。
 */
export function buildBattleForecastView(
  forecast: BattleForecast,
  attacker: Unit,
  defender: Unit,
): BattleForecastView {
  const lines = ['戦闘予測', `${attacker.unitName} → ${defender.unitName}`];

  // こちらの攻撃で敵が受けるダメージ
  lines.push(
    `こちらの攻撃: ${forecast.damageDealt}  ${hpChange(
      '敵',
      forecast.defenderHpBefore,
      forecast.defenderHpAfter,
    )}`,
  );

  // 敵の反撃でこちらが受けるダメージ
  if (forecast.willCounter) {
    lines.push(
      `敵の反撃: ${forecast.counterDamage}  ${hpChange(
        '自',
        forecast.attackerHpBefore,
        forecast.attackerHpAfter,
      )}`,
    );
  } else {
    lines.push('敵の反撃: なし');
  }

  // 被撃破は撃破より優先して伝える(反撃で撃破されるなら敵は生存しているため排他)
  const alert: ForecastAlert = forecast.attackerDefeated
    ? 'danger'
    : forecast.defenderDefeated
      ? 'kill'
      : 'none';

  return { lines, alert, alertText: ALERT_TEXT[alert] };
}
