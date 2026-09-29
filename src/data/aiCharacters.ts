// 指揮官(対戦キャラクター)の一覧。
// キャラクターごとに敵軍AIの思考パターン(AiBehavior)と攻撃補正を紐づけ、
// マップ選択画面で「自軍の指揮官」と「対戦相手の指揮官」をそれぞれ選べるようにする。
// CLAUDE.md の方針に従い、キャラクターも思考パターンの数値もすべてオリジナルとする。
//
// 思考パターンは敵軍AIが使うものなので、自軍の指揮官に選んだときは攻撃補正だけが効く
// (自軍はプレイヤーが操作するため、思考パターンの出番がない)。
//
// 新しい指揮官を増やすときは、AiBehavior のパラメータと攻撃補正を組み合わせたキャラクターを
// この一覧へ追加すれば、自軍・対戦相手の両方の選択画面に並ぶ。

import type { AiBehavior } from '@/core/ai/AiBehavior';

/** 対戦キャラクター 1 人ぶんの定義 */
export interface AiCharacter {
  /** 内部識別子(シーン間の受け渡し・中断データの保存に使う) */
  readonly id: string;
  /** 表示名 */
  readonly name: string;
  /** 肩書(表示名の前に添える) */
  readonly title: string;
  /** 想定するプレイヤー層(選択画面での目安表示) */
  readonly difficulty: string;
  /**
   * 指揮官ごとの識別色(エンブレム)。対戦相手の選択ウィンドウと選択ボタンの丸印に使う。
   * 人数が増えたときに一覧から目当ての相手を見分けやすくするためのもので、
   * ゲームのルール(軍の色)とは関係しない。
   */
  readonly emblemColor: number;
  /** 思考パターンの説明(選択画面の指揮官ウィンドウに表示する) */
  readonly description: string;
  /**
   * この指揮官が率いる軍の攻撃補正。0.1 なら「全ユニットの攻撃力 +10%」。
   * 補正を持たない指揮官は 0(これまでどおりのダメージ計算)。
   * 自軍の指揮官に選べばこちらの火力が上がり、対戦相手に選べば相手の火力が上がる。
   */
  readonly attackBonus: number;
  /**
   * この指揮官が率いる軍の収入補正。ターン開始時の収入に、拠点の数に関わらず毎ターンこの額が上乗せされる。
   * 補正を持たない指揮官は 0(これまでどおりの収入)。攻撃補正と同じく、自軍の指揮官に選べばこちらの、
   * 対戦相手に選べば相手の収入が増える。
   */
  readonly incomeBonus: number;
  /** この指揮官の思考パターン(敵軍AIが使う。自軍の指揮官に選んだときは使わない) */
  readonly behavior: AiBehavior;
}

/**
 * 選択できる指揮官の一覧(表示順)。
 * 先頭が既定の指揮官(自軍・対戦相手ともに初期選択)になる。
 */
