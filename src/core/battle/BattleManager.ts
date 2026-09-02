// 戦闘の実行を統括する。Phaser には依存しない純粋なロジック。
// ダメージ計算・HP 減少・撃破・反撃・行動済み化までを一括で処理する。
// docs/DevelopmentPlan.md Phase 5、docs/UnitSpec.md「反撃ルール」を参照。

import { manhattanDistance } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import {
  canAttackUnit,
  canCounterattack,
  isWithinAttackRange,
} from '@/core/battle/AttackRange';
import {
  attackBonusOf,
  NO_COMMANDER_BONUS,
  type CommanderBonus,
} from '@/core/battle/CommanderBonus';
import { calculateDamage } from '@/core/battle/DamageCalculator';

/** 攻撃 1 回ぶんの結果 */
export interface AttackResult {
  /** 攻撃側ユニット */
  readonly attacker: Unit;
  /** 防御側ユニット */
  readonly defender: Unit;
  /** 攻撃で与えたダメージ(HP) */
  readonly damageDealt: number;
  /** 反撃で受けたダメージ(HP)。反撃なしは 0 */
  readonly counterDamage: number;
  /** 防御側を撃破したか */
  readonly defenderDefeated: boolean;
  /** 反撃で攻撃側が撃破されたか */
  readonly attackerDefeated: boolean;
  /** 攻撃・反撃の巻き添えで撃沈した輸送中のユニット(いなければ空配列) */
  readonly lostPassengers: readonly Unit[];
}

/** 攻撃の実行を担うマネージャ */
export class BattleManager {
  /**
   * @param map 地形防御値の参照に使うマップ
   * @param units 撃破時にユニットを取り除くための管理
   * @param bonus 軍ごとの指揮官の攻撃補正(省略時は補正なし)。
   *   攻撃・反撃のどちらも、撃つ側の軍の補正で計算する
   */
  constructor(
    private readonly map: MapManager,
    private readonly units: UnitManager,
    private readonly bonus: CommanderBonus = NO_COMMANDER_BONUS,
  ) {}

  /**
   * 攻撃側が防御側を攻撃する。
   *
   * 手順:
   * 1. 攻撃側から防御側へダメージを与える。HP が 0 になれば撃破(除去)。
   * 2. 防御側が生存し、かつ直接攻撃(距離1)を受け、防御側が攻撃側を射程に
   *    捉え、種別としても攻撃できる場合のみ反撃する。
   *    間接攻撃(距離2以上)には反撃しない。
   *    対空戦車 → 重戦車のように相性表が 0 の向きでは反撃も起きない
   *    (判定は AttackRange の canCounterattack がまとめて担う)。
   * 3. 攻撃側を行動済みにする。
   *
   * 射程外・味方への攻撃、および種別として攻撃できない相手(戦艦 → 潜水艦、
   * 対空戦車 → 重戦車など)への攻撃はデータ不整合として例外を投げる。
   */
  attack(attacker: Unit, defender: Unit): AttackResult {
    if (attacker.armyType === defender.armyType) {
      throw new Error('味方ユニットは攻撃できません');
    }
    if (!canAttackUnit(attacker, defender)) {
      throw new Error(`${attacker.unitName}は${defender.unitName}を攻撃できません`);
    }
    if (!isWithinAttackRange(attacker, defender.position)) {
      throw new Error('攻撃対象が射程外です');
    }

    const distance = manhattanDistance(attacker.position, defender.position);
    const lostPassengers: Unit[] = [];

    // 1. 攻撃
    const damageDealt = this.applyDamage(attacker, defender, lostPassengers);
    const defenderDefeated = !defender.isAlive;
    if (defenderDefeated) {
      // 撃破された輸送ユニットが運んでいたユニットは、盤面に戻らず一緒に失われる
      lostPassengers.push(...defender.carried.splice(0));
      this.units.removeUnit(defender);
    }

    // 2. 反撃(直接攻撃のみ・防御側が攻撃側を射程に捉え、種別としても攻撃できる場合)
    let counterDamage = 0;
    let attackerDefeated = false;
    const canCounter =
      !defenderDefeated && canCounterattack(defender, attacker, distance);
    if (canCounter) {
      counterDamage = this.applyDamage(defender, attacker, lostPassengers);
      attackerDefeated = !attacker.isAlive;
      if (attackerDefeated) {
        lostPassengers.push(...attacker.carried.splice(0));
        this.units.removeUnit(attacker);
      }
    }

    // 3. 攻撃側を行動済みにする
    attacker.hasActed = true;

    return {
      attacker,
      defender,
      damageDealt,
      counterDamage,
      defenderDefeated,
      attackerDefeated,
      lostPassengers,
    };
  }

  /**
   * 攻撃側から防御側へダメージを与え、現在 HP を更新する。与えたダメージを返す。
   * 防御側が輸送ユニットの場合、輸送中のユニットも同じダメージを受ける
   * (docs/UnitSpec.md「輸送ルール」参照)。巻き添えで HP が 0 になった搭乗ユニットは
   * lost へ積んで呼び出し側に知らせる。
   */
  private applyDamage(attacker: Unit, defender: Unit, lost: Unit[]): number {
    const terrain = this.map.getTerrainData(defender.position);
    const defense = terrain?.defense ?? 0;
    const damage = calculateDamage(attacker, defender, defense, {
      // 攻撃側の軍を率いる指揮官の補正で火力が上がる(反撃も撃つ側の補正で計算する)
      attackBonus: attackBonusOf(this.bonus, attacker.armyType),
    });
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    this.applyDamageToPassengers(defender, damage, lost);
    return damage;
  }

  /**
   * 輸送中のユニットへ、輸送ユニットが受けたのと同じダメージを与える。
   * HP が 0 になった搭乗ユニットは輸送枠から取り除き、lost へ積む
   * (搭乗中は盤面にいないため、盤面からの除去は不要)。
   */
  private applyDamageToPassengers(transport: Unit, damage: number, lost: Unit[]): void {
    if (damage <= 0 || !transport.isCarrying) {
      return;
    }
    const survivors: Unit[] = [];
    for (const passenger of transport.carried) {
      passenger.currentHp = Math.max(0, passenger.currentHp - damage);
      if (passenger.isAlive) {
        survivors.push(passenger);
      } else {
        lost.push(passenger);
      }
    }
    transport.carried = survivors;
  }
}
