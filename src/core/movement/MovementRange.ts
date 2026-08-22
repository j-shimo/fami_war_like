// ユニットの移動可能範囲を計算する。Phaser には依存しない純粋なロジック。
// 地形ごとの移動コストが異なるため、ダイクストラ法で最小コストの到達範囲を求める。
// docs/DevelopmentPlan.md Phase 4 参照。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import { canMerge } from '@/core/units/merge';
import { canCarry } from '@/core/units/transport';

/**
 * 移動範囲・経路の計算オプション。
 * 夜戦(暗い盤面)では「見えていない敵」を通過できるものとして扱うために使う。
 */
export interface MovementOptions {
  /**
   * 夜戦で、その敵ユニットが自軍から見えていないかを判定する述語。
   * 見えていない敵のいるマスはプレイヤーには空きマスに見えるため、移動範囲の計算では
   * 通過できるものとして扱う(実際にそこへ踏み込むと 1 つ手前で強制待機になる)。
   * 省略した場合(昼戦)は、敵ユニットのいるマスは常に進入不可として扱う。
   */
  readonly isHiddenEnemy?: (unit: Unit) => boolean;
}

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

/** ダイクストラ法の計算結果(各マスへの最小コストと、そこへ至る 1 つ手前のマス) */
interface ReachableCosts {
  /** マスキー → 開始マスからの最小移動コスト */
  readonly dist: Map<string, number>;
  /** マスキー → そのマスへ最小コストで来るときの 1 つ手前のマスキー(開始マスは持たない) */
  readonly prev: Map<string, string>;
}

/**
 * 指定ユニットが到達できるマスへの最小移動コストをダイクストラ法で求める。
 * 味方ユニットが占有しているマスも含めて返す(そこで停止できるかは呼び出し側で判断する)。
 *
 * ルール:
 * - 地形ごとの移動コストを移動タイプ別に加算し、移動力以内で到達できるマスを求める。
 * - 進入不可地形(移動コスト null)には入れない。
 * - 敵ユニットがいるマスは通過も停止もできない(進入不可として扱う)。
 *   ただし夜戦で見えていない敵(options.isHiddenEnemy)は空きマスと同じく通過できる扱いにする。
 * - 味方ユニットがいるマスは通過できる(そのマスも到達マスとして返す)。
 */
