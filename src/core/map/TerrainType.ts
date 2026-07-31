// 地形と拠点所有者に関する型定義。Phaser には依存しない純粋なロジック。

/** 地形の種別 */
export type TerrainType =
  'plain' | 'forest' | 'mountain' | 'road' | 'city' | 'factory' | 'headquarters';

/** 拠点の所有軍。中立を含む */
export type ArmyType = 'player' | 'enemy' | 'neutral';

/**
 * 移動タイプ。地形ごとの移動コストは移動タイプ別に定義する。
 * MVP では歩兵系(infantry)と車両系(vehicle)の 2 種類のみ扱う。
 */
export type MovementType = 'infantry' | 'vehicle';

/** すべての地形種別の一覧 */
export const TERRAIN_TYPES: readonly TerrainType[] = [
  'plain',
  'forest',
  'mountain',
  'road',
  'city',
  'factory',
  'headquarters',
];
