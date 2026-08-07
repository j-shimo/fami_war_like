// 自軍の修理拠点の上で待機しているダメージを受けたユニットを、
// ターン開始時に資金を消費して修理する。Phaser には依存しない純粋なロジック。
// 修理拠点はユニットの移動タイプで分かれており、飛行ユニットは空港でのみ、
// 地上ユニット(歩兵・車両)は空港以外の修理拠点(都市・工場・本拠地)でのみ修理できる。
// docs/GameDesign.md「修理」を参照。

import type { EconomyArmy, EconomyManager } from '@/core/economy/EconomyManager';
import type { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { REPAIR_HP_PER_TURN } from '@/data/economyConfig';
import { getTerrainData } from '@/data/terrainData';

/** 修理 1 回ぶんの結果 */
export interface RepairResult {
  /** 修理したユニット */
  readonly unit: Unit;
  /** このターンに回復した HP 量 */
  readonly healedHp: number;
  /** 消費した資金 */
  readonly cost: number;
  /** 修理後の現在 HP */
  readonly currentHp: number;
}

/** ターン開始時のユニット修理を担うマネージャ */
export class RepairManager {
  constructor(
    private readonly map: MapManager,
    private readonly units: UnitManager,
    private readonly economy: EconomyManager,
  ) {}

  /**
   * unit が army のターン開始時に修理を受けられる状態か(資金は考慮しない)。
   * 生存する army のユニットが、自軍所有の修理拠点の上に立ち、
   * かつ HP が最大未満(ダメージを受けている)であることが条件。
   * さらに、修理拠点はユニットの移動タイプで分かれる:
   * 飛行ユニットは空港でのみ、地上ユニットは空港以外の修理拠点でのみ修理できる。
   */
  canRepair(unit: Unit, army: EconomyArmy): boolean {
    if (!unit.isAlive || unit.armyType !== army) {
      return false;
    }
    // ダメージを受けていないユニットは修理対象外
    if (unit.currentHp >= unit.maxHp) {
      return false;
    }
    const tile = this.map.getTile(unit.position);
    if (!tile || tile.owner !== army) {
      return false;
    }
    if (!getTerrainData(tile.terrainType).canRepair) {
      return false;
    }
    // 飛行ユニットは空港でのみ、地上ユニットは空港以外の修理拠点でのみ修理できる。
    // isAirport と isAirUnit が一致するときだけ修理可能。
    const isAirport = tile.terrainType === 'airport';
    const isAirUnit = unit.movementType === 'air';
    return isAirport === isAirUnit;
  }

  /**
   * unit がこのターンに回復する HP 量を返す。
   * 1 ターンあたり最大 REPAIR_HP_PER_TURN 回復するが、
   * 最大 HP を超えないよう残り HP 差でクランプする(例: HP9 なら +1)。
   */
  getRepairAmount(unit: Unit): number {
    return Math.max(0, Math.min(REPAIR_HP_PER_TURN, unit.maxHp - unit.currentHp));
  }

  /**
   * unit を回復量ぶん修理するのに必要な資金を返す。
   * 1 HP あたりの修理費 = 生産コスト ÷ 最大 HP。
   * そのため回復量が半分(HP9 → 10 の +1)のときは費用も半額になる。
   */
  getRepairCost(unit: Unit): number {
    const data = unit.data;
    const costPerHp = data.cost / data.maxHp;
    return Math.round(costPerHp * this.getRepairAmount(unit));
  }

  /**
   * army のターン開始時に、修理可能かつ資金を支払えるユニットをすべて修理する。
   * 資金が足りないユニットは修理せずにスキップする。
   * 実行した修理の結果を配列で返す(何も修理しなければ空配列)。
   */
  repairAll(army: EconomyArmy): RepairResult[] {
    const results: RepairResult[] = [];
    for (const unit of this.units.getUnitsByArmy(army)) {
      if (!this.canRepair(unit, army)) {
        continue;
      }
      const cost = this.getRepairCost(unit);
      if (!this.economy.canAfford(army, cost)) {
        continue;
      }
      const healedHp = this.getRepairAmount(unit);
      this.economy.spend(army, cost);
      unit.currentHp += healedHp;
      results.push({ unit, healedHp, cost, currentHp: unit.currentHp });
    }
    return results;
  }
}
