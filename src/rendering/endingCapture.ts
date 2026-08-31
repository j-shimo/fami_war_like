// エンディングのエピローグに載せるカット(ゲーム画面風のミニ盤面)を描く。
// 盤面の描画そのものは rendering/miniBoard.ts の共通ルーチン(ゲーム説明のキャプチャと共用)へ委ね、
// ここではカットごとの盤面データ(地形・駒・ラベル)だけを持つ。
// ここは描画専用で、ゲームロジックには依存しない。

import type Phaser from 'phaser';

import type { EndingCutKind } from '@/data/endingData';
import {
  drawMiniBoard,
  type MiniBoardArea,
  type MiniScene,
} from '@/rendering/miniBoard';

/** カットを描く領域(左上原点のピクセル矩形) */
export type EndingCutArea = MiniBoardArea;

/**
 * カット種別ごとのミニ盤面定義(いずれも 7x4 マス)。
 * 激ムズマップ「双大陸マップ」を思わせる、海峡で東西に分かれた盤面をもとにしている。
 */
const CUTS: Readonly<Record<EndingCutKind, MiniScene>> = {
  // ① 海峡に架かる橋を、自軍が西から東へ渡っていく
  bridge: {
    layout: ['.c.~~.c', '..===..', '..f~~f.', 'H..~~.c'],
    owners: [
      { at: [1, 0], army: 'player' },
      { at: [0, 3], army: 'player' },
      { at: [6, 0], army: 'enemy' },
      { at: [6, 3], army: 'enemy' },
    ],
    // 橋の上を、歩兵と戦車が縦列で東へ渡っていく
    units: [
      { at: [2, 1], type: 'infantry', army: 'player' },
      { at: [3, 1], type: 'mediumTank', army: 'player' },
    ],
    badges: [{ at: [4, 1], text: '海峡を渡る', color: '#cfe4ff', fill: 0x1c2a44 }],
  },
  // ② 東の島の拠点がすべて自軍の旗に変わる
  liberation: {
    layout: ['..c..c.', '.=====.', '..mm...', 'c...H.c'],
    owners: [
      { at: [2, 0], army: 'player' },
      { at: [5, 0], army: 'player' },
      { at: [0, 3], army: 'player' },
      { at: [4, 3], army: 'player' },
      { at: [6, 3], army: 'player' },
    ],
    units: [{ at: [4, 2], type: 'infantry', army: 'player' }],
    selected: [4, 3],
    badges: [{ at: [4, 3], text: '東の島 制圧', color: '#ffe08a', fill: 0x2a2a1c }],
  },
  // ③ 両軍の指揮官が街道をはさんで向き合う
  commanders: {
    layout: ['f.....f', '..===..', '..===..', 'f.....f'],
    units: [
      { at: [2, 2], type: 'infantry', army: 'player' },
      { at: [4, 2], type: 'infantry', army: 'enemy' },
    ],
    badges: [{ at: [3, 1], text: '再戦の約束', color: '#ffd479', fill: 0x2a2436 }],
  },
};

/**
 * 指定カットを area 内に描く。
 * 生成した Phaser オブジェクトを配列で返すので、ページ切り替え時に呼び出し側でまとめて破棄する。
 */
export function drawEndingCut(
  scene: Phaser.Scene,
  kind: EndingCutKind,
  area: EndingCutArea,
): Phaser.GameObjects.GameObject[] {
  return drawMiniBoard(scene, CUTS[kind], area);
}
