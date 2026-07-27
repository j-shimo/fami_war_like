// グリッド座標を表す純粋なロジック。Phaser には依存しない。

/** マップ上のマス位置を表す座標 */
export interface GridPosition {
  readonly col: number;
  readonly row: number;
}

/** グリッド座標を生成する */
export function gridPosition(col: number, row: number): GridPosition {
  return { col, row };
}

/** 2つのグリッド座標が同じマスを指すか判定する */
export function equals(a: GridPosition, b: GridPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * 2つのグリッド座標間のマンハッタン距離を返す。
 * 射程判定や移動範囲計算の基礎に使う。
 */
export function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

/** 指定した座標がマップ範囲内かどうかを判定する */
export function isInBounds(pos: GridPosition, cols: number, rows: number): boolean {
  return pos.col >= 0 && pos.col < cols && pos.row >= 0 && pos.row < rows;
}
