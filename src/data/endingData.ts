// エンディング(激ムズマップのクリア後に流れる、エピローグ + スタッフロール)の内容定義。
// 文章は純粋なデータとして外部化し(バランス調整パラメータと同じ方針)、
// 図(カット)の描き分けは cut 種別で指定して rendering/endingCapture.ts が担う。
// 本文の "{commander}" は、対戦していた敵指揮官の名前へ置き換えて表示する
// (置換は src/ui/endingInfo.ts の applyCommander が担う)。

/** エピローグの各ページに描くカット(ゲーム画面風のミニ盤面)の種別 */
export type EndingCutKind =
  | 'bridge' // 海峡に架かる橋を渡って進軍する
  | 'liberation' // 東の島の拠点をすべて塗り替える
  | 'commanders'; // 両軍の指揮官が向き合う

/** エピローグ 1 ページぶんの内容 */
export interface EndingSlide {
  /** 内部識別子(テストやページ管理に使う) */
  readonly id: string;
  /** ページの見出し */
  readonly title: string;
  /** 本文(1 要素 = 1 行ぶん) */
  readonly body: readonly string[];
  /** このページで描くカットの種別 */
  readonly cut: EndingCutKind;
}

/**
 * エピローグのページ一覧(表示順)。
 * 激ムズマップ「双大陸マップ」の戦いが終わったあとの後日談を 3 ページで見せる。
 */
export const ENDING_SLIDES: readonly EndingSlide[] = [
  {
    id: 'bridge',
    title: 'エピローグ ①  三本の橋',
    body: [
      '西の島の中立拠点をすべて塗り替えたとき、こちらの収入はついに東を追い越した。',
      '守り続けた三本の橋を、今度はこちらから渡っていく。',
    ],
    cut: 'bridge',
  },
  {
    id: 'liberation',
    title: 'エピローグ ②  東の島',
    body: [
      '対空砲はもう火を噴かず、飛行場に残った機影は動かない。',
      '最後の本拠地に、こちらの旗が上がった。',
    ],
    cut: 'liberation',
  },
  {
    id: 'commanders',
    title: 'エピローグ ③  次の盤面へ',
    body: [
      '「この盤面で勝ち切るとはね」と、{commander} は静かに笑った。',
      '「次は、もっと不利な側で来い」——その盤面は、まだ地図の外にある。',
    ],
    cut: 'commanders',
  },
];

/** スタッフロールの 1 行の見せ方 */
export type CreditStyle =
  | 'title' // 作品名(いちばん大きく)
  | 'heading' // 見出し(STAFF など)
  | 'role' // 担当と内容
  | 'note'; // 添え書き

/** スタッフロールの 1 行 */
export interface CreditLine {
  readonly text: string;
  readonly style: CreditStyle;
}

/**
 * スタッフロールの行(表示順)。上から下へ流す。
 * 担当者名を入れる場合は role 行の下へ足す。
 */
export const CREDIT_LINES: readonly CreditLine[] = [
  { text: 'グリッドウォーズ(仮題)', style: 'title' },
  { text: 'STAFF', style: 'heading' },
  { text: 'ゲームデザイン / マップデザイン', style: 'role' },
  { text: 'プログラム', style: 'role' },
  { text: 'グラフィック(すべてコードで描画)', style: 'role' },
  { text: 'サウンド(Web Audio によるチップチューン)', style: 'role' },
  { text: 'SPECIAL THANKS', style: 'heading' },
  { text: '双大陸の戦線を守り抜いた あなたへ', style: 'note' },
];