function computeReachableCosts(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
  options: MovementOptions = {},
): ReachableCosts {
  const movementType = unit.movementType;
  const maxMove = unit.movement;
  const start = unit.position;

  // 各マスへの暫定最小コスト
  const dist = new Map<string, number>([[toKey(start), 0]]);
  // 各マスへ最小コストで至る 1 つ手前のマス(移動経路の復元に使う)
  const prev = new Map<string, string>();
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

      // 敵ユニットのいるマスは通過も停止もできない。
      // ただし夜戦で見えていない敵は、プレイヤーには空きマスに見えるため通過できる扱いにする。
      const occupant = units.getUnitAt(next);
      if (
        occupant &&
        occupant.armyType !== unit.armyType &&
        !(options.isHiddenEnemy?.(occupant) ?? false)
      ) {
        continue;
      }

      const nextCost = currentCost + moveCost;
      if (nextCost > maxMove) {
        continue;
      }

      const known = dist.get(nextKey);
      if (known === undefined || nextCost < known) {
        dist.set(nextKey, nextCost);
        prev.set(nextKey, currentKey);
      }
    }
  }

  return { dist, prev };
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
  options: MovementOptions = {},
): MovementRange {
  const { dist } = computeReachableCosts(unit, map, units, options);

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
  options: MovementOptions = {},
): Unit[] {
  if (unit.currentHp >= unit.maxHp) {
    return [];
  }
  const { dist } = computeReachableCosts(unit, map, units, options);
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
 * 指定ユニットが移動範囲内で搭乗できる、味方の輸送ユニット(輸送ヘリ・輸送艦)を列挙する。
 *
 * 味方ユニットのいるマスは通常「通過はできるが停止できない」が、搭乗の場合は
 * そのマスへ進んで味方の輸送ユニットに乗り込める(移動先として選べる)。
 * 搭乗の可否(同じ軍・輸送可能な種別・空きあり)は canCarry で判定する。
 * unit が輸送可能な種別でない場合は、該当する輸送ユニットが見つからず空配列を返す。
 * 海上にいる輸送艦へは地上ユニットが進入できないため、実際に乗り込めるのは
 * 港に停泊している輸送艦(地上ユニットが到達できるマス)に限られる。
 */
export function findTransportTargets(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
  options: MovementOptions = {},
): Unit[] {
  const { dist } = computeReachableCosts(unit, map, units, options);
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
 * - 降ろすユニットの移動タイプで進入できる地形であること(進入不可地形は除く)
 * - 他ユニットがいないこと(空きマス)
 *
 * 複数体を運べる輸送艦では、降ろす 1 体を passenger で指定する
 * (省略時は先頭の搭乗ユニット)。何も運んでいない場合は空配列を返す。
 */
export function findUnloadPositions(
  transport: Unit,
  map: MapManager,
  units: UnitManager,
  passenger?: Unit,
): GridPosition[] {
  const target = passenger ?? transport.carried[0];
  if (!target) {
    return [];
  }
  const result: GridPosition[] = [];
  for (const { dc, dr } of NEIGHBOR_OFFSETS) {
    const pos = gridPosition(transport.position.col + dc, transport.position.row + dr);
    if (map.getMoveCost(pos, target.movementType) === null) {
      continue;
    }
    if (units.getUnitAt(pos)) {
      continue;
    }
    result.push(pos);
  }
  return result;
}

/** 移動経路の解決結果。夜戦で見えない敵に阻まれた場合の強制待機を表現する */
export interface MovePathResult {
  /** 開始マスから destination までの実際に通るマスの列(先頭は開始マス) */
  readonly path: readonly GridPosition[];
  /** 実際に停止するマス。阻まれなければ指定した移動先そのもの */
  readonly destination: GridPosition;
  /**
   * 移動経路上で見つかった、見えていなかった敵ユニット(いなければ null)。
   * この敵に阻まれた場合、ユニットは 1 つ手前のマスで強制待機になる。
   */
  readonly blockedBy: Unit | null;
}

/**
 * 指定ユニットが dest へ移動するときの経路と、実際に停止するマスを求める。
 *
 * 夜戦では見えていない敵のマスも通過できるものとして移動範囲を計算するため、
 * 実際に動かすと経路上でその敵に出くわすことがある。その場合は仕様どおり
 * 「1 つ手前のマス」で止める(強制待機)。手前のマスが味方で埋まっている場合は、
 * さらに手前の空きマスまで下がる(最後は開始マス)。
 *
 * dest へ到達できない場合は、開始マスに留まる結果を返す。
 */
export function resolveMovePath(
  unit: Unit,
  map: MapManager,
  units: UnitManager,
  dest: GridPosition,
  options: MovementOptions = {},
): MovePathResult {
  const start = unit.position;
  const { dist, prev } = computeReachableCosts(unit, map, units, options);

  const destKey = toKey(dest);
  if (!dist.has(destKey)) {
    return { path: [start], destination: start, blockedBy: null };
  }

  // 移動先から prev をたどって経路を復元する(復元後に開始マス → 移動先の順へ直す)
  const path: GridPosition[] = [];
  let key: string | undefined = destKey;
  while (key !== undefined) {
    path.push(fromKey(key));
    key = prev.get(key);
  }
  path.reverse();

  // 経路上で最初に出くわす「見えていなかった敵」を探す
  for (let i = 1; i < path.length; i++) {
    const occupant = units.getUnitAt(path[i]);
    if (
      !occupant ||
      occupant.armyType === unit.armyType ||
      !(options.isHiddenEnemy?.(occupant) ?? false)
    ) {
      continue;
    }
    // 1 つ手前のマスへ止まる。埋まっていればさらに手前へ下がる(開始マスは必ず空き)
    let stopIndex = i - 1;
    while (stopIndex > 0) {
      const blocker = units.getUnitAt(path[stopIndex]);
      if (!blocker || blocker === unit) {
        break;
      }
      stopIndex -= 1;
    }
    return {
      path: path.slice(0, stopIndex + 1),
      destination: path[stopIndex],
      blockedBy: occupant,
    };
  }

  return { path, destination: dest, blockedBy: null };
}
