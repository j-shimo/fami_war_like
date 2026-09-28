// モード選択画面の「中断から再開」に出す内容を組み立てる。表示ロジックのみを担い、Phaser には依存しない。

import { matchesMap, type SaveData } from '@/core/save/SaveData';
import type { ResolvedMapEntry } from '@/data/maps';

/** 「中断から再開」で再開する対象(中断データと、それを遊んでいたマップ) */
export interface ResumeTarget {
  readonly save: SaveData;
  readonly entry: ResolvedMapEntry;
}

/**
 * 中断データを再開できるマップを一覧から探す。
 * 中断データが無い、または遊んでいたマップが一覧に無い・サイズが変わっている場合は
 * 再開できないため null を返す(マップ選択画面での照合と同じ matchesMap で判定する)。
 */
export function findResumeTarget(
  save: SaveData | null,
  maps: readonly ResolvedMapEntry[],
): ResumeTarget | null {
  if (!save) {
    return null;
  }
  const entry = maps.find((candidate) =>
    matchesMap(save, candidate.id, candidate.definition),
  );
  return entry ? { save, entry } : null;
}

/** 中断した日時を「9/26 21:04」の形に整形する(端末のローカル時刻で表示する) */
export function formatSuspendedAt(savedAt: number): string {
  const date = new Date(savedAt);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${minutes}`;
}

/** 1 行目: 遊んでいたマップ名(夜戦なら「(夜戦)」を添える) */
export function resumeMapLine(target: ResumeTarget): string {
  const night = target.save.nightBattle ? '(夜戦)' : '';
  return `${target.entry.definition.name}${night}`;
}

/** 2 行目: 中断したターン数と日時 */
export function resumeDetailLine(save: SaveData): string {
  return `第${save.turnNumber}ターン・${formatSuspendedAt(save.savedAt)} 中断`;
}
