// マップ 1 マスぶんの状態を表すデータ。Phaser には依存しない。

import type { GridPosition } from '@/core/map/GridPosition';
import type { ArmyType, TerrainType } from '@/core/map/TerrainType';

/** 占領耐久値の初期値。docs/TerrainSpec.md 参照 */
export const INITIAL_CAPTURE_HP = 20;

/** マップ 1 マスの状態 */
export interface TileData {
  /** マス位置 */
  readonly position: GridPosition;
  /** 地形種別 */
  readonly terrainType: TerrainType;
  /** 拠点の所有軍。占領不可地形は常に neutral */
  owner: ArmyType;
  /** 占領耐久値。占領不可地形では使用しない */
  captureHp: number;
}
