// 中断データの保存先(ブラウザの localStorage)を扱う。Phaser には依存しない。
// 中断データは 1 件だけ保持し、「中断」で上書き保存、再開・破棄で削除する。
// localStorage が使えない環境(SSR・テスト・プライベートモード等)では静かに失敗し、
// ゲーム進行そのものは止めない(保存できたかどうかは戻り値で判定できる)。

import { isSaveData, type SaveData } from '@/core/save/SaveData';

/** 中断データを保存する localStorage のキー */
export const SAVE_STORAGE_KEY = 'gridwars:suspend';

/** 保存先に必要な最小限のインタフェース(テストではダミー実装を渡す) */
export interface SaveStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 既定の保存先(ブラウザの localStorage)を返す。
 * localStorage が存在しない・参照が拒否される環境では null を返す。
 */
export function defaultStorage(): SaveStorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // ブラウザ設定によっては参照そのものが例外になるため握りつぶす
    return null;
  }
}

/**
 * 中断データを保存する。保存できたら true を返す。
 * 保存先が無い、または容量超過などで書き込めなかった場合は false を返す。
 */
export function writeSuspendData(
  data: SaveData,
  storage: SaveStorageLike | null = defaultStorage(),
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/**
 * 保存済みの中断データを読み込む。
 * 保存が無い、JSON として壊れている、形式が現在のバージョンと合わない場合は null を返す。
 */
export function readSuspendData(
  storage: SaveStorageLike | null = defaultStorage(),
): SaveData | null {
  if (!storage) {
    return null;
  }
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSaveData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 保存済みの中断データを削除する(再開後・破棄時に呼ぶ) */
export function clearSuspendData(
  storage: SaveStorageLike | null = defaultStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // 削除できなくてもゲーム進行には影響しないため握りつぶす
  }
}
