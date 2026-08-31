import { describe, expect, it } from 'vitest';
import { emptyBattleStats, type BattleStats } from '@/core/stats/BattleStats';
import { applyCommander, formatBattleStats } from '@/ui/endingInfo';
import { ENDING_SLIDES } from '@/data/endingData';

/** 表示確認に使う戦績 */
const STATS: BattleStats = {
  turns: 27,
  player: {
    attacks: 60,
    defeated: 41,
    lost: 12,
    produced: 34,
    spent: 286000,
    captured: 22,
  },
  enemy: {
    attacks: 55,
    defeated: 12,
    lost: 41,
    produced: 30,
    spent: 240000,
    captured: 5,
  },
};

describe('formatBattleStats(戦績の行)', () => {
  it('自軍の記録を、単位付きの行に整形する', () => {
    expect(formatBattleStats(STATS)).toEqual([
      { label: 'クリアターン数', value: '27 ターン' },
      { label: '生産したユニット', value: '34 体' },
      { label: '投じた資金', value: '286,000' },
      { label: '撃破したユニット', value: '41 体' },
      { label: '失ったユニット', value: '12 体' },
      { label: '占領した拠点', value: '22 か所' },
    ]);
  });

  it('0 件でも行は欠けない', () => {
    const rows = formatBattleStats(emptyBattleStats());
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.value.length).toBeGreaterThan(0);
    }
  });
});

describe('applyCommander(対戦相手の差し込み)', () => {
  it('本文の {commander} を指揮官名へ置き換える', () => {
    expect(applyCommander('{commander} は笑った', '教導官 ノーラ')).toBe(
      '教導官 ノーラ は笑った',
    );
  });

  it('差し込み先が無い行はそのまま返す', () => {
    expect(applyCommander('次の盤面へ', '教導官 ノーラ')).toBe('次の盤面へ');
  });

  it('エピローグ本文の差し込みを済ませると {commander} が残らない', () => {
    for (const slide of ENDING_SLIDES) {
      for (const line of slide.body) {
        expect(applyCommander(line, '教導官 ノーラ')).not.toContain('{commander}');
      }
    }
  });
});
