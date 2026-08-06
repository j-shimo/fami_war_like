// ユニットごとの静的パラメータ定義。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md を参照。

import type { MovementType, TerrainType } from '@/core/map/TerrainType';
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
  /** 最大射程。0 は攻撃できないユニット(輸送ヘリ)を表す */
  readonly maxAttackRange: number;
  /** 生産コスト */
  readonly cost: number;
  /** 拠点を占領できるかどうか */
  readonly canCapture: boolean;
  /** 輸送できるユニット数(輸送ヘリのみ 1 以上。輸送しないユニットは 0) */
  readonly capacity: number;
  /** 輸送できるユニット種別(capacity が 0 のユニットでは空配列) */
  readonly carriableTypes: readonly UnitType[];
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
    capacity: 0,
    carriableTypes: [],
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
    capacity: 0,
    carriableTypes: [],
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
    capacity: 0,
    carriableTypes: [],
  },
  attackHelicopter: {
    unitType: 'attackHelicopter',
    unitName: '戦闘ヘリ',
    maxHp: 10,
    movement: 6,
    movementType: 'air',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 7000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
  },
  transportHelicopter: {
    unitType: 'transportHelicopter',
    unitName: '輸送ヘリ',
    maxHp: 10,
    movement: 6,
    movementType: 'air',
    // 攻撃できないユニット。射程 0 で「攻撃不可」を表す。
    minAttackRange: 0,
    maxAttackRange: 0,
    cost: 4000,
    canCapture: false,
    // 歩兵を 1 体だけ輸送できる。
    capacity: 1,
    carriableTypes: ['infantry'],
  },
  antiAirTank: {
    unitType: 'antiAirTank',
    unitName: '対空戦車',
    maxHp: 10,
    movement: 6,
    movementType: 'vehicle',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 8000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
  },
};

/** 指定したユニット種別の静的パラメータを返す */
export function getUnitData(unitType: UnitType): UnitData {
  return UNIT_DATA[unitType];
}

/**
 * 生産拠点(地形)ごとに生産できるユニット種別の一覧(生産メニューの表示順)。
 * 工場・本拠地では地上ユニット、空港では飛行ユニットを生産する。
 * 生産できない地形(都市など)は一覧に含めない。
 */
export const PRODUCIBLE_UNIT_TYPES_BY_TERRAIN: Readonly<
  Partial<Record<TerrainType, readonly UnitType[]>>
> = {
  headquarters: ['infantry', 'tank', 'artillery', 'antiAirTank'],
  factory: ['infantry', 'tank', 'artillery', 'antiAirTank'],
  airport: ['attackHelicopter', 'transportHelicopter'],
};

/** 指定した生産拠点(地形)で生産できるユニット種別の一覧を返す(生産不可地形は空配列) */
export function producibleUnitTypesAt(terrainType: TerrainType): readonly UnitType[] {
  return PRODUCIBLE_UNIT_TYPES_BY_TERRAIN[terrainType] ?? [];
}

/** 指定した生産拠点(地形)で unitType を生産できるか */
export function isProducibleAt(terrainType: TerrainType, unitType: UnitType): boolean {
  return producibleUnitTypesAt(terrainType).includes(unitType);
}
