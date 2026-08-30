import { describe, expect, it } from 'vitest';
import {
  addClear,
  clearAllProgress,
  clearRecordOf,
  CLEAR_PROGRESS_STORAGE_KEY,
  CLEAR_PROGRESS_VERSION,
  emptyClearProgress,
  isMapCleared,
  readClearProgress,
  recordMapClear,
  writeClearProgress,
} from '@/core/progress/ClearProgress';
import type { SaveStorageLike } from '@/core/save/SaveStorage';

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

/** 読み書きが必ず失敗する保存先(プライベートモード・容量超過などの再現) */
class BrokenStorage implements SaveStorageLike {
  getItem(): string | null {
    throw new Error('読み込めません');
  }

  setItem(): void {
    throw new Error('書き込めません');
  }

  removeItem(): void {
    throw new Error('削除できません');
  }
}

describe('ClearProgress(マップのクリア状況)', () => {
  it('保存が無ければクリア状況なしを返す', () => {
    expect(readClearProgress(new MemoryStorage())).toEqual(emptyClearProgress());
    expect(emptyClearProgress().cleared).toEqual({});
  });

  it('記録したクリアを読み戻せる', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', nightBattle: false, clearedAt: 100 }, storage);

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, 'capture')).toBe(true);
    expect(clearRecordOf(progress, 'capture')).toEqual({
      clearedAt: 100,
      clearCount: 1,
      nightCleared: false,
    });
  });

  it('専用のキーへ保存する(中断データ・設定とは別に残る)', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', nightBattle: false }, storage);
    expect(storage.items.has(CLEAR_PROGRESS_STORAGE_KEY)).toBe(true);
  });

  it('未クリアのマップはクリア済みにならない', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', nightBattle: false }, storage);

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, 'test')).toBe(false);
    expect(clearRecordOf(progress, 'test')).toBeNull();
  });

  it('同じマップを再クリアするとクリア回数が増え、時刻が新しくなる', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', nightBattle: false, clearedAt: 100 }, storage);
    recordMapClear({ mapId: 'capture', nightBattle: false, clearedAt: 200 }, storage);

    expect(clearRecordOf(readClearProgress(storage), 'capture')).toEqual({
      clearedAt: 200,
      clearCount: 2,
      nightCleared: false,
    });
  });

  it('夜戦クリアの記録は積み上がり、通常戦のクリアで消えない', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', nightBattle: true, clearedAt: 100 }, storage);
    expect(clearRecordOf(readClearProgress(storage), 'capture')?.nightCleared).toBe(true);

    recordMapClear({ mapId: 'capture', nightBattle: false, clearedAt: 200 }, storage);
    expect(clearRecordOf(readClearProgress(storage), 'capture')?.nightCleared).toBe(true);
  });

  it('addClear は元のクリア状況を書き換えない', () => {
    const before = emptyClearProgress();
    const after = addClear(before, { mapId: 'capture', nightBattle: false });

    expect(isMapCleared(before, 'capture')).toBe(false);
    expect(isMapCleared(after, 'capture')).toBe(true);
  });

  it('壊れた JSON はクリア状況なしとして扱う', () => {
    const storage = new MemoryStorage();
    storage.setItem(CLEAR_PROGRESS_STORAGE_KEY, '{壊れた');
    expect(readClearProgress(storage)).toEqual(emptyClearProgress());
  });

  it('バージョンが違う保存は読み捨てる', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CLEAR_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        version: CLEAR_PROGRESS_VERSION + 1,
        cleared: { capture: { clearedAt: 1, clearCount: 1, nightCleared: false } },
      }),
    );
    expect(readClearProgress(storage)).toEqual(emptyClearProgress());
  });

  it('壊れた記録だけを捨て、正しい記録は残す', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CLEAR_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        version: CLEAR_PROGRESS_VERSION,
        cleared: {
          capture: { clearedAt: 1, clearCount: 1, nightCleared: false },
          broken: { clearedAt: 'いつか', clearCount: 0 },
        },
      }),
    );

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, 'capture')).toBe(true);
    expect(isMapCleared(progress, 'broken')).toBe(false);
  });

  it('クリア状況をすべて消せる', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', nightBattle: false }, storage);
    clearAllProgress(storage);
    expect(readClearProgress(storage)).toEqual(emptyClearProgress());
  });

  it('保存先が無い・壊れている環境でも例外を投げない', () => {
    expect(readClearProgress(null)).toEqual(emptyClearProgress());
    expect(readClearProgress(new BrokenStorage())).toEqual(emptyClearProgress());
    expect(writeClearProgress(emptyClearProgress(), null)).toBe(false);
    expect(writeClearProgress(emptyClearProgress(), new BrokenStorage())).toBe(false);
    expect(() => clearAllProgress(new BrokenStorage())).not.toThrow();

    // 保存できなくても、その場のクリア状況としては記録後の値を返す
    const progress = recordMapClear(
      { mapId: 'capture', nightBattle: false },
      new BrokenStorage(),
    );
    expect(isMapCleared(progress, 'capture')).toBe(true);
  });
});
