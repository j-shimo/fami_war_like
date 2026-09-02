import { describe, expect, it } from 'vitest';
import { BattleManager } from '@/core/battle/BattleManager';
import { forecastBattle } from '@/core/battle/BattleForecast';
import {
  attackBonusOf,
  NO_COMMANDER_BONUS,
  type CommanderBonus,
} from '@/core/battle/CommanderBonus';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import { EnemyAi } from '@/core/ai/EnemyAi';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { UnitType } from '@/core/units/UnitType';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 全面平地(防御1)の 3x3 マップ */
const PLAIN_MAP: MapDefinition = { name: 'plain', terrain: ['...', '...', '...'] };

/** 攻撃対象のマスだけを山(防御3)にしたマップ。補正の有無で与ダメージの差が出る */
const MOUNTAIN_MAP: MapDefinition = { name: 'mountain', terrain: ['.m.', '...', '...'] };

/** 自軍だけ攻撃力 +10% の補正を持つ状態 */
const PLAYER_BONUS: CommanderBonus = { player: 0.1, enemy: 0 };

/** テスト用にユニットを 1 体生成する */
function makeUnit(
  unitType: UnitType,
  army: ArmyType = 'player',
  currentHp?: number,
): Unit {
  return new Unit({
    id: `${unitType}-${army}`,
    unitType,
    armyType: army,
    position: gridPosition(0, 0),
    currentHp,
  });
}

/** テスト用に MapManager と UnitManager を組み立てる */
function setup(
  placements: Parameters<typeof UnitManager.fromPlacements>[0],
  definition: MapDefinition = PLAIN_MAP,
): { map: MapManager; units: UnitManager } {
  const map = MapManager.fromDefinition(definition);
  return { map, units: UnitManager.fromPlacements(placements, map) };
}

describe('attackBonusOf', () => {
  it('軍ごとの補正を引ける。中立には補正がかからない', () => {
    expect(attackBonusOf(PLAYER_BONUS, 'player')).toBe(0.1);
    expect(attackBonusOf(PLAYER_BONUS, 'enemy')).toBe(0);
    expect(attackBonusOf(PLAYER_BONUS, 'neutral')).toBe(0);
  });

  it('補正なしの既定値ではどちらの軍も 0 になる', () => {
    expect(attackBonusOf(NO_COMMANDER_BONUS, 'player')).toBe(0);
    expect(attackBonusOf(NO_COMMANDER_BONUS, 'enemy')).toBe(0);
  });
});

describe('calculateDamage の攻撃補正', () => {
  it('攻撃補正のぶんだけ火力が上がる', () => {
    // 中戦車→歩兵(防御0): 補正なしは 75 × 1.0 / 10 = 7.5 → 8
    // +10% では 75 × 1.1 / 10 = 8.25 → 8 のままだが、防御 3 では差が出る
    const tank = makeUnit('mediumTank');
    const infantry = makeUnit('infantry', 'enemy');
    // 防御3: 補正なし 75 × 0.7 / 10 = 5.25 → 5 / +10% は 5.775 → 6
    expect(calculateDamage(tank, infantry, 3)).toBe(5);
    expect(calculateDamage(tank, infantry, 3, { attackBonus: 0.1 })).toBe(6);
  });

  it('補正を指定しなければこれまでどおりの計算になる', () => {
    const tank = makeUnit('mediumTank');
    const infantry = makeUnit('infantry', 'enemy');
    expect(calculateDamage(tank, infantry, 0, { attackBonus: 0 })).toBe(
      calculateDamage(tank, infantry, 0),
    );
  });

  it('攻撃側 HP の指定と攻撃補正は同時に効く', () => {
    // 中戦車(HP5扱い)→歩兵(防御0): 75 × 0.5 × 1.1 / 10 = 4.125 → 4
    const tank = makeUnit('mediumTank');
    const infantry = makeUnit('infantry', 'enemy');
    expect(calculateDamage(tank, infantry, 0, { attackerHp: 5 })).toBe(4);
    expect(calculateDamage(tank, infantry, 0, { attackerHp: 5, attackBonus: 0.1 })).toBe(
      4,
    );
    // HP8 なら 75 × 0.8 × 1.1 / 10 = 6.6 → 7(補正なしは 6)
    expect(calculateDamage(tank, infantry, 0, { attackerHp: 8 })).toBe(6);
    expect(calculateDamage(tank, infantry, 0, { attackerHp: 8, attackBonus: 0.1 })).toBe(
      7,
    );
  });

  it('相性がなければ補正をかけても 0 ダメージのまま', () => {
    // 輸送艦は攻撃手段を持たない(相性表がすべて 0)
    const transport = makeUnit('transportShip');
    const infantry = makeUnit('infantry', 'enemy');
    expect(calculateDamage(transport, infantry, 0, { attackBonus: 0.1 })).toBe(0);
  });
});

