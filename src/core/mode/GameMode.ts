// モード選択画面で選ぶ「遊び方」(プレイヤーサイド・操作設定・マップ区分)の型と判定。
// Phaser には依存しない純粋なロジックとして持ち、シーン間・中断データで共有する。
// docs/GameDesign.md「モード選択」を参照。

import type { TurnArmy } from '@/core/turn/TurnManager';

/**
 * プレイヤーが担当するサイド。
 * - 1p: これまでどおり、マップ定義の自軍(player)側を担当する
 * - 2p: マップ定義の敵軍(enemy)側を担当する。盤面の自軍・敵軍を入れ替えたうえで
 *   後手番(相手が先に動く)になるため、同じマップでも難度が上がる
 */
export type PlayerSide = '1p' | '2p';

/**
 * 操作の設定(誰が誰を操作するか)。
 * - cpu: プレイヤー vs CPU。相手の手番は敵軍AIが自動で行動する
 * - human: プレイヤー vs プレイヤー。1 台の画面を交代で使い、両陣営とも人間が操作する
 */
export type VersusMode = 'cpu' | 'human';

/**
 * マップ選択画面で並べるマップの区分(モード選択画面のどの入口から入ったか)。
 * - standard: 通常マップ(これまで遊んできたマップ)
 * - new: 新マップ(追加要素を入れたマップ)
 * - four: 4P マップ(4 人で遊べるマップ)
 */
export type MapGroup = 'standard' | 'new' | 'four';

/** マップ区分を指定しなかった場合の既定値 */
export const DEFAULT_MAP_GROUP: MapGroup = 'standard';

/** モード選択画面で選んだ内容 */
export interface GameMode {
  readonly side: PlayerSide;
  readonly versus: VersusMode;
}

/** 何も選んでいないときに使う既定のモード(1P側・対 CPU) */
export const DEFAULT_GAME_MODE: GameMode = { side: '1p', versus: 'cpu' };

/** プレイヤーサイドとして妥当な値か */
export function isPlayerSide(value: unknown): value is PlayerSide {
  return value === '1p' || value === '2p';
}

/** 操作の設定として妥当な値か */
export function isVersusMode(value: unknown): value is VersusMode {
  return value === 'cpu' || value === 'human';
}

/** マップ区分として妥当な値か */
export function isMapGroup(value: unknown): value is MapGroup {
  return value === 'standard' || value === 'new' || value === 'four';
}

/**
 * 選んだサイドで盤面の自軍・敵軍を入れ替えるか。
 * 2P側は「これまで敵軍だった側」を担当するため入れ替える。
 */
export function swapsSides(side: PlayerSide): boolean {
  return side === '2p';
}

/**
 * 選んだサイドでの先手の軍勢。
 * 2P側は後手番にするため、入れ替え後の敵軍(= 元の 1P 側)が先に動く。
 */
export function firstArmy(side: PlayerSide): TurnArmy {
  return swapsSides(side) ? 'enemy' : 'player';
}

/** プレイヤーサイドの表示名 */
export function sideLabel(side: PlayerSide): string {
  return side === '2p' ? '2P側' : '1P側';
}

/** 操作の設定の表示名 */
export function versusLabel(versus: VersusMode): string {
  return versus === 'human' ? 'プレイヤー vs プレイヤー' : 'プレイヤー vs CPU';
}

/** マップ区分の表示名(マップ選択画面の見出しに使う) */
export function mapGroupLabel(group: MapGroup): string {
  switch (group) {
    case 'new':
      return '新マップ';
    case 'four':
      return '4Pマップ';
    default:
      return '通常マップ';
  }
}

/** 選んでいるモードを 1 行にまとめた表示("1P側 / プレイヤー vs CPU") */
export function gameModeSummary(mode: GameMode): string {
  return `${sideLabel(mode.side)} / ${versusLabel(mode.versus)}`;
}
