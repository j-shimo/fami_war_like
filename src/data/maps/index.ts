// 選択可能なマップの一覧。マップ選択画面(MapSelectScene)から参照する。
// 新しいマップを追加したら、この一覧に登録すれば選択画面に並ぶ。

import { DEFAULT_MAP_GROUP, type MapGroup, type PlayerSide } from '@/core/mode/GameMode';
import { CAPTURE_MAP } from '@/data/maps/captureMap';
import { DIAGONAL_SEA_MAP } from '@/data/maps/diagonalSeaMap';
import { INNER_SEA_MAP } from '@/data/maps/innerSeaMap';
import { ISLAND_MAP } from '@/data/maps/islandMap';
import { LONG_ISLAND_MAP } from '@/data/maps/longIslandMap';
import { DEFAULT_MAP_CATEGORY, type MapCategory } from '@/data/maps/mapCategory';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { RIDGE_MAP } from '@/data/maps/ridgeMap';
import { RING_LABORATORY_MAP } from '@/data/maps/ringLaboratoryMap';
import { SEA_MAP } from '@/data/maps/seaMap';
import { STRAIT_MAP } from '@/data/maps/straitMap';
import { TEST_MAP } from '@/data/maps/testMap';
import { TWIN_CONTINENTS_MAP } from '@/data/maps/twinContinentsMap';

/** マップ選択画面に並べる 1 枚ぶんのエントリ */
export interface MapEntry {
  /** 内部識別子(シーン間の受け渡しやテストで使う) */
  readonly id: string;
  /** マップ定義本体 */
  readonly definition: MapDefinition;
  /** 選択画面に表示する 1 行説明 */
  readonly description: string;
  /**
   * マップの区分。省略時は通常マップ(normal)として扱う。
   * 通常マップをすべてクリアすると激ムズマップ(extra)が選択画面に現れる。
   * テストマップ(test)は解放条件の集計対象外。
   */
  readonly category?: MapCategory;
  /**
   * どのマップ選択画面に並べるか。省略時は通常マップ(standard)として扱う。
   * モード選択画面の「通常マップ / 新マップ / 4Pマップ」の入口に対応する。
   */
  readonly group?: MapGroup;
  /**
   * このマップを出す担当サイド。省略時は 1P側・2P側のどちらでも出す。
   * 激ムズマップはサイドごとに別のマップを用意するため、この指定で出し分ける
   * (判定は src/core/progress/MapUnlock.ts)。
   */
  readonly side?: PlayerSide;
}

/** 区分の解決済みマップエントリ(解放判定・表示はこちらを使う) */
export interface ResolvedMapEntry extends MapEntry {
  readonly category: MapCategory;
  readonly group: MapGroup;
}

/** エントリの区分を解決する(未指定なら既定の区分にする) */
export function resolveMapEntry(entry: MapEntry): ResolvedMapEntry {
  return {
    ...entry,
    category: entry.category ?? DEFAULT_MAP_CATEGORY,
    group: entry.group ?? DEFAULT_MAP_GROUP,
  };
}

/**
 * 選択可能なマップの一覧(表示順)。
 * 激ムズマップ(category: 'extra')はここへ登録しても、通常マップをすべてクリアするまで
 * 選択画面には並ばない(判定は src/core/progress/MapUnlock.ts)。
 * 激ムズマップは担当サイドごとに別のマップを用意するため、side でどちらのサイドに出すかを指定する
 * (1P側は双大陸マップ・2P側は対角海マップ)。
 */
