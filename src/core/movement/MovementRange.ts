// ユニットの移動可能範囲を計算する。Phaser には依存しない純粋なロジック。
// 地形ごとの移動コストが異なるため、ダイクストラ法で最小コストの到達範囲を求める。
// docs/DevelopmentPlan.md Phase 4 参照。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { canMerge } from '@/core/units/merge';
import { canCarry } from '@/core/units/transport';

/** 到達可能な 1 マスと、そこへ到達するのに必要な最小移動コスト */
export interface ReachableTile {
  readonly position: GridPosition;
  /** 開始マスからの累積移動コスト(開始マスは 0) */
  readonly cost: number;
}

/** 隣接 4 方向のオフセット(斜め移動はしない) */
const NEIGHBOR_OFFSETS: readonly { readonly dc: number; readonly dr: number }[] = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

/** マップキー(座標を一意な文字列にする) */
function toKey(pos: GridPosition): string {
  return `${pos.col},${pos.row}`;
}

/** マップキーを座標に戻す */
function fromKey(key: string): GridPosition {
  const [col, row] = key.split(',').map(Number);
  return gridPosition(col, row);
}

/**
 * 移動可能範囲の計算結果。到達マスの集合を保持し、
 * 到達判定やコスト参照を提供する。
 */
export class MovementRange {
  private readonly reachable: ReadonlyMap<string, ReachableTile>;

  constructor(tiles: readonly ReachableTile[]) {
    const map = new Map<string, ReachableTile>();
    for (const tile of tiles) {
      map.set(toKey(tile.position), tile);
    }
    this.reachable = map;
  }

  /** 到達可能なすべてのマスを返す */
  get tiles(): readonly ReachableTile[] {
    return [...this.reachable.values()];
  }

  /** 指定マスへ移動できるか(移動先として選択できるか) */
  canReach(pos: GridPosition): boolean {
    return this.reachable.has(toKey(pos));
  }

  /** 指定マスへの累積移動コストを返す。到達不可なら undefined */
  getCost(pos: GridPosition): number | undefined {
    return this.reachable.get(toKey(pos))?.cost;
  }
}

/**
 * 指定ユニットが到達できるマスへの最小移動コストをダイクストラ法で求める。
 * 味方ユニットが占有しているマスも含めて返す(そこで停止できるかは呼び出し側で判断する)。
 *
 * ルール:
 * - 地形ごとの移動コストを移動タイプ別に加算し、移動力以内で到達できるマスを求める。
 * - 進入不可地形(移動コスト null)には入れない。
 * - 敵ユニットがいるマスは通過も停止もできない(進入不可として扱う)。
 * - 味方ユニットがいるマスは通過できる(そのマスも到達マスとして返す)。
 */
function computeReachableCosts(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
): Map<string, number> {
  const movementType = unit.movementType;
  const maxMove = unit.movement;
  const start = unit.position;

  // 各マスへの暫定最小コスト
  const dist = new Map<string, number>([[toKey(start), 0]]);
  // 最小コストが確定したマス
  const settled = new Set<string>();

  while (true) {
    // 未確定マスの中から最小コストのものを取り出す(小規模マップのため線形探索で十分)
    let currentKey: string | null = null;
    let currentCost = Infinity;
    for (const [key, cost] of dist) {
      if (!settled.has(key) && cost < currentCost) {
        currentCost = cost;
        currentKey = key;
      }
    }
    if (currentKey === null) {
      break;
    }
    settled.add(currentKey);

    const current = fromKey(currentKey);
    for (const { dc, dr } of NEIGHBOR_OFFSETS) {
      const next = gridPosition(current.col + dc, current.row + dr);
      const nextKey = toKey(next);
      if (settled.has(nextKey)) {
        continue;
      }

      // 進入不可地形・範囲外は入れない
      const moveCost = map.getMoveCost(next, movementType);
      if (moveCost === null) {
        continue;
      }

      // 敵ユニットのいるマスは通過も停止もできない
      const occupant = units.getUnitAt(next);
      if (occupant && occupant.armyType !== unit.armyType) {
        continue;
      }

      const nextCost = currentCost + moveCost;
      if (nextCost > maxMove) {
        continue;
      }

      const known = dist.get(nextKey);
      if (known === undefined || nextCost < known) {
        dist.set(nextKey, nextCost);
      }
    }
  }

  return dist;
}

