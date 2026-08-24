// 地形と拠点所有者に関する型定義。Phaser には依存しない純粋なロジック。

/** 地形の種別 */
export type TerrainType =
  | 'plain'
  | 'forest'
  | 'mountain'
  | 'road'
  | 'sea'
  | 'beach'
  | 'city'
  | 'factory'
  | 'airport'
  | 'port'
  | 'headquarters';

/** 拠点の所有軍。中立を含む */
export type ArmyType = 'player' | 'enemy' | 'neutral';

/**
 * 移動タイプ。地形ごとの移動コストは移動タイプ別に定義する。
 * 地上系の歩兵系(infantry)・装軌車両系(vehicle)・装輪車両系(wheeled)に加え、
 * 飛行系(air)・海上系(sea)を扱う。
 * 装輪車両系は道路・拠点をタイヤで軽快に走る代わりに、平地では減速し、
 * 森・山へは進入できない移動タイプ(偵察車・ロケット砲が持つ)。
 * 飛行系はすべての地形の上を一定コストで移動でき、海や山も越えられる。
 * 海上系は海・海岸・港の上だけを移動できる(それ以外の陸地には進入できない)。
 */
export type MovementType = 'infantry' | 'vehicle' | 'wheeled' | 'air' | 'sea';

/** すべての地形種別の一覧 */
export const TERRAIN_TYPES: readonly TerrainType[] = [
  'plain',
  'forest',
  'mountain',
  'road',
  'sea',
  'beach',
  'city',
  'factory',
  'airport',
  'port',
  'headquarters',
];
