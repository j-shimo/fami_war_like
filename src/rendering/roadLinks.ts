// 道路・線路・川タイルが上下左右のどの隣接マスと「つながって見えるか」を判定する。
// Phaser には依存しない純粋なロジックとして実装し、Vitest でテストする。
// 描画側(terrainDecoration)はこの結果を使って道路の帯と中央線、線路のレール、川の流れを描く。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import { getTerrainData } from '@/data/terrainData';

/** 道路・線路・川が各方向の隣接マスへつながっているか */
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

/**
 * 指定座標の隣接マスが線路として連結して見えるかを返す。
 * 線路どうしに加えて、線路の終端にあたる駅も接続先とみなす
 * (道路や他の拠点へはつながらない。線路は駅と駅を結ぶ専用の帯として描く)。
 */
function isRailConnectable(map: MapManager, pos: GridPosition): boolean {
  const tile = map.getTile(pos);
  if (!tile) {
    return false;
  }
  return tile.terrainType === 'railway' || tile.terrainType === 'station';
}

/**
 * 指定した線路マスについて、上下左右それぞれへ線路が続いているかを判定する。
 * 描画時に隣接方向へレールと枕木を伸ばすために使う。
 */
export function computeRailLinks(map: MapManager, pos: GridPosition): RoadLinks {
  const { col, row } = pos;
  return {
    up: isRailConnectable(map, gridPosition(col, row - 1)),
    down: isRailConnectable(map, gridPosition(col, row + 1)),
    left: isRailConnectable(map, gridPosition(col - 1, row)),
    right: isRailConnectable(map, gridPosition(col + 1, row)),
  };
}

/**
 * 指定座標の隣接マスが川として連結して見えるかを返す。
 * 川どうしに加えて、川が注ぎ込む先の水面(海・海岸・港)も接続先とみなす
 * (陸地へはつながらない。川は水の流れとして描く)。
 */
function isRiverConnectable(map: MapManager, pos: GridPosition): boolean {
  const tile = map.getTile(pos);
  if (!tile) {
    return false;
  }
  return (
    tile.terrainType === 'river' ||
    tile.terrainType === 'sea' ||
    tile.terrainType === 'beach' ||
    tile.terrainType === 'port'
  );
}

/**
 * 指定した川マスについて、上下左右それぞれへ水面が続いているかを判定する。
 * 描画時に流れの向き(横に流れる川か、縦に流れる川か)を決めるために使う。
 */
export function computeRiverLinks(map: MapManager, pos: GridPosition): RoadLinks {
  const { col, row } = pos;
  return {
    up: isRiverConnectable(map, gridPosition(col, row - 1)),
    down: isRiverConnectable(map, gridPosition(col, row + 1)),
    left: isRiverConnectable(map, gridPosition(col - 1, row)),
    right: isRiverConnectable(map, gridPosition(col + 1, row)),
  };
}
