// ユニットごとの静的パラメータ定義。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md を参照。

import type { MovementType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';

/** ユニット 1 種類ぶんの静的パラメータ */
export interface UnitData {
  /** ユニット種別 */
  readonly unitType: UnitType;
  /** 表示名(日本語) */
  readonly unitName: string;
  /** 最大 HP */
  readonly maxHp: number;
  /** 移動力 */
  readonly movement: number;
  /** 移動タイプ。地形移動コストの参照に使う */
  readonly movementType: MovementType;
  /** 最小射程 */
  readonly minAttackRange: number;
  /** 最大射程 */
  readonly maxAttackRange: number;
  /** 生産コスト */
  readonly cost: number;
  /** 拠点を占領できるかどうか */
  readonly canCapture: boolean;
}

/** 全ユニットの静的パラメータ表 */
export const UNIT_DATA: Readonly<Record<UnitType, UnitData>> = {
  infantry: {
    unitType: 'infantry',
    unitName: '歩兵',
    maxHp: 10,
    movement: 3,
    movementType: 'infantry',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 1000,
    canCapture: true,
  },
  tank: {
    unitType: 'tank',
    unitName: '戦車',
    maxHp: 10,
    movement: 5,
    movementType: 'vehicle',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 7000,
    canCapture: false,
  },
  artillery: {
    unitType: 'artillery',
    unitName: '自走砲',
    maxHp: 10,
    movement: 4,
    movementType: 'vehicle',
    minAttackRange: 2,
    maxAttackRange: 3,
    cost: 6000,
    canCapture: false,
  },
};

/** 指定したユニット種別の静的パラメータを返す */
export function getUnitData(unitType: UnitType): UnitData {
  return UNIT_DATA[unitType];
}
