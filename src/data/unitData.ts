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
  /** 最大射程。0 は攻撃できないユニット(輸送ヘリ・輸送艦)を表す */
  readonly maxAttackRange: number;
  /** 生産コスト */
  readonly cost: number;
  /** 拠点を占領できるかどうか */
  readonly canCapture: boolean;
  /** 輸送できるユニット数(輸送ヘリは 1・輸送艦は 2。輸送しないユニットは 0) */
  readonly capacity: number;
  /**
   * 輸送できるユニット種別(capacity が 0 のユニットでは空配列)。
   * 輸送ヘリは歩兵のみ、輸送艦はすべての地上ユニットを運べる。
   */
  readonly carriableTypes: readonly UnitType[];
  /**
   * 視界(マス数)。後に実装予定の夜戦で、このユニットが敵を発見できる範囲に使う。
   * 通常は DEFAULT_VISION、護衛艦だけが広い視界(5)を持つ。
   * 昼戦(現行の通常戦闘)では参照しない。
   */
  readonly vision: number;
  /**
   * 夜戦で「隣接マスまで近づかないと発見できない」隠密ユニットかどうか。
   * 潜水艦のみ true。昼戦(現行の通常戦闘)では参照しない。
   */
  readonly nightStealth: boolean;
}

/** 視界(vision)の既定値。護衛艦以外のユニットはこの値を持つ */
export const DEFAULT_VISION = 2;

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
    vision: DEFAULT_VISION,
    nightStealth: false,
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
    vision: DEFAULT_VISION,
    nightStealth: false,
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
    vision: DEFAULT_VISION,
    nightStealth: false,
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
    vision: DEFAULT_VISION,
    nightStealth: false,
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
    vision: DEFAULT_VISION,
    nightStealth: false,
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
    vision: DEFAULT_VISION,
    nightStealth: false,
  },
  battleship: {
    unitType: 'battleship',
    unitName: '戦艦',
    maxHp: 10,
    movement: 5,
    movementType: 'sea',
    // 遠距離砲撃のみを行う間接攻撃ユニット。隣接した相手は撃てない。
    minAttackRange: 3,
    maxAttackRange: 6,
    cost: 35000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    vision: DEFAULT_VISION,
    nightStealth: false,
  },
  escortShip: {
    unitType: 'escortShip',
    unitName: '護衛艦',
    maxHp: 10,
    movement: 6,
    movementType: 'sea',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 22000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 夜戦で広い視界(5マス)を持つ、艦隊の目となるユニット。
    vision: 5,
    nightStealth: false,
  },
  transportShip: {
    unitType: 'transportShip',
    unitName: '輸送艦',
    maxHp: 10,
    movement: 6,
    movementType: 'sea',
    // 攻撃できないユニット。射程 0 で「攻撃不可」を表す。
    minAttackRange: 0,
    maxAttackRange: 0,
    cost: 16500,
    canCapture: false,
    // すべての地上ユニットを最大 2 体まで運べる。
    capacity: 2,
    carriableTypes: ['infantry', 'tank', 'artillery', 'antiAirTank'],
    vision: DEFAULT_VISION,
    nightStealth: false,
  },
  submarine: {
    unitType: 'submarine',
    unitName: '潜水艦',
    maxHp: 10,
    movement: 4,
    movementType: 'sea',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 30000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    vision: DEFAULT_VISION,
    // 夜戦では隣接マスまで近づかれないと発見されない。
    nightStealth: true,
  },
};

/** 指定したユニット種別の静的パラメータを返す */
export function getUnitData(unitType: UnitType): UnitData {
  return UNIT_DATA[unitType];
}

/**
 * 生産拠点(地形)ごとに生産できるユニット種別の一覧(生産メニューの表示順)。
 * 工場・本拠地では地上ユニット、空港では飛行ユニット、港では海上ユニットを生産する。
 * 生産できない地形(都市など)は一覧に含めない。
 */
export const PRODUCIBLE_UNIT_TYPES_BY_TERRAIN: Readonly<
  Partial<Record<TerrainType, readonly UnitType[]>>
> = {
  headquarters: ['infantry', 'tank', 'artillery', 'antiAirTank'],
  factory: ['infantry', 'tank', 'artillery', 'antiAirTank'],
  airport: ['attackHelicopter', 'transportHelicopter'],
  port: ['transportShip', 'escortShip', 'submarine', 'battleship'],
};

/** 指定した生産拠点(地形)で生産できるユニット種別の一覧を返す(生産不可地形は空配列) */
export function producibleUnitTypesAt(terrainType: TerrainType): readonly UnitType[] {
  return PRODUCIBLE_UNIT_TYPES_BY_TERRAIN[terrainType] ?? [];
}

/** 指定した生産拠点(地形)で unitType を生産できるか */
export function isProducibleAt(terrainType: TerrainType, unitType: UnitType): boolean {
  return producibleUnitTypesAt(terrainType).includes(unitType);
}