export const AI_CHARACTERS: readonly AiCharacter[] = [
  {
    id: 'instructor',
    name: 'ノーラ',
    title: '教導官',
    difficulty: '初級〜中級',
    emblemColor: 0x6ec1a0,
    description:
      '目の前の敵と拠点を順に片づける、基本に忠実な指揮官。遠くを見ないぶん動きが読みやすく、まずはこの相手で戦い方を覚えられる。攻撃できる敵がいれば必ず攻撃し、移動できる範囲に拠点があれば占領する。生産はまず占領役の歩兵 3 体をそろえ、そのあとは毎ターン、資金で買えるいちばん高価なユニットを選ぶ。',
    // 補正を持たない基本の指揮官。ここを基準に、他の指揮官の強さを測る
    attackBonus: 0,
    incomeBonus: 0,
    // 敵AIを導入した当初からの思考パターン。既定値そのままの素朴な方針
    // (占領役の歩兵の目標数だけは、拠点が増えないまま詰まらないよう既定値ごと 3 体にしてある)。
    behavior: {
      production: 'strongest',
      // 占領役の歩兵 3 体だけは高価なユニットより先にそろえる。
      // ここが 0 だと収入の多いマップでは戦車ばかりを買い続け、拠点を 1 つも占領できない
      infantryQuota: 3,
      roster: [],
      powerCostRatio: 0,
      saveForUpgrade: false,
      indirectPriority: false,
      advance: 'nearestEnemy',
      routing: 'direct',
      preferNeutralCapture: false,
      avoidUnfavorableAttack: false,
      indirectStandoff: false,
      nightVisionFloor: 0,
      regroupRadius: 0,
    },
  },
  {
    id: 'vanguard',
    name: 'ガルム',
    title: '突撃長',
    difficulty: '中級〜上級',
    emblemColor: 0xe8734a,
    description:
      'まず歩兵 6 体をそろえて中立都市を押さえ、伸ばした収入で重装備を整える指揮官。歩兵がそろうまでは歩兵だけを生産し、そのあとは安いユニットを買わずに資金を貯めて強力なユニットを狙う。戦闘ユニットは敵が 1 体も見えていなくても、通れるマスをたどって自軍の本拠地へ突き進む。',
    attackBonus: 0,
    incomeBonus: 0,
    behavior: {
      // 序盤は歩兵で中立都市を取りに行き、収入を伸ばしてから戦力を整える
      production: 'infantryFirst',
      // 生産拠点 2〜3 か所で 2 ターンほど回すとそろう数。都市の制圧役として十分な頭数になる
      infantryQuota: 6,
      roster: [],
      // その拠点で作れる最強ユニットの半額以上のものだけを買う。
      // 工場・本拠地なら最強は重戦車 18000 なので、9000 未満の安いユニットは見送って資金を貯める
      powerCostRatio: 0.5,
      saveForUpgrade: false,
      indirectPriority: false,
      advance: 'captureAndCharge',
      // 稜線や海に阻まれても、通れるマスをたどって回り込む
      routing: 'path',
      preferNeutralCapture: true,
      // 突撃長は不利な相性でもかまわず殴りかかり、間合いも隊列も気にせず本拠地へ向かう
      avoidUnfavorableAttack: false,
      indirectStandoff: false,
      nightVisionFloor: 0,
      regroupRadius: 0,
    },
  },
  {
    id: 'nightHunter',
    name: 'ヴェスパ',
    title: '猟兵長',
    difficulty: '上級',
    emblemColor: 0x8f7ad6,
    description:
      '編成を組み、戦力を一段ずつ積み上げてくる指揮官。占領役の歩兵と目になる偵察車を切らさず、同じユニットを並べるより一段強いユニットを狙って資金を貯める。ただし戦力で押されているあいだは貯めこまず、買えるものを買って盛り返してくる。自走砲は間合いを取って一方的に撃ち、部隊は固まって前進するため各個撃破しにくい。夜戦では視界の狭い鈍重なユニットを買わず、目の利く戦力でそろえてくる。',
    attackBonus: 0,
    incomeBonus: 0,
    behavior: {
      // 「最低限の編成をそろえてから、一段ずつ強い戦力へ乗り換える」方針
      production: 'roster',
      infantryQuota: 0,
      // 占領役の歩兵 4 体と、夜戦で最も広い視界(5)を持つ偵察車 1 台を常に確保する。
      // 撃破されて数が減れば、強力なユニットより先に補充へ戻る
      roster: [
        { unitType: 'infantry', count: 4 },
        { unitType: 'recon', count: 1 },
      ],
      // 編成がそろったあとは、その拠点の最強ユニットの 3 割(工場なら 5400)未満は買わない。
      // 偵察車・歩兵の買い足しは編成表の側で行うため、こちらは戦力の底上げに絞る
      powerCostRatio: 0.3,
      // 軽戦車 → 中戦車 → 重戦車と、手持ちにない一段上のユニットを狙って資金を貯める。
      // ただし戦力で負けているあいだは貯めず、いま買えるものを買って頭数を戻す
      saveForUpgrade: true,
      indirectPriority: false,
      advance: 'captureAndCharge',
      routing: 'path',
      preferNeutralCapture: true,
      avoidUnfavorableAttack: false,
      // 自走砲・ロケット砲は敵へ詰めず、射程に収めるマスへ構えてから撃つ
      indirectStandoff: true,
      // 夜戦では視界 2 マス未満のユニット(重戦車・自走砲・ロケット砲など)を買わない。
      // 見えない相手に高価な鈍重ユニットを並べるより、目の利く戦力で編成をそろえる
      nightVisionFloor: 2,
      // 味方から 2 マス以内を保って進む。足の速いユニットだけが突出しない
      regroupRadius: 2,
    },
  },
  {
    id: 'bastion',
    name: 'バルド',
    title: '城塞長',
    difficulty: '中級〜上級',
    emblemColor: 0x5a8fd0,
    description:
      '攻め込まず、自陣を固めて受け止める指揮官。まず歩兵 8 体で拠点を広げ、そのあとは自走砲やロケット砲などの遠距離ユニットを先に生産する(戦車・偵察車も買うが、遠距離が前に立つ戦力を上回るまでは後回し)。戦闘ユニットは本拠地へ突撃せず、自軍の拠点のそばで構えて近づいた敵だけを迎え撃つ。相性で不利な戦い(反撃のほうが重くなる攻撃)はしかけず、撃破できるときだけ手を出す。',
    // 特別な力を持たない指揮官。強さの違いは思考パターンだけにある
    attackBonus: 0,
    incomeBonus: 0,
    behavior: {
      // 占領役を厚めにそろえてから戦力を整える。拠点が増えるほど守る場所も収入も増える
      production: 'infantryFirst',
      // 突撃長ガルム(6 体)より多い。守りを固めつつ拠点を広げるための頭数
      infantryQuota: 8,
      roster: [],
      // 歩兵がそろったあとは、その拠点の最強ユニットの 15%(工場なら 2700)未満は買わない。
      // 偵察車(3500)は買えるが歩兵(1000)の買い足しは止まり、余った資金が
      // 自走砲・戦車へ回る。守りを固める頭数は歩兵の目標数のほうで確保する
      powerCostRatio: 0.15,
      saveForUpgrade: false,
      // 歩兵がそろったあとは自走砲・ロケット砲を優先して買う。
      // ただし直接攻撃の戦闘ユニットを上回るまでで、戦車・偵察車も切らさない
      indirectPriority: true,
      // 戦闘ユニットは攻め上がらず、自軍の拠点のそばで構える
      advance: 'defendBase',
      routing: 'path',
      preferNeutralCapture: true,
      // 相性で不利な戦闘はしかけない(撃破できるときだけ手を出す)
      avoidUnfavorableAttack: true,
      // 拠点のそばで構えたまま撃つため、敵を追って間合いを取りには行かない
      indirectStandoff: false,
      // 夜戦でも遠距離ユニット(視界 1)を軸にするため、視界での絞り込みはしない
      nightVisionFloor: 0,
      regroupRadius: 0,
    },
  },
  {
    id: 'heir',
    name: 'ロラン',
    title: '御曹司',
    difficulty: '最凶',
    emblemColor: 0xe07ab8,
    description:
      '大富豪の家に生まれた坊ちゃん指揮官。実家からの仕送りで、拠点の数に関わらず毎ターンの収入が 10000 増える。資金の差だけで押しつぶしてくる最凶の相手だが、腕前はノーラにも及ばない。ときどき思いつきで役に立たないユニットを買い、目の前の敵を放ってあらぬ方へ歩き出すこともある。そのしくじりを突いて、物量に呑まれる前に本拠地を落としたい。',
    // 攻撃補正は持たない。強さはすべて資金(収入補正)から来る
    attackBonus: 0,
    // 実家からの仕送り。拠点 10 か所ぶんの収入が毎ターン上乗せされる
    incomeBonus: 10000,
    // 思考の土台はノーラ(既定)と同じだが、気まぐれな生産と行動のしくじりが加わるぶんノーラより弱い
    behavior: {
      production: 'strongest',
      // 占領役の歩兵 3 体だけは高価なユニットより先にそろえる(ノーラと同じ)
      infantryQuota: 3,
      roster: [],
      powerCostRatio: 0,
      saveForUpgrade: false,
      indirectPriority: false,
      advance: 'nearestEnemy',
      routing: 'direct',
      preferNeutralCapture: false,
      avoidUnfavorableAttack: false,
      indirectStandoff: false,
      nightVisionFloor: 0,
      regroupRadius: 0,
      // 生産拠点ごとに 3 割の確率で、方針を無視して買えるものからでたらめに選ぶ
      // (敵に攻撃できない戦闘機や、運ぶ相手のいない輸送ユニットを買うこともある)
      oddProductionRate: 0.3,
      // ユニットごとに 2 割の確率で判断を飛ばし、でたらめなマスへ動いて待機する
      blunderRate: 0.2,
    },
  },
  {
    id: 'gunnery',
    name: 'イグナ',
    title: '火力長',
    difficulty: '中級〜上級',
    emblemColor: 0xd8c24a,
    description:
      '砲の腕だけで戦局を動かす指揮官。動き方はノーラとまったく同じで、目の前の敵と拠点を順に片づけ、生産は歩兵 3 体をそろえたあと毎ターンいちばん高価なユニットを選ぶ。違うのは火力で、率いる軍は全ユニットが攻撃時に 10% の攻撃補正を受ける。読みやすい動きのまま一撃が重くなるため、同じ撃ち合いでもこちらが先に削り切られる。自軍の指揮官に選べば、その 10% はこちらの火力になる。',
    // ノーラと同じ +10% の攻撃補正だけを持つ指揮官。
    // 撃ち合いの一手ぶんが重くなるため、相手にするとノーラより一段手ごわい
    attackBonus: 0.1,
    incomeBonus: 0,
    // 思考パターンはノーラ(既定)と同一。強さの違いを攻撃補正だけに絞っている
    behavior: {
      production: 'strongest',
      // 占領役の歩兵 3 体だけは高価なユニットより先にそろえる。
      // ここが 0 だと収入の多いマップでは戦車ばかりを買い続け、拠点を 1 つも占領できない
      infantryQuota: 3,
      roster: [],
      powerCostRatio: 0,
      saveForUpgrade: false,
      indirectPriority: false,
      advance: 'nearestEnemy',
      routing: 'direct',
      preferNeutralCapture: false,
      avoidUnfavorableAttack: false,
      indirectStandoff: false,
      nightVisionFloor: 0,
      regroupRadius: 0,
    },
  },
];

