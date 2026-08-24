// ユニットごとの静的パラメータ定義。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md を参照。

import type { MovementType, TerrainType } from '@/core/map/TerrainType';
import { GROUND_UNIT_TYPES, type UnitType } from '@/core/units/UnitType';

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
   * 輸送ヘリは歩兵のみ、輸送艦はすべての地上ユニット(GROUND_UNIT_TYPES)を運べる。
   */
  readonly carriableTypes: readonly UnitType[];
  /**
   * 視界(マス数)。夜戦で、このユニットの周囲何マスまでを明るくする(敵を発見できる)かを表す。
   * 昼戦(通常戦闘)ではマップ全体が明るいため参照しない。
   * 詳細は docs/GameDesign.md「夜戦」を参照。
   */
  readonly vision: number;
  /**
   * 山の上にいるときに視界へ加算するマス数。高所から見渡せる歩兵のみ 3 で、それ以外は 0。
   * 夜戦でのみ参照する。
   */
  readonly mountainVisionBonus: number;
  /**
   * 夜戦で「隣接マスまで近づかないと発見できない」隠密ユニットかどうか。
   * 潜水艦のみ true。昼戦(現行の通常戦闘)では参照しない。
   */
  readonly nightStealth: boolean;
}

/** 視界(vision)の既定値。歩兵・中戦車・対空戦車・輸送ヘリがこの値を持つ */
export const DEFAULT_VISION = 2;

/** 歩兵が山の上にいるときの視界ボーナス(マス数)。高所から遠くまで見渡せる */
export const INFANTRY_MOUNTAIN_VISION_BONUS = 3;

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
    // 山へ登ると高所から遠くまで見渡せる(夜戦の視界が 2 + 3 = 5 になる)
    mountainVisionBonus: INFANTRY_MOUNTAIN_VISION_BONUS,
    nightStealth: false,
  },
  lightTank: {
    unitType: 'lightTank',
    unitName: '軽戦車',
    maxHp: 10,
    movement: 6,
    movementType: 'vehicle',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 6000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 装甲を削って車高を抑えたぶん見晴らしがよく、戦車 3 種では最も広い視界(3)を持つ
    vision: 3,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  mediumTank: {
    unitType: 'mediumTank',
    unitName: '中戦車',
    maxHp: 10,
    movement: 5,
    movementType: 'vehicle',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 12000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    vision: DEFAULT_VISION,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  heavyTank: {
    unitType: 'heavyTank',
    unitName: '重戦車',
    maxHp: 10,
    movement: 4,
    movementType: 'vehicle',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 18000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 厚い装甲に閉じこもるぶん外が見えにくく、夜戦では手元しか見えない(視界 1)
    vision: 1,
    mountainVisionBonus: 0,
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
    // 車内から周囲を見張る余裕がなく、夜戦では手元しか見えない(視界 1)
    vision: 1,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  rocketArtillery: {
    unitType: 'rocketArtillery',
    unitName: 'ロケット砲',
    maxHp: 10,
    movement: 4,
    // 大型のロケット発射機を積んだ装輪車両。偵察車と同じ移動コストで、
    // 道路・拠点は速いが平地では減速し、森・山・海には進入できない。
    movementType: 'wheeled',
    // 自走砲(2〜3)より遠く、戦艦(3〜6)に迫る射程 3〜5 の間接攻撃ユニット。
    minAttackRange: 3,
    maxAttackRange: 5,
    cost: 15000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 自走砲と同じく、射程より視界が狭い(単独では最大射程まで撃てない)
    vision: 1,
    mountainVisionBonus: 0,
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
    // 上空から見下ろすため地上ユニットより広い視界(3)を持つ
    vision: 3,
    mountainVisionBonus: 0,
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
    mountainVisionBonus: 0,
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
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  recon: {
    unitType: 'recon',
    unitName: '偵察車',
    maxHp: 10,
    movement: 8,
    // 道路・拠点を走り抜ける装輪車両の移動タイプ(ロケット砲と共通)。森・山・海には進入できない。
    movementType: 'wheeled',
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 3500,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 索敵を役割とするユニットなので、護衛艦と並ぶ最も広い視界(5)を持つ。
    // 地上ユニットの中では単独で最も広い。
    vision: 5,
    mountainVisionBonus: 0,
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
    // 高い艦橋から遠方を見張る(視界 3)。ただし索敵の主役は護衛艦。
    vision: 3,
    mountainVisionBonus: 0,
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
    // 夜戦で偵察車と並ぶ最も広い視界(5マス)を持つ、艦隊の目となるユニット。
    vision: 5,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  transportShip: {
    unitType: 'transportShip',
    unitName: '輸送艦',
    maxHp: 10,
    movement: 5,
    movementType: 'sea',
    // 攻撃できないユニット。射程 0 で「攻撃不可」を表す。
    minAttackRange: 0,
    maxAttackRange: 0,
    cost: 16500,
    canCapture: false,
    // すべての地上ユニットを最大 2 体まで運べる。
    capacity: 2,
    carriableTypes: GROUND_UNIT_TYPES,
    // 見張りに人手を割けない輸送船。夜戦では周囲 1 マスしか見えない。
    vision: 1,
    mountainVisionBonus: 0,
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
    // 潜望鏡とソナーで広く索敵する(視界 3)。
    vision: 3,
    mountainVisionBonus: 0,
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
  headquarters: [
    'infantry',
    'recon',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'rocketArtillery',
    'antiAirTank',
  ],
  factory: [
    'infantry',
    'recon',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'rocketArtillery',
    'antiAirTank',
  ],
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
