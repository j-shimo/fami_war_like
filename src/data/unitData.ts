// ユニットごとの静的パラメータ定義。バランス調整用の数値はここに集約して外部化する。
// 詳細な仕様は docs/UnitSpec.md を参照。

import type { MovementType, TerrainType } from '@/core/map/TerrainType';
import {
  AIR_ONLY_ANTI_AIR_UNIT_TYPES,
  CARRIABLE_GROUND_UNIT_TYPES,
  type UnitType,
} from '@/core/units/UnitType';

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
  /** 輸送できるユニット数(輸送ヘリ・輸送車は 1・輸送艦は 2。輸送しないユニットは 0) */
  readonly capacity: number;
  /**
   * 輸送できるユニット種別(capacity が 0 のユニットでは空配列)。
   * 輸送ヘリ・輸送車は歩兵のみ、輸送艦・列車砲は列車砲を除く地上ユニット
   * (CARRIABLE_GROUND_UNIT_TYPES)を運べる。
   */
  readonly carriableTypes: readonly UnitType[];
  /**
   * 積み降ろし(搭乗・降車)を行える地形の限定リスト。
   * 省略した輸送ユニット(輸送ヘリ・輸送車・輸送艦)は、停まっている地形を問わず積み降ろしできる。
   * 列車砲だけがこの制限を持ち、駅(station)に停車しているときしか積み降ろしできない。
   */
  readonly loadingTerrainTypes?: readonly TerrainType[];
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

