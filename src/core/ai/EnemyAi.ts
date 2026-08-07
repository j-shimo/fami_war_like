// 敵軍(CPU)の思考ルーチン。Phaser には依存しない純粋なロジックとして実装し、
// 既存のマネージャ(戦闘・占領・生産)を介して盤面を更新する。
// docs/DevelopmentPlan.md Phase 9、docs/GameDesign.md「敵AI(簡易)」を参照。
//
// 行動優先順位(ユニット 1 体ごと):
//   1. 攻撃可能なら攻撃する(移動して攻撃できる場合も含む)
//   2. 占領可能なら占領する(占領地形へ移動しての占領も含む)
//   3. 攻撃も占領もできなければ最寄りの敵へ近づく
//   4. どこへも進めなければ待機する
// 全ユニットの行動後、資金があれば生産拠点でユニットを生産する。

import { isWithinAttackRange } from '@/core/battle/AttackRange';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import type { AttackResult, BattleManager } from '@/core/battle/BattleManager';
import type { CaptureResult, CaptureSystem } from '@/core/economy/CaptureSystem';
import type { EconomyArmy } from '@/core/economy/EconomyManager';
import type {
  ProductionManager,
  ProductionResult,
} from '@/core/economy/ProductionManager';
import { equals, manhattanDistance, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { TileData } from '@/core/map/TileData';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData, producibleUnitTypesAt } from '@/data/unitData';

/** AI が 1 手番で実行した行動 1 件を表すログ。呼び出し側の表示に使う */
export type AiAction =
  | {
      readonly kind: 'attack';
      readonly result: AttackResult;
      /** 攻撃前に移動した先。その場から攻撃した場合は null */
      readonly movedTo: GridPosition | null;
    }
  | {
      readonly kind: 'capture';
      readonly result: CaptureResult;
      /** 占領前に移動した先。その場で占領した場合は null */
      readonly movedTo: GridPosition | null;
    }
  | {
      readonly kind: 'move';
      readonly unit: Unit;
      readonly from: GridPosition;
      readonly to: GridPosition;
    }
  | { readonly kind: 'produce'; readonly result: ProductionResult }
  | { readonly kind: 'wait'; readonly unit: Unit };

/** EnemyAi が盤面操作に用いるマネージャ群 */
export interface EnemyAiDeps {
  readonly map: MapManager;
  readonly units: UnitManager;
  readonly battle: BattleManager;
  readonly capture: CaptureSystem;
  /** 生産の可否判定・実行に使う(資金判定は ProductionManager 経由で行う) */
  readonly production: ProductionManager;
}

/** 拠点占領の優先度。本拠地を最優先で狙う */
const CAPTURE_PRIORITY: Record<string, number> = {
  headquarters: 3,
  factory: 2,
  city: 1,
};

/**
 * 敵軍(既定)の 1 手番ぶんの思考を行うコントローラ。
 * run() で手番の全ユニットを順に行動させ、最後に生産を行う。
 */
export class EnemyAi {
  private readonly map: MapManager;
  private readonly units: UnitManager;
  private readonly battle: BattleManager;
  private readonly capture: CaptureSystem;
  private readonly production: ProductionManager;

  /**
   * @param deps 盤面操作に使うマネージャ群
   * @param army この AI が操作する軍勢(既定は敵軍)
   */
  constructor(
    deps: EnemyAiDeps,
    private readonly army: EconomyArmy = 'enemy',
  ) {
    this.map = deps.map;
    this.units = deps.units;
    this.battle = deps.battle;
    this.capture = deps.capture;
    this.production = deps.production;
  }

  /**
   * この AI の手番を実行する。手番開始時点で行動可能なユニットを順に処理し、
   * 最後に生産拠点での生産を行う。実行した行動のログを返す。
   */
  run(): AiAction[] {
    const actions: AiAction[] = [];

    // 手番開始時のユニットを固定してから処理する(撃破・生産で集合が変わるため)
    const acting = [...this.units.getUnitsByArmy(this.army)];
    for (const unit of acting) {
      // 反撃で撃破された・すでに行動済みのユニットは飛ばす
      if (!unit.isAlive || unit.hasActed) {
        continue;
      }
      actions.push(this.actUnit(unit));
    }

    actions.push(...this.produceAll());
    return actions;
  }

