// ユニットの種別に関する型定義。Phaser には依存しない純粋なロジック。
// 詳細な仕様は docs/UnitSpec.md を参照。

/**
 * ユニットの種別。
 * 地上系(歩兵・軽戦車・中戦車・重戦車・自走砲・ロケット砲・対空戦車・偵察車)、
 * 飛行系(戦闘ヘリ・輸送ヘリ)に加え、海上系(戦艦・護衛艦・輸送艦・潜水艦)を扱う。
 *
 * 戦車は装甲と機動力のバランスで 3 段階に分かれる。
 * 軽戦車は安価で足が速く、重戦車は高価で鈍いが正面から撃ち勝てる。
 */
export type UnitType =
  | 'infantry'
  | 'lightTank'
  | 'mediumTank'
  | 'heavyTank'
  | 'artillery'
  | 'rocketArtillery'
  | 'attackHelicopter'
  | 'transportHelicopter'
  | 'antiAirTank'
  | 'recon'
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
  'artillery',
  'rocketArtillery',
  'attackHelicopter',
  'transportHelicopter',
  'antiAirTank',
  'recon',
  'battleship',
  'escortShip',
  'transportShip',
  'submarine',
];

/** 戦車 3 種(軽・中・重)の一覧。装甲の薄い順に並べる */
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

/** 地上ユニット(工場・本拠地で生産する 8 種)の一覧。輸送艦で運べる種別でもある */
export const GROUND_UNIT_TYPES: readonly UnitType[] = [
  'infantry',
  'lightTank',
  'mediumTank',
  'heavyTank',
  'artillery',
  'rocketArtillery',
  'antiAirTank',
  'recon',
];
