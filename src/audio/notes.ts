// 音名と周波数の変換を担う純粋ロジック。Web Audio / Phaser には依存せず、Vitest でテストできる。
// ファミコン風のチップチューンをコードから生成するため、音を「音名」で扱えるようにする。

/** ド〜シの各音の、オクターブ内での半音インデックス(C=0 起点) */
const SEMITONE_OFFSET: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** 基準となる A4 の周波数(Hz)。平均律の計算に用いる */
const A4_FREQUENCY = 440;
/** A4 の MIDI ノート番号 */
const A4_MIDI = 69;

/**
 * 音名(例: "A4"、"C#5"、"Eb3")を MIDI ノート番号へ変換する。
 * 表記は「音名 + 任意の # / b + オクターブ数」の形式。
 * 不正な表記は例外を投げる(データ不整合を早期に検知するため)。
 */
export function noteToMidi(note: string): number {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(note);
  if (!match) {
    throw new Error(`不正な音名です: ${note}`);
  }
  const [, letter, accidental, octaveText] = match;
  let semitone = SEMITONE_OFFSET[letter];
  if (accidental === '#') {
    semitone += 1;
  } else if (accidental === 'b') {
    semitone -= 1;
  }
  const octave = Number.parseInt(octaveText, 10);
  // MIDI では C-1 が 0。C4(中央ハ)は 60、A4 は 69 になる。
  return (octave + 1) * 12 + semitone;
}

/**
 * 音名を周波数(Hz)へ変換する。
 * 平均律で A4 = 440Hz を基準に算出する。
 */
export function noteToFrequency(note: string): number {
  const midi = noteToMidi(note);
  return A4_FREQUENCY * 2 ** ((midi - A4_MIDI) / 12);
}
