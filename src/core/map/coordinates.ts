// グリッド座標と画面(ピクセル)座標の相互変換。描画には依存しない純粋な計算。

import { gridPosition, type GridPosition } from '@/core/map/GridPosition';

/** グリッド座標 → そのマスの左上ピクセル座標 */
export function gridToWorld(
  pos: GridPosition,
  tileSize: number,
): { x: number; y: number } {
  return { x: pos.col * tileSize, y: pos.row * tileSize };
}

/** グリッド座標 → そのマスの中心ピクセル座標 */
export function gridToWorldCenter(
  pos: GridPosition,
  tileSize: number,
): { x: number; y: number } {
  return {
    x: pos.col * tileSize + tileSize / 2,
    y: pos.row * tileSize + tileSize / 2,
  };
}

/** ピクセル座標 → そのマスのグリッド座標(範囲チェックはしない) */
export function worldToGrid(x: number, y: number, tileSize: number): GridPosition {
  return gridPosition(Math.floor(x / tileSize), Math.floor(y / tileSize));
}