  /** ユニット 1 体の行動を優先順位に従って決定・実行する */
  private actUnit(unit: Unit): AiAction {
    return this.tryAttack(unit) ?? this.tryCapture(unit) ?? this.moveOrWait(unit);
  }

  /**
   * 攻撃を試みる。移動可能範囲の各マスから攻撃できる敵を探し、
   * 最も有利なマス・対象の組み合わせで(必要なら移動してから)攻撃する。
   * ただし間接攻撃(遠距離)ユニットは移動後は攻撃できないため、
   * その場から攻撃できる場合のみ攻撃する。
   * 有効な攻撃がなければ null を返す。
   */
  private tryAttack(unit: Unit): AiAction | null {
    const range = calculateMovementRange(unit, this.map, this.units);
    const enemies = this.opposingUnits();

    let bestScore = -Infinity;
    let bestTarget: Unit | null = null;
    let bestFrom: GridPosition | null = null;

    for (const target of enemies) {
      const damage = calculateDamage(unit, target, this.terrainDefense(target.position));
      // ダメージを与えられない相手には攻撃しない(無駄な行動を避ける)
      if (damage <= 0) {
        continue;
      }
      const willKill = target.currentHp <= damage;

      for (const { position: from } of range.tiles) {
        // 間接攻撃ユニットは移動すると攻撃できない。その場からの攻撃のみ許可する
        if (unit.isIndirect && !equals(from, unit.position)) {
          continue;
        }
        if (!isWithinAttackRange(unit, target.position, from)) {
          continue;
        }
        const counter = this.estimateCounter(unit, target, from, damage, willKill);

        // 撃破を最優先し、次に与ダメージ、被反撃は減点、防御地形は微加点する
        let score = damage - counter + this.terrainDefense(from) * 0.5;
        if (willKill) {
          score += 100;
        }
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
          bestFrom = from;
        }
      }
    }

    if (!bestTarget || !bestFrom) {
      return null;
    }

