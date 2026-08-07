// 選択可能なマップの一覧。マップ選択画面(MapSelectScene)から参照する。
// 新しいマップを追加したら、この一覧に登録すれば選択画面に並ぶ。

import { CAPTURE_MAP } from '@/data/maps/captureMap';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { SEA_MAP } from '@/data/maps/seaMap';
import { TEST_MAP } from '@/data/maps/testMap';

/** マップ選択画面に並べる 1 枚ぶんのエントリ */
export interface MapEntry {
  /** 内部識別子(シーン間の受け渡しやテストで使う) */
  readonly id: string;
  /** マップ定義本体 */
  readonly definition: MapDefinition;
  /** 選択画面に表示する 1 行説明 */
  readonly description: string;
}

/** 選択可能なマップの一覧(表示順) */
export const MAP_LIST: readonly MapEntry[] = [
  {
    id: 'capture',
    definition: CAPTURE_MAP,
    description: '中央の拠点を奪い合う横長マップ。占領テンポで戦力差をつける。',
  },
  {
    id: 'test',
    definition: TEST_MAP,
    description: '上下に陣地を構える標準サイズのマップ。基本の遊び方を試せる。',
  },
  {
    id: 'sea',
    definition: SEA_MAP,
    description:
      '海を配した 20x20 の大型対角マップ。左下と右上に分かれて広大な戦場を奪い合う。',
  },
];

/** 選択画面の初期選択に使う先頭マップ */
export const DEFAULT_MAP_ENTRY: MapEntry = MAP_LIST[0];
