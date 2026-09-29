// 戦闘のダメージ計算。Phaser には依存しない純粋なロジック。
// docs/GameDesign.md「ダメージ計算の初期案」および docs/TerrainSpec.md「防御値」を参照。
//
// 計算式(MVP):
//   raw = 基礎ダメージ(相性表) × 攻撃側HP割合 × 地形補正 × 指揮官補正
//   地形補正   = 1 - 防御値 × 0.1
//   指揮官補正 = 1 + 攻撃補正(攻撃側の指揮官による割増し。補正なしなら 1)
//   ダメージポイント = round(raw)(0-100 スケールのまま、HP 1 = 10 ポイント)
//
// HP は 0-10 表記だが、ダメージは 1/10 HP 単位(ポイント)で厳密に扱う。
// 10 ポイントに満たない端数はユニットごとに「端数ダメージ」(Unit.damageRemainder)として
// 蓄積し、合計が 10 ポイントに達するたびに HP を 1 減らす(applyDamagePoints)。
// これにより、歩兵 → 重戦車(2 ポイント)と歩兵 → 戦車(10 ポイント)のような
// 小さなダメージの差も、一律 HP1 に丸められずに反映される。
// 基礎ダメージがある組み合わせでは、攻撃が無意味にならないよう最低 1 ポイントを保証する。

import type { Unit } from '@/core/units/Unit';
import { getBaseDamage } from '@/data/damageTable';

/** HP 1 に相当するダメージポイント数 */
export const DAMAGE_POINTS_PER_HP = 10;

/** calculateDamagePoints の任意指定(省略するとどちらも既定の計算になる) */
export interface DamageOptions {
  /**
   * 火力計算に使う攻撃側 HP(省略時は攻撃側の現在 HP)。
   * 反撃ダメージの予測など、被弾後の HP で計算したい場合に指定する。
   */
  readonly attackerHp?: number;
  /**
   * 攻撃側の指揮官による攻撃補正(0.1 なら +10%)。省略時は補正なし(0)。
   * 軍ごとの補正表は CommanderBonus が持つ。
   */
  readonly attackBonus?: number;
}

/**
 * 攻撃側が防御側へ与えるダメージを、ポイント(1/10 HP 単位)で計算する。
 *
 * @param attacker 攻撃側ユニット(現在 HP により火力が低下する)
 * @param defender 防御側ユニット(種別で相性が決まる)
 * @param defenderTerrainDefense 防御側がいるマスの地形防御値
 * @param options 火力計算に使う攻撃側 HP と、攻撃側の指揮官による攻撃補正
 */
export function calculateDamagePoints(
  attacker: Unit,
  defender: Unit,
  defenderTerrainDefense: number,
  options: DamageOptions = {},
): number {
  const attackerHp = options.attackerHp ?? attacker.currentHp;
  const attackBonus = options.attackBonus ?? 0;
  const base = getBaseDamage(attacker.unitType, defender.unitType);
  const hpRatio = attackerHp / attacker.maxHp;
  // 飛行ユニットは地形の上空にいるため、地形の防御補正を受けない(常に防御 0 扱い)。
  const effectiveDefense = defender.movementType === 'air' ? 0 : defenderTerrainDefense;
  const terrainFactor = Math.max(0, 1 - effectiveDefense * 0.1);
  // 指揮官の攻撃補正。マイナスの補正は想定していないため 0 で下限を切る
  const commanderFactor = 1 + Math.max(0, attackBonus);

  const points = Math.round(base * hpRatio * terrainFactor * commanderFactor); // 0-100 スケール

  // 相性があり攻撃側が生存しているのに 0 ポイントになる場合は 1 に切り上げる
  if (base > 0 && attackerHp > 0 && points < 1) {
    return 1;
  }
  return points;
}

/** applyDamagePoints の結果 */
export interface DamageApplication {
  /** 被弾後の HP(0 以上) */
  readonly hp: number;
  /** 被弾後の端数ダメージ(0 以上 DAMAGE_POINTS_PER_HP 未満。撃破時は 0) */
  readonly remainder: number;
  /** 実際に減った HP */
  readonly hpLoss: number;
}

/**
 * 現在 HP と蓄積中の端数ダメージにダメージポイントを加え、被弾後の状態を求める(状態は変更しない)。
 * 端数と今回のポイントの合計が 10 に達するごとに HP を 1 減らし、余りを新たな端数として残す。
 *
 * 例: HP10・端数 8 に 5 ポイント → 合計 13 → HP9・端数 3
 */
export function applyDamagePoints(
  hp: number,
  remainder: number,
  points: number,
): DamageApplication {
  const total = remainder + Math.max(0, points);
  const loss = Math.floor(total / DAMAGE_POINTS_PER_HP);
  const nextHp = Math.max(0, hp - loss);
  return {
    hp: nextHp,
    remainder: nextHp === 0 ? 0 : total % DAMAGE_POINTS_PER_HP,
    hpLoss: hp - nextHp,
  };
}

/**
 * ユニットにダメージポイントを与え、現在 HP と端数ダメージを更新する。減った HP を返す。
 */
export function dealDamagePoints(unit: Unit, points: number): number {
  const applied = applyDamagePoints(unit.currentHp, unit.damageRemainder, points);
  unit.currentHp = applied.hp;
  unit.damageRemainder = applied.remainder;
  return applied.hpLoss;
}
