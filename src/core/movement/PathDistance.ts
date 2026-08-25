// 地形だけを見た「実際に通れる経路の長さ」を求める。Phaser には依存しない純粋なロジック。
//
// calculateMovementRange() が「1 手番で届く範囲」を求めるのに対し、こちらは移動力の上限を
// 設けずマップ全体の経路コストを求める。敵AIが遠くの目標(中立都市・敵本拠地)を選んだり、
// 山や海に阻まれた目標へ回り道して近づいたりするために使う。
//
// ユニットの配置は考慮しない。何ターンもかけて向かう先を決めるための距離であり、
// そのときどこに誰が立っているかは移動するころには変わっているため。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';

/** 隣接 4 方向のオフセット(斜め移動はしない) */
const NEIGHBOR_OFFSETS: readonly { readonly dc: number; readonly dr: number }[] = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

/**
 * 進入できない目標マスへ向かうときに、その 1 マスぶんへ仮に与える移動コスト。
 * 例えば海上ユニットが陸の本拠地を目標にする場合、その本拠地には入れないが
 * 「隣接マスがいちばん近い」と順位付けできるようにするための仮の値。
 */
const IMPASSABLE_GOAL_COST = 1;

/** マップキー(座標を一意な文字列にする) */
function toKey(pos: GridPosition): string {
  return `${pos.col},${pos.row}`;
}

/** マップキーを座標に戻す */
function fromKey(key: string): GridPosition {
  const [col, row] = key.split(',').map(Number);
  return gridPosition(col, row);
}

/** 各マスへの経路コストを引ける距離マップ */
export class PathDistanceField {
  constructor(private readonly costs: ReadonlyMap<string, number>) {}

  /** 指定マスの経路コスト。経路がつながっていないマスは undefined */
  get(pos: GridPosition): number | undefined {
    return this.costs.get(toKey(pos));
  }

  /** 経路がつながっているマスの数(0 なら目標へ通じる経路がまったくない) */
  get size(): number {
    return this.costs.size;
  }
}

/**
 * ダイクストラ法で単一始点の経路コストを求める共通処理。
 *
 * @param edgeCost 展開元のマス from から隣接マス to へ進むときに加算するコスト。
 *   進行方向の取り方(origin から / origin へ)によって、どちらのマスへ入るコストを
 *   積むかが変わるため、呼び出し側から与える。
 */
function computeField(
  map: MapManager,
  origin: GridPosition,
  movementType: MovementType,
  edgeCost: (from: GridPosition, to: GridPosition) => number | null,
): PathDistanceField {
  if (!map.getTile(origin)) {
    return new PathDistanceField(new Map());
  }

  const dist = new Map<string, number>([[toKey(origin), 0]]);
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
      // 進入不可地形・範囲外へは進めない(目標マス自体だけは始点として扱う)
      if (map.getMoveCost(next, movementType) === null) {
        continue;
      }
      const step = edgeCost(current, next);
      if (step === null) {
        continue;
      }

      const nextCost = currentCost + step;
      const known = dist.get(nextKey);
      if (known === undefined || nextCost < known) {
        dist.set(nextKey, nextCost);
      }
    }
  }

  return new PathDistanceField(dist);
}

/**
 * origin から各マスへ移動するのにかかる最小の移動コストを求める。
 * 「このユニットにとっていちばん近い拠点はどれか」を選ぶときに使う。
 * 進入できないマスは結果に含まれない(= 経路なし)。
 */
export function distancesFrom(
  map: MapManager,
  origin: GridPosition,
  movementType: MovementType,
): PathDistanceField {
  // origin から進むので、入る先のマス(to)の移動コストを積む
  return computeField(map, origin, movementType, (_from, to) =>
    map.getMoveCost(to, movementType),
  );
}

/**
 * 各マスから target へ移動するのにかかる最小の移動コストを求める。
 * 「目標へいちばん近づけるマスはどこか」を選ぶときに使う。
 * target 自身が進入不可地形の場合は、その 1 マスぶんを仮のコスト
 * (IMPASSABLE_GOAL_COST)として扱い、隣接マスが最短になるようにする。
 */
export function distancesTo(
  map: MapManager,
  target: GridPosition,
  movementType: MovementType,
): PathDistanceField {
  // target へ向かって進むので、逆向きに展開する。展開元のマス(from)へ入るコストを積むと、
  // 進行方向で通るマスのコストと一致する。
  return computeField(
    map,
    target,
    movementType,
    (from) => map.getMoveCost(from, movementType) ?? IMPASSABLE_GOAL_COST,
  );
}
