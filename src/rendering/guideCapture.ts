// ゲーム説明(GuideScene)の各スライドに載せる「キャプチャ」を描く。
// 盤面の描画そのものは rendering/miniBoard.ts の共通ルーチン(エンディングのカットと共用)に委ね、
// ここではスライドごとの盤面データ(地形・駒・ラベル)だけを持つ。
// ここは描画専用で、ゲームロジックには依存しない。

import type Phaser from 'phaser';

import type { GuideCaptureKind } from '@/data/guideData';
import {
  drawMiniBoard,
  type MiniBadge,
  type MiniBoardArea,
  type MiniScene,
} from '@/rendering/miniBoard';

/** キャプチャを描く領域(左上原点のピクセル矩形) */
export type GuideCaptureArea = MiniBoardArea;

/** スライド種別ごとのミニ盤面定義(いずれも 5x4 マス) */
const SCENES: Readonly<Record<GuideCaptureKind, MiniScene>> = {
  objective: {
    layout: ['H.f..', '.==..', '..==f', 'f..cH'],
    owners: [
      { at: [0, 0], army: 'player' },
      { at: [4, 3], army: 'enemy' },
    ],
    units: [
      { at: [1, 1], type: 'mediumTank', army: 'player' },
      { at: [3, 2], type: 'mediumTank', army: 'enemy' },
    ],
    attackTarget: [4, 3],
  },
  income: {
    layout: ['H.c..', '.t...', '..f..', '..c.H'],
    owners: [
      { at: [0, 0], army: 'player' },
      { at: [1, 1], army: 'player' },
      { at: [2, 0], army: 'player' },
    ],
    units: [{ at: [1, 1], type: 'infantry', army: 'player' }],
    selected: [1, 1],
  },
  move: {
    layout: ['..f..', '.....', '..m..', 'f...c'],
    units: [{ at: [1, 1], type: 'mediumTank', army: 'player' }],
    moveTiles: [
      [1, 0],
      [0, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [0, 2],
    ],
    selected: [1, 1],
  },
  attack: {
    layout: ['.....', '..f..', '.....', 'f...c'],
    units: [
      { at: [1, 2], type: 'mediumTank', army: 'player' },
      { at: [2, 2], type: 'mediumTank', army: 'enemy' },
    ],
    selected: [1, 2],
    attackTarget: [2, 2],
  },
  capture: {
    layout: ['.....', '..c..', '.....', 'H...c'],
    owners: [{ at: [0, 3], army: 'player' }],
    units: [{ at: [2, 1], type: 'infantry', army: 'player' }],
    selected: [2, 1],
  },
  endTurn: {
    layout: ['H.f..', '.==..', '..f..', '...cH'],
    owners: [
      { at: [0, 0], army: 'player' },
      { at: [4, 3], army: 'enemy' },
    ],
    units: [
      { at: [1, 1], type: 'infantry', army: 'player' },
      { at: [3, 2], type: 'mediumTank', army: 'enemy' },
    ],
  },
};

/** スライド種別ごとに、盤面へ重ねる説明ラベル */
const BADGES: Readonly<Record<GuideCaptureKind, readonly MiniBadge[]>> = {
  objective: [{ at: [4, 3], text: '敵本拠地を占領', color: '#ffd479', fill: 0x3a1c1c }],
  income: [{ at: [1, 1], text: '+資金 → 生産', color: '#ffe08a', fill: 0x1c2a3a }],
  move: [{ at: [3, 1], text: '移動範囲', color: '#cfe4ff', fill: 0x1c2a44 }],
  attack: [
    { at: [2, 2], text: '戦闘予測 -6 / 反撃-2', color: '#ffd0d0', fill: 0x3a1c1c },
  ],
  capture: [{ at: [2, 1], text: '占領 20 → 10', color: '#ffe08a', fill: 0x2a2a1c }],
  endTurn: [
    { at: [2, 0], text: 'ターン終了 → 敵の番', color: '#cfe4ff', fill: 0x1c2436 },
  ],
};

/**
 * 指定スライドのキャプチャを area 内に描く。
 * 生成した Phaser オブジェクトを配列で返すので、スライド切り替え時に呼び出し側でまとめて破棄する。
 */
export function drawGuideCapture(
  scene: Phaser.Scene,
  kind: GuideCaptureKind,
  area: GuideCaptureArea,
): Phaser.GameObjects.GameObject[] {
  return drawMiniBoard(scene, { ...SCENES[kind], badges: BADGES[kind] }, area);
}
