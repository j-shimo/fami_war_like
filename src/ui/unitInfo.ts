// 選択中ユニットの情報を表示用テキストに整形する。Phaser には依存しない純粋な関数。

import type { Unit } from '@/core/units/Unit';
import { armyLabel } from '@/ui/terrainInfo';

/** 射程の表示テキスト。最小と最大が同じなら 1 値、異なれば範囲表記にする */
function rangeLabel(unit: Unit): string {
  return unit.minAttackRange === unit.maxAttackRange
    ? String(unit.maxAttackRange)
    : `${unit.minAttackRange}-${unit.maxAttackRange}`;
}

/**
 * 選択中ユニットの情報を複数行のテキストとして返す。
 * 情報パネルへの表示に使う。
 */
export function formatUnitInfo(unit: Unit): string[] {
  return [
    `ユニット: ${unit.unitName}`,
    `所属: ${armyLabel(unit.armyType)}`,
    `HP: ${unit.currentHp}/${unit.maxHp}`,
    `移動力: ${unit.movement}`,
    `射程: ${rangeLabel(unit)}`,
    `占領: ${unit.canCapture ? '可' : '不可'}`,
    `状態: ${unit.hasActed ? '行動済み' : '待機'}`,
  ];
}
