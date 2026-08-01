// 経済情報(資金・生産・占領)を情報パネル向けの文字列へ整形する。
// 表示ロジックのみを担い、Phaser には依存しない純粋な関数。

import type { CaptureResult } from '@/core/economy/CaptureSystem';
import type { EconomyArmy } from '@/core/economy/EconomyManager';
import type { ProductionResult } from '@/core/economy/ProductionManager';
import { armyLabel } from '@/ui/terrainInfo';
import { getUnitData } from '@/data/unitData';
import type { UnitType } from '@/core/units/UnitType';

/** 資金額を「資金(自軍): 12000」の形式に整形する */
export function formatFunds(army: EconomyArmy, amount: number): string {
  return `資金(${armyLabel(army)}): ${amount}`;
}

/** 生産メニューのボタン表示名を「歩兵 (1000)」の形式に整形する */
export function formatProductionLabel(unitType: UnitType): string {
  const data = getUnitData(unitType);
  return `${data.unitName} (${data.cost})`;
}

/** 占領結果を情報パネル用の複数行テキストに整形する */
export function formatCaptureLog(result: CaptureResult): string[] {
  const lines = ['占領', `${result.unit.unitName} が占領`];
  if (result.captured) {
    lines.push('占領完了');
  } else {
    lines.push(`残り耐久: ${result.remainingHp}`);
  }
  return lines;
}

/** 生産結果を情報パネル用の複数行テキストに整形する */
export function formatProductionLog(result: ProductionResult): string[] {
  return ['生産', `${result.unit.unitName} を生産`, `消費資金: ${result.cost}`];
}
