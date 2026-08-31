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
  it('対人戦では、どちらの陣営が勝ったかを見出しにする', () => {
    expect(
      formatResultMessage(
        { outcome: 'player_victory', reason: 'enemy_hq_captured' },
        { versus: 'human' },
      ),
    ).toEqual({ title: '1P の勝利！', detail: '2Pの本拠地が占領された' });
    expect(
      formatResultMessage(
        { outcome: 'player_defeat', reason: 'player_annihilated' },
        { versus: 'human' },
      ),
    ).toEqual({ title: '2P の勝利！', detail: '1Pが全滅した' });
  });

  it('対人戦で 2P側を選ぶと、先手(1P)が敵軍(赤)側になる', () => {
    expect(
      formatResultMessage(
        { outcome: 'player_victory', reason: 'enemy_annihilated' },
        { versus: 'human', side: '2p' },
      ),
    ).toEqual({ title: '2P の勝利！', detail: '1Pが全滅した' });
  });
});
