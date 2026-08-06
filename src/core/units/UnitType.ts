// ユニットの種別に関する型定義。Phaser には依存しない純粋なロジック。
// 詳細な仕様は docs/UnitSpec.md を参照。

/**
 * ユニットの種別。
 * 地上系(歩兵・戦車・自走砲・対空戦車)に加え、飛行系(戦闘ヘリ・輸送ヘリ)を扱う。
 */
export type UnitType =
  | 'infantry'
  | 'tank'
  | 'artillery'
  | 'attackHelicopter'
  | 'transportHelicopter'
  | 'antiAirTank';

/** すべてのユニット種別の一覧 */
export const UNIT_TYPES: readonly UnitType[] = [
  'infantry',
  'tank',
  'artillery',
  'attackHelicopter',
  'transportHelicopter',
  'antiAirTank',
];
