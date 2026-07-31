import { describe, expect, it } from 'vitest';
import { gridPosition } from '@/core/map/GridPosition';
import { Unit } from '@/core/units/Unit';
import { getUnitData } from '@/data/unitData';

describe('Unit', () => {
  it('省略時は現在HPが最大HP・行動未済で生成される', () => {
    const unit = new Unit({
      id: 'u1',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(2, 3),
    });
    expect(unit.currentHp).toBe(getUnitData('infantry').maxHp);
    expect(unit.hasActed).toBe(false);
    expect(unit.isAlive).toBe(true);
  });

  it('静的パラメータをアクセサ経由で参照できる', () => {
    const unit = new Unit({
      id: 'u2',
      unitType: 'artillery',
      armyType: 'enemy',
      position: gridPosition(0, 0),
    });
    expect(unit.unitName).toBe('自走砲');
    expect(unit.movement).toBe(4);
    expect(unit.movementType).toBe('vehicle');
    expect(unit.minAttackRange).toBe(2);
    expect(unit.maxAttackRange).toBe(3);
    expect(unit.canCapture).toBe(false);
  });

  it('歩兵は占領可能', () => {
    const unit = new Unit({
      id: 'u3',
      unitType: 'infantry',
      armyType: 'player',
      position: gridPosition(1, 1),
    });
    expect(unit.canCapture).toBe(true);
  });

  it('現在HPが0以下なら生存していない', () => {
    const unit = new Unit({
      id: 'u4',
      unitType: 'tank',
      armyType: 'player',
      position: gridPosition(0, 0),
      currentHp: 0,
    });
    expect(unit.isAlive).toBe(false);
  });

  it('position はコピーされ、渡した座標オブジェクトと独立している', () => {
    const pos = gridPosition(4, 5);
    const unit = new Unit({
      id: 'u5',
      unitType: 'tank',
      armyType: 'player',
      position: pos,
    });
    expect(unit.position).not.toBe(pos);
    expect(unit.position).toEqual(pos);
  });
});
