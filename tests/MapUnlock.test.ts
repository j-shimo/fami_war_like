import { describe, expect, it } from 'vitest';
import { addClear, emptyClearProgress } from '@/core/progress/ClearProgress';
import type { ClearProgress } from '@/core/progress/ClearProgress';
import {
  becameUnlocked,
  isExtraUnlocked,
  remainingRequiredMaps,
  unlockRequiredMaps,
  visibleMaps,
  type UnlockableMap,
} from '@/core/progress/MapUnlock';
import { MAP_LIST } from '@/data/maps';

/** テスト用のマップ一覧(通常 2 枚・テスト 1 枚・激ムズ 1 枚) */
const ENTRIES: readonly UnlockableMap[] = [
  { id: 'alpha', category: 'normal' },
  { id: 'beta', category: 'normal' },
  { id: 'test', category: 'test' },
  { id: 'extra', category: 'extra' },
];

/** 指定した識別子のマップをクリア済みにしたクリア状況を作る */
function clearedProgress(...mapIds: readonly string[]): ClearProgress {
  return mapIds.reduce(
    (progress, mapId) => addClear(progress, { mapId, nightBattle: false }),
    emptyClearProgress(),
  );
}

describe('MapUnlock(激ムズマップの解放判定)', () => {
  it('解放に必要なのは通常マップだけ(テストマップ・激ムズマップは含まない)', () => {
    expect(unlockRequiredMaps(ENTRIES).map((entry) => entry.id)).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('未クリアの通常マップが残っている間は解放されない', () => {
    expect(isExtraUnlocked(ENTRIES, emptyClearProgress())).toBe(false);
    expect(isExtraUnlocked(ENTRIES, clearedProgress('alpha'))).toBe(false);
  });

  it('テストマップをクリアしても解放条件は進まない', () => {
    const progress = clearedProgress('alpha', 'test');
    expect(remainingRequiredMaps(ENTRIES, progress).map((entry) => entry.id)).toEqual([
      'beta',
    ]);
    expect(isExtraUnlocked(ENTRIES, progress)).toBe(false);
  });

  it('テストマップを除く全マップをクリアすると解放される', () => {
    const progress = clearedProgress('alpha', 'beta');
    expect(remainingRequiredMaps(ENTRIES, progress)).toEqual([]);
    expect(isExtraUnlocked(ENTRIES, progress)).toBe(true);
  });

  it('通常マップが 1 枚も無ければ解放しない', () => {
    const onlyTest: readonly UnlockableMap[] = [
      { id: 'test', category: 'test' },
      { id: 'extra', category: 'extra' },
    ];
    expect(isExtraUnlocked(onlyTest, clearedProgress('test'))).toBe(false);
  });

  it('解放前は激ムズマップを一覧に出さない', () => {
    expect(
      visibleMaps(ENTRIES, clearedProgress('alpha')).map((entry) => entry.id),
    ).toEqual(['alpha', 'beta', 'test']);
  });

  it('解放後は激ムズマップも登録順のまま一覧に並ぶ', () => {
    expect(
      visibleMaps(ENTRIES, clearedProgress('alpha', 'beta')).map((entry) => entry.id),
    ).toEqual(['alpha', 'beta', 'test', 'extra']);
  });

  it('最後の 1 枚をクリアした瞬間だけ「解放された」と判定する', () => {
    const before = clearedProgress('alpha');
    const after = clearedProgress('alpha', 'beta');
    expect(becameUnlocked(ENTRIES, before, after)).toBe(true);
    // すでに解放済みの状態で再クリアしても「解放された」とはしない
    expect(becameUnlocked(ENTRIES, after, clearedProgress('alpha', 'beta', 'test'))).toBe(
      false,
    );
    // まだ足りない場合も解放されない
    expect(becameUnlocked(ENTRIES, emptyClearProgress(), before)).toBe(false);
  });

  it('実際のマップ一覧では、全通常マップのクリアで解放される', () => {
    const required = unlockRequiredMaps(MAP_LIST);
    expect(required.length).toBeGreaterThan(0);
    // テストマップは解放条件に数えない
    expect(required.some((entry) => entry.id === 'test')).toBe(false);

    const progress = clearedProgress(...required.map((entry) => entry.id));
    expect(isExtraUnlocked(MAP_LIST, progress)).toBe(true);
  });
});
