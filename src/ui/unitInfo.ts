// 選択中ユニットの情報を表示用テキストに整形する。Phaser には依存しない純粋な関数。

import type { Unit } from '@/core/units/Unit';
import { armyLabel } from '@/ui/terrainInfo';

/** formatUnitInfo の表示オプション */
export interface UnitInfoOptions {
  /**
   * 夜戦かどうか。夜戦のときだけ視界の行を表示する
   * (昼戦ではマップ全体が明るく視界を参照しないため、行数を増やさない)。
   */
  nightBattle?: boolean;
  /**
   * 表示する視界(マス数)。地形補正込みの値を呼び出し側で計算して渡す
   * (山の上の歩兵は +3)。省略時はユニットの基本視界を表示する。
   */
  vision?: number;
}

/**
 * 射程の表示テキスト。攻撃できないユニット(射程 0)は「なし」、
 * 最小と最大が同じなら 1 値、異なれば範囲表記にする。
 */
function rangeLabel(unit: Unit): string {
  if (!unit.canAttack) {
    return 'なし';
  }
  return unit.minAttackRange === unit.maxAttackRange
    ? String(unit.maxAttackRange)
    : `${unit.minAttackRange}-${unit.maxAttackRange}`;
}

/**
 * 輸送状況の表示テキスト。何も乗せていなければ「空」、
 * 乗せているユニットがいれば名前を並べ、輸送枠が 2 以上のときは「1/2」の形で残量も示す。
 */
function carriedLabel(unit: Unit): string {
  const names = unit.carried.map((passenger) => passenger.unitName).join('・');
  const body = names === '' ? '空' : names;
  return unit.capacity >= 2 ? `${body} (${unit.carried.length}/${unit.capacity})` : body;
}

/**
 * 選択中ユニットの情報を複数行のテキストとして返す。
 * 情報パネルへの表示に使う。輸送できるユニット(輸送ヘリ・輸送艦)は搭乗状況も併記する。
 * 夜戦では視界(何マス先まで明るくできるか)も併記する。
 */
export function formatUnitInfo(unit: Unit, options: UnitInfoOptions = {}): string[] {
  const lines = [
    `ユニット: ${unit.unitName}`,
    `所属: ${armyLabel(unit.armyType)}`,
    `HP: ${unit.currentHp}/${unit.maxHp}`,
    `移動力: ${unit.movement}`,
    `射程: ${rangeLabel(unit)}`,
    `占領: ${unit.canCapture ? '可' : '不可'}`,
  ];
  if (options.nightBattle) {
    lines.push(`視界: ${options.vision ?? unit.vision}`);
  }
  if (unit.capacity >= 1) {
    lines.push(`輸送: ${carriedLabel(unit)}`);
  }
  lines.push(`状態: ${unit.hasActed ? '行動済み' : '待機'}`);
  return lines;
}
