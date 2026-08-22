// 攻撃可能範囲と攻撃対象の判定。Phaser には依存しない純粋なロジック。
// docs/DevelopmentPlan.md Phase 5 参照。
//
// 射程はマンハッタン距離で判定する。最小射程・最大射程の間にあるマスを攻撃できる。
// 直接攻撃(射程1)は隣接マスのみ、間接攻撃(射程2以上)は最小射程未満の敵を攻撃できない。
//
// 射程に加えて「相手の種別を攻撃できるか」も判定する。戦艦は潜水艦を、護衛艦は
// ヘリ系・潜水艦以外を攻撃できないなど、相性表の基礎ダメージが 0 の組み合わせは
// 射程内にいても攻撃対象にならない(canAttackUnit)。

import {
  gridPosition,
  manhattanDistance,
  type GridPosition,
} from '@/core/map/GridPosition';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { canDamage } from '@/data/damageTable';

/**
 * 攻撃側が防御側を攻撃対象にできるかを、種別の相性だけで判定する(射程は見ない)。
 * 基礎ダメージが 0 の組み合わせ(戦艦 → 潜水艦、護衛艦 → 水上艦、輸送ヘリ・輸送艦の
 * 全対象など)は攻撃できない。味方同士も攻撃対象にならない。
 */
export function canAttackUnit(attacker: Unit, defender: Unit): boolean {
  return (
    attacker.armyType !== defender.armyType &&
    canDamage(attacker.unitType, defender.unitType)
  );
}

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

/** findAttackableTargets のオプション */
export interface AttackTargetOptions {
  /**
   * 夜戦で、その敵ユニットが攻撃側の軍から見えているかを判定する述語。
   * 見えていない敵は射程内にいても攻撃対象にならない(暗いマスの敵は撃てない)。
   * 省略した場合(昼戦)はすべての敵が見えているものとして扱う。
   */
  readonly isVisible?: (unit: Unit) => boolean;
}

/**
 * 攻撃側が指定位置から攻撃できる敵ユニットの一覧を返す。
 * 射程内にいて、かつ種別の相性として攻撃できる敵軍の生存ユニットのみを対象とする。
 * 夜戦では、加えて「見えている」敵だけを対象とする(options.isVisible)。
 */
export function findAttackableTargets(
  attacker: Unit,
  units: UnitManager,
  from: GridPosition = attacker.position,
  options: AttackTargetOptions = {},
): Unit[] {
  return units
    .getAllUnits()
    .filter(
      (target) =>
        canAttackUnit(attacker, target) &&
        isWithinAttackRange(attacker, target.position, from) &&
        (options.isVisible?.(target) ?? true),
    );
}
