// 経済情報(資金・生産・占領)を情報パネル向けの文字列へ整形する。
// 表示ロジックのみを担い、Phaser には依存しない純粋な関数。

import type { CaptureResult } from '@/core/economy/CaptureSystem';
import type { EconomyArmy } from '@/core/economy/EconomyManager';
import type { ProductionResult } from '@/core/economy/ProductionManager';
import type { RepairResult } from '@/core/economy/RepairManager';
import { armyLabel } from '@/ui/terrainInfo';
import type { ArmyLabelOptions } from '@/ui/turnInfo';
import {
  getUnitData,
  producibleUnitTypesAt,
  type ProductionMapContext,
} from '@/data/unitData';
import type { TerrainType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';

/**
 * 資金額を「資金(自軍): 12000」の形式に整形する。
 * 対人戦では軍勢の呼び名が「1P / 2P」に変わる(options で呼び分けを渡す)。
 */
export function formatFunds(
  army: EconomyArmy,
  amount: number,
  options: ArmyLabelOptions = {},
): string {
  return `資金(${armyLabel(army, options)}): ${amount}`;
}

/**
 * ターン開始時に得られる収入を「収入: 5000 (拠点5)」の形式に整形する。
 * 資金行のすぐ下に置く想定で、どの軍かは資金行が示すため軍名は付けない。
 */
export function formatIncome(income: number, bases: number): string {
  return `収入: ${income} (拠点${bases})`;
}

/** 生産メニューのボタン表示名を「歩兵 (1000)」の形式に整形する */
export function formatProductionLabel(unitType: UnitType): string {
  const data = getUnitData(unitType);
  return `${data.unitName} (${data.cost})`;
}

/** 生産ウィンドウの 1 行ぶんの表示データ(アイコン・名前・料金の描画に使う) */
export interface ProductionMenuItem {
  /** ユニット種別(アイコン描画と生産実行のキーに使う) */
  readonly unitType: UnitType;
  /** 表示名(日本語) */
  readonly unitName: string;
  /** 生産コスト(料金) */
  readonly cost: number;
}

/**
 * 生産ウィンドウに並べる、指定した生産拠点(地形)で生産できるユニットの一覧を表示順で返す。
 * 工場・本拠地では地上ユニット、空港では飛行ユニットが並ぶ。
 * context にマップの構成(空港の有無)を渡すと、そのマップで無意味なユニットは並ばない。
 * 表示範囲を超えるぶんはウィンドウ側でスクロール表示する想定で、件数の上限は設けない。
 */
export function listProductionItems(
  terrainType: TerrainType,
  context: ProductionMapContext = {},
): ProductionMenuItem[] {
  return producibleUnitTypesAt(terrainType, context).map((unitType) => {
    const data = getUnitData(unitType);
    return { unitType, unitName: data.unitName, cost: data.cost };
  });
}

/** 占領結果を情報パネル用の複数行テキストに整形する */
export function formatCaptureLog(result: CaptureResult): string[] {
  const lines = ['占領', `${result.unit.unitName} が占領`];
  // 別の軍が進めていた占領を初期値へ戻してから占領した場合はその旨を示す
  if (result.reset) {
    lines.push('耐久をリセット');
  }
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

/**
 * ターン開始時の修理結果を情報パネル用の複数行テキストに整形する。
 * 修理が 1 件もなければ空配列を返す(表示しない)。
 */
export function formatRepairLog(results: readonly RepairResult[]): string[] {
  if (results.length === 0) {
    return [];
  }
  const lines = ['修理'];
  let total = 0;
  for (const result of results) {
    lines.push(`${result.unit.unitName} +${result.healedHp} (HP${result.currentHp})`);
    total += result.cost;
  }
  lines.push(`消費資金: ${total}`);
  return lines;
}
