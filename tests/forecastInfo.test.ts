import { describe, expect, it } from 'vitest';
import type { BattleForecast } from '@/core/battle/BattleForecast';
import { gridPosition } from '@/core/map/GridPosition';
import { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';
import { buildBattleForecastView } from '@/ui/forecastInfo';

/** テスト用にユニットを 1 体生成する */
function makeUnit(unitType: UnitType): Unit {
  return new Unit({
    id: `${unitType}-test`,
    unitType,
    armyType: 'player',
    position: gridPosition(0, 0),
  });
}

describe('buildBattleForecastView', () => {
  const tank = makeUnit('tank');
  const infantry = makeUnit('infantry');

  it('与ダメージと反撃を自軍・敵軍が分かる形で表示する', () => {
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

    const view = buildBattleForecastView(forecast, tank, infantry);

    expect(view.lines[0]).toBe('戦闘予測');
    expect(view.lines[1]).toBe('戦車 → 歩兵');
    expect(view.lines[2]).toBe('こちらの攻撃: 7  敵HP 10→3');
    expect(view.lines[3]).toBe('敵の反撃: 1  自HP 10→9');
    expect(view.alert).toBe('none');
    expect(view.alertText).toBeNull();
  });

  it('撃破できる場合は撃破を強調し、反撃なしとする', () => {
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

    const view = buildBattleForecastView(forecast, tank, infantry);

    expect(view.lines[2]).toBe('こちらの攻撃: 8  敵HP 2→0');
    expect(view.lines[3]).toBe('敵の反撃: なし');
    expect(view.alert).toBe('kill');
    expect(view.alertText).toBe('撃破できる！');
  });

  it('反撃で撃破される場合は「やられる」と警告する', () => {
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

    const view = buildBattleForecastView(forecast, infantry, tank);

    expect(view.lines[3]).toBe('敵の反撃: 5  自HP 1→0');
    expect(view.alert).toBe('danger');
    expect(view.alertText).toBe('やられる！ 反撃で撃破される');
  });
});
