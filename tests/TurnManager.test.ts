import { describe, expect, it } from 'vitest';
import { TurnManager } from '@/core/turn/TurnManager';
import { UnitManager, type UnitPlacement } from '@/core/units/UnitManager';

const PLACEMENTS: readonly UnitPlacement[] = [
  { col: 1, row: 1, unitType: 'infantry', army: 'player' },
  { col: 2, row: 1, unitType: 'tank', army: 'player' },
  { col: 5, row: 5, unitType: 'artillery', army: 'enemy' },
];

describe('TurnManager', () => {
  it('開始時は第1ターンの自軍手番', () => {
    const turn = new TurnManager(UnitManager.fromPlacements(PLACEMENTS));
    expect(turn.turnNumber).toBe(1);
    expect(turn.currentArmy).toBe('player');
    expect(turn.state).toEqual({ turnNumber: 1, currentArmy: 'player' });
  });

  it('ターン終了で自軍→敵軍へ手番が移る(ターン数は据え置き)', () => {
    const turn = new TurnManager(UnitManager.fromPlacements(PLACEMENTS));
    turn.endTurn();
    expect(turn.currentArmy).toBe('enemy');
    expect(turn.turnNumber).toBe(1);
  });

  it('敵軍のターン終了で自軍へ戻り、ターン数が増える', () => {
    const turn = new TurnManager(UnitManager.fromPlacements(PLACEMENTS));
    turn.endTurn(); // → 敵軍
    turn.endTurn(); // → 自軍(第2ターン)
    expect(turn.currentArmy).toBe('player');
    expect(turn.turnNumber).toBe(2);
  });

  it('isCurrentArmy は現在の手番だけ true を返す', () => {
    const turn = new TurnManager(UnitManager.fromPlacements(PLACEMENTS));
    expect(turn.isCurrentArmy('player')).toBe(true);
    expect(turn.isCurrentArmy('enemy')).toBe(false);
    expect(turn.isCurrentArmy('neutral')).toBe(false);
    turn.endTurn();
    expect(turn.isCurrentArmy('enemy')).toBe(true);
    expect(turn.isCurrentArmy('player')).toBe(false);
  });

  it('手番開始時に手番軍の行動済み状態をリセットする', () => {
    const units = UnitManager.fromPlacements(PLACEMENTS);
    const turn = new TurnManager(units);

    // 自軍ユニットを行動済みにしてから手番を進める
    for (const unit of units.getUnitsByArmy('player')) {
      unit.hasActed = true;
    }
    // 敵軍ユニットも行動済みにしておく
    const enemy = units.getUnitsByArmy('enemy')[0];
    enemy.hasActed = true;

    turn.endTurn(); // → 敵軍手番開始:敵軍がリセットされる
    expect(enemy.hasActed).toBe(false);
    // 自軍はまだリセットされない
    expect(units.getUnitsByArmy('player').every((u) => u.hasActed)).toBe(true);

    turn.endTurn(); // → 自軍手番開始:自軍がリセットされる
    expect(units.getUnitsByArmy('player').every((u) => !u.hasActed)).toBe(true);
  });
});
