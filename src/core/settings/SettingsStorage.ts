// ゲーム設定(敵の行動アニメ・モード選択の内容)の保存先を扱う。Phaser には依存しない。
// 中断データ(SaveStorage)とは別のキーで持ち、ゲームを中断・再開しても、
// マップ選択画面へ戻っても選んだ設定が残るようにする。
// localStorage が使えない環境(SSR・テスト・プライベートモード等)では静かに失敗し、
// 既定値で動き続ける(設定が保存できないだけでゲーム進行は止めない)。

import {
  DEFAULT_GAME_MODE,
  isPlayerSide,
  isVersusMode,
  type GameMode,
} from '@/core/mode/GameMode';
import { defaultStorage, type SaveStorageLike } from '@/core/save/SaveStorage';
import {
  DEFAULT_ENEMY_ANIMATION_MODE,
  isEnemyAnimationMode,
  type EnemyAnimationMode,
} from '@/data/enemyAnimation';

/** ゲーム設定を保存する localStorage のキー */
export const SETTINGS_STORAGE_KEY = 'gridwars:settings';

/** 保存するゲーム設定 */
export interface GameSettings {
  /** 敵の行動アニメ(敵軍の手番をどこまで描画するか) */
  readonly enemyAnimationMode: EnemyAnimationMode;
  /** モード選択画面で選んだ遊び方(担当サイド・操作の設定) */
  readonly gameMode: GameMode;
}

/** 保存が無い・壊れているときに使う既定の設定 */
export function defaultSettings(): GameSettings {
  return {
    enemyAnimationMode: DEFAULT_ENEMY_ANIMATION_MODE,
    gameMode: DEFAULT_GAME_MODE,
  };
}

/**
 * 保存済みのゲーム設定を読み込む。
 * 保存が無い、JSON として壊れている、知らない値が入っている項目は既定値で補う。
 */
export function readSettings(
  storage: SaveStorageLike | null = defaultStorage(),
): GameSettings {
  const fallback = defaultSettings();
  if (!storage) {
    return fallback;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return fallback;
  }
  if (raw === null) {
    return fallback;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return fallback;
  }
  const record = parsed as {
    enemyAnimationMode?: unknown;
    gameMode?: unknown;
  };
  const mode = record.enemyAnimationMode;
  const gameMode = isRecord(record.gameMode) ? record.gameMode : {};
  return {
    enemyAnimationMode: isEnemyAnimationMode(mode) ? mode : fallback.enemyAnimationMode,
    gameMode: {
      side: isPlayerSide(gameMode.side) ? gameMode.side : fallback.gameMode.side,
      versus: isVersusMode(gameMode.versus) ? gameMode.versus : fallback.gameMode.versus,
    },
  };
}

/** 値がオブジェクト(配列・null を除く)かどうか */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ゲーム設定を保存する。保存できたら true を返す */
export function writeSettings(
  settings: GameSettings,
  storage: SaveStorageLike | null = defaultStorage(),
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

/** 敵の行動アニメの設定だけを読み込む(ゲーム開始時の読み出しに使う) */
export function readEnemyAnimationMode(
  storage: SaveStorageLike | null = defaultStorage(),
): EnemyAnimationMode {
  return readSettings(storage).enemyAnimationMode;
}

/** 敵の行動アニメの設定だけを保存する(設定ウィンドウでの変更時に使う) */
export function writeEnemyAnimationMode(
  mode: EnemyAnimationMode,
  storage: SaveStorageLike | null = defaultStorage(),
): boolean {
  return writeSettings({ ...readSettings(storage), enemyAnimationMode: mode }, storage);
}

/** モード選択の内容だけを読み込む(マップ選択・インゲームの開始時に使う) */
export function readGameMode(
  storage: SaveStorageLike | null = defaultStorage(),
): GameMode {
  return readSettings(storage).gameMode;
}

/** モード選択の内容だけを保存する(モード選択画面での変更時に使う) */
export function writeGameMode(
  mode: GameMode,
  storage: SaveStorageLike | null = defaultStorage(),
): boolean {
  return writeSettings({ ...readSettings(storage), gameMode: mode }, storage);
}
