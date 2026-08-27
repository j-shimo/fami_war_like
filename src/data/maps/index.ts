// 選択可能なマップの一覧。マップ選択画面(MapSelectScene)から参照する。
// 新しいマップを追加したら、この一覧に登録すれば選択画面に並ぶ。

import { CAPTURE_MAP } from '@/data/maps/captureMap';
import { INNER_SEA_MAP } from '@/data/maps/innerSeaMap';
import { ISLAND_MAP } from '@/data/maps/islandMap';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { RIDGE_MAP } from '@/data/maps/ridgeMap';
import { SEA_MAP } from '@/data/maps/seaMap';
import { STRAIT_MAP } from '@/data/maps/straitMap';
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
  {
    id: 'ridge',
    definition: RIDGE_MAP,
    description:
      '収入 4000 の自軍と 10000 の敵軍で始まる 20x16 の地上戦マップ。中央の稜線が北の森ルート(装輪車両は通行不可)と南の道路ルートに戦場を分ける。拠点近くの中立都市 8 個を取り切れば収入で追いつける。',
  },
  {
    id: 'strait',
    definition: STRAIT_MAP,
    description:
      '中央を海峡が貫く 26x14 の横長マップ。北と南の大陸をつなぐ陸路は両軍の陣地だけで、戦線を渡せるのは海峡を進む艦隊と空を飛ぶ航空機のみ。中央の双子空港島と海峡の中立港が争点。後手の敵軍は陣地の隣に都市が 2 個多い。',
  },
  {
    id: 'innerSea',
    definition: INNER_SEA_MAP,
    description:
      '収入 13000 の自軍と 4000 の敵軍で始まる 20x16 の地上戦マップ。中央のレンズ型の内海が戦場を北の街道ルートと南の森ルート(装輪車両は通行不可)に完全に分断する。中立拠点はすべて自軍から遠く、うち 4 個は敵軍が 1 ターンで届く位置にある。',
  },
];

/** 選択画面の初期選択に使う先頭マップ */
export const DEFAULT_MAP_ENTRY: MapEntry = MAP_LIST[0];
