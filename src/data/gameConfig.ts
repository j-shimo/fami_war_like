// ゲーム全体の基本設定。バランス調整に関わる数値はデータとして分離しておく。

/** 1マスのピクセルサイズ */
export const TILE_SIZE = 48;

/** マップのグリッド数(横) */
export const MAP_COLS = 10;

/** マップのグリッド数(縦) */
export const MAP_ROWS = 10;

/** マップ描画領域のピクセル幅 */
export const MAP_WIDTH = TILE_SIZE * MAP_COLS;

/** マップ描画領域のピクセル高さ */
export const MAP_HEIGHT = TILE_SIZE * MAP_ROWS;

/** 情報表示パネルのピクセル幅(マップ右側に配置) */
export const INFO_PANEL_WIDTH = 200;

/** ゲーム画面のピクセル幅(マップ + 情報パネル) */
export const GAME_WIDTH = MAP_WIDTH + INFO_PANEL_WIDTH;

/** ゲーム画面のピクセル高さ */
export const GAME_HEIGHT = MAP_HEIGHT;
