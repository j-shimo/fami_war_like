// 激ムズマップ(extra)の解放条件を判定する。Phaser には依存しない純粋なロジック。
// テストマップ(test)を除く通常マップ(normal)をすべてクリアすると、
// 激ムズマップがマップ選択画面に現れる。docs/GameDesign.md「クリア状況と激ムズマップ」を参照。

import { isMapCleared, type ClearProgress } from '@/core/progress/ClearProgress';
import type { MapCategory } from '@/data/maps/mapCategory';

/** 解放判定に必要な、マップ 1 枚ぶんの最小限の情報 */
export interface UnlockableMap {
  readonly id: string;
  readonly category: MapCategory;
}

/** 激ムズマップの解放に必要な(= クリアが求められる)マップを返す */
export function unlockRequiredMaps<T extends UnlockableMap>(
  entries: readonly T[],
): readonly T[] {
  return entries.filter((entry) => entry.category === 'normal');
}

/** 解放に必要なマップのうち、まだクリアしていないものを返す */
export function remainingRequiredMaps<T extends UnlockableMap>(
  entries: readonly T[],
  progress: ClearProgress,
): readonly T[] {
  return unlockRequiredMaps(entries).filter((entry) => !isMapCleared(progress, entry.id));
}

/**
 * 激ムズマップが解放されているかを判定する。
 * 解放に必要な通常マップをすべてクリアしていれば true。
 * 通常マップが 1 枚も無い場合は解放条件を満たしようがないため false を返す
 * (テストマップだけの状態で激ムズマップが出てしまうのを防ぐ)。
 */
export function isExtraUnlocked(
  entries: readonly UnlockableMap[],
  progress: ClearProgress,
): boolean {
  const required = unlockRequiredMaps(entries);
  if (required.length === 0) {
    return false;
  }
  return required.every((entry) => isMapCleared(progress, entry.id));
}

/**
 * マップ選択画面に出すマップを絞り込む。
 * 激ムズマップは解放されるまで一覧に出さず、それ以外はそのまま並べる。
 */
export function visibleMaps<T extends UnlockableMap>(
  entries: readonly T[],
  progress: ClearProgress,
): readonly T[] {
  const unlocked = isExtraUnlocked(entries, progress);
  return entries.filter((entry) => entry.category !== 'extra' || unlocked);
}

/**
 * 今回のクリアで激ムズマップが解放されたか(= クリア直前は未解放で、直後に解放されたか)。
 * クリア結果の画面で「激ムズマップが解放された」と知らせるために使う。
 */
export function becameUnlocked(
  entries: readonly UnlockableMap[],
  before: ClearProgress,
  after: ClearProgress,
): boolean {
  return !isExtraUnlocked(entries, before) && isExtraUnlocked(entries, after);
}