export const MAP_LIST: readonly ResolvedMapEntry[] = (
  [
    {
      id: 'capture',
      definition: CAPTURE_MAP,
      description: '中央の拠点を奪い合う横長マップ。占領テンポで戦力差をつける。',
    },
    {
      id: 'test',
      definition: TEST_MAP,
      description: '上下に陣地を構える標準サイズのマップ。基本の遊び方を試せる。',
      // 動作確認用のマップなので、激ムズマップの解放条件には数えない
      category: 'test',
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
      id: 'longIsland',
      definition: LONG_ISLAND_MAP,
      description:
        '海に囲まれた細長い島を、一本の街道が端から端まで貫く 40x10 の横長マップ。島を断ち切る中央の山地帯を車両が越えられるのは幅 1 マスの峠道と北の森の間道だけで、その両端の麓には中立空港 2 個と中立港 4 個が並ぶ。西は森と九十九折りで守りやすく、東は平地で速く攻められる非対称の島。初期資金 0・両軍とも本拠地 1・工場 2・空港 2・港 1 から始まり、後手の敵軍は中立都市が 3 個・中立空港が 1 個多い。',
    },
    {
      id: 'innerSea',
      definition: INNER_SEA_MAP,
      description:
        '収入 13000 の自軍と 4000 の敵軍で始まる 16x12 の地上戦マップ。前線工場から偵察車が 2 ターンで敵陣へ届く狭い盤面で、中央のレンズ型の内海が戦場を北の街道ルートと南の森ルート(装輪車両は通行不可)に完全に分断する。中立拠点はすべて自軍から遠く、うち 4 個は敵軍が 1 ターンで届く。中央の中立都市 6 個も敵軍寄りで、特に北ルートは敵軍が先に届く。',
    },
    {
      id: 'ringLaboratory',
      definition: RING_LABORATORY_MAP,
      description:
        '「日」を横倒しにした街道が四隅を結ぶ 13x11 の地上戦マップ。両軍とも本拠地を持たず工場 3・収入 3000 の対等な立ち上がりで、左下が先手の自軍・右上が後手の敵軍の陣地。街道に挟まれた内側は左が山(車両は進入不可)・中央が平地・右が森(装輪車両は進入不可)の 3 帯に分かれる。盤面中央の中立研究所は両軍の前線工場から等距離(歩兵でちょうど 3 ターン)で、先に動ける自軍が新型戦車を手にする代わりに、中立都市 4 個は 4 個とも後手の敵軍が 1 ターン早く届く。',
      // 追加要素(研究所・新型戦車)を主題にした新マップ
      group: 'new',
    },
    {
      id: 'twinContinents',
      definition: TWIN_CONTINENTS_MAP,
      description:
        '中央の海峡が東西に断ち切る 42x26 の激ムズマップ。自軍は陣地 8 拠点・都市 0 個・収入 8000 の裸一貫、敵軍は東の島 21 拠点を占領済みの収入 29000 で、戦闘機・爆撃機を含む 10 体を配置して待ち構える。西の島の中立拠点 22 個を取り切るまで、海峡に架かる 3 本の橋を渡らせずに守り切れるかが勝負。海峡に浮かぶ 2 島の中立空港・中立港は輸送艦か輸送ヘリでしか取れない。',
      category: 'extra',
      // 1P側の激ムズマップ(2P側には別のマップを用意する)
      side: '1p',
    },
    {
      id: 'diagonalSea',
      definition: DIAGONAL_SEA_MAP,
      description:
        '幅 9 マスの海が右上から左下へ斜めに横切る 40x24 の激ムズマップ。海の左上と右下に同じ大きさの三角形の島が 1 つずつ残り、島をつなぐ陸路は 1 本も無い。自軍は右上の陣地 7 拠点・収入 7000 の裸一貫、敵軍は都市と森が広がる左の島の 8 割(24 拠点)を占領済みの収入 31000 で、戦艦・戦闘機・爆撃機を含む 11 体を配置して待ち構える。海に点在する空港と港だけの小島 4 つは、輸送艦か輸送ヘリでしか取れない。',
      category: 'extra',
      // 2P側の激ムズマップ(1P側には双大陸マップを用意している)
      side: '2p',
    },
  ] as const satisfies readonly MapEntry[]
).map(resolveMapEntry);

/** 指定した区分のマップだけを取り出す(マップ選択画面はこの結果を並べる) */
export function mapsInGroup(
  entries: readonly ResolvedMapEntry[],
  group: MapGroup,
): readonly ResolvedMapEntry[] {
  return entries.filter((entry) => entry.group === group);
}

/**
 * 通常マップ(standard)の一覧。
 * 激ムズマップの解放条件は通常マップのクリア状況だけで判定する
 * (新マップ・4Pマップは解放条件に含めない)。
 */
export const STANDARD_MAP_LIST: readonly ResolvedMapEntry[] = mapsInGroup(
  MAP_LIST,
  'standard',
);

/** 選択画面の初期選択に使う先頭マップ */
export const DEFAULT_MAP_ENTRY: ResolvedMapEntry = MAP_LIST[0];