/**
 * 指定ユニットの移動可能範囲をダイクストラ法で計算する。
 *
 * ルール:
 * - 地形ごとの移動コストを移動タイプ別に加算し、移動力以内で到達できるマスを求める。
 * - 進入不可地形(移動コスト null)には入れない。
 * - 敵ユニットがいるマスは通過も停止もできない(進入不可として扱う)。
 * - 味方ユニットがいるマスは通過できるが、そこで停止(移動先に選択)はできない。
 * - 開始マス(その場で待機)は常に移動先候補に含む。
 */
export function calculateMovementRange(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
): MovementRange {
  const dist = computeReachableCosts(unit, map, units);

  // 到達マスから、他ユニットが占有しているマス(停止不可)を除外して結果を作る。
  // 開始マスは自ユニットが占有しているが、その場で待機できるため含める。
  const result: ReachableTile[] = [];
  for (const [key, cost] of dist) {
    const pos = fromKey(key);
    const occupant = units.getUnitAt(pos);
    if (occupant && occupant !== unit) {
      continue;
    }
    result.push({ position: pos, cost });
  }

  return new MovementRange(result);
}

/**
 * 指定ユニットが移動範囲内で合流できる、味方の同種ユニットを列挙する。
 *
 * 味方ユニットのいるマスは通常「通過はできるが停止できない」が、合流の場合は
 * そのマスへ進んで同種の味方に合流できる(移動先として選べる)。
 * 合流の可否(同じ軍・同じ種別・双方 HP が減っている)は canMerge で判定する。
 * unit 自身が満タンのときは合流の意味がないため、空配列を返す。
 */
export function findMergeTargets(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
): Unit[] {
  if (unit.currentHp >= unit.maxHp) {
    return [];
  }
  const dist = computeReachableCosts(unit, map, units);
  const targets: Unit[] = [];
  for (const key of dist.keys()) {
    const occupant = units.getUnitAt(fromKey(key));
    if (occupant && canMerge(unit, occupant)) {
      targets.push(occupant);
    }
  }
  return targets;
}

/**
 * 指定ユニットが移動範囲内で搭乗できる、味方の輸送ユニット(輸送ヘリ)を列挙する。
 *
 * 味方ユニットのいるマスは通常「通過はできるが停止できない」が、搭乗の場合は
 * そのマスへ進んで味方の輸送ユニットに乗り込める(移動先として選べる)。
 * 搭乗の可否(同じ軍・輸送可能な種別・空きあり)は canCarry で判定する。
 * unit が輸送可能な種別でない場合は、該当する輸送ユニットが見つからず空配列を返す。
 */
export function findTransportTargets(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
): Unit[] {
  const dist = computeReachableCosts(unit, map, units);
  const targets: Unit[] = [];
  for (const key of dist.keys()) {
    const occupant = units.getUnitAt(fromKey(key));
    if (occupant && canCarry(occupant, unit)) {
      targets.push(occupant);
    }
  }
  return targets;
}

/**
 * 輸送ユニットが運んでいるユニットを降ろせる、隣接マスの一覧を返す。
 *
 * 条件:
 * - 輸送ユニットの上下左右いずれかの隣接マスであること
 * - 搭乗しているユニットの移動タイプで進入できる地形であること(進入不可地形は除く)
 * - 他ユニットがいないこと(空きマス)
 * 何も運んでいない場合は空配列を返す。
 */
export function findUnloadPositions(
  transport: Unit,
  map: MapManager,
  units: UnitManager,
): GridPosition[] {
  const passenger = transport.carried;
  if (!passenger) {
    return [];
  }
  const result: GridPosition[] = [];
  for (const { dc, dr } of NEIGHBOR_OFFSETS) {
    const pos = gridPosition(transport.position.col + dc, transport.position.row + dr);
    if (map.getMoveCost(pos, passenger.movementType) === null) {
      continue;
    }
    if (units.getUnitAt(pos)) {
      continue;
    }
    result.push(pos);
  }
  return result;
}
