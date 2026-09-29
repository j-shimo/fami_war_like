// ターン状態を情報パネル向けの文字列へ整形する。表示ロジックのみを担い、Phaser には依存しない。

import {
  DEFAULT_GAME_MODE,
  firstArmy,
  type PlayerSide,
  type VersusMode,
} from '@/core/mode/GameMode';
import { playerNumberLabel } from '@/core/mode/FourPlayerSetup';
import type { TurnArmy, TurnState } from '@/core/turn/TurnManager';

/** 手番軍の表示名(対 CPU。3P・4P は 4P マップにしか登場しないため番号で呼ぶ) */
const ARMY_LABEL: Record<TurnArmy, string> = {
  player: '自軍',
  enemy: '敵軍',
  third: '3P',
  fourth: '4P',
};

/** 表示名の呼び分けに使うモード選択の内容 */
export interface ArmyLabelOptions {
  /** 操作の設定。対人戦では両陣営とも人間が操作するため 1P・2P と呼び分ける */
  readonly versus?: VersusMode;
  /** 担当サイド。対人戦でどちらが先手かの判定に使う(省略時は 1P側) */
  readonly side?: PlayerSide;
  /**
   * 4P マップで遊んでいるか。4P マップでは操作(プレイヤー / コンピューター)にかかわらず、
   * 各軍勢を 1P〜4P の番号で呼ぶ。
   */
  readonly fourPlayer?: boolean;
}

/**
 * 軍勢の表示名を返す。
 * 対 CPU ではプレイヤーが操作する側を「自軍」、AI 側を「敵軍」と呼ぶ。
 * 対人戦は両方とも人間が操作するため、先手を 1P・後手を 2P と呼ぶ
 * (2P側を選ぶと盤面を入れ替えて敵軍が先手になるため、赤い軍勢が 1P になる)。
 * 4P マップでは、各軍勢を 1P〜4P の番号で呼ぶ(自軍 = 1P・敵軍 = 2P・3P・4P)。
 */
export function armyLabel(army: TurnArmy, options: ArmyLabelOptions = {}): string {
  if (options.fourPlayer === true) {
    return playerNumberLabel(army);
  }
  if (options.versus !== 'human') {
    return ARMY_LABEL[army];
  }
  return army === firstArmy(options.side ?? DEFAULT_GAME_MODE.side) ? '1P' : '2P';
}

/**
 * ターン状態を「第Nターン / 自軍」の形式の見出しに整形する。
 * 夜戦(nightBattle)のときは、どちらのモードで遊んでいるか分かるよう末尾に印を添える。
 */
export function formatTurnBanner(
  state: TurnState,
  options: ArmyLabelOptions & { nightBattle?: boolean } = {},
): string {
  const banner = `第${state.turnNumber}ターン / ${armyLabel(state.currentArmy, options)}`;
  return options.nightBattle ? `${banner} 🌙` : banner;
}
