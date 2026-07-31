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

  it('HP と行動済みフラグを反映する', () => {
    const unit = new Unit({
      id: 'u3',
      unitType: 'tank',
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
