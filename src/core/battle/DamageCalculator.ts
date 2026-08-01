// 戦闘のダメージ計算。Phaser には依存しない純粋なロジック。
// docs/GameDesign.md「ダメージ計算の初期案」および docs/TerrainSpec.md「防御値」を参照。
//
// 計算式(MVP):
//   raw = 基礎ダメージ(相性表) × 攻撃側HP割合 × 地形補正
//   地形補正 = 1 - 防御値 × 0.1
//   最終ダメージ(HP) = round(raw / 10)
//
// 相性表は 0-100 スケールのため、0-10 表記の HP に合わせて 10 で割る。
// 基礎ダメージがある組み合わせでは、攻撃が無意味にならないよう最低 1 ダメージを保証する。

import type { Unit } from '@/core/units/Unit';
import { getBaseDamage } from '@/data/damageTable';

/**
 * 攻撃側が防御側へ与えるダメージ(HP 値)を計算する。
 *
 * @param attacker 攻撃側ユニット(現在 HP により火力が低下する)
 * @param defender 防御側ユニット(種別で相性が決まる)
 * @param defenderTerrainDefense 防御側がいるマスの地形防御値
 */
export function calculateDamage(
  attacker: Unit,
  defender: Unit,
  defenderTerrainDefense: number,
): number {
  const base = getBaseDamage(attacker.unitType, defender.unitType);
  const hpRatio = attacker.currentHp / attacker.maxHp;
  const terrainFactor = Math.max(0, 1 - defenderTerrainDefense * 0.1);

  const raw = base * hpRatio * terrainFactor; // 0-100 スケール
  const damage = Math.round(raw / 10); // HP(0-10)スケールへ変換

  // 相性があり攻撃側が生存しているのに 0 ダメージになる場合は 1 に切り上げる
  if (base > 0 && attacker.currentHp > 0 && damage < 1) {
    return 1;
  }
  return damage;
}
