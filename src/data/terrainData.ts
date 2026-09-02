// 地形ごとの静的パラメータ定義。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/TerrainSpec.md を参照。

import type { MovementType, TerrainType } from '@/core/map/TerrainType';

/**
 * 移動コストの特別値: 該当移動タイプが進入できないことを表す。
 * docs/TerrainSpec.md の方針に従い、-1 などの魔法数ではなく null で管理する。
 */
export const IMPASSABLE = null;

/** 地形 1 種類ぶんの静的パラメータ */
export interface TerrainData {
  /** 地形種別 */
  readonly terrainType: TerrainType;
  /** 表示名(日本語) */
  readonly terrainName: string;
  /** 防御値。戦闘時の被ダメージ軽減に使う */
  readonly defense: number;
  /** 占領可能な拠点かどうか */
  readonly canCapture: boolean;
  /** ユニットを生産できるかどうか */
  readonly canProduce: boolean;
  /**
   * この地形の上で自軍ユニットをターン開始時に修理できる拠点かどうか
   * (都市・研究所・工場・駅・本拠地・空港・港)。実際に修理できる移動タイプは拠点ごとに分かれており、
   * その対応は REPAIRABLE_MOVEMENT_TYPES_BY_TERRAIN が持つ。
   */
  readonly canRepair: boolean;
  /** 移動タイプ別の移動コスト。null(IMPASSABLE) は進入不可 */
  readonly moveCost: Readonly<Record<MovementType, number | null>>;
  /** 描画時の塗り色 */
  readonly color: number;
}

/** 全地形の静的パラメータ表 */
export const TERRAIN_DATA: Readonly<Record<TerrainType, TerrainData>> = {
  plain: {
    terrainType: 'plain',
    terrainName: '平地',
    defense: 1,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 装輪車両(偵察車・ロケット砲)は舗装のない平地では速度を落とす(道路・拠点の 2 倍のコスト)
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 2,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0x6b8f3a,
  },
  forest: {
    terrainType: 'forest',
    terrainName: '森',
    defense: 2,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 装輪車両は下草と立木に阻まれて森へは進入できない
    moveCost: {
      infantry: 1,
      vehicle: 2,
      wheeled: IMPASSABLE,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0x2f5d34,
  },
  mountain: {
    terrainType: 'mountain',
    terrainName: '山',
    defense: 3,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    moveCost: {
      infantry: 2,
      vehicle: IMPASSABLE,
      // 装輪車両も装軌車両と同じく山へは進入できない
      wheeled: IMPASSABLE,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0x8a6a45,
  },
  road: {
    terrainType: 'road',
    terrainName: '道路',
    defense: 0,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 装輪車両が最も速く走れる地形(コスト 1)
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0xb7a98a,
  },
  railway: {
    terrainType: 'railway',
    terrainName: '線路',
    // 地形効果は道路とまったく同じ(防御 0・占領不可・生産不可・修理不可)
    defense: 0,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 枕木とバラストの上を進むため、道路と違って車両は速度を落とす。
    // 歩兵は線路づたいに 1 で歩けるが、装軌車両(戦車・自走砲系)は 2、
    // 装輪車両(偵察車・ロケット砲系)はタイヤがレールに取られて 4 と大きく減速する。
    // 列車砲(軌道系)だけがコスト 1 で本来の速さを出せる。
    moveCost: {
      infantry: 1,
      vehicle: 2,
      wheeled: 4,
      air: 1,
      sea: IMPASSABLE,
      rail: 1,
    },
    // 道路(明るいアスファルト色)と見分けられるよう、バラストの灰褐色にする
    color: 0x8d8677,
  },
  sea: {
    terrainType: 'sea',
    terrainName: '海',
    defense: 0,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 地上ユニット(歩兵・車両)は進入不可。飛行ユニットは上空を、
    // 海上ユニット(戦艦・護衛艦・輸送艦・潜水艦)は水上を移動コスト 1 で進める。
    // 海と陸の境目にあたる海岸(beach)・港(port)と、陸を刻む川(river)だけは
    // 海上ユニットも進入できる。
    moveCost: {
      infantry: IMPASSABLE,
      vehicle: IMPASSABLE,
      wheeled: IMPASSABLE,
      air: 1,
      sea: 1,
      rail: IMPASSABLE,
    },
    color: 0x2f6aa0,
  },
  river: {
    terrainType: 'river',
    terrainName: '川',
    // 遮蔽の無い浅瀬。渡っている最中は撃たれ放題という位置づけで防御は 0(海・海岸と同じ)。
    defense: 0,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 陸を分断しながら、海上ユニットには水路として使える地形。
    // 歩兵は膝まで水に浸かって渡るのでコスト 2(山・海岸と同じ)、装軌車両は
    // 川底を踏み固めながら渡るのでコスト 3(全地形の中で最も重い進入コスト)。
    // 装輪車両はタイヤが川底に取られて渡れない。海上ユニットは海と同じくコスト 1 で遡上でき、
    // 「陸の切れ目」であると同時に「艦艇の通り道」にもなる。
    moveCost: {
      infantry: 2,
      vehicle: 3,
      wheeled: IMPASSABLE,
      air: 1,
      sea: 1,
      rail: IMPASSABLE,
    },
    // 海(濃い青)と見分けられるよう、川底が透ける浅瀬の明るい青にする
    color: 0x4f9ec0,
  },
  beach: {
    terrainType: 'beach',
    terrainName: '海岸',
    // 遮蔽の乏しい砂浜。上陸直後は身を隠す場所がなく無防備、という位置づけで防御は 0。
    defense: 0,
    canCapture: false,
    canProduce: false,
    canRepair: false,
    // 陸と海が接する唯一の非拠点地形。海上ユニットは港と同じくコスト 1 で進入・停泊でき、
    // 地上ユニット(歩兵・車両)は砂に足を取られながらコスト 2 で乗り降りできる。
    // これにより「港が無くても上陸・乗船できる」浜辺として機能する。
    // 装輪車両は軽量な車輪走行のため砂に足を取られやすく、コスト 4 と大きく減速する
    moveCost: {
      infantry: 2,
      vehicle: 2,
      wheeled: 4,
      air: 1,
      sea: 1,
      rail: IMPASSABLE,
    },
    color: 0xd8c07c,
  },
  city: {
    terrainType: 'city',
    terrainName: '都市',
    defense: 2,
    canCapture: true,
    canProduce: false,
    canRepair: true,
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0x9a9aa8,
  },
  laboratory: {
    terrainType: 'laboratory',
    terrainName: '研究所',
    // 防御・移動コスト・修理は都市とまったく同じ拠点として扱う
    defense: 2,
    canCapture: true,
    canProduce: false,
    canRepair: true,
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    // 都市(灰)と見分けられるよう、研究施設らしい青みがかった色にする
    color: 0x7f8fb0,
  },
  factory: {
    terrainType: 'factory',
    terrainName: '工場',
    defense: 2,
    canCapture: true,
    canProduce: true,
    canRepair: true,
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0x7a7a86,
  },
  airport: {
    terrainType: 'airport',
    terrainName: '空港',
    defense: 2,
    canCapture: true,
    // 都市と同じく占領で収入が増える拠点。加えて飛行ユニット(戦闘ヘリ・輸送ヘリ)の
    // 生産拠点でもある。生産できる種別は地形ごとに分かれており、空港では飛行ユニットのみ、
    // 工場・本拠地では地上ユニットのみを生産する(docs/UnitSpec.md「生産拠点と生産可能ユニット」参照)。
    canProduce: true,
    canRepair: true,
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0x6f7d8c,
  },
  port: {
    terrainType: 'port',
    terrainName: '港',
    defense: 1,
    canCapture: true,
    // 都市と同じく占領で収入が増える拠点。加えて海上ユニット(戦艦・護衛艦・輸送艦・
    // 潜水艦)の生産拠点でもある。港は陸と海の境目にある拠点なので、地上・飛行・海上の
    // すべての移動タイプが進入でき、地上ユニットが港に停泊した輸送艦へ乗り込める。
    canProduce: true,
    canRepair: true,
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: 1,
      rail: IMPASSABLE,
    },
    color: 0x4a7f9e,
  },
  station: {
    terrainType: 'station',
    terrainName: '駅',
    // 防御・移動コスト・占領・修理は工場とまったく同じ拠点として扱う。
    // 違いは「線路とつながっていて、列車砲だけを生産できる」という 1 点だけ。
    defense: 2,
    canCapture: true,
    canProduce: true,
    canRepair: true,
    // 列車砲(軌道系)が唯一停車できる拠点。海上ユニットは進入できない。
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: 1,
    },
    // 工場(灰)と見分けられるよう、駅舎らしい赤煉瓦色にする
    color: 0x9c6f5c,
  },
  headquarters: {
    terrainType: 'headquarters',
    terrainName: '本拠地',
    defense: 3,
    canCapture: true,
    canProduce: true,
    canRepair: true,
    moveCost: {
      infantry: 1,
      vehicle: 1,
      wheeled: 1,
      air: 1,
      sea: IMPASSABLE,
      rail: IMPASSABLE,
    },
    color: 0xc0603a,
  },
};

