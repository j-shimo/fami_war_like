// 攻撃可能範囲と攻撃対象の判定。Phaser には依存しない純粋なロジック。
// docs/DevelopmentPlan.md Phase 5 参照。
//
// 射程はマンハッタン距離で判定する。最小射程・最大射程の間にあるマスを攻撃できる。
// 直接攻撃(射程1)は隣接マスのみ、間接攻撃(射程2以上)は最小射程未満の敵を攻撃できない。

import {
  gridPosition,
  manhattanDistance,
  type GridPosition,
} from '@/core/map/GridPosition';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';

/**
 * 指定位置が攻撃側の射程内かどうかを判定する。
 *
 * @param attacker 攻撃側ユニット(射程を参照する)
 * @param targetPos 判定対象の座標
 * @param from 攻撃を行う位置(省略時は攻撃側の現在位置)
 */
export function isWithinAttackRange(
  attacker: Unit,
  targetPos: GridPosition,
  from: GridPosition = attacker.position,
): boolean {
  const distance = manhattanDistance(from, targetPos);
  return distance >= attacker.minAttackRange && distance <= attacker.maxAttackRange;
}

/**
 * 指定位置から攻撃できるすべてのマスを返す(マスの中身は問わない)。
 * 攻撃可能範囲のハイライト表示に使う。座標はマップ範囲外を含みうるため、
 * 描画側でマップ範囲に絞り込むこと。
 */
export function calculateAttackableTiles(
  attacker: Unit,
  from: GridPosition = attacker.position,
): GridPosition[] {
  const tiles: GridPosition[] = [];
  const max = attacker.maxAttackRange;
  for (let dc = -max; dc <= max; dc++) {
    for (let dr = -max; dr <= max; dr++) {
      const distance = Math.abs(dc) + Math.abs(dr);
      if (distance >= attacker.minAttackRange && distance <= max) {
        tiles.push(gridPosition(from.col + dc, from.row + dr));
      }
    }
  }
  return tiles;
}

/**
 * 攻撃側が指定位置から攻撃できる敵ユニットの一覧を返す。
 * 射程内にいる敵軍の生存ユニットのみを対象とする。
 */
export function findAttackableTargets(
  attacker: Unit,
  units: UnitManager,
  from: GridPosition = attacker.position,
): Unit[] {
  return units
    .getAllUnits()
    .filter(
      (target) =>
        target.armyType !== attacker.armyType &&
        isWithinAttackRange(attacker, target.position, from),
    );
}