/** 既定の指揮官(自軍・対戦相手ともに選択画面の初期選択) */
export const DEFAULT_AI_CHARACTER: AiCharacter = AI_CHARACTERS[0];

/**
 * 識別子から指揮官を引く。
 * 未知の識別子(古い中断データなど)の場合は既定のキャラクターを返す。
 */
export function getAiCharacter(id: string | undefined): AiCharacter {
  return AI_CHARACTERS.find((character) => character.id === id) ?? DEFAULT_AI_CHARACTER;
}

/** 肩書つきの表示名(例: 「教導官 ノーラ」)を返す */
export function aiCharacterLabel(character: AiCharacter): string {
  return `${character.title} ${character.name}`;
}

/**
 * 収入補正の表示文(例: 「毎ターンの収入 +10000」)を返す。
 * 補正を持たない指揮官は、補正が無いことをはっきり示す文言を返す。
 */
export function incomeBonusLabel(character: AiCharacter): string {
  if (character.incomeBonus <= 0) {
    return '収入補正なし';
  }
  return `毎ターンの収入 +${character.incomeBonus}`;
}

/**
 * 選択ボタンや一覧で名前・想定プレイヤー層のうしろに添える、補正の短い表示
 * (例: 「攻撃 +10%」「収入 +10000」)。補正を持たない指揮官は空の配列を返す。
 */