/** 視界(vision)の既定値。歩兵・中戦車・対空戦車・輸送ヘリ・固定翼機がこの値を持つ */
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
  newTank: {
    unitType: 'newTank',
    unitName: '新型戦車',
    maxHp: 10,
    // 軽戦車と同じ機動力(移動力 6)を、重戦車以上の装甲のまま実現した試作戦車。
    movement: 6,
    movementType: 'vehicle',
    minAttackRange: 1,
    maxAttackRange: 1,
    // 生産はできない(研究所の占領による進化でのみ手に入る)ため、
    // このコストは修理費の計算と戦力の目安にだけ使う。重戦車(18000)より高い。
    cost: 22000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 重戦車(1)と違い、観測装置を備えるため標準の視界 2 を持つ
    vision: DEFAULT_VISION,
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
  fighter: {
    unitType: 'fighter',
    unitName: '戦闘機',
    maxHp: 10,
    movement: 10,
    movementType: 'air',
    // 近接攻撃のみ。空対空だけを行い、地上・海上ユニットには手が出せない。
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 20000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 全ユニット最速の移動力 10 を持つが、高速で飛ぶぶん地上の細かい様子は見えない(視界 2)
    vision: DEFAULT_VISION,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  bomber: {
    unitType: 'bomber',
    unitName: '爆撃機',
    maxHp: 10,
    movement: 8,
    movementType: 'air',
    // 近接攻撃のみ。爆弾を落とす相手(地上・海上)だけを狙い、飛行ユニットは攻撃できない。
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 22000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    vision: DEFAULT_VISION,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  attackAircraft: {
    unitType: 'attackAircraft',
    unitName: '攻撃機',
    maxHp: 10,
    movement: 9,
    movementType: 'air',
    // 近接攻撃のみ。戦闘機と爆撃機の中間で、空・陸・海のすべてを攻撃できる。
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 26500,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    vision: DEFAULT_VISION,
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
    cost: 8500,
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
    cost: 5500,
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
  antiAirArtillery: {
    unitType: 'antiAirArtillery',
    unitName: '対空自走砲',
    maxHp: 10,
    movement: 4,
    // 自走砲・戦車と同じ履帯の車両。森は抜けられるが山・海には進入できない。
    movementType: 'vehicle',
    // 射程 2〜3 の間接攻撃のみ。隣接した相手は撃てず、移動したターンは攻撃できない。
    minAttackRange: 2,
    maxAttackRange: 3,
    cost: 5500,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // 自走砲と同じく、射程より視界が狭い(単独では最大射程まで撃てない)
    vision: 1,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  antiAirRocketArtillery: {
    unitType: 'antiAirRocketArtillery',
    unitName: '対空ロケット砲',
    maxHp: 10,
    movement: 4,
    // ロケット砲・偵察車と同じ装輪車両。道路・拠点は速いが平地では減速し、森・山には入れない。
    movementType: 'wheeled',
    // ロケット砲と同じ射程 3〜5 の間接攻撃。狙えるのは飛行ユニットだけ。
    minAttackRange: 3,
    maxAttackRange: 5,
    cost: 13000,
    canCapture: false,
    capacity: 0,
    carriableTypes: [],
    // ロケット砲と同じく、射程に対して視界が極端に狭い
    vision: 1,
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
  transportVehicle: {
    unitType: 'transportVehicle',
    unitName: '輸送車',
    maxHp: 10,
    movement: 6,
    // 履帯の装甲車。戦車 3 種・自走砲・対空戦車と同じ移動コスト(森は通れるが山・海は不可)。
    movementType: 'vehicle',
    // 偵察車と同じ近接攻撃(射程 1)のみ。相性表も偵察車と同じ値を持つ。
    minAttackRange: 1,
    maxAttackRange: 1,
    cost: 5000,
    canCapture: false,
    // 輸送ヘリと同じく、歩兵を 1 体だけ運べる。
    capacity: 1,
    carriableTypes: ['infantry'],
    // 荷台に人と物資を積むことが役目で見張りに人手を割けない。夜戦では周囲 1 マスしか見えない。
    vision: 1,
    mountainVisionBonus: 0,
    nightStealth: false,
  },
  railgun: {
    unitType: 'railgun',
    unitName: '列車砲',
    maxHp: 10,
    // 線路の上を蒸気で駆け抜ける移動力 15。ただし進めるのは線路と駅の上だけなので、
    // 実際に届く範囲は敷かれた線路の長さそのもので決まる。
    movement: 15,
    // 軌道系。線路(コスト 1)と駅(コスト 1)以外はすべて進入不可。
    movementType: 'rail',
    // 射程 2〜6 の間接攻撃のみ。戦艦と同じ最大射程を持つ、地上で最も遠くまで届く砲。
    // 間接攻撃なので移動したターンは攻撃できず、反撃も受けない。
    minAttackRange: 2,
    maxAttackRange: 6,
    // 全ユニット中 2 番目に高いコスト(戦艦 35000 に次ぐ)。1 軍 1 台の制限もあわせて、
    // 序盤に買える戦力ではなく「線路を守り切った側の切り札」という位置づけにする。
    cost: 30000,
    canCapture: false,
    // 砲車の後ろに連結した貨車で、地上ユニットを 2 体まで運べる(列車砲自身は積めない)。
    capacity: 2,
    carriableTypes: CARRIABLE_GROUND_UNIT_TYPES,
    // 積み降ろしができるのは駅に停車しているときだけ(線路の上では乗せも降ろしもできない)。
    // 貨車への積み込みには荷役設備が要る、という理屈で駅にだけ許す。
    loadingTerrainTypes: ['station'],
    // 射程 6 に対して視界 1。単独では最大射程まで撃てず、前に出した味方の目が要る。
    vision: 1,
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
    carriableTypes: CARRIABLE_GROUND_UNIT_TYPES,
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
    cost: 24000,
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
 * 中立の研究所を占領したときに進化するユニット種別の対応表。
 * 研究所を最初に占領した歩兵だけが新型戦車へ進化する(一覧に無い種別は進化しない)。
 * 進化は「中立の研究所を占領したとき」の 1 回だけで、いったん所有者が決まった研究所を
 * 奪い返しても進化は起きない(docs/GameDesign.md「研究所」を参照)。
 */
export const LABORATORY_EVOLUTION: Readonly<Partial<Record<UnitType, UnitType>>> = {
  infantry: 'newTank',
};

/**
 * unitType が中立の研究所を占領したときに進化する種別を返す。進化しないなら null。
 */
export function laboratoryEvolutionOf(unitType: UnitType): UnitType | null {
  return LABORATORY_EVOLUTION[unitType] ?? null;
}

/**
 * 生産拠点(地形)ごとに生産できるユニット種別の一覧(生産メニューの表示順)。
 * 新型戦車は生産できないため、どの拠点の一覧にも含めない
 * (研究所の占領で歩兵が進化したときにだけ手に入る)。
 * 工場・本拠地では地上ユニット(対空自走砲・対空ロケット砲を含む)、
 * 空港では飛行ユニット(ヘリ系と固定翼機)、港では海上ユニット、駅では列車砲を生産する。
 * 生産できない地形(都市など)は一覧に含めない。
 * マップの構成による絞り込み(空港のないマップでの対空 2 種の除外)は
 * producibleUnitTypesAt の context で行う。
 */
export const PRODUCIBLE_UNIT_TYPES_BY_TERRAIN: Readonly<
  Partial<Record<TerrainType, readonly UnitType[]>>
> = {
  headquarters: [
    'infantry',
    'recon',
    'transportVehicle',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'rocketArtillery',
    'antiAirTank',
    'antiAirArtillery',
    'antiAirRocketArtillery',
  ],
  factory: [
    'infantry',
    'recon',
    'transportVehicle',
    'lightTank',
    'mediumTank',
    'heavyTank',
    'artillery',
    'rocketArtillery',
    'antiAirTank',
    'antiAirArtillery',
    'antiAirRocketArtillery',
  ],
  airport: [
    'attackHelicopter',
    'transportHelicopter',
    'fighter',
    'bomber',
    'attackAircraft',
  ],
  port: ['transportShip', 'escortShip', 'submarine', 'battleship'],
  // 駅で生産できるのは列車砲だけ(逆に列車砲は駅でしか生産できない)
  station: ['railgun'],
};

/**
 * 1 軍が同時に持てるユニット数の上限。一覧に無い種別に上限はない。
 * 列車砲は 1 軍 1 台まで(撃破されれば作り直せる)。
 */
export const UNIT_LIMIT_PER_ARMY: Readonly<Partial<Record<UnitType, number>>> = {
  railgun: 1,
};

/** unitType の 1 軍あたりの所持上限を返す。上限が無い種別は null */
export function unitLimitOf(unitType: UnitType): number | null {
  return UNIT_LIMIT_PER_ARMY[unitType] ?? null;
}

/**
 * 輸送を役目とするユニット(輸送ヘリ・輸送車・輸送艦)かどうか。
 * 「他ユニットを運べる(capacity >= 1)」ユニットのうち、間接攻撃を持たないものを指す。
 * 列車砲も地上ユニットを 2 体運べるが、射程 2〜6 の砲撃が本業なので輸送ユニットには数えない
 * (敵軍AIが列車砲を「渡る足」と誤認して輸送艦を作らなくなるのを防ぐ)。
 */
export function isFerryUnit(unitType: UnitType): boolean {
  const data = getUnitData(unitType);
  return data.capacity >= 1 && data.maxAttackRange <= 1;
}

/**
 * 生産できる種別をマップの構成に応じて絞り込むための条件。
 * 地形と種別の対応(PRODUCIBLE_UNIT_TYPES_BY_TERRAIN)だけでは決まらない制限をここで扱う。
 */
export interface ProductionMapContext {
  /**
   * マップに空港があるか。
   * 空港がなければ両軍とも飛行ユニットを生産できないため、
   * 飛行ユニットしか攻撃できない対空ユニット(対空自走砲・対空ロケット砲)を
   * 生産一覧から除く。指定しない場合は制限なし(true 扱い)。
   */
  readonly hasAirport?: boolean;
  /**
   * その軍がすでに所持上限(UNIT_LIMIT_PER_ARMY)に達している種別の一覧。
   * 列車砲を 1 台持っているあいだは、生産一覧から列車砲が消える。
   * 盤面を見て数える必要があるため、値は ProductionManager.mapContext が組み立てる。
   */
  readonly limitReachedTypes?: readonly UnitType[];
}

/**
 * 指定した生産拠点(地形)で生産できるユニット種別の一覧を返す(生産不可地形は空配列)。
 * context に hasAirport: false を渡すと、空港のないマップでは無意味になる
 * 対空自走砲・対空ロケット砲を除いた一覧を返す。
 * context.limitReachedTypes に渡した種別(所持上限に達した列車砲など)も一覧から外す。
 */
export function producibleUnitTypesAt(
  terrainType: TerrainType,
  context: ProductionMapContext = {},
): readonly UnitType[] {
  let types = PRODUCIBLE_UNIT_TYPES_BY_TERRAIN[terrainType] ?? [];
  if (context.hasAirport === false) {
    types = types.filter((type) => !AIR_ONLY_ANTI_AIR_UNIT_TYPES.includes(type));
  }
  const limitReached = context.limitReachedTypes;
  if (limitReached && limitReached.length > 0) {
    types = types.filter((type) => !limitReached.includes(type));
  }
  return types;
}

/** 指定した生産拠点(地形)で unitType を生産できるか */
export function isProducibleAt(
  terrainType: TerrainType,
  unitType: UnitType,
  context: ProductionMapContext = {},
): boolean {
  return producibleUnitTypesAt(terrainType, context).includes(unitType);
}
