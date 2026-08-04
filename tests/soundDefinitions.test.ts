import { describe, expect, it } from 'vitest';
import { noteToFrequency } from '@/audio/notes';
import {
  BGM_TRACKS,
  SOUND_EFFECTS,
  beatsToSeconds,
  channelTotalBeats,
  type SfxName,
} from '@/audio/soundDefinitions';

/** 効果音として定義しておきたい種類の一覧 */
const EXPECTED_SFX: SfxName[] = [
  'select',
  'move',
  'attack',
  'defeat',
  'capture',
  'produce',
  'repair',
  'button',
  'turnPlayer',
  'turnEnemy',
  'victory',
  'lose',
];

describe('soundDefinitions - 効果音', () => {
  it('想定する効果音がすべて定義されている', () => {
    for (const name of EXPECTED_SFX) {
      expect(SOUND_EFFECTS[name]).toBeDefined();
    }
  });

  it('各効果音は 1 つ以上のステップを持ち、長さは正の値', () => {
    for (const [name, effect] of Object.entries(SOUND_EFFECTS)) {
      expect(effect.steps.length, name).toBeGreaterThan(0);
      for (const step of effect.steps) {
        expect(step.duration, name).toBeGreaterThan(0);
      }
    }
  });

  it('トーンステップの音名は周波数へ変換できる', () => {
    for (const effect of Object.values(SOUND_EFFECTS)) {
      for (const step of effect.steps) {
        if (step.kind === 'tone') {
          expect(noteToFrequency(step.note)).toBeGreaterThan(0);
          if (step.slideTo) {
            expect(noteToFrequency(step.slideTo)).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('soundDefinitions - BGM', () => {
  it('自軍・敵軍の戦闘 BGM が定義されている', () => {
    expect(BGM_TRACKS.playerBattle).toBeDefined();
    expect(BGM_TRACKS.enemyBattle).toBeDefined();
  });

  it('各トラックのチャンネルは同じ総拍数でループする', () => {
    for (const [name, track] of Object.entries(BGM_TRACKS)) {
      expect(track.bpm, name).toBeGreaterThan(0);
      expect(track.channels.length, name).toBeGreaterThan(0);
      const totals = track.channels.map((channel) => channelTotalBeats(channel));
      // すべてのチャンネルが同じ拍数なら、ずれずにループできる
      for (const total of totals) {
        expect(total, name).toBe(totals[0]);
      }
    }
  });

  it('BGM の音符(休符以外)は周波数へ変換できる', () => {
    for (const track of Object.values(BGM_TRACKS)) {
      for (const channel of track.channels) {
        for (const note of channel.notes) {
          if (note.note !== null) {
            expect(noteToFrequency(note.note)).toBeGreaterThan(0);
          }
          expect(note.beats).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('beatsToSeconds', () => {
  it('テンポに応じて拍数を秒へ変換する', () => {
    // 120bpm では 1 拍 = 0.5 秒
    expect(beatsToSeconds(1, 120)).toBeCloseTo(0.5, 5);
    expect(beatsToSeconds(4, 120)).toBeCloseTo(2, 5);
    // 60bpm では 1 拍 = 1 秒
    expect(beatsToSeconds(1, 60)).toBeCloseTo(1, 5);
  });
});
