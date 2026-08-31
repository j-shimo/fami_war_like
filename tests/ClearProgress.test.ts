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
  sideClearRecords,
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
    expect(sideClearRecords(emptyClearProgress(), '1p')).toEqual({});
    expect(sideClearRecords(emptyClearProgress(), '2p')).toEqual({});
  });

  it('記録したクリアを読み戻せる', () => {
    const storage = new MemoryStorage();
    recordMapClear(
      { mapId: 'capture', side: '1p', nightBattle: false, clearedAt: 100 },
      storage,
    );

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, '1p', 'capture')).toBe(true);
    expect(clearRecordOf(progress, '1p', 'capture')).toEqual({
      clearedAt: 100,
      clearCount: 1,
      nightCleared: false,
    });
  });

  it('専用のキーへ保存する(中断データ・設定とは別に残る)', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', side: '1p', nightBattle: false }, storage);
    expect(storage.items.has(CLEAR_PROGRESS_STORAGE_KEY)).toBe(true);
  });

  it('未クリアのマップはクリア済みにならない', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', side: '1p', nightBattle: false }, storage);

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, '1p', 'test')).toBe(false);
    expect(clearRecordOf(progress, '1p', 'test')).toBeNull();
  });

  it('1P側のクリアは2P側の記録にならない(サイドごとに分けて数える)', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', side: '1p', nightBattle: false }, storage);

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, '1p', 'capture')).toBe(true);
    expect(isMapCleared(progress, '2p', 'capture')).toBe(false);
    expect(clearRecordOf(progress, '2p', 'capture')).toBeNull();
  });

  it('同じマップを両サイドでクリアすると、クリア回数はそれぞれ別に数える', () => {
    const storage = new MemoryStorage();
    recordMapClear(
      { mapId: 'capture', side: '1p', nightBattle: false, clearedAt: 100 },
      storage,
    );
    recordMapClear(
      { mapId: 'capture', side: '1p', nightBattle: false, clearedAt: 200 },
      storage,
    );
    recordMapClear(
      { mapId: 'capture', side: '2p', nightBattle: true, clearedAt: 300 },
      storage,
    );

    const progress = readClearProgress(storage);
    expect(clearRecordOf(progress, '1p', 'capture')).toEqual({
      clearedAt: 200,
      clearCount: 2,
      nightCleared: false,
    });
    expect(clearRecordOf(progress, '2p', 'capture')).toEqual({
      clearedAt: 300,
      clearCount: 1,
      nightCleared: true,
    });
  });

  it('同じマップを再クリアするとクリア回数が増え、時刻が新しくなる', () => {
    const storage = new MemoryStorage();
    recordMapClear(
      { mapId: 'capture', side: '2p', nightBattle: false, clearedAt: 100 },
      storage,
    );
    recordMapClear(
      { mapId: 'capture', side: '2p', nightBattle: false, clearedAt: 200 },
      storage,
    );

    expect(clearRecordOf(readClearProgress(storage), '2p', 'capture')).toEqual({
      clearedAt: 200,
      clearCount: 2,
      nightCleared: false,
    });
  });

  it('夜戦クリアの記録は積み上がり、通常戦のクリアで消えない', () => {
    const storage = new MemoryStorage();
    recordMapClear(
      { mapId: 'capture', side: '1p', nightBattle: true, clearedAt: 100 },
      storage,
    );
    expect(clearRecordOf(readClearProgress(storage), '1p', 'capture')?.nightCleared).toBe(
      true,
    );

    recordMapClear(
      { mapId: 'capture', side: '1p', nightBattle: false, clearedAt: 200 },
      storage,
    );
    expect(clearRecordOf(readClearProgress(storage), '1p', 'capture')?.nightCleared).toBe(
      true,
    );
  });

  it('addClear は元のクリア状況を書き換えず、もう一方のサイドの記録も残す', () => {
    const before = addClear(emptyClearProgress(), {
      mapId: 'sea',
      side: '2p',
      nightBattle: false,
    });
    const after = addClear(before, { mapId: 'capture', side: '1p', nightBattle: false });

    expect(isMapCleared(before, '1p', 'capture')).toBe(false);
    expect(isMapCleared(after, '1p', 'capture')).toBe(true);
    // もう一方のサイドの記録は足したあとも残る
    expect(isMapCleared(after, '2p', 'sea')).toBe(true);
  });

  it('壊れた JSON はクリア状況なしとして扱う', () => {
    const storage = new MemoryStorage();
    storage.setItem(CLEAR_PROGRESS_STORAGE_KEY, '{壊れた');
    expect(readClearProgress(storage)).toEqual(emptyClearProgress());
  });

  it('知らないバージョンの保存は読み捨てる', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CLEAR_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        version: CLEAR_PROGRESS_VERSION + 1,
        bySide: {
          '1p': { capture: { clearedAt: 1, clearCount: 1, nightCleared: false } },
        },
      }),
    );
    expect(readClearProgress(storage)).toEqual(emptyClearProgress());
  });

  it('サイドを分けていなかった旧形式(バージョン 1)は1P側の記録として引き継ぐ', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CLEAR_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        cleared: { capture: { clearedAt: 1, clearCount: 3, nightCleared: true } },
      }),
    );

    const progress = readClearProgress(storage);
    expect(progress.version).toBe(CLEAR_PROGRESS_VERSION);
    expect(clearRecordOf(progress, '1p', 'capture')).toEqual({
      clearedAt: 1,
      clearCount: 3,
      nightCleared: true,
    });
    expect(isMapCleared(progress, '2p', 'capture')).toBe(false);
  });

  it('壊れた記録だけを捨て、正しい記録は残す', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      CLEAR_PROGRESS_STORAGE_KEY,
      JSON.stringify({
        version: CLEAR_PROGRESS_VERSION,
        bySide: {
          '1p': {
            capture: { clearedAt: 1, clearCount: 1, nightCleared: false },
            broken: { clearedAt: 'いつか', clearCount: 0 },
          },
          '2p': 'こわれている',
        },
      }),
    );

    const progress = readClearProgress(storage);
    expect(isMapCleared(progress, '1p', 'capture')).toBe(true);
    expect(isMapCleared(progress, '1p', 'broken')).toBe(false);
    expect(sideClearRecords(progress, '2p')).toEqual({});
  });

  it('クリア状況をすべて消せる(両サイドぶん消える)', () => {
    const storage = new MemoryStorage();
    recordMapClear({ mapId: 'capture', side: '1p', nightBattle: false }, storage);
    recordMapClear({ mapId: 'capture', side: '2p', nightBattle: false }, storage);
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
      { mapId: 'capture', side: '1p', nightBattle: false },
      new BrokenStorage(),
    );
    expect(isMapCleared(progress, '1p', 'capture')).toBe(true);
  });
});
