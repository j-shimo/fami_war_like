import { describe, expect, it } from 'vitest';
import type { AiAction } from '@/core/ai/EnemyAi';
import { formatEnemyActionLog, formatEnemyTurnSummary } from '@/ui/aiInfo';

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
const board = (): AiAction => ({ kind: 'board' }) as unknown as AiAction;
const unload = (): AiAction => ({ kind: 'unload' }) as unknown as AiAction;
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

  it('搭乗と降車はまとめて「輸送」として数える', () => {
    const lines = formatEnemyTurnSummary([board(), unload(), unload()]);
    expect(lines).toContain('輸送: 3');
  });

  it('指揮官名を渡すと、その名前を見出しにする', () => {
    const lines = formatEnemyTurnSummary([move()], { commander: '突撃長 ガルム' });
    expect(lines[0]).toBe('突撃長 ガルム の行動');
    expect(lines).toContain('移動: 1');
  });
});

describe('formatEnemyActionLog', () => {
  it('攻撃はダメージと撃破・反撃を並べる', () => {
    const action = {
      kind: 'attack',
      movedTo: null,
      path: [],
      result: {
        attacker: { unitName: '戦車' },
        defender: { unitName: '歩兵' },
        damageDealt: 6,
        counterDamage: 2,
        defenderDefeated: false,
        attackerDefeated: false,
      },
    } as unknown as AiAction;

    const lines = formatEnemyActionLog(action);
    expect(lines[0]).toBe('敵軍の行動');
    expect(lines).toContain('攻撃');
    expect(lines).toContain('戦車 → 歩兵');
    expect(lines).toContain('ダメージ: 6');
    expect(lines).toContain('反撃: 2');
    expect(lines).not.toContain('歩兵 を撃破');
  });

  it('撃破したときはその旨を添える', () => {
    const action = {
      kind: 'attack',
      movedTo: null,
      path: [],
      result: {
        attacker: { unitName: '戦車' },
        defender: { unitName: '歩兵' },
        damageDealt: 9,
        counterDamage: 0,
        defenderDefeated: true,
        attackerDefeated: false,
      },
    } as unknown as AiAction;

    expect(formatEnemyActionLog(action)).toContain('歩兵 を撃破');
  });

  it('占領は完了か残り耐久かを示す', () => {
    const ongoing = {
      kind: 'capture',
      movedTo: null,
      path: [],
      result: { unit: { unitName: '歩兵' }, captured: false, remainingHp: 12 },
    } as unknown as AiAction;
    expect(formatEnemyActionLog(ongoing)).toContain('残り耐久: 12');

    const done = {
      kind: 'capture',
      movedTo: null,
      path: [],
      result: { unit: { unitName: '歩兵' }, captured: true, remainingHp: 0 },
    } as unknown as AiAction;
    expect(formatEnemyActionLog(done)).toContain('占領完了');
  });

  it('移動・待機・遭遇・生産もユニット名とともに示す', () => {
    const unit = { unitName: '戦車' };
    expect(formatEnemyActionLog({ kind: 'move', unit } as unknown as AiAction)).toEqual([
      '敵軍の行動',
      '移動',
      '戦車',
    ]);
    expect(formatEnemyActionLog({ kind: 'wait', unit } as unknown as AiAction)).toEqual([
      '敵軍の行動',
      '待機',
      '戦車',
    ]);
    expect(formatEnemyActionLog({ kind: 'halt', unit } as unknown as AiAction)).toContain(
      'そうぐう！',
    );
    expect(
      formatEnemyActionLog({
        kind: 'produce',
        result: { unit: { unitName: '歩兵' }, cost: 1000 },
      } as unknown as AiAction),
    ).toEqual(['敵軍の行動', '生産', '歩兵 を生産', '消費資金: 1000']);
  });

  it('搭乗・降車は輸送ユニットと運ばれるユニットの組み合わせを示す', () => {
    expect(
      formatEnemyActionLog({
        kind: 'board',
        unit: { unitName: '歩兵' },
        transport: { unitName: '輸送艦' },
      } as unknown as AiAction),
    ).toEqual(['敵軍の行動', '搭乗', '輸送艦に歩兵が搭乗']);
    expect(
      formatEnemyActionLog({
        kind: 'unload',
        unit: { unitName: '輸送艦' },
        passenger: { unitName: '歩兵' },
      } as unknown as AiAction),
    ).toEqual(['敵軍の行動', '降ろす', '輸送艦が歩兵を配置']);
  });

  it('指揮官名を渡すと、その名前を見出しにする', () => {
    const lines = formatEnemyActionLog(
      { kind: 'move', unit: { unitName: '戦車' } } as unknown as AiAction,
      { commander: '突撃長 ガルム' },
    );
    expect(lines[0]).toBe('突撃長 ガルム の行動');
  });
});
