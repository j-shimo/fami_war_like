// 地形と拠点所有者に関する型定義。Phaser には依存しない純粋なロジック。

/** 地形の種別 */
export type TerrainType =
  | 'plain'
  | 'forest'
  | 'mountain'
  | 'road'
  | 'railway'
  | 'sea'
  | 'river'
  | 'beach'
  | 'city'
  | 'laboratory'
  | 'factory'
  | 'airport'
  | 'port'
  | 'station'
  | 'headquarters';

/**
 * 手番を持つ軍勢。自軍(player)・敵軍(enemy)に加え、4P マップでは
 * 3P(third)・4P(fourth)の軍勢も加わる。
 * 2 人で遊ぶマップでは player / enemy の 2 軍だけが登場する。
 */
export type PlayableArmy = 'player' | 'enemy' | 'third' | 'fourth';

/** 手番を持つ軍勢の一覧(1P → 2P → 3P → 4P の順) */
export const PLAYABLE_ARMIES: readonly PlayableArmy[] = [
  'player',
  'enemy',
  'third',
  'fourth',
];

/** 手番を持つ軍勢として妥当な値か */
export function isPlayableArmy(value: unknown): value is PlayableArmy {
  return PLAYABLE_ARMIES.includes(value as PlayableArmy);
}

/** 拠点の所有軍。中立を含む */
export type ArmyType = PlayableArmy | 'neutral';

/**
 * 移動タイプ。地形ごとの移動コストは移動タイプ別に定義する。
 * 地上系の歩兵系(infantry)・装軌車両系(vehicle)・装輪車両系(wheeled)に加え、
 * 飛行系(air)・海上系(sea)を扱う。
 * 装輪車両系は道路・拠点をタイヤで軽快に走る代わりに、平地では減速し、
 * 森・山へは進入できない移動タイプ(偵察車・ロケット砲が持つ)。
 * 飛行系はすべての地形の上を一定コストで移動でき、海や山も越えられる。
 * 海上系は海・川・海岸・港の上だけを移動できる(それ以外の陸地には進入できない)。
 * 軌道系(rail)は列車砲だけが持つ移動タイプで、線路と駅の上しか進めない
 * (それ以外の地形はすべて進入不可)。
 */
export type MovementType = 'infantry' | 'vehicle' | 'wheeled' | 'air' | 'sea' | 'rail';

/** すべての地形種別の一覧 */
export const TERRAIN_TYPES: readonly TerrainType[] = [
  'plain',
  'forest',
  'mountain',
  'road',
  'railway',
  'sea',
  'river',
  'beach',
  'city',
  'laboratory',
  'factory',
  'airport',
  'port',
  'station',
  'headquarters',
];
