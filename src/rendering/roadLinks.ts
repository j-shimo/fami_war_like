// 道路タイルが上下左右のどの隣接マスと「つながって見えるか」を判定する。
// Phaser には依存しない純粋なロジックとして実装し、Vitest でテストする。
// 描画側(terrainDecoration)はこの結果を使って道路の帯と中央線を描く。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import { getTerrainData } from '@/data/terrainData';

/** 道路が各方向の隣接マスへつながっているか */
export interface RoadLinks {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

/**
 * 指定座標の隣接マスが道路として連結して見えるかを返す。
 * 道路どうしはもちろん、占領拠点(都市・工場・本拠地)も道路の接続先とみなし、
 * 拠点へ道が自然につながって見えるようにする。
 */
function isConnectable(map: MapManager, pos: GridPosition): boolean {
  const tile = map.getTile(pos);
  if (!tile) {
    return false;
  }
  if (tile.terrainType === 'road') {
    return true;
  }
  return getTerrainData(tile.terrainType).canCapture;
}

/**
 * 指定した道路マスについて、上下左右それぞれへ道路が続いているかを判定する。
 * 描画時に隣接方向へアスファルトの帯を伸ばすために使う。
 */
export function computeRoadLinks(map: MapManager, pos: GridPosition): RoadLinks {
  const { col, row } = pos;
  return {
    up: isConnectable(map, gridPosition(col, row - 1)),
    down: isConnectable(map, gridPosition(col, row + 1)),
    left: isConnectable(map, gridPosition(col - 1, row)),
    right: isConnectable(map, gridPosition(col + 1, row)),
  };
}
