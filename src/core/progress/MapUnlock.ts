// 激ムズマップ(extra)と新マップ(区分 new)の解放条件を判定する。Phaser には依存しない純粋なロジック。
// テストマップ(test)を除く通常マップ(normal)をすべてクリアすると、
// 激ムズマップがマップ選択画面に現れる。
// 判定は担当サイド(1P側 / 2P側)ごとに独立して行い、それぞれのサイドでのクリア状況だけを見る。
// 激ムズマップはサイドを限定でき(MapEntry.side)、限定されたマップはそのサイドでしか
// 一覧に出さず、そのサイドの解放判定にだけ関わる。
// 新マップは「1P側・2P側のどちらかで通常マップをすべてクリアする」と解放され、
// モード選択画面の入口が開く(サイドごとに分けず、どちらかで達成すればよい)。
// docs/GameDesign.md「クリア状況と激ムズマップ」を参照。

import type { PlayerSide } from '@/core/mode/GameMode';
import { isMapCleared, type ClearProgress } from '@/core/progress/ClearProgress';
import type { MapCategory } from '@/data/maps/mapCategory';

/** 解放判定に必要な、マップ 1 枚ぶんの最小限の情報 */
export interface UnlockableMap {
  readonly id: string;
  readonly category: MapCategory;
  /** 担当サイドを限定するマップはそのサイド。省略時は両サイドで扱う */
  readonly side?: PlayerSide;
}

/** 指定サイドで扱うマップ(サイドを限定していないマップと、そのサイド向けのマップ)を返す */
export function mapsForSide<T extends UnlockableMap>(
  entries: readonly T[],
  side: PlayerSide,
): readonly T[] {
  return entries.filter((entry) => entry.side === undefined || entry.side === side);
}

/** 指定サイドの激ムズマップを返す(そのサイド向けに用意されていなければ空) */
export function extraMapsForSide<T extends UnlockableMap>(
  entries: readonly T[],
  side: PlayerSide,
): readonly T[] {
  return mapsForSide(entries, side).filter((entry) => entry.category === 'extra');
}

/** 指定サイドで、激ムズマップの解放に必要な(= クリアが求められる)マップを返す */
export function unlockRequiredMaps<T extends UnlockableMap>(
  entries: readonly T[],
  side: PlayerSide,
): readonly T[] {
  return mapsForSide(entries, side).filter((entry) => entry.category === 'normal');
}

/** 解放に必要なマップのうち、そのサイドでまだクリアしていないものを返す */
export function remainingRequiredMaps<T extends UnlockableMap>(
  entries: readonly T[],
  progress: ClearProgress,
  side: PlayerSide,
): readonly T[] {
  return unlockRequiredMaps(entries, side).filter(
    (entry) => !isMapCleared(progress, side, entry.id),
  );
}

/**
 * 指定サイドで、解放に必要な通常マップをすべてクリアしているかを判定する。
 * 通常マップが 1 枚も無い場合は解放条件を満たしようがないため false を返す
 * (テストマップだけの状態で解放されてしまうのを防ぐ)。
 */
export function isRequiredCleared(
  entries: readonly UnlockableMap[],
  progress: ClearProgress,
  side: PlayerSide,
): boolean {
  const required = unlockRequiredMaps(entries, side);
  if (required.length === 0) {
    return false;
  }
  return required.every((entry) => isMapCleared(progress, side, entry.id));
}

/**
 * 指定サイドで激ムズマップが解放されているかを判定する。
 * そのサイドの解放に必要な通常マップをすべてクリアしていれば true。
 * そのサイド向けの激ムズマップが 1 枚も無い場合は false を返す
 * (出すものが無いのに「解放された」と扱わないため)。
 */
export function isExtraUnlocked(
  entries: readonly UnlockableMap[],
  progress: ClearProgress,
  side: PlayerSide,
): boolean {
  if (extraMapsForSide(entries, side).length === 0) {
    return false;
  }
  return isRequiredCleared(entries, progress, side);
}

/**
 * 新マップの区分が解放されているかを判定する。
 * 激ムズマップと違い、こちらは担当サイドを問わず
 * 「1P側・2P側のどちらかで通常マップをすべてクリアしていれば解放」とする
 * (どちらのサイドで遊んでいても、いちど解いた人には新マップを開く)。
 */
export function isNewGroupUnlocked(
  entries: readonly UnlockableMap[],
  progress: ClearProgress,
): boolean {
  return (
    isRequiredCleared(entries, progress, '1p') ||
    isRequiredCleared(entries, progress, '2p')
  );
}

/**
 * 新マップの解放まで、あと何枚の通常マップをクリアする必要があるかを返す。
 * 解放は 1P側・2P側のどちらかで達成すればよいため、残り枚数が少ないほうのサイドを見る。
 * すでに解放されている場合は 0 を返す。
 */
export function remainingForNewGroup(
  entries: readonly UnlockableMap[],
  progress: ClearProgress,
): number {
  if (isNewGroupUnlocked(entries, progress)) {
    return 0;
  }
  return Math.min(
    remainingRequiredMaps(entries, progress, '1p').length,
    remainingRequiredMaps(entries, progress, '2p').length,
  );
}

/**
 * マップ選択画面に出すマップを絞り込む。
 * 別サイド向けのマップは外し、激ムズマップは解放されるまで一覧に出さず、
 * それ以外はそのまま並べる。
 */
export function visibleMaps<T extends UnlockableMap>(
  entries: readonly T[],
  progress: ClearProgress,
  side: PlayerSide,
): readonly T[] {
  const unlocked = isExtraUnlocked(entries, progress, side);
  return mapsForSide(entries, side).filter(
    (entry) => entry.category !== 'extra' || unlocked,
  );
}

/**
 * 今回のクリアで、そのサイドの激ムズマップが解放されたか
 * (= クリア直前は未解放で、直後に解放されたか)。
 * クリア結果の画面で「激ムズマップが解放された」と知らせるために使う。
 */
export function becameUnlocked(
  entries: readonly UnlockableMap[],
  before: ClearProgress,
  after: ClearProgress,
  side: PlayerSide,
): boolean {
  return !isExtraUnlocked(entries, before, side) && isExtraUnlocked(entries, after, side);
}
