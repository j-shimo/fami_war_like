// マップごとのクリア状況(どのマップを何回クリアしたか)の保存先を扱う。Phaser には依存しない。
// クリア記録は担当サイド(1P側 / 2P側)ごとに分けて持ち、同じマップでも 1P側でのクリアと
// 2P側でのクリアを別々に数える(2P側は後手番のぶん難度が違うため、別の実績として扱う)。
// 中断データ(SaveStorage)・ゲーム設定(SettingsStorage)とは別のキーで持ち、
// 中断データを破棄してもクリア状況は残るようにする。
// localStorage が使えない環境(SSR・テスト・プライベートモード等)では静かに失敗し、
// 「クリア状況なし」として動き続ける(記録できないだけでゲーム進行は止めない)。

import type { PlayerSide } from '@/core/mode/GameMode';
import { defaultStorage, type SaveStorageLike } from '@/core/save/SaveStorage';

/** クリア状況を保存する localStorage のキー */
export const CLEAR_PROGRESS_STORAGE_KEY = 'gridwars:clear';

/**
 * クリア状況の形式バージョン。
 * 保存内容の構造を変えたら 1 つ増やす。知らないバージョンの保存は読み捨てる
 * (クリア状況が消えるだけで、ゲームは最初から遊べる)。
 * バージョン 1(サイドを分けずに記録していた形式)だけは、
 * 1P側の記録として読み込み直す(それまでの遊び方は 1P側だけだったため)。
 */
export const CLEAR_PROGRESS_VERSION = 2;

/** マップ 1 枚ぶんのクリア記録 */
export interface MapClearRecord {
  /** 最後にクリアした時刻(エポックミリ秒。表示用) */
  readonly clearedAt: number;
  /** クリアした回数(1 以上) */
  readonly clearCount: number;
  /** 夜戦でクリアしたことがあるか */
  readonly nightCleared: boolean;
}

/** サイド 1 つぶんのクリア記録(マップ識別子 → クリア記録)。未クリアのマップは含まない */
export type SideClearRecords = Readonly<Record<string, MapClearRecord>>;

/** クリア状況(担当サイド → そのサイドでのクリア記録) */
export interface ClearProgress {
  /** 形式バージョン(CLEAR_PROGRESS_VERSION) */
  readonly version: number;
  /** サイドごとのクリア記録。1P側・2P側は互いに独立して数える */
  readonly bySide: Readonly<Record<PlayerSide, SideClearRecords>>;
}

/** 1 回ぶんのクリアを記録するときに渡す情報 */
export interface ClearEvent {
  /** クリアしたマップの識別子(MapEntry.id) */
  readonly mapId: string;
  /** どちらのサイドを担当してクリアしたか */
  readonly side: PlayerSide;
  /** 夜戦でクリアしたか */
  readonly nightBattle: boolean;
  /** クリア時刻(エポックミリ秒)。省略時は現在時刻 */
  readonly clearedAt?: number;
}

/** 保存が無い・壊れているときに使う「クリア状況なし」の値 */
export function emptyClearProgress(): ClearProgress {
  return { version: CLEAR_PROGRESS_VERSION, bySide: { '1p': {}, '2p': {} } };
}

/** 値が 1 件ぶんのクリア記録として妥当かを判定する */
function isMapClearRecord(value: unknown): value is MapClearRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<MapClearRecord>;
  return (
    typeof record.clearedAt === 'number' &&
    Number.isFinite(record.clearedAt) &&
    typeof record.clearCount === 'number' &&
    Number.isInteger(record.clearCount) &&
    record.clearCount >= 1 &&
    typeof record.nightCleared === 'boolean'
  );
}

/**
 * サイド 1 つぶんのクリア記録を読み取る。
 * 一部のマップの記録だけが壊れている場合は、その記録だけを捨てて残りを活かす。
 */
function readSideRecords(value: unknown): SideClearRecords {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const valid: Record<string, MapClearRecord> = {};
  for (const [mapId, record] of Object.entries(value as Record<string, unknown>)) {
    if (isMapClearRecord(record)) {
      valid[mapId] = {
        clearedAt: record.clearedAt,
        clearCount: record.clearCount,
        nightCleared: record.nightCleared,
      };
    }
  }
  return valid;
}