export function bonusBadges(character: AiCharacter): string[] {
  const badges: string[] = [];
  if (character.attackBonus > 0) {
    badges.push(`攻撃 +${Math.round(character.attackBonus * 100)}%`);
  }
  if (character.incomeBonus > 0) {
    badges.push(`収入 +${character.incomeBonus}`);
  }
  return badges;
}

/**
 * 指揮官の選択ボタンで名前のうしろに添える、補正のごく短い表示(例: 「 +10%」「 +1万」)。
 * ボタンの幅が狭いため、収入補正は万単位で縮める。補正を持たない指揮官は空文字を返す。
 */
export function shortBonusLabel(character: AiCharacter): string {
  let label = '';
  if (character.attackBonus > 0) {
    label += ` +${Math.round(character.attackBonus * 100)}%`;
  }
  if (character.incomeBonus > 0) {
    const amount = character.incomeBonus;
    label += amount % 10000 === 0 ? ` +${amount / 10000}万` : ` +${amount}`;
  }
  return label;
}

/**
 * 攻撃補正の表示文(例: 「全ユニットの攻撃力 +10%」)を返す。
 * 補正を持たない指揮官は、補正が無いことをはっきり示す文言を返す。
 */
export function attackBonusLabel(character: AiCharacter): string {
  if (character.attackBonus <= 0) {
    return '攻撃補正なし';
  }
  return `全ユニットの攻撃力 +${Math.round(character.attackBonus * 100)}%`;
}
