// ゲーム全体の基本設定。バランス調整に関わる数値はデータとして分離しておく。

/** 1マスのピクセルサイズ */
export const TILE_SIZE = 48;

/** マップのグリッド数(横) */
export const MAP_COLS = 10;

/** マップのグリッド数(縦) */
export const MAP_ROWS = 10;

/** ゲーム画面のピクセル幅 */
export const GAME_WIDTH = TILE_SIZE * MAP_COLS;

/** ゲーム画面のピクセル高さ */
export const GAME_HEIGHT = TILE_SIZE * MAP_ROWS;
