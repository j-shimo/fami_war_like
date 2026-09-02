// 工場・本拠地でのユニット生産を処理する。Phaser には依存しない純粋なロジック。
// 資金を消費してユニットを生成し、生産マスに配置する。
// docs/DevelopmentPlan.md Phase 7、docs/GameDesign.md「生産」を参照。

import type { EconomyArmy, EconomyManager } from '@/core/economy/EconomyManager';
import type { MapManager } from '@/core/map/MapManager';
import type { TileData } from '@/core/map/TileData';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { AIR_UNIT_TYPES, UNIT_TYPES, type UnitType } from '@/core/units/UnitType';
import { getTerrainData } from '@/data/terrainData';
import {
  getUnitData,
  isProducibleAt,
  producibleUnitTypesAt,
  unitLimitOf,
  type ProductionMapContext,
} from '@/data/unitData';

/** 生産 1 回ぶんの結果 */
export interface ProductionResult {
  /** 生産されたユニット */
  readonly unit: Unit;
  /** 消費した資金 */
  readonly cost: number;
}

/** ユニット生産の実行を担うマネージャ */
export class ProductionManager {
  constructor(
    private readonly map: MapManager,
    private readonly units: UnitManager,
    private readonly economy: EconomyManager,
  ) {}

  /**
   * このマップの構成による生産制限。
   * 空港がなく、盤面にも飛行ユニットが 1 体もいないマップでは飛行ユニットが出てこないため、
   * 飛行ユニットしか攻撃できない対空自走砲・対空ロケット砲を生産できないようにする
   * (敵軍AIが無駄なユニットを買ってしまうのを防ぐ意味もある)。
   *
   * army を渡すと、その軍が所持上限に達している種別(列車砲は 1 軍 1 台まで)も
   * 生産一覧から外す。省略した場合は所持数による制限をかけない。
   */
  mapContext(army?: EconomyArmy): ProductionMapContext {
    const hasAirUnit = this.units
      .getAllUnits()
      .some((unit) => AIR_UNIT_TYPES.includes(unit.unitType));
    return {
      hasAirport: this.map.hasAirport || hasAirUnit,
      limitReachedTypes: army ? this.limitReachedTypes(army) : undefined,
    };
  }

  /**
   * army がすでに所持上限(UNIT_LIMIT_PER_ARMY)に達している種別の一覧を返す。
   * 数えるのは盤面に出ている生存ユニットだけなので、撃破されれば作り直せる。
   */
  private limitReachedTypes(army: EconomyArmy): readonly UnitType[] {
    return UNIT_TYPES.filter((unitType) => {
      const limit = unitLimitOf(unitType);
      return limit !== null && this.countUnits(army, unitType) >= limit;
    });
  }

  /** army が盤面に出している unitType のユニット数(輸送中のユニットも数える) */
  private countUnits(army: EconomyArmy, unitType: UnitType): number {
    let count = 0;
    for (const unit of this.units.getUnitsByArmy(army)) {
      if (unit.unitType === unitType) {
        count += 1;
      }
      count += unit.carried.filter((passenger) => passenger.unitType === unitType).length;
    }
    return count;
  }

  /**
   * army が tile で生産を行える状態か(資金は考慮しない)。
   * 生産可能地形かつ自軍所有、マスにユニットがいないこと、さらに
   * その拠点でいま作れる種別が 1 つ以上残っていることが条件。
   *
   * 最後の条件は、列車砲をすでに 1 台持っている軍が駅を選んだときに
   * 中身の無い生産ウィンドウを開かせないためのもの(駅で作れるのは列車砲だけなので、
   * 上限に達すると候補が 1 つも残らない)。
   */
  canProduceAt(army: EconomyArmy, tile: TileData): boolean {
    if (!getTerrainData(tile.terrainType).canProduce) {
      return false;
    }
    if (tile.owner !== army) {
      return false;
    }
    if (this.units.isOccupied(tile.position)) {
      return false;
    }
    return producibleUnitTypesAt(tile.terrainType, this.mapContext(army)).length > 0;
  }

  /**
   * army が tile で unitType を生産できるか(生産条件 + 生産拠点の種別対応 + 資金)。
   * 生産拠点ごとに生産できる種別が異なる(工場・本拠地は地上ユニット、空港は飛行ユニット、
   * 港は海上ユニット、駅は列車砲)。所持上限に達している種別も生産できない。
   */
  canProduce(army: EconomyArmy, tile: TileData, unitType: UnitType): boolean {
    if (!this.canProduceAt(army, tile)) {
      return false;
    }
    if (!isProducibleAt(tile.terrainType, unitType, this.mapContext(army))) {
      return false;
    }
    return this.economy.canAfford(army, getUnitData(unitType).cost);
  }

  /**
   * army が tile で unitType を生産する。
   * 生産条件を満たさない、または資金が不足する場合は例外を投げる。
   * 生産したユニットはそのマスに配置され、行動済み(このターンは行動不可)になる。
   */
  produce(army: EconomyArmy, tile: TileData, unitType: UnitType): ProductionResult {
    if (!this.canProduceAt(army, tile)) {
      throw new Error(
        `このマスでは生産できません(col ${tile.position.col}, row ${tile.position.row})`,
      );
    }
    if (!isProducibleAt(tile.terrainType, unitType, this.mapContext(army))) {
      throw new Error(
        `この生産拠点では ${getUnitData(unitType).unitName} を生産できません`,
      );
    }
    const cost = getUnitData(unitType).cost;
    if (!this.economy.canAfford(army, cost)) {
      throw new Error('資金が不足しています');
    }

    this.economy.spend(army, cost);
    const unit = this.units.spawnUnit({
      unitType,
      army,
      position: tile.position,
      hasActed: true,
    });

    return { unit, cost };
  }
}
