// ユニットの種別に関する型定義。Phaser には依存しない純粋なロジック。
// 詳細な仕様は docs/UnitSpec.md を参照。

/** ユニットの種別。MVP では歩兵・戦車・自走砲の 3 種類のみ扱う */
export type UnitType = 'infantry' | 'tank' | 'artillery';

/** すべてのユニット種別の一覧 */
export const UNIT_TYPES: readonly UnitType[] = ['infantry', 'tank', 'artillery'];
