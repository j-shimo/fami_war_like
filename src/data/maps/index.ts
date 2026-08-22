// 選択可能なマップの一覧。マップ選択画面(MapSelectScene)から参照する。
// 新しいマップを追加したら、この一覧に登録すれば選択画面に並ぶ。

import { CAPTURE_MAP } from '@/data/maps/captureMap';
import { ISLAND_MAP } from '@/data/maps/islandMap';
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
      '海が盤面を分断する 20x20 の対角マップ。地上は細い地峡に渋滞し、海を越える飛行ユニットと島の中立空港が主導権を握る。',
  },
  {
    id: 'island',
    definition: ISLAND_MAP,
    description:
      '海で本土が完全に分断された 20x24 の南北マップ。資金 0 から都市を集めて艦隊を整え、輸送艦で小島と敵本土へ渡る。後手の敵軍は都市が 2 個多い。',
  },
];

/** 選択画面の初期選択に使う先頭マップ */
export const DEFAULT_MAP_ENTRY: MapEntry = MAP_LIST[0];
