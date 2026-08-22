import { describe, expect, it } from 'vitest';
import { armyLabel, formatTurnBanner } from '@/ui/turnInfo';

describe('turnInfo', () => {
  it('軍勢の表示名を返す', () => {
    expect(armyLabel('player')).toBe('自軍');
    expect(armyLabel('enemy')).toBe('敵軍');
  });

  it('ターン状態を見出し文字列に整形する', () => {
    expect(formatTurnBanner({ turnNumber: 1, currentArmy: 'player' })).toBe(
      '第1ターン / 自軍',
    );
    expect(formatTurnBanner({ turnNumber: 3, currentArmy: 'enemy' })).toBe(
      '第3ターン / 敵軍',
    );
  });

  it('夜戦では見出しの末尾に印を添える', () => {
    expect(
      formatTurnBanner({ turnNumber: 2, currentArmy: 'player' }, { nightBattle: true }),
    ).toBe('第2ターン / 自軍 🌙');
    expect(
      formatTurnBanner({ turnNumber: 2, currentArmy: 'player' }, { nightBattle: false }),
    ).toBe('第2ターン / 自軍');
  });
});
