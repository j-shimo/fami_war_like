// ターン状態を情報パネル向けの文字列へ整形する。表示ロジックのみを担い、Phaser には依存しない。

import type { TurnArmy, TurnState } from '@/core/turn/TurnManager';

/** 手番軍の表示名 */
const ARMY_LABEL: Record<TurnArmy, string> = {
  player: '自軍',
  enemy: '敵軍',
};

/** 軍勢の表示名を返す */
export function armyLabel(army: TurnArmy): string {
  return ARMY_LABEL[army];
}

/**
 * ターン状態を「第Nターン / 自軍」の形式の見出しに整形する。
 * 夜戦(nightBattle)のときは、どちらのモードで遊んでいるか分かるよう末尾に印を添える。
 */
export function formatTurnBanner(
  state: TurnState,
  options: { nightBattle?: boolean } = {},
): string {
  const banner = `第${state.turnNumber}ターン / ${armyLabel(state.currentArmy)}`;
  return options.nightBattle ? `${banner} 🌙` : banner;
}
