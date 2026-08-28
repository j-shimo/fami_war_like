// 工場・本拠地でのユニット生産を処理する。Phaser には依存しない純粋なロジック。
// 資金を消費してユニットを生成し、生産マスに配置する。
// docs/DevelopmentPlan.md Phase 7、docs/GameDesign.md「生産」を参照。

import type { EconomyArmy, EconomyManager } from '@/core/economy/EconomyManager';
import type { MapManager } from '@/core/map/MapManager';
import type { TileData } from '@/core/map/TileData';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { AIR_UNIT_TYPES, type UnitType } from '@/core/units/UnitType';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData, isProducibleAt, type ProductionMapContext } from '@/data/unitData';

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
   */
  mapContext(): ProductionMapContext {
    const hasAirUnit = this.units
      .getAllUnits()
      .some((unit) => AIR_UNIT_TYPES.includes(unit.unitType));
    return { hasAirport: this.map.hasAirport || hasAirUnit };
  }

  /**
   * army が tile で生産を行える状態か(資金は考慮しない)。
   * 生産可能地形かつ自軍所有、さらにマスにユニットがいないことが条件。
   */
  canProduceAt(army: EconomyArmy, tile: TileData): boolean {
    if (!getTerrainData(tile.terrainType).canProduce) {
      return false;
    }
    if (tile.owner !== army) {
      return false;
    }
    return !this.units.isOccupied(tile.position);
  }

  /**
   * army が tile で unitType を生産できるか(生産条件 + 生産拠点の種別対応 + 資金)。
   * 生産拠点ごとに生産できる種別が異なる(工場・本拠地は地上ユニット、空港は飛行ユニット)。
   */
  canProduce(army: EconomyArmy, tile: TileData, unitType: UnitType): boolean {
    if (!this.canProduceAt(army, tile)) {
      return false;
    }
    if (!isProducibleAt(tile.terrainType, unitType, this.mapContext())) {
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
    if (!isProducibleAt(tile.terrainType, unitType, this.mapContext())) {
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
