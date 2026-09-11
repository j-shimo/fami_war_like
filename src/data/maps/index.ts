// 選択可能なマップの一覧。マップ選択画面(MapSelectScene)から参照する。
// 新しいマップを追加したら、この一覧に登録すれば選択画面に並ぶ。

import { DEFAULT_MAP_GROUP, type MapGroup, type PlayerSide } from '@/core/mode/GameMode';
import { CAPE_LABORATORY_MAP } from '@/data/maps/capeLaboratoryMap';
import { CAPTURE_MAP } from '@/data/maps/captureMap';
import { DIAGONAL_SEA_MAP } from '@/data/maps/diagonalSeaMap';
import { FOUR_ISLANDS_MAP } from '@/data/maps/fourIslandsMap';
import { INNER_SEA_MAP } from '@/data/maps/innerSeaMap';
import { ISLAND_MAP } from '@/data/maps/islandMap';
import { LAKESIDE_GORGE_MAP } from '@/data/maps/lakesideGorgeMap';
import { LONG_ISLAND_MAP } from '@/data/maps/longIslandMap';
import { DEFAULT_MAP_CATEGORY, type MapCategory } from '@/data/maps/mapCategory';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { RAIL_BRIDGE_MAP } from '@/data/maps/railBridgeMap';
import { RIDGE_MAP } from '@/data/maps/ridgeMap';
import { RING_LABORATORY_MAP } from '@/data/maps/ringLaboratoryMap';
import { SEA_MAP } from '@/data/maps/seaMap';
import { STRAIT_MAP } from '@/data/maps/straitMap';
import { TEST_MAP } from '@/data/maps/testMap';
import { TWIN_CONTINENTS_MAP } from '@/data/maps/twinContinentsMap';
import { TWIN_ISLAND_RAIL_MAP } from '@/data/maps/twinIslandRailMap';

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
      id: 'fourIslands',
      definition: FOUR_ISLANDS_MAP,
      description:
        '海に囲まれた 4 つの島が並ぶ 35x17 の横長マップ。左が先手の自軍・右が後手の敵軍の島で、真ん中の上下に中立の空港 1 個と中立都市 3 個を持つ小島が 1 つずつ浮かぶ(北は横長の砂州・南は小さな菱形の岩島で、形も都市の並びも別物)。港が 1 つも無いので島を渡れるのは飛行ユニットだけで、歩兵を運べるのは空港で作る輸送ヘリだけ。道路も無く陸地は平地と森だけなので、歩兵以外の地上ユニットは自分の島から出られない守備専用になる。両軍とも本拠地 1・工場 2・空港 2(収入 5000)・初期資金 0 の対等な立ち上がりで、空港 2 つは担当する中立島からどちらも 12 マス。中立島へはどう飛んでも輸送ヘリで 2 ターン以上かかる。島の南北の端に中立都市が 5 個あり、後手の敵軍は本拠地の隣に中立都市が 1 個多い。',
    },
    {
      id: 'ringLaboratory',
      definition: RING_LABORATORY_MAP,
      description:
        '「日」を横倒しにした街道が四隅を結ぶ 17x15 の地上戦マップ。両軍とも本拠地 1 + 工場 3・収入 4000・初期資金 0 の対等な立ち上がりで、左下が先手の自軍・右上が後手の敵軍の陣地。街道に挟まれた内側は左が山(車両は進入不可)・中央が平地・右が森(装輪車両は進入不可)の 3 帯に分かれる。盤面中央の中立研究所は両軍の前線工場から等距離(歩兵でちょうど 3 ターン)で、先に動ける自軍が新型戦車を手にする。中立都市は 14 個あり、先に届くのは自軍 6 個・敵軍 8 個。陣地の隣の都市は後手だけが 1 ターンで届くので、収入が伸び始めるのは後手のほうが 1 ターン早い。',
      // 追加要素(研究所・新型戦車)を主題にした新マップ
      group: 'new',
    },
    {
      id: 'railBridge',
      definition: RAIL_BRIDGE_MAP,
      description:
        '「山」の字の両端を上まで伸ばした陸地を、上端の線路が一直線に貫く 29x17 の横長マップ。左上が先手の自軍・右上が後手の敵軍で、両軍とも本拠地 1 + 工場 3 + 駅 1 + 港 1(収入 6000)・初期資金 31000 の対等な立ち上がりで、1 ターン目から駅で列車砲を出せる。自軍の駅から中立の駅を挟んで敵軍の駅までが 1 本の線路でつながっており、入江の上は幅 1 マスの鉄橋になる。線路は駅から駅まで 9・端から端まで 18 あるので、移動力 15 の列車砲でも中立駅までが 1 ターンぶんの射程になる。線路を使わない地上ユニットは南岸までぐるっと回り込むしかなく、敵本拠地までの距離は歩兵で線路 20・南岸回り 46(中立駅までは 9 と 36)。中央の中立駅は森と中立都市に囲まれた高台にあり、南から上がるには幅 1 マスの川を渡ることになる(装輪車両は渡れない)。川は左右の入江をつなぐ水路でもあり、海上ユニットは川を通って敵の港へ回り込める。川より南の中央には中立の研究所 2 個・中立都市 4 個・中立港 2 個が並び、研究所は両軍とも近いほうへ歩兵で 6 ターン。中立拠点は 30 個(都市 25・研究所 2・港 2・駅 1)で、後手の敵軍は陣地の隣に中立都市が 2 個多い。',
      // 駅・線路・列車砲と、新しい地形「川」を主題にした新マップ
      group: 'new',
    },
    {
      id: 'capeLaboratory',
      definition: CAPE_LABORATORY_MAP,
      description:
        '北西と南東に大きな島が斜向かいに並ぶ 28x25 のマップ。北西の島の真ん中が先手の自軍(本拠地 1 + 工場 3 + 空港 1 + 港 2 + 都市 3・収入 10000)、南東の島の西端が後手の敵軍(本拠地 1 + 工場 3 + 空港 1 + 港 2 + 都市 8・収入 15000)で、初期資金は両軍とも 0。自軍の港 2 つは街道の上の (10,5)/(12,5) で、街道 1 マスを挟んでどちらも工場から 3 マス。港の下は幅 1 マスの入り江になっていて、作った地上ユニットが 1 ターンで乗船できる。陸路は 1 本も無く、相手の島へ渡れるのは輸送艦と飛行ユニットだけ。中立拠点 21 個のうち 18 個は自軍側にあり、北西の島では陣地を挟んで西 5 個・東 5 個に分かれている。自軍の島は西側だけが盤面の下端近くまで細長く伸びたあと東へ折れて「[」の字を描き、その縦棒に中立の研究所 1 個と中立都市 3 個、下の横棒の付け根に中立空港 1 個が縦一列に並ぶ。横棒の先端の東の端にある中立港からは、海 1 マスの向こうがもう敵軍の島。先端の上側(内海に面した側)は山の壁なので、地上ユニットは横棒を端まで歩くしかなく(歩兵 28・装輪車両 37 マス)、飛行ユニットだけが山を越えて 18 マスで近道できる。自軍の島の東端(col 19)よりさらに右には研究所 2 個だけが建つ離島が浮かび、海路は自軍の港から 13・敵軍の港から 22 と自軍が近い。敵軍の島は右側が北へ長く伸びていて、残る中立都市 3 個はその腕の上。敵軍の陣地からは歩兵で 11〜15 マスあるが、自軍の艦隊からは海路 16〜20 マスで横付けできる。',
      // 研究所と、島を分ける海・上陸戦を主題にした新マップ
      group: 'new',
    },
    {
      id: 'lakesideGorge',
      definition: LAKESIDE_GORGE_MAP,
      description:
        '盤面の左端だけに海がある 35x24 のマップ。右上が先手の自軍(本拠地 1 + 工場 3 + 空港 2 + 港 1)、左下が後手の敵軍(本拠地 1 + 工場 3 + 空港 1 + 港 1 + 駅 1)で、拠点数も収入 7000 も同じだが、開始時に列車砲を出せるのは駅を持つ敵軍だけ。自軍の陣地の下には 5x4 の湖があり、そこから西へ流れる幅 1 マスの川が盤面を上下に分ける。川より上は一面の森、川より下は一面の山で、川を渡って南へ降りられるのは歩兵だけ。車両の南北路は湖の右を通る街道 1 本だけで、湖を越えた (33,11) で「左のくねくね道」と「下の空間」へ分かれる。川が海へ出る手前の北岸には、山にすっぽり囲まれた 3x3 の窪地に中立の研究所・都市 2・空港が収まっている(歩兵と飛行ユニットしか入れない)。南の山を刻む線路は敵軍の駅から中立の駅 2 つを結び、駅から駅まで 13 と 15・端から端まで 28。中立拠点は 26 個で、敵軍の陣地の隣の 2 個は後手だけが 1 ターンで届く。',
      // 湖と川・駅と列車砲・研究所を主題にした新マップ
      group: 'new',
    },
    {
      id: 'twinIslandRail',
      definition: TWIN_ISLAND_RAIL_MAP,
      description:
        '海に囲まれた大きめの島が上下に 2 つ並ぶ 30x32 のマップ。上の島の左上が先手の自軍(本拠地 1 + 工場 3 + 港 2 + 駅 1・収入 7000)、下の島の左側が後手の敵軍(本拠地 1 + 工場 3 + 港 2 + 都市 4・収入 10000)で、初期資金は両軍とも 31000。空港が 1 つも無く陸路もつながっていないので、島を渡れるのは輸送艦だけ。開始時に駅を持つのは自軍だけなので、列車砲を生産できるのも自軍だけになる。自軍の島の線路は陣地の駅から右下の中間駅 (14,7) へ、そこから左下の下の駅 (8,13) へと折り返し、駅から駅までは 15 と 12(移動力 15 の列車砲でどちらも 1 ターンぶん)。線路と街道のあいだは山の壁で仕切られていて、車両が島の東側へ回れるのは中間駅と南の峠 (11,14) の 2 か所だけ。研究所は中間駅のわきと下の駅の右に 1 個ずつある。下の駅から 3〜4 マス南はもう海で、海峡を 3 マス渡れば敵軍の陣地の北隣に着く。中立都市 19 個のうち 12 個は自軍の島にあって総数では自軍が多いが、敵軍の島の 7 個は敵軍のほうが先に届き(2 ターン。自軍の最寄りは 3 ターン)、海峡を先に渡れるのも敵軍のほう(海路 11 対 25)。',
      // 駅と列車砲・研究所と、島を分ける海峡の上陸戦を主題にした新マップ
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
