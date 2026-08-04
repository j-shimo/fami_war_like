import { describe, expect, it } from 'vitest';
import type { BattleForecast } from '@/core/battle/BattleForecast';
import { gridPosition } from '@/core/map/GridPosition';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';
import { formatBattleForecast } from '@/ui/forecastInfo';

/** テスト用にユニットを 1 体生成する */
function makeUnit(unitType: UnitType): Unit {
  return new Unit({
    id: `${unitType}-test`,
    unitType,
    armyType: 'player',
    position: gridPosition(0, 0),
  });
}

describe('formatBattleForecast', () => {
  const tank = makeUnit('tank');
  const infantry = makeUnit('infantry');

  it('与ダメージと反撃を HP 変化つきで表示する', () => {
    const forecast: BattleForecast = {
      damageDealt: 7,
      defenderHpBefore: 10,
      defenderHpAfter: 3,
      defenderDefeated: false,
      willCounter: true,
      counterDamage: 1,
      attackerHpBefore: 10,
      attackerHpAfter: 9,
      attackerDefeated: false,
    };

    const lines = formatBattleForecast(forecast, tank, infantry);

    expect(lines[0]).toBe('戦闘予測');
    expect(lines[1]).toBe('戦車 → 歩兵');
    expect(lines[2]).toBe('与ダメージ: 7 (HP 10→3)');
    expect(lines[3]).toBe('反撃: 1 (HP 10→9)');
  });

  it('撃破できる場合は撃破を明示し、反撃なしとする', () => {
    const forecast: BattleForecast = {
      damageDealt: 8,
      defenderHpBefore: 2,
      defenderHpAfter: 0,
      defenderDefeated: true,
      willCounter: false,
      counterDamage: 0,
      attackerHpBefore: 10,
      attackerHpAfter: 10,
      attackerDefeated: false,
    };

    const lines = formatBattleForecast(forecast, tank, infantry);

    expect(lines[2]).toBe('与ダメージ: 8 (HP 2→0) 撃破!');
    expect(lines[3]).toBe('反撃: なし');
  });

  it('反撃で撃破される場合は被撃破を明示する', () => {
    const forecast: BattleForecast = {
      damageDealt: 1,
      defenderHpBefore: 10,
      defenderHpAfter: 9,
      defenderDefeated: false,
      willCounter: true,
      counterDamage: 5,
      attackerHpBefore: 1,
      attackerHpAfter: 0,
      attackerDefeated: true,
    };

    const lines = formatBattleForecast(forecast, infantry, tank);

    expect(lines[3]).toBe('反撃: 5 (HP 1→0) 被撃破!');
  });
});
