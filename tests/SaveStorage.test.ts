import { beforeEach, describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { MapManager } from '@/core/map/MapManager';
import { createSaveData, SAVE_VERSION, type SaveData } from '@/core/save/SaveData';
import {
  clearSuspendData,
  readSuspendData,
  SAVE_STORAGE_KEY,
  writeSuspendData,
  type SaveStorageLike,
} from '@/core/save/SaveStorage';
import { TurnManager } from '@/core/turn/TurnManager';
import { UnitManager } from '@/core/units/UnitManager';
import { TEST_MAP } from '@/data/maps/testMap';

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

/** 書き込みが必ず失敗する保存先(容量超過などの再現) */
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

function makeSaveData(): SaveData {
  const map = MapManager.fromDefinition(TEST_MAP);
  const units = UnitManager.fromPlacements(TEST_MAP.units ?? [], map);
  return createSaveData({
    mapId: 'test',
    nightBattle: false,
    map,
    units,
    turn: new TurnManager(units),
    economy: new EconomyManager(),
  });
}

describe('SaveStorage(中断データの保存先)', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('保存した中断データを読み戻せる', () => {
    const save = makeSaveData();
    expect(writeSuspendData(save, storage)).toBe(true);
    expect(storage.items.has(SAVE_STORAGE_KEY)).toBe(true);
    expect(readSuspendData(storage)).toEqual(save);
  });

  it('保存が無ければ null を返す', () => {
    expect(readSuspendData(storage)).toBeNull();
  });

  it('壊れた JSON・形式違いのデータは null として扱う', () => {
    storage.setItem(SAVE_STORAGE_KEY, '{壊れた');
    expect(readSuspendData(storage)).toBeNull();

    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION }));
    expect(readSuspendData(storage)).toBeNull();

    storage.setItem(
      SAVE_STORAGE_KEY,
      JSON.stringify({ ...makeSaveData(), version: SAVE_VERSION + 1 }),
    );
    expect(readSuspendData(storage)).toBeNull();
  });

  it('削除すると読み込めなくなる', () => {
    writeSuspendData(makeSaveData(), storage);
    clearSuspendData(storage);
    expect(readSuspendData(storage)).toBeNull();
  });

  it('保存先が無い・使えない環境では失敗しても例外を投げない', () => {
    expect(writeSuspendData(makeSaveData(), null)).toBe(false);
    expect(readSuspendData(null)).toBeNull();
    expect(() => clearSuspendData(null)).not.toThrow();

    const broken = new BrokenStorage();
    expect(writeSuspendData(makeSaveData(), broken)).toBe(false);
    expect(readSuspendData(broken)).toBeNull();
    expect(() => clearSuspendData(broken)).not.toThrow();
  });
});
