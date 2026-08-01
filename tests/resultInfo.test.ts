import { describe, expect, it } from 'vitest';
import type { VictoryResult } from '@/core/victory/VictoryConditionChecker';
import { formatResultMessage } from '@/ui/resultInfo';

describe('resultInfo', () => {
  it('敵本拠地占領による勝利を整形する', () => {
    const result: VictoryResult = {
      outcome: 'player_victory',
      reason: 'enemy_hq_captured',
    };
    expect(formatResultMessage(result)).toEqual({
      title: '勝利！',
      detail: '敵本拠地を占領した',
    });
  });

  it('敵軍全滅による勝利を整形する', () => {
    const result: VictoryResult = {
      outcome: 'player_victory',
      reason: 'enemy_annihilated',
    };
    expect(formatResultMessage(result)).toEqual({
      title: '勝利！',
      detail: '敵軍を全滅させた',
    });
  });

  it('自軍本拠地占領による敗北を整形する', () => {
    const result: VictoryResult = {
      outcome: 'player_defeat',
      reason: 'player_hq_captured',
    };
    expect(formatResultMessage(result)).toEqual({
      title: '敗北…',
      detail: '自軍本拠地を占領された',
    });
  });

  it('自軍全滅による敗北を整形する', () => {
    const result: VictoryResult = {
      outcome: 'player_defeat',
      reason: 'player_annihilated',
    };
    expect(formatResultMessage(result)).toEqual({
      title: '敗北…',
      detail: '自軍が全滅した',
    });
  });

  it('未決着の結果を渡すと例外を投げる', () => {
    const result: VictoryResult = { outcome: 'ongoing', reason: null };
    expect(() => formatResultMessage(result)).toThrow();
  });
});
