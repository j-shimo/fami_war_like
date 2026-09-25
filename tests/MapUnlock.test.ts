import { describe, expect, it } from 'vitest';
import type { PlayerSide } from '@/core/mode/GameMode';
import { addClear, emptyClearProgress } from '@/core/progress/ClearProgress';
import type { ClearProgress } from '@/core/progress/ClearProgress';
import {
  becameUnlocked,
  extraMapsForSide,
  isExtraUnlocked,
  isNewGroupUnlocked,
  isRequiredCleared,
  mapsForSide,
  remainingForNewGroup,
  remainingRequiredMaps,
  unlockRequiredMaps,
  visibleMaps,
  type UnlockableMap,
} from '@/core/progress/MapUnlock';
import { MAP_LIST, mapsInGroup, STANDARD_MAP_LIST } from '@/data/maps';

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

describe('MapUnlock(マップ区分ごとの激ムズマップ解放)', () => {
  it('実際のマップ一覧では、新マップの激ムズマップは新マップの全クリアで解放される', () => {
    const newGroup = mapsInGroup(MAP_LIST, 'new');
    // 新マップの区分にも 1P側の激ムズマップ(鉄河列島マップ)が登録されている
    expect(extraMapsForSide(newGroup, '1p').map((entry) => entry.id)).toEqual([
      'ironRiverIslands',
    ]);

    const required = unlockRequiredMaps(newGroup, '1p');
    expect(required.length).toBeGreaterThan(0);
    // 通常マップを全クリアしても、新マップの激ムズマップは解放されない
    const standardCleared = clearedProgress(
      '1p',
      ...unlockRequiredMaps(STANDARD_MAP_LIST, '1p').map((entry) => entry.id),
    );
    expect(isExtraUnlocked(newGroup, standardCleared, '1p')).toBe(false);

    // 新マップを全クリアすると解放され、一覧に並ぶ
    const progress = clearedProgress('1p', ...required.map((entry) => entry.id));
    expect(isExtraUnlocked(newGroup, progress, '1p')).toBe(true);
    expect(
      visibleMaps(newGroup, progress, '1p').some(
        (entry) => entry.id === 'ironRiverIslands',
      ),
    ).toBe(true);
    // 2P側にはこのマップを出さない(2P側には蛇河大島マップを出す)
    const progress2p = clearedProgress('2p', ...required.map((entry) => entry.id));
    expect(
      visibleMaps(newGroup, progress2p, '2p').some(
        (entry) => entry.id === 'ironRiverIslands',
      ),
    ).toBe(false);
  });

  it('新マップの 2P側の激ムズマップ(蛇河大島マップ)は、2P側で新マップを全クリアすると解放される', () => {
    const newGroup = mapsInGroup(MAP_LIST, 'new');
    expect(extraMapsForSide(newGroup, '2p').map((entry) => entry.id)).toEqual([
      'serpentRiverIsland',
    ]);
    const required = unlockRequiredMaps(newGroup, '2p');
    expect(required.length).toBeGreaterThan(0);

    // 1P側で新マップを全クリアしても、2P側の激ムズマップは解放されない
    const progress1p = clearedProgress('1p', ...required.map((entry) => entry.id));
    expect(isExtraUnlocked(newGroup, progress1p, '2p')).toBe(false);
    expect(
      visibleMaps(newGroup, progress1p, '1p').some(
        (entry) => entry.id === 'serpentRiverIsland',
      ),
    ).toBe(false);

    // 2P側で新マップを全クリアすると解放され、2P側の一覧にだけ並ぶ
    const progress2p = clearedProgress('2p', ...required.map((entry) => entry.id));
    expect(isExtraUnlocked(newGroup, progress2p, '2p')).toBe(true);
    const visible = visibleMaps(newGroup, progress2p, '2p').map((entry) => entry.id);
    expect(visible).toContain('serpentRiverIsland');
    expect(visible).not.toContain('ironRiverIslands');
  });

  it('通常マップの激ムズマップは、新マップのクリア状況に左右されない', () => {
    const standard = STANDARD_MAP_LIST;
    const required = unlockRequiredMaps(standard, '1p');
    const progress = clearedProgress('1p', ...required.map((entry) => entry.id));
    expect(isExtraUnlocked(standard, progress, '1p')).toBe(true);
    expect(
      visibleMaps(standard, progress, '1p').some(
        (entry) => entry.id === 'twinContinents',
      ),
    ).toBe(true);
    // 新マップの激ムズマップは通常マップの一覧には出さない
    expect(
      visibleMaps(standard, progress, '1p').some(
        (entry) => entry.id === 'ironRiverIslands',
      ),
    ).toBe(false);
  });
});

describe('MapUnlock(新マップの解放判定)', () => {
  it('通常マップをすべてクリアするまで新マップは解放されない', () => {
    expect(isNewGroupUnlocked(ENTRIES, emptyClearProgress())).toBe(false);
    expect(isNewGroupUnlocked(ENTRIES, clearedProgress('1p', 'alpha'))).toBe(false);
    // テストマップだけをクリアしても解放条件には数えない
    expect(isNewGroupUnlocked(ENTRIES, clearedProgress('1p', 'test'))).toBe(false);
  });

  it('1P側・2P側のどちらかで通常マップを全クリアすれば解放される', () => {
    expect(isNewGroupUnlocked(ENTRIES, clearedProgress('1p', 'alpha', 'beta'))).toBe(
      true,
    );
    expect(isNewGroupUnlocked(ENTRIES, clearedProgress('2p', 'alpha', 'beta'))).toBe(
      true,
    );
  });

  it('サイドをまたいで 1 枚ずつクリアしただけでは解放されない', () => {
    const mixed = addClear(clearedProgress('1p', 'alpha'), {
      mapId: 'beta',
      side: '2p',
      nightBattle: false,
    });
    expect(isRequiredCleared(ENTRIES, mixed, '1p')).toBe(false);
    expect(isRequiredCleared(ENTRIES, mixed, '2p')).toBe(false);
    expect(isNewGroupUnlocked(ENTRIES, mixed)).toBe(false);
  });

  it('解放までの残り枚数は、進んでいるほうのサイドで数える', () => {
    expect(remainingForNewGroup(ENTRIES, emptyClearProgress())).toBe(2);
    expect(remainingForNewGroup(ENTRIES, clearedProgress('2p', 'alpha'))).toBe(1);
    // 解放済みなら残りは 0
    expect(remainingForNewGroup(ENTRIES, clearedProgress('2p', 'alpha', 'beta'))).toBe(0);
  });

  it('実際のマップ一覧でも、通常マップを全クリアすると新マップが解放される', () => {
    const required = unlockRequiredMaps(STANDARD_MAP_LIST, '1p');
    expect(required.length).toBeGreaterThan(0);
    expect(isNewGroupUnlocked(STANDARD_MAP_LIST, emptyClearProgress())).toBe(false);

    const progress = clearedProgress('2p', ...required.map((entry) => entry.id));
    expect(isNewGroupUnlocked(STANDARD_MAP_LIST, progress)).toBe(true);
  });
});
