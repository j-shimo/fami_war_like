// ゲーム全体の基本設定。バランス調整に関わる数値はデータとして分離しておく。

/** 1マスのピクセルサイズ */
export const TILE_SIZE = 48;

/** マップのグリッド数(横)の既定値。実際のサイズはマップ定義から決まる */
export const MAP_COLS = 10;

/** マップのグリッド数(縦)の既定値。実際のサイズはマップ定義から決まる */
export const MAP_ROWS = 10;

/** 情報表示パネルのピクセル幅(マップ右側に配置) */
export const INFO_PANEL_WIDTH = 200;

/**
 * マップ表示領域(ビューポート)の最大マス数。
 * これを超える大きさのマップは縮小せず、ドラッグ(スワイプ)でスクロールして
 * 全体を見られるようにする。既定の 10x10 マップはこの範囲に収まるため従来どおり全体を表示する。
 */
export const MAX_MAP_VIEW_COLS = 10;
export const MAX_MAP_VIEW_ROWS = 10;

/**
 * マップのグリッド数から画面各部のピクセル寸法を求める。
 * マップごとに縦横のマス数が異なるため、描画・入力判定はこの値を基準にする。
 * マップ全体のピクセルサイズ(mapWidth/mapHeight)と、実際に画面へ映す
 * ビューポートのサイズ(viewWidth/viewHeight)を分けて持つ。
 * ビューポートより大きいマップはドラッグでスクロールする。
 */
export interface GameDimensions {
  /** マップ描画領域(全体)のピクセル幅 */
  readonly mapWidth: number;
  /** マップ描画領域(全体)のピクセル高さ */
  readonly mapHeight: number;
  /** マップを映すビューポートのピクセル幅(マップが大きいときはマップより小さくなる) */
  readonly viewWidth: number;
  /** マップを映すビューポートのピクセル高さ */
  readonly viewHeight: number;
  /** ゲーム画面のピクセル幅(ビューポート + 情報パネル) */
  readonly gameWidth: number;
  /** ゲーム画面のピクセル高さ(= ビューポート高さ) */
  readonly gameHeight: number;
}

/** マス数から画面寸法を計算する */
export function computeGameDimensions(cols: number, rows: number): GameDimensions {
  const mapWidth = TILE_SIZE * cols;
  const mapHeight = TILE_SIZE * rows;
  // ビューポートは最大マス数で頭打ちにする。これを超えたぶんはスクロールで見る。
  const viewWidth = TILE_SIZE * Math.min(cols, MAX_MAP_VIEW_COLS);
  const viewHeight = TILE_SIZE * Math.min(rows, MAX_MAP_VIEW_ROWS);
  return {
    mapWidth,
    mapHeight,
    viewWidth,
    viewHeight,
    gameWidth: viewWidth + INFO_PANEL_WIDTH,
    gameHeight: viewHeight,
  };
}

/** 既定マップサイズ(10x10)での画面寸法。起動時のキャンバス初期サイズに使う */
export const DEFAULT_DIMENSIONS = computeGameDimensions(MAP_COLS, MAP_ROWS);

/** マップ描画領域のピクセル幅(既定サイズ) */
export const MAP_WIDTH = DEFAULT_DIMENSIONS.mapWidth;

/** マップ描画領域のピクセル高さ(既定サイズ) */
export const MAP_HEIGHT = DEFAULT_DIMENSIONS.mapHeight;

/** ゲーム画面のピクセル幅(既定サイズ) */
export const GAME_WIDTH = DEFAULT_DIMENSIONS.gameWidth;

/** ゲーム画面のピクセル高さ(既定サイズ) */
export const GAME_HEIGHT = DEFAULT_DIMENSIONS.gameHeight;
