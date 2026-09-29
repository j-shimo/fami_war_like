// 軍勢ごとの表示色。インゲームの盤面・4P 設定画面で共有する。
// 1P(自軍)は青・2P(敵軍)は赤で、4P マップにだけ登場する 3P は緑・4P は黄にする。
// 緑は地形(平地のオリーブ・森の深緑)に埋もれないよう、青みを足した明るい翠色にしてある。

import type { ArmyType } from '@/core/map/TerrainType';

/** 占領拠点の所有者を示す枠・旗の色 */
export const OWNER_COLOR: Readonly<Record<ArmyType, number>> = {
  player: 0x3a7bd5,
  enemy: 0xd53a3a,
  third: 0x2fc48e,
  fourth: 0xe8c53a,
  neutral: 0xdddddd,
};

/** ユニット本体(軍色トークン)の塗り色 */
export const UNIT_BODY_COLOR: Readonly<Record<ArmyType, number>> = {
  player: 0x2f5fae,
  enemy: 0xae2f2f,
  third: 0x1f8f68,
  fourth: 0xb8921c,
  neutral: 0x777777,
};

/** ターン開始バナーの帯の色 */
export const TURN_BANNER_COLOR: Readonly<Record<ArmyType, number>> = {
  player: 0x2f5fae,
  enemy: 0xae2f2f,
  third: 0x1f8f68,
  fourth: 0xa88418,
  neutral: 0x555566,
};

/** 文字色として使うときの軍勢の色(4P 設定画面・結果表示の見出しなど) */
export const ARMY_TEXT_COLOR: Readonly<Record<ArmyType, string>> = {
  player: '#6aa8ff',
  enemy: '#ff6a6a',
  third: '#4fe0a8',
  fourth: '#ffd84a',
  neutral: '#dddddd',
};