/**
 * 修理拠点(地形)ごとに、そこで修理できるユニットの移動タイプ。
 * 修理拠点はユニットの移動タイプで分かれており、地上ユニット(歩兵・装軌車両・装輪車両)は
 * 都市・研究所・工場・駅・本拠地、飛行ユニットは空港、海上ユニットは港、
 * 列車砲(軌道系)は駅でのみ修理できる。
 * 一覧に無い地形(平地など)では修理できない。詳細は docs/GameDesign.md「修理」を参照。
 */
export const REPAIRABLE_MOVEMENT_TYPES_BY_TERRAIN: Readonly<
  Partial<Record<TerrainType, readonly MovementType[]>>
> = {
  city: ['infantry', 'vehicle', 'wheeled'],
  // 研究所は都市と同等の拠点なので、修理できる移動タイプも都市と同じ
  laboratory: ['infantry', 'vehicle', 'wheeled'],
  factory: ['infantry', 'vehicle', 'wheeled'],
  headquarters: ['infantry', 'vehicle', 'wheeled'],
  // 駅は工場と同じ地上の修理拠点であり、加えて列車砲(軌道系)を修理できる唯一の拠点
  station: ['infantry', 'vehicle', 'wheeled', 'rail'],
  airport: ['air'],
  port: ['sea'],
};

/** 指定した地形で movementType のユニットを修理できるか */
export function canRepairAt(
  terrainType: TerrainType,
  movementType: MovementType,
): boolean {
  return (
    REPAIRABLE_MOVEMENT_TYPES_BY_TERRAIN[terrainType]?.includes(movementType) ?? false
  );
}

/** 指定した地形種別の静的パラメータを返す */
export function getTerrainData(terrainType: TerrainType): TerrainData {
  return TERRAIN_DATA[terrainType];
}
