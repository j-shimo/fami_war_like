import { describe, expect, it } from 'vitest';
import { noteToFrequency, noteToMidi } from '@/audio/notes';

describe('notes', () => {
  it('音名を MIDI ノート番号へ変換する', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C-1')).toBe(0);
  });

  it('シャープ・フラットを半音として扱う', () => {
    expect(noteToMidi('C#4')).toBe(61);
    expect(noteToMidi('Db4')).toBe(61);
    expect(noteToMidi('B3')).toBe(59);
    expect(noteToMidi('Cb4')).toBe(59);
  });

  it('A4 を基準に平均律で周波数へ変換する', () => {
    expect(noteToFrequency('A4')).toBeCloseTo(440, 5);
    // 1 オクターブ上は 2 倍、下は半分
    expect(noteToFrequency('A5')).toBeCloseTo(880, 5);
    expect(noteToFrequency('A3')).toBeCloseTo(220, 5);
    // 中央ハは約 261.63Hz
    expect(noteToFrequency('C4')).toBeCloseTo(261.6255, 3);
  });

  it('不正な音名は例外を投げる', () => {
    expect(() => noteToMidi('H4')).toThrow();
    expect(() => noteToMidi('C')).toThrow();
    expect(() => noteToMidi('')).toThrow();
  });
});
