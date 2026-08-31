import { describe, expect, it } from 'vitest';
import type { PlayerSide } from '@/core/mode/GameMode';
import { addClear, emptyClearProgress } from '@/core/progress/ClearProgress';
import type { ClearProgress } from '@/core/progress/ClearProgress';
import {
  becameUnlocked,
  extraMapsForSide,
  isExtraUnlocked,
  mapsForSide,
  remainingRequiredMaps,
  unlockRequiredMaps,
  visibleMaps,
  type UnlockableMap,
} from '@/core/progress/MapUnlock';
import { MAP_LIST } from '@/data/maps';

/**
 * テスト用のマップ一覧(通常 2 枚・テスト 1 枚・激ムズ 2 枚)。
 * 激ムズマップはサイドごとに別のマップを用意する。
 */
const ENTRIES: readonly UnlockableMap[] = [
  { id: 'alpha', category: 'normal' },
  { id: 'beta', category: 'normal' },
  { id: 'test', category: 'test' },
  { id: 'extra1p', category: 'extra', side: '1p' },
  { id: 'extra2p', category: 'extra', side: '2p' },
];

/** 指定した識別子のマップを、そのサイドでクリア済みにしたクリア状況を作る */
function clearedProgress(side: PlayerSide, ...mapIds: readonly string[]): ClearProgress {
  return mapIds.reduce(
    (progress, mapId) => addClear(progress, { mapId, side, nightBattle: false }),
    emptyClearProgress(),
  );
}

describe('MapUnlock(激ムズマップの解放判定)', () => {
  it('サイドを限定したマップは、そのサイドでしか扱わない', () => {
    expect(mapsForSide(ENTRIES, '1p').map((entry) => entry.id)).toEqual([
      'alpha',
      'beta',
      'test',
      'extra1p',
    ]);
    expect(extraMapsForSide(ENTRIES, '2p').map((entry) => entry.id)).toEqual(['extra2p']);
  });

  it('解放に必要なのは通常マップだけ(テストマップ・激ムズマップは含まない)', () => {
    for (const side of ['1p', '2p'] as const) {
      expect(unlockRequiredMaps(ENTRIES, side).map((entry) => entry.id)).toEqual([
        'alpha',
        'beta',
      ]);
    }
  });

  it('未クリアの通常マップが残っている間は解放されない', () => {
    expect(isExtraUnlocked(ENTRIES, emptyClearProgress(), '1p')).toBe(false);
    expect(isExtraUnlocked(ENTRIES, clearedProgress('1p', 'alpha'), '1p')).toBe(false);
  });

  it('テストマップをクリアしても解放条件は進まない', () => {
    const progress = clearedProgress('1p', 'alpha', 'test');
    expect(
      remainingRequiredMaps(ENTRIES, progress, '1p').map((entry) => entry.id),
    ).toEqual(['beta']);
    expect(isExtraUnlocked(ENTRIES, progress, '1p')).toBe(false);
  });

  it('テストマップを除く全マップをクリアすると解放される', () => {
    const progress = clearedProgress('1p', 'alpha', 'beta');
    expect(remainingRequiredMaps(ENTRIES, progress, '1p')).toEqual([]);
    expect(isExtraUnlocked(ENTRIES, progress, '1p')).toBe(true);
  });

  it('2P側でも、テストマップを除く全マップのクリアで解放される', () => {
    const progress = clearedProgress('2p', 'alpha', 'beta');
    expect(remainingRequiredMaps(ENTRIES, progress, '2p')).toEqual([]);
    expect(isExtraUnlocked(ENTRIES, progress, '2p')).toBe(true);
  });

  it('解放状況はサイドごとに独立している(1P側のクリアで2P側は解放されない)', () => {
    const progress = clearedProgress('1p', 'alpha', 'beta');
    expect(isExtraUnlocked(ENTRIES, progress, '1p')).toBe(true);
    expect(isExtraUnlocked(ENTRIES, progress, '2p')).toBe(false);
    expect(
      remainingRequiredMaps(ENTRIES, progress, '2p').map((entry) => entry.id),
    ).toEqual(['alpha', 'beta']);
  });

  it('通常マップが 1 枚も無ければ解放しない', () => {
    const onlyTest: readonly UnlockableMap[] = [
      { id: 'test', category: 'test' },
      { id: 'extra', category: 'extra' },
    ];
    expect(isExtraUnlocked(onlyTest, clearedProgress('1p', 'test'), '1p')).toBe(false);
  });

  it('そのサイド向けの激ムズマップが無ければ解放扱いにしない', () => {
    const only1p: readonly UnlockableMap[] = [
      { id: 'alpha', category: 'normal' },
      { id: 'extra1p', category: 'extra', side: '1p' },
    ];
    const progress = clearedProgress('2p', 'alpha');
    expect(isExtraUnlocked(only1p, progress, '2p')).toBe(false);
    expect(becameUnlocked(only1p, emptyClearProgress(), progress, '2p')).toBe(false);
  });

  it('解放前は激ムズマップを一覧に出さない', () => {
    expect(
      visibleMaps(ENTRIES, clearedProgress('1p', 'alpha'), '1p').map((entry) => entry.id),
    ).toEqual(['alpha', 'beta', 'test']);
  });

  it('解放後は、そのサイド向けの激ムズマップだけが登録順のまま一覧に並ぶ', () => {
    expect(
      visibleMaps(ENTRIES, clearedProgress('1p', 'alpha', 'beta'), '1p').map(
        (entry) => entry.id,
      ),
    ).toEqual(['alpha', 'beta', 'test', 'extra1p']);
    expect(
      visibleMaps(ENTRIES, clearedProgress('2p', 'alpha', 'beta'), '2p').map(
        (entry) => entry.id,
      ),
    ).toEqual(['alpha', 'beta', 'test', 'extra2p']);
  });

  it('最後の 1 枚をクリアした瞬間だけ「解放された」と判定する', () => {
    const before = clearedProgress('1p', 'alpha');
    const after = clearedProgress('1p', 'alpha', 'beta');
    expect(becameUnlocked(ENTRIES, before, after, '1p')).toBe(true);
    // すでに解放済みの状態で再クリアしても「解放された」とはしない
    expect(
      becameUnlocked(
        ENTRIES,
        after,
        clearedProgress('1p', 'alpha', 'beta', 'test'),
        '1p',
      ),
    ).toBe(false);
    // まだ足りない場合も解放されない
    expect(becameUnlocked(ENTRIES, emptyClearProgress(), before, '1p')).toBe(false);
    // 1P側で達成しても、2P側の解放にはならない
    expect(becameUnlocked(ENTRIES, before, after, '2p')).toBe(false);
  });

  it('実際のマップ一覧では、1P側の全通常マップのクリアで解放される', () => {
    const required = unlockRequiredMaps(MAP_LIST, '1p');
    expect(required.length).toBeGreaterThan(0);
    // テストマップは解放条件に数えない
    expect(required.some((entry) => entry.id === 'test')).toBe(false);

    const progress = clearedProgress('1p', ...required.map((entry) => entry.id));
    expect(isExtraUnlocked(MAP_LIST, progress, '1p')).toBe(true);
    // 双大陸マップは1P側の激ムズマップなので、2P側の一覧には出さない
    expect(
      visibleMaps(MAP_LIST, progress, '1p').some(
        (entry) => entry.id === 'twinContinents',
      ),
    ).toBe(true);
    expect(
      visibleMaps(
        MAP_LIST,
        clearedProgress('2p', ...required.map((entry) => entry.id)),
        '2p',
      ).some((entry) => entry.id === 'twinContinents'),
    ).toBe(false);
  });
});
