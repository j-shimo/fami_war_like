import { describe, expect, it } from 'vitest';
import type { AiAction } from '@/core/ai/EnemyAi';
import { formatEnemyTurnSummary } from '@/ui/aiInfo';

/** テスト用に各種の AiAction を最小限のダミーで組み立てるヘルパー群 */
const attack = (defenderDefeated: boolean): AiAction =>
  ({
    kind: 'attack',
    movedTo: null,
    result: { defenderDefeated },
  }) as unknown as AiAction;

const capture = (captured: boolean): AiAction =>
  ({
    kind: 'capture',
    movedTo: null,
    result: { captured },
  }) as unknown as AiAction;

const move = (): AiAction => ({ kind: 'move' }) as unknown as AiAction;
const produce = (): AiAction => ({ kind: 'produce' }) as unknown as AiAction;
const wait = (): AiAction => ({ kind: 'wait' }) as unknown as AiAction;

describe('formatEnemyTurnSummary', () => {
  it('各行動の件数を集計して表示する', () => {
    const lines = formatEnemyTurnSummary([
      attack(true),
      attack(false),
      capture(true),
      move(),
      produce(),
    ]);
    expect(lines[0]).toBe('敵軍の行動');
    expect(lines).toContain('攻撃: 2(撃破 1)');
    expect(lines).toContain('占領: 1(占領完了)');
    expect(lines).toContain('移動: 1');
    expect(lines).toContain('生産: 1');
  });

  it('撃破がなければ攻撃件数のみ表示する', () => {
    const lines = formatEnemyTurnSummary([attack(false)]);
    expect(lines).toContain('攻撃: 1');
    expect(lines).not.toContain('撃破');
  });

  it('行動が待機のみなら「待機」と表示する', () => {
    const lines = formatEnemyTurnSummary([wait(), wait()]);
    expect(lines).toEqual(['敵軍の行動', '待機']);
  });

  it('指揮官名を渡すと、その名前を見出しにする', () => {
    const lines = formatEnemyTurnSummary([move()], { commander: '突撃長 ガルム' });
    expect(lines[0]).toBe('突撃長 ガルム の行動');
    expect(lines).toContain('移動: 1');
  });
});
