// ゲーム設定(いまは「敵の行動アニメ」のみ)の保存先を扱う。Phaser には依存しない。
// 中断データ(SaveStorage)とは別のキーで持ち、ゲームを中断・再開しても、
// マップ選択画面へ戻っても選んだ設定が残るようにする。
// localStorage が使えない環境(SSR・テスト・プライベートモード等)では静かに失敗し、
// 既定値で動き続ける(設定が保存できないだけでゲーム進行は止めない)。

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
}

/** 保存が無い・壊れているときに使う既定の設定 */
export function defaultSettings(): GameSettings {
  return { enemyAnimationMode: DEFAULT_ENEMY_ANIMATION_MODE };
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
  const mode = (parsed as { enemyAnimationMode?: unknown }).enemyAnimationMode;
  return {
    enemyAnimationMode: isEnemyAnimationMode(mode) ? mode : fallback.enemyAnimationMode,
  };
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
