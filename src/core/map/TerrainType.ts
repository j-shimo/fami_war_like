// 地形と拠点所有者に関する型定義。Phaser には依存しない純粋なロジック。

/** 地形の種別 */
export type TerrainType =
  | 'plain'
  | 'forest'
  | 'mountain'
  | 'road'
  | 'sea'
  | 'city'
  | 'factory'
  | 'airport'
  | 'headquarters';

/** 拠点の所有軍。中立を含む */
export type ArmyType = 'player' | 'enemy' | 'neutral';

/**
 * 移動タイプ。地形ごとの移動コストは移動タイプ別に定義する。
 * 地上系の歩兵系(infantry)・車両系(vehicle)に加え、飛行系(air)を扱う。
 * 飛行系はすべての地形の上を一定コストで移動でき、海や山も越えられる。
 */
export type MovementType = 'infantry' | 'vehicle' | 'air';

/** すべての地形種別の一覧 */
export const TERRAIN_TYPES: readonly TerrainType[] = [
  'plain',
  'forest',
  'mountain',
  'road',
  'sea',
  'city',
  'factory',
  'airport',
  'headquarters',
];
