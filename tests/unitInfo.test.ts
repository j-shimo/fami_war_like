import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { Unit } from '@/core/units/Unit';
import { formatUnitInfo } from '@/ui/unitInfo';

describe('formatUnitInfo', () => {
  it('歩兵の情報を整形する', () => {
    const unit = new Unit({
      id: 'u1',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    const lines = formatUnitInfo(unit);
    expect(lines).toContain('ユニット: 歩兵');
    expect(lines).toContain('所属: 自軍');
    expect(lines).toContain('HP: 10/10');
    expect(lines).toContain('移動力: 3');
    expect(lines).toContain('射程: 1');
    expect(lines).toContain('占領: 可');
    expect(lines).toContain('状態: 待機');
  });

  it('自走砲は射程を範囲表記で示す', () => {
    const unit = new Unit({
      id: 'u2',
      unitType: 'artillery',
      armyType: 'enemy',
      position: gridPosition(0, 0),
    });
    const lines = formatUnitInfo(unit);
    expect(lines).toContain('所属: 敵軍');
    expect(lines).toContain('射程: 2-3');
    expect(lines).toContain('占領: 不可');
  });

  it('夜戦のときだけ視界の行を表示する', () => {
    const unit = new Unit({
      id: 'u4',
      unitType: 'escortShip',
      armyType: 'player',
      position: gridPosition(0, 0),
    });
    // 昼戦では視界を表示しない
    expect(formatUnitInfo(unit).some((l) => l.startsWith('視界:'))).toBe(false);
    // 夜戦では視界を表示する(既定はユニットの基本視界)
    expect(formatUnitInfo(unit, { nightBattle: true })).toContain('視界: 5');
    // 地形補正込みの視界を渡すとその値を表示する(山の上の歩兵など)
    expect(formatUnitInfo(unit, { nightBattle: true, vision: 7 })).toContain('視界: 7');
  });

  it('HP と行動済みフラグを反映する', () => {
    const unit = new Unit({
      id: 'u3',
      unitType: 'mediumTank',
      armyType: 'player',
      position: gridPosition(0, 0),
      currentHp: 4,
      hasActed: true,
    });
    const lines = formatUnitInfo(unit);
    expect(lines).toContain('HP: 4/10');
    expect(lines).toContain('状態: 行動済み');
  });
});
