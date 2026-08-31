// エンディングの表示テキスト(戦績の行・指揮官名の差し込み)を整形する。
// 表示ロジックのみを担い、Phaser には依存しない純粋な関数。

import type { BattleStats } from '@/core/stats/BattleStats';

/** 戦績 1 行ぶんの表示データ */
export interface StatRow {
  readonly label: string;
  readonly value: string;
}

/** 数値を 3 桁区切りにする(資金など桁の大きい値に使う) */
function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * 戦績をスタッフロールに載せる行へ整形する。
 * 表示するのはプレイヤー(自軍)側の記録で、エンディングは対 CPU の勝利でしか流れないため、
 * 自軍 = エンディングを見ているプレイヤーになる。
 */
export function formatBattleStats(stats: BattleStats): StatRow[] {
  return [
    { label: 'クリアターン数', value: `${formatNumber(stats.turns)} ターン` },
    { label: '生産したユニット', value: `${formatNumber(stats.player.produced)} 体` },
    { label: '投じた資金', value: formatNumber(stats.player.spent) },
    { label: '撃破したユニット', value: `${formatNumber(stats.player.defeated)} 体` },
    { label: '失ったユニット', value: `${formatNumber(stats.player.lost)} 体` },
    { label: '占領した拠点', value: `${formatNumber(stats.player.captured)} か所` },
  ];
}

/** 本文中の "{commander}" を、対戦していた敵指揮官の名前へ置き換える */
export function applyCommander(line: string, commander: string): string {
  return line.split('{commander}').join(commander);
}
