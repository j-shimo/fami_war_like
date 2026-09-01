// ユニットの種別に関する型定義。Phaser には依存しない純粋なロジック。
// 詳細な仕様は docs/UnitSpec.md を参照。

/**
 * ユニットの種別。
 * 地上系(歩兵・軽戦車・中戦車・重戦車・新型戦車・自走砲・ロケット砲・対空戦車・対空自走砲・
 * 対空ロケット砲・偵察車・輸送車)、飛行系(戦闘機・爆撃機・攻撃機・戦闘ヘリ・輸送ヘリ)に加え、
 * 海上系(戦艦・護衛艦・輸送艦・潜水艦)を扱う。
 *
 * 戦車は装甲と機動力のバランスで 3 段階に分かれる。
 * 軽戦車は安価で足が速く、重戦車は高価で鈍いが正面から撃ち勝てる。
 * 新型戦車(newTank)はこの 3 種とは別枠の特別なユニットで、生産はできず、
 * 研究所を最初に占領した歩兵が進化することでのみ手に入る
 * (軽戦車の機動力・重戦車以上の装甲・重戦車と同等の火力を併せ持つ)。
 *
 * 固定翼機は役割で 3 段階に分かれる。戦闘機は空だけを、爆撃機は地上・海上だけを狙い、
 * 攻撃機はその中間で空も陸も海も撃てる。
 */
export type UnitType =
  | 'infantry'
  | 'lightTank'
  | 'mediumTank'
  | 'heavyTank'
  | 'newTank'
  | 'artillery'
  | 'rocketArtillery'
  | 'fighter'
  | 'bomber'
  | 'attackAircraft'
  | 'attackHelicopter'
  | 'transportHelicopter'
  | 'antiAirTank'
  | 'antiAirArtillery'
  | 'antiAirRocketArtillery'
  | 'recon'
  | 'transportVehicle'
  | 'battleship'
  | 'escortShip'
  | 'transportShip'
  | 'submarine';

/** すべてのユニット種別の一覧 */
export const UNIT_TYPES: readonly UnitType[] = [
  'infantry',
  'lightTank',
  'mediumTank',
  'heavyTank',
  'newTank',
  'artillery',
  'rocketArtillery',
  'fighter',
  'bomber',
  'attackAircraft',
  'attackHelicopter',
  'transportHelicopter',
  'antiAirTank',
  'antiAirArtillery',
  'antiAirRocketArtillery',
  'recon',
  'transportVehicle',
  'battleship',
  'escortShip',
  'transportShip',
  'submarine',
];

/**
 * 生産できる戦車 3 種(軽・中・重)の一覧。装甲の薄い順に並べる。
 * 生産できない新型戦車(newTank)はこの一覧には含めない。
 */
export const TANK_UNIT_TYPES: readonly UnitType[] = [
  'lightTank',
  'mediumTank',
  'heavyTank',
];

/** 海上ユニット(港で生産する 4 種)の一覧。移動タイプ 'sea' を持つ */
export const NAVAL_UNIT_TYPES: readonly UnitType[] = [
  'battleship',
  'escortShip',
  'transportShip',
  'submarine',
];

/** 飛行ユニット(空港で生産する 5 種)の一覧。移動タイプ 'air' を持つ */
export const AIR_UNIT_TYPES: readonly UnitType[] = [
  'fighter',
  'bomber',
  'attackAircraft',
  'attackHelicopter',
  'transportHelicopter',
];

/**
 * 対空ユニット(飛行ユニットを主目標にする地上ユニット)の一覧。
 * 固定翼機(戦闘機・爆撃機・攻撃機)を攻撃できる地上ユニットはこの 3 種だけ。
 */
export const ANTI_AIR_UNIT_TYPES: readonly UnitType[] = [
  'antiAirTank',
  'antiAirArtillery',
  'antiAirRocketArtillery',
];

/**
 * 飛行ユニットしか攻撃できない対空ユニットの一覧。
 * 対空戦車は地上ユニットも攻撃できるためここには含めない。
 * 空港のないマップでは飛行ユニットが出てこないため、この 2 種は生産できない。
 */
export const AIR_ONLY_ANTI_AIR_UNIT_TYPES: readonly UnitType[] = [
  'antiAirArtillery',
  'antiAirRocketArtillery',
];

/**
 * 地上ユニットの一覧。輸送艦で運べる種別でもある。
 * 工場・本拠地で生産できるのはこのうち 11 種で、新型戦車だけは生産できない
 * (研究所の占領で歩兵が進化したときにだけ手に入る)。
 */
export const GROUND_UNIT_TYPES: readonly UnitType[] = [
  'infantry',
  'lightTank',
  'mediumTank',
  'heavyTank',
  'newTank',
  'artillery',
  'rocketArtillery',
  'antiAirTank',
  'antiAirArtillery',
  'antiAirRocketArtillery',
  'recon',
  'transportVehicle',
];