    const movedTo = equals(bestFrom, unit.position) ? null : bestFrom;
    if (movedTo) {
      this.units.moveUnit(unit, movedTo, { markActed: false });
    }
    const result = this.battle.attack(unit, bestTarget);
    return { kind: 'attack', result, movedTo };
  }

  /**
   * from から attacker が target を攻撃したときに想定される反撃ダメージを見積もる。
   * 直接攻撃(隣接)で、防御側が生存し、攻撃側を射程に収める場合のみ反撃が発生する。
   * 反撃は被弾後の HP で行われるため、想定残 HP を反映して計算する。
   */
  private estimateCounter(
    attacker: Unit,
    target: Unit,
    from: GridPosition,
    damage: number,
    willKill: boolean,
  ): number {
    if (willKill || manhattanDistance(from, target.position) !== 1) {
      return 0;
    }
    if (!isWithinAttackRange(target, from)) {
      return 0;
    }
    // 反撃は被弾後の HP で行われるため、想定残 HP に一時的に置き換えて見積もる
    const savedHp = target.currentHp;
    target.currentHp = Math.max(1, savedHp - damage);
    const counter = calculateDamage(target, attacker, this.terrainDefense(from));
    target.currentHp = savedHp;
    return counter;
  }

  /**
   * 占領を試みる。占領能力を持つユニットが、移動可能範囲内の
   * 自軍所有でない占領地形へ(必要なら移動して)占領を行う。
   * 占領できなければ null を返す。
   */
  private tryCapture(unit: Unit): AiAction | null {
    if (!unit.canCapture) {
      return null;
    }
    const range = calculateMovementRange(unit, this.map, this.units);

    let bestTile: TileData | null = null;
    let bestFrom: GridPosition | null = null;
    let bestKey = -Infinity;

    for (const { position } of range.tiles) {
      const tile = this.map.getTile(position);
      if (!tile) {
        continue;
      }
      if (!getTerrainData(tile.terrainType).canCapture || tile.owner === this.army) {
        continue;
      }
      // すでにその場にいる拠点を最優先(移動せず占領を継続できる)、
      // 次に拠点の戦略価値(本拠地>工場>都市)を優先する
      const priority = CAPTURE_PRIORITY[tile.terrainType] ?? 0;
      const key = (equals(position, unit.position) ? 100 : 0) + priority;
      if (key > bestKey) {
        bestKey = key;
        bestTile = tile;
        bestFrom = position;
      }
    }

    if (!bestTile || !bestFrom) {
      return null;
    }

    const movedTo = equals(bestFrom, unit.position) ? null : bestFrom;
    if (movedTo) {
      this.units.moveUnit(unit, movedTo, { markActed: false });
    }
    const result = this.capture.capture(unit, bestTile);
    return { kind: 'capture', result, movedTo };
  }

  /**
   * 最寄りの敵へ近づく。近づけない(現在地が最善)場合は待機する。
   * どちらの場合も行動済みにする。
   */
  private moveOrWait(unit: Unit): AiAction {
    const enemies = this.opposingUnits();
    if (enemies.length === 0) {
      unit.hasActed = true;
      return { kind: 'wait', unit };
    }

    // 現在地から最も近い敵を接近目標にする
    const targetPos = this.nearestEnemyPosition(unit, enemies);
    const range = calculateMovementRange(unit, this.map, this.units);

    let bestPos = unit.position;
    let bestDist = manhattanDistance(unit.position, targetPos);
    let bestDefense = this.terrainDefense(unit.position);

    for (const { position } of range.tiles) {
      const dist = manhattanDistance(position, targetPos);
      const defense = this.terrainDefense(position);
      // 目標へより近いマスを優先し、同距離なら防御の高い地形を選ぶ
      if (dist < bestDist || (dist === bestDist && defense > bestDefense)) {
        bestDist = dist;
        bestDefense = defense;
        bestPos = position;
      }
    }

    if (equals(bestPos, unit.position)) {
      unit.hasActed = true;
      return { kind: 'wait', unit };
    }

    const from = unit.position;
    this.units.moveUnit(unit, bestPos);
    return { kind: 'move', unit, from, to: bestPos };
  }

  /**
   * 生産拠点でユニットを生産する。自軍所有かつ空の生産拠点ごとに、
   * 資金で購入できる最も高価なユニットを生産する。買えなければ飛ばす。
   */
  private produceAll(): AiAction[] {
    const actions: AiAction[] = [];
    const producibleTiles: TileData[] = [];
    this.map.forEachTile((tile) => {
      if (this.production.canProduceAt(this.army, tile)) {
        producibleTiles.push(tile);
      }
    });

    for (const tile of producibleTiles) {
      // 生産拠点(工場・本拠地・空港)ごとに生産できる種別が異なるため、
      // そのマスで生産できる種別の中から、高価な(強力な)ユニットを優先して購入する。
      const byCostDesc = [...producibleUnitTypesAt(tile.terrainType)].sort(
        (a, b) => getUnitData(b).cost - getUnitData(a).cost,
      );
      const unitType = byCostDesc.find((type) =>
        this.production.canProduce(this.army, tile, type),
      );
      if (!unitType) {
        continue;
      }
      const result = this.production.produce(this.army, tile, unitType);
      actions.push({ kind: 'produce', result });
    }
    return actions;
  }

  /** この AI の相手軍勢の生存ユニット一覧を返す */
  private opposingUnits(): readonly Unit[] {
    return this.units.getAllUnits().filter((unit) => unit.armyType !== this.army);
  }

  /** unit の現在地から最も近い敵ユニットの位置を返す(enemies は 1 体以上) */
  private nearestEnemyPosition(unit: Unit, enemies: readonly Unit[]): GridPosition {
    let nearest = enemies[0];
    let nearestDist = manhattanDistance(unit.position, nearest.position);
    for (const enemy of enemies) {
      const dist = manhattanDistance(unit.position, enemy.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    return nearest.position;
  }

  /** 指定マスの地形防御値を返す(範囲外は 0) */
  private terrainDefense(pos: GridPosition): number {
    return this.map.getTerrainData(pos)?.defense ?? 0;
  }
}