/**
 * 保存済みのクリア状況を読み込む。
 * 保存が無い、JSON として壊れている、知らないバージョンの場合は「クリア状況なし」を返す。
 * サイドを分けていなかったバージョン 1 の保存は、1P側のクリア記録として引き継ぐ。
 */
export function readClearProgress(
  storage: SaveStorageLike | null = defaultStorage(),
): ClearProgress {
  if (!storage) {
    return emptyClearProgress();
  }
  let raw: string | null;
  try {
    raw = storage.getItem(CLEAR_PROGRESS_STORAGE_KEY);
  } catch {
    return emptyClearProgress();
  }
  if (raw === null) {
    return emptyClearProgress();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyClearProgress();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return emptyClearProgress();
  }
  const { version, cleared, bySide } = parsed as {
    version?: unknown;
    cleared?: unknown;
    bySide?: unknown;
  };
  // サイドを分けていなかった形式は、それまでの遊び方(1P側)の記録として引き継ぐ
  if (version === 1) {
    return {
      version: CLEAR_PROGRESS_VERSION,
      bySide: { '1p': readSideRecords(cleared), '2p': {} },
    };
  }
  if (version !== CLEAR_PROGRESS_VERSION) {
    return emptyClearProgress();
  }
  if (typeof bySide !== 'object' || bySide === null) {
    return emptyClearProgress();
  }
  const sides = bySide as { '1p'?: unknown; '2p'?: unknown };
  return {
    version: CLEAR_PROGRESS_VERSION,
    bySide: { '1p': readSideRecords(sides['1p']), '2p': readSideRecords(sides['2p']) },
  };
}

/** クリア状況を保存する。保存できたら true を返す */
export function writeClearProgress(
  progress: ClearProgress,
  storage: SaveStorageLike | null = defaultStorage(),
): boolean {
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(CLEAR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/** 指定サイドのクリア記録を返す */
export function sideClearRecords(
  progress: ClearProgress,
  side: PlayerSide,
): SideClearRecords {
  return progress.bySide[side] ?? {};
}

/**
 * クリア状況へ 1 回ぶんのクリアを足した、新しいクリア状況を返す(元の値は変更しない)。
 * 記録はクリアしたサイドにだけ足し、もう一方のサイドの記録はそのまま残す。
 * そのサイドですでにクリア済みのマップならクリア回数を 1 増やし、夜戦クリアの有無は積み上げる。
 */
export function addClear(progress: ClearProgress, event: ClearEvent): ClearProgress {
  const records = sideClearRecords(progress, event.side);
  const previous = records[event.mapId];
  const record: MapClearRecord = {
    clearedAt: event.clearedAt ?? Date.now(),
    clearCount: (previous?.clearCount ?? 0) + 1,
    nightCleared: (previous?.nightCleared ?? false) || event.nightBattle,
  };
  return {
    version: CLEAR_PROGRESS_VERSION,
    bySide: {
      ...progress.bySide,
      [event.side]: { ...records, [event.mapId]: record },
    },
  };
}

/**
 * 1 回ぶんのクリアを保存先へ記録し、記録後のクリア状況を返す。
 * 保存できない環境でも、返り値としては記録後の状況を返す
 * (その場の表示は更新でき、次回起動時に消えるだけにする)。
 */
export function recordMapClear(
  event: ClearEvent,
  storage: SaveStorageLike | null = defaultStorage(),
): ClearProgress {
  const updated = addClear(readClearProgress(storage), event);
  writeClearProgress(updated, storage);
  return updated;
}

/** 指定サイドで、指定マップをクリア済みか */
export function isMapCleared(
  progress: ClearProgress,
  side: PlayerSide,
  mapId: string,
): boolean {
  return sideClearRecords(progress, side)[mapId] !== undefined;
}

/** 指定サイドでの、指定マップのクリア記録を返す。未クリアなら null */
export function clearRecordOf(
  progress: ClearProgress,
  side: PlayerSide,
  mapId: string,
): MapClearRecord | null {
  return sideClearRecords(progress, side)[mapId] ?? null;
}

/** クリア状況をすべて消す(やり直したいときに使う。両サイドぶんが消える) */
export function clearAllProgress(
  storage: SaveStorageLike | null = defaultStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(CLEAR_PROGRESS_STORAGE_KEY);
  } catch {
    // 消せなくてもゲーム進行には影響しないため握りつぶす
  }
}
