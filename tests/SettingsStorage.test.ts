import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_MODE } from '@/core/mode/GameMode';
import type { SaveStorageLike } from '@/core/save/SaveStorage';
import {
  defaultSettings,
  readEnemyAnimationMode,
  readGameMode,
  readSettings,
  SETTINGS_STORAGE_KEY,
  writeEnemyAnimationMode,
  writeGameMode,
  writeSettings,
} from '@/core/settings/SettingsStorage';
import { DEFAULT_ENEMY_ANIMATION_MODE } from '@/data/enemyAnimation';

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

describe('SettingsStorage', () => {
  it('保存した設定をそのまま読み戻せる', () => {
    const storage = new MemoryStorage();
    expect(
      writeSettings(
        { enemyAnimationMode: 'instant', gameMode: DEFAULT_GAME_MODE },
        storage,
      ),
    ).toBe(true);
    expect(readSettings(storage).enemyAnimationMode).toBe('instant');
  });

  it('専用のキーへ保存する', () => {
    const storage = new MemoryStorage();
    writeSettings({ enemyAnimationMode: 'simple', gameMode: DEFAULT_GAME_MODE }, storage);
    expect(storage.items.has(SETTINGS_STORAGE_KEY)).toBe(true);
  });

  it('保存が無ければ既定の設定を返す', () => {
    expect(readSettings(new MemoryStorage())).toEqual(defaultSettings());
    expect(defaultSettings().enemyAnimationMode).toBe(DEFAULT_ENEMY_ANIMATION_MODE);
  });

  it('壊れた JSON・知らない値は既定値で補う', () => {
    const broken = new MemoryStorage();
    broken.items.set(SETTINGS_STORAGE_KEY, '{壊れている');
    expect(readSettings(broken).enemyAnimationMode).toBe(DEFAULT_ENEMY_ANIMATION_MODE);

    const unknown = new MemoryStorage();
    unknown.items.set(SETTINGS_STORAGE_KEY, JSON.stringify({ enemyAnimationMode: 'x' }));
    expect(readSettings(unknown).enemyAnimationMode).toBe(DEFAULT_ENEMY_ANIMATION_MODE);
  });

  it('保存先が無い・例外を投げる環境では既定値を返し、保存は false を返す', () => {
    expect(readSettings(null)).toEqual(defaultSettings());
    expect(
      writeSettings({ enemyAnimationMode: 'instant', gameMode: DEFAULT_GAME_MODE }, null),
    ).toBe(false);
    expect(readSettings(new BrokenStorage())).toEqual(defaultSettings());
    expect(
      writeSettings(
        { enemyAnimationMode: 'instant', gameMode: DEFAULT_GAME_MODE },
        new BrokenStorage(),
      ),
    ).toBe(false);
  });

  it('敵の行動アニメだけを読み書きできる', () => {
    const storage = new MemoryStorage();
    expect(readEnemyAnimationMode(storage)).toBe(DEFAULT_ENEMY_ANIMATION_MODE);
    expect(writeEnemyAnimationMode('instant', storage)).toBe(true);
    expect(readEnemyAnimationMode(storage)).toBe('instant');
  });
  it('モード選択の内容を保存して読み戻せる', () => {
    const storage = new MemoryStorage();
    expect(writeGameMode({ side: '2p', versus: 'human' }, storage)).toBe(true);
    expect(readGameMode(storage)).toEqual({ side: '2p', versus: 'human' });
    // 他の設定は保ったまま書き換える
    writeEnemyAnimationMode('instant', storage);
    expect(readGameMode(storage)).toEqual({ side: '2p', versus: 'human' });
    expect(readEnemyAnimationMode(storage)).toBe('instant');
  });

  it('モード選択の内容が無い・知らない値なら既定値で補う', () => {
    expect(readGameMode(new MemoryStorage())).toEqual(DEFAULT_GAME_MODE);

    const unknown = new MemoryStorage();
    unknown.items.set(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ gameMode: { side: '3p', versus: 'human' } }),
    );
    expect(readGameMode(unknown)).toEqual({
      side: DEFAULT_GAME_MODE.side,
      versus: 'human',
    });
  });
});
