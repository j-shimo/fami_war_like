// 攻撃を実行する前に、その戦闘結果を予測する。Phaser には依存しない純粋なロジック。
// BattleManager.attack と同じ計算式で、状態を変更せずに結果だけを求める。
// docs/DevelopmentPlan.md Phase 10「ダメージ予測UIを作る」を参照。
//
// 予測手順(BattleManager と同じ):
//   1. 攻撃側 → 防御側のダメージを求め、被弾後の防御側 HP を算出する。
//   2. 防御側が生存し、直接攻撃(距離1)で互いに射程内、かつ防御側が攻撃側の種別を
//      攻撃できるなら反撃が発生する。反撃火力は被弾後の防御側 HP を基準に計算する。

import { canAttackUnit, isWithinAttackRange } from '@/core/battle/AttackRange';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import { manhattanDistance } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';

/** 攻撃前に算出する戦闘予測の結果 */
export interface BattleForecast {
  /** 攻撃で与える見込みダメージ(HP) */
  readonly damageDealt: number;
  /** 被弾前の防御側 HP */
  readonly defenderHpBefore: number;
  /** 被弾後の防御側 HP(0 以上) */
  readonly defenderHpAfter: number;
  /** この攻撃で防御側を撃破できる見込みか */
  readonly defenderDefeated: boolean;
  /** 反撃が発生する見込みか */
  readonly willCounter: boolean;
  /** 反撃で受ける見込みダメージ(HP)。反撃なしは 0 */
  readonly counterDamage: number;
  /** 反撃前の攻撃側 HP */
  readonly attackerHpBefore: number;
  /** 反撃後の攻撃側 HP(0 以上) */
  readonly attackerHpAfter: number;
  /** 反撃で攻撃側が撃破される見込みか */
  readonly attackerDefeated: boolean;
}

/** 指定マスの地形防御値を返す(範囲外は 0) */
function terrainDefenseAt(map: MapManager, unit: Unit): number {
  return map.getTerrainData(unit.position)?.defense ?? 0;
}

/**
 * 攻撃側が防御側を攻撃した場合の結果を、状態を変更せずに予測する。
 *
 * @param attacker 攻撃側ユニット
 * @param defender 防御側ユニット
 * @param map 地形防御値の参照に使うマップ
 */
export function forecastBattle(
  attacker: Unit,
  defender: Unit,
  map: MapManager,
): BattleForecast {
  // 1. 攻撃側 → 防御側
  const damageDealt = calculateDamage(
    attacker,
    defender,
    terrainDefenseAt(map, defender),
  );
  const defenderHpAfter = Math.max(0, defender.currentHp - damageDealt);
  const defenderDefeated = defenderHpAfter === 0;

  // 2. 反撃(直接攻撃・防御側生存・互いに射程内・種別として攻撃できるときのみ)
  const distance = manhattanDistance(attacker.position, defender.position);
  const willCounter =
    !defenderDefeated &&
    distance === 1 &&
    canAttackUnit(defender, attacker) &&
    isWithinAttackRange(defender, attacker.position);

  // 反撃火力は被弾後の防御側 HP で計算する(BattleManager と同じ挙動)
  const counterDamage = willCounter
    ? calculateDamage(
        defender,
        attacker,
        terrainDefenseAt(map, attacker),
        defenderHpAfter,
      )
    : 0;
  const attackerHpAfter = Math.max(0, attacker.currentHp - counterDamage);
  const attackerDefeated = willCounter && attackerHpAfter === 0;

  return {
    damageDealt,
    defenderHpBefore: defender.currentHp,
    defenderHpAfter,
    defenderDefeated,
    willCounter,
    counterDamage,
    attackerHpBefore: attacker.currentHp,
    attackerHpAfter,
    attackerDefeated,
  };
}