describe('BattleManager の攻撃補正', () => {
  it('補正を持つ軍の攻撃だけが強くなる', () => {
    /** 山(防御3)の歩兵を、自軍の中戦車が攻撃したときの与ダメージ */
    function damageDealt(bonus?: CommanderBonus): number {
      const { map, units } = setup(
        [
          { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
          { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
        ],
        MOUNTAIN_MAP,
      );
      return new BattleManager(map, units, bonus).attack(
        units.getUnitAt(gridPosition(0, 0))!,
        units.getUnitAt(gridPosition(1, 0))!,
      ).damageDealt;
    }

    // 山(防御3)の歩兵へ中戦車: 補正なし 75 × 0.7 / 10 = 5.25 → 5 / +10% は 5.775 → 6
    expect(damageDealt()).toBe(5);
    expect(damageDealt(PLAYER_BONUS)).toBe(6);
    // 補正を持つのは自軍だけなので、敵軍側の補正では変わらない
    expect(damageDealt({ player: 0, enemy: 0.1 })).toBe(5);
  });

  it('反撃は撃ち返す側(防御側)の軍の補正で計算する', () => {
    // 敵軍だけが +10% の補正を持つ。自軍の攻撃は変わらず、敵軍の反撃だけが強くなる
    const enemyBonus: CommanderBonus = { player: 0, enemy: 0.1 };
    const withBonus = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const withoutBonus = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);

    const bonusResult = new BattleManager(
      withBonus.map,
      withBonus.units,
      enemyBonus,
    ).attack(
      withBonus.units.getUnitAt(gridPosition(0, 0))!,
      withBonus.units.getUnitAt(gridPosition(1, 0))!,
    );
    const plainResult = new BattleManager(withoutBonus.map, withoutBonus.units).attack(
      withoutBonus.units.getUnitAt(gridPosition(0, 0))!,
      withoutBonus.units.getUnitAt(gridPosition(1, 0))!,
    );

    // 攻撃(自軍の歩兵)は同じで、反撃(敵軍の中戦車)だけが重くなる
    expect(bonusResult.damageDealt).toBe(plainResult.damageDealt);
    expect(bonusResult.counterDamage).toBeGreaterThan(plainResult.counterDamage);
  });
});

describe('forecastBattle の攻撃補正', () => {
  it('予測は実際の戦闘と同じ補正込みのダメージを返す', () => {
    const forecastBoard = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const battleBoard = setup([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
    ]);
    const bonus: CommanderBonus = { player: 0.1, enemy: 0.1 };

    const forecast = forecastBattle(
      forecastBoard.units.getUnitAt(gridPosition(0, 0))!,
      forecastBoard.units.getUnitAt(gridPosition(1, 0))!,
      forecastBoard.map,
      bonus,
    );
    const result = new BattleManager(battleBoard.map, battleBoard.units, bonus).attack(
      battleBoard.units.getUnitAt(gridPosition(0, 0))!,
      battleBoard.units.getUnitAt(gridPosition(1, 0))!,
    );

    expect(forecast.damageDealt).toBe(result.damageDealt);
    expect(forecast.counterDamage).toBe(result.counterDamage);
  });

  it('補正を渡さなければこれまでどおりの予測になる', () => {
    const { map, units } = setup([
      { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const attacker = units.getUnitAt(gridPosition(0, 0))!;
    const defender = units.getUnitAt(gridPosition(1, 0))!;
    expect(forecastBattle(attacker, defender, map)).toEqual(
      forecastBattle(attacker, defender, map, NO_COMMANDER_BONUS),
    );
  });
});

describe('敵軍AIの攻撃補正', () => {
  it('補正込みで攻撃を実行するため、与ダメージが補正なしより増える', () => {
    /** 山(防御3)の自軍歩兵へ、敵軍AIに攻撃させたときの与ダメージ */
    function attackDamage(bonus?: CommanderBonus): number {
      const { map, units } = setup(
        [
          { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
          { col: 1, row: 0, unitType: 'infantry', army: 'player' },
        ],
        MOUNTAIN_MAP,
      );
      const economy = new EconomyManager();
      const ai = new EnemyAi({
        map,
        units,
        battle: new BattleManager(map, units, bonus),
        capture: new CaptureSystem(),
        production: new ProductionManager(map, units, economy),
        commanderBonus: bonus,
      });
      const attack = ai.run().find((action) => action.kind === 'attack');
      return attack?.kind === 'attack' ? attack.result.damageDealt : 0;
    }

    // 山(防御3)の歩兵へ中戦車: 補正なし 75 × 0.7 / 10 = 5.25 → 5 / +10% は 5.775 → 6
    expect(attackDamage()).toBe(5);
    expect(attackDamage({ player: 0, enemy: 0.1 })).toBe(6);
  });
});
