// 戦闘の実行を統括する。Phaser には依存しない純粋なロジック。
// ダメージ計算・HP 減少・撃破・反撃・行動済み化までを一括で処理する。
// docs/DevelopmentPlan.md Phase 5、docs/UnitSpec.md「反撃ルール」を参照。

import { manhattanDistance } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { isWithinAttackRange } from '@/core/battle/AttackRange';
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
}

/** 攻撃の実行を担うマネージャ */
export class BattleManager {
  constructor(
    private readonly map: MapManager,
    private readonly units: UnitManager,
  ) {}

  /**
   * 攻撃側が防御側を攻撃する。
   *
   * 手順:
   * 1. 攻撃側から防御側へダメージを与える。HP が 0 になれば撃破(除去)。
   * 2. 防御側が生存し、かつ直接攻撃(距離1)を受け、防御側が攻撃側を射程に
   *    捉えている場合のみ反撃する。間接攻撃(距離2以上)には反撃しない。
   * 3. 攻撃側を行動済みにする。
   *
   * 射程外・味方への攻撃はデータ不整合として例外を投げる。
   */
  attack(attacker: Unit, defender: Unit): AttackResult {
    if (attacker.armyType === defender.armyType) {
      throw new Error('味方ユニットは攻撃できません');
    }
    if (!isWithinAttackRange(attacker, defender.position)) {
      throw new Error('攻撃対象が射程外です');
    }

    const distance = manhattanDistance(attacker.position, defender.position);

    // 1. 攻撃
    const damageDealt = this.applyDamage(attacker, defender);
    const defenderDefeated = !defender.isAlive;
    if (defenderDefeated) {
      this.units.removeUnit(defender);
    }

    // 2. 反撃(直接攻撃のみ・防御側が攻撃側を射程に捉えている場合)
    let counterDamage = 0;
    let attackerDefeated = false;
    const canCounter =
      !defenderDefeated &&
      distance === 1 &&
      isWithinAttackRange(defender, attacker.position);
    if (canCounter) {
      counterDamage = this.applyDamage(defender, attacker);
      attackerDefeated = !attacker.isAlive;
      if (attackerDefeated) {
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
    };
  }

  /** 攻撃側から防御側へダメージを与え、現在 HP を更新する。与えたダメージを返す */
  private applyDamage(attacker: Unit, defender: Unit): number {
    const terrain = this.map.getTerrainData(defender.position);
    const defense = terrain?.defense ?? 0;
    const damage = calculateDamage(attacker, defender, defense);
    defender.currentHp = Math.max(0, defender.currentHp - damage);
    return damage;
  }
}
