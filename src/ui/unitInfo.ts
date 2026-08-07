// 選択中ユニットの情報を表示用テキストに整形する。Phaser には依存しない純粋な関数。

import type { Unit } from '@/core/units/Unit';
import { armyLabel } from '@/ui/terrainInfo';

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
 * 選択中ユニットの情報を複数行のテキストとして返す。
 * 情報パネルへの表示に使う。輸送できるユニット(輸送ヘリ)は搭乗状況も併記する。
 */
export function formatUnitInfo(unit: Unit): string[] {
  const lines = [
    `ユニット: ${unit.unitName}`,
    `所属: ${armyLabel(unit.armyType)}`,
    `HP: ${unit.currentHp}/${unit.maxHp}`,
    `移動力: ${unit.movement}`,
    `射程: ${rangeLabel(unit)}`,
    `占領: ${unit.canCapture ? '可' : '不可'}`,
  ];
  if (unit.capacity >= 1) {
    lines.push(`輸送: ${unit.carried ? unit.carried.unitName : '空'}`);
  }
  lines.push(`状態: ${unit.hasActed ? '行動済み' : '待機'}`);
  return lines;
}
