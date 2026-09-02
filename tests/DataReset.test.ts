import { describe, expect, it } from 'vitest';
import {
  CLEAR_PROGRESS_STORAGE_KEY,
  readClearProgress,
  recordMapClear,
} from '@/core/progress/ClearProgress';
import { resetClearData } from '@/core/progress/DataReset';
import {
  SAVE_STORAGE_KEY,
  readSuspendData,
  type SaveStorageLike,
} from '@/core/save/SaveStorage';
import { SETTINGS_STORAGE_KEY, readSettings } from '@/core/settings/SettingsStorage';

/** localStorage の代わりに使うメモリ上の保存先 */
class MemoryStorage implements SaveStorageLike {
  readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** 削除が必ず失敗する保存先(プライベートモードなどの再現) */
class BrokenStorage extends MemoryStorage {
  override removeItem(): void {
    throw new Error('消せません');
  }
}

describe('resetClearData', () => {
  it('クリア状況と中断データを両方とも消す', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'test', side: '1p', nightBattle: false }, storage);
    // 中断データは JSON の中身まで検証されるため、消えたことはキーの有無で確かめる
    storage.setItem(SAVE_STORAGE_KEY, '{"version":7}');

    resetClearData(storage);

    expect(storage.items.has(CLEAR_PROGRESS_STORAGE_KEY)).toBe(false);
    expect(storage.items.has(SAVE_STORAGE_KEY)).toBe(false);
    // 読み直しても「記録なし」の状態に戻っている
    expect(readClearProgress(storage).bySide['1p']).toEqual({});
    expect(readSuspendData(storage)).toBeNull();
  });

  it('ゲーム設定(担当サイド・操作の設定など)は消さない', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'test', side: '2p', nightBattle: true }, storage);
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        enemyAnimationMode: 'instant',
        gameMode: { side: '2p', versus: 'human' },
      }),
    );

    resetClearData(storage);

    const settings = readSettings(storage);
    expect(settings.enemyAnimationMode).toBe('instant');
    expect(settings.gameMode).toEqual({ side: '2p', versus: 'human' });
  });

  it('何も保存されていなくても、保存先が無くても失敗しない', () => {
    expect(() => resetClearData(new MemoryStorage())).not.toThrow();
    expect(() => resetClearData(null)).not.toThrow();
  });

  it('削除できない保存先でも例外を投げない(遊べる状態は保つ)', () => {
    expect(() => resetClearData(new BrokenStorage())).not.toThrow();
  });
});
