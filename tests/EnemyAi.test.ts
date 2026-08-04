import { describe, expect, it } from 'vitest';
import { EnemyAi, type AiAction } from '@/core/ai/EnemyAi';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** テスト用に敵軍AIと関連マネージャを組み立てる */
function setup(def: MapDefinition): {
  map: MapManager;
  units: UnitManager;
  economy: EconomyManager;
  ai: EnemyAi;
} {
  const map = MapManager.fromDefinition(def);
  const units = UnitManager.fromPlacements(def.units ?? [], map);
  const economy = new EconomyManager();
  const battle = new BattleManager(map, units);
  const capture = new CaptureSystem();
  const production = new ProductionManager(units, economy);
  const ai = new EnemyAi({ map, units, battle, capture, production });
  return { map, units, economy, ai };
}

/** 行動ログから指定種別のものだけ取り出す */
function actionsOfKind<K extends AiAction['kind']>(
  actions: readonly AiAction[],
  kind: K,
): Extract<AiAction, { kind: K }>[] {
  return actions.filter((a): a is Extract<AiAction, { kind: K }> => a.kind === kind);
}

describe('EnemyAi.run', () => {
  it('射程内に敵がいれば、その場から攻撃する', () => {
    // 3 マス平地。敵戦車の隣に自軍歩兵、反対側は敵歩兵が塞いでいて移動先がない
    const { units, ai } = setup({
      name: 't',
      terrain: ['...'],
      units: [
        { col: 0, row: 0, unitType: 'tank', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    const actions = ai.run();
    const attacks = actionsOfKind(actions, 'attack');

    expect(attacks).toHaveLength(1);
    // 移動せずその場から攻撃している(隣接する空きマスがないため)
    expect(attacks[0].movedTo).toBeNull();
    // 戦車→歩兵: 75 × 1.0 × 0.9 / 10 = 6.75 → 7
    expect(attacks[0].result.damageDealt).toBe(7);
    expect(infantry.currentHp).toBe(3);
    expect(tank.hasActed).toBe(true);
  });

  it('射程外でも、移動して攻撃できるなら移動してから攻撃する', () => {
    // 5 マス平地。敵戦車(移動5)は col3 の自軍歩兵へ隣接する col2 まで動いて攻撃する
    const { units, ai } = setup({
      name: 't',
      terrain: ['.....'],
      units: [
        { col: 0, row: 0, unitType: 'tank', army: 'enemy' },
        { col: 3, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });
    const infantry = units.getUnitAt(gridPosition(3, 0))!;

    const actions = ai.run();
    const attacks = actionsOfKind(actions, 'attack');

    expect(attacks).toHaveLength(1);
    expect(attacks[0].movedTo).toEqual(gridPosition(2, 0));
    // 攻撃側の戦車は移動先の col2 にいる
    expect(units.getUnitAt(gridPosition(2, 0))?.unitType).toBe('tank');
    expect(infantry.currentHp).toBeLessThan(infantry.maxHp);
  });

  it('間接攻撃ユニットは、その場から届く敵には移動せず攻撃する', () => {
    // 敵自走砲(射程2-3)。col2 の自軍歩兵は現在地 col0 から距離2で射程内
    const { units, ai } = setup({
      name: 't',
      terrain: ['.........'],
      units: [
        { col: 0, row: 0, unitType: 'artillery', army: 'enemy' },
        { col: 2, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });
    const artillery = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(2, 0))!;

    const actions = ai.run();
    const attacks = actionsOfKind(actions, 'attack');

    expect(attacks).toHaveLength(1);
    // 移動せずその場から攻撃している
    expect(attacks[0].movedTo).toBeNull();
    expect(artillery.position).toEqual(gridPosition(0, 0));
    expect(infantry.currentHp).toBeLessThan(infantry.maxHp);
  });

  it('間接攻撃ユニットは、移動しないと届かない敵には攻撃せず接近する', () => {
    // 敵自走砲(移動4・射程2-3)。col5 の自軍歩兵は現在地から距離5で射程外。
    // 移動すれば射程に収められるが、間接攻撃ユニットは移動後攻撃できないため接近のみ行う
    const { units, ai } = setup({
      name: 't',
      terrain: ['.........'],
      units: [
        { col: 0, row: 0, unitType: 'artillery', army: 'enemy' },
        { col: 5, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });
    const infantry = units.getUnitAt(gridPosition(5, 0))!;

    const actions = ai.run();
    const attacks = actionsOfKind(actions, 'attack');
    const moves = actionsOfKind(actions, 'move');

    // 移動して攻撃はしない
    expect(attacks).toHaveLength(0);
    expect(infantry.currentHp).toBe(infantry.maxHp);
    // 代わりに最寄りの敵へ接近する(移動4で col4 まで前進)
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(gridPosition(4, 0));
  });

  it('相手を撃破できる攻撃を優先して選ぶ', () => {
    // 瀕死の自軍歩兵と、隣に自軍戦車。敵戦車は撃破できる歩兵を狙う
    const { units, ai } = setup({
      name: 't',
      terrain: ['...'],
      units: [
        { col: 0, row: 0, unitType: 'tank', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    infantry.currentHp = 2;

    const actions = ai.run();
    const attacks = actionsOfKind(actions, 'attack');

    expect(attacks[0].result.defenderDefeated).toBe(true);
    expect(units.getUnitAt(gridPosition(1, 0))).toBeUndefined();
  });

  it('攻撃できないときは、移動して占領地形を占領する', () => {
    // col0 に中立都市。敵歩兵は都市へ移動して占領する。自軍歩兵は遠く攻撃できない
    const { map, units, ai } = setup({
      name: 't',
      terrain: ['c........'],
      units: [
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 8, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });

    const actions = ai.run();
    const captures = actionsOfKind(actions, 'capture');

    expect(captures).toHaveLength(1);
    expect(captures[0].movedTo).toEqual(gridPosition(0, 0));
    // 歩兵 HP10 ぶん耐久が減る(初期耐久 20 → 残り 10、占領は未完了)
    expect(captures[0].result.captured).toBe(false);
    expect(map.getTile(gridPosition(0, 0))?.captureHp).toBe(10);
    expect(units.getUnitAt(gridPosition(0, 0))?.armyType).toBe('enemy');
  });

  it('攻撃も占領もできないときは、最寄りの敵へ近づく', () => {
    // 9 マス平地。敵戦車(移動5)は自軍歩兵(col8)へ向けて col5 まで前進する
    const { units, ai } = setup({
      name: 't',
      terrain: ['.........'],
      units: [
        { col: 0, row: 0, unitType: 'tank', army: 'enemy' },
        { col: 8, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });

    const actions = ai.run();
    const moves = actionsOfKind(actions, 'move');

    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(gridPosition(5, 0));
    expect(units.getUnitAt(gridPosition(5, 0))?.unitType).toBe('tank');
  });

  it('攻撃対象がいなければ待機する', () => {
    const { units, ai } = setup({
      name: 't',
      terrain: ['...'],
      units: [{ col: 0, row: 0, unitType: 'tank', army: 'enemy' }],
    });
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const actions = ai.run();
    const waits = actionsOfKind(actions, 'wait');

    expect(waits).toHaveLength(1);
    expect(tank.hasActed).toBe(true);
  });

  it('資金があれば、空の生産拠点で最も高価なユニットを生産する', () => {
    // col0 に敵軍の工場(空)。資金 10000 で最も高価な戦車(7000)を生産する
    const { units, economy, ai } = setup({
      name: 't',
      terrain: ['F..'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [{ col: 2, row: 0, unitType: 'infantry', army: 'enemy' }],
    });

    const actions = ai.run();
    const produced = actionsOfKind(actions, 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('tank');
    // 資金 10000 − 戦車 7000 = 3000
    expect(economy.getFunds('enemy')).toBe(3000);
    // 生産されたユニットは工場マスに配置され、このターンは行動済み
    const spawned = units.getUnitAt(gridPosition(0, 0));
    expect(spawned?.unitType).toBe('tank');
    expect(spawned?.hasActed).toBe(true);
  });

  it('生産拠点にユニットがいる場合は生産しない', () => {
    // 工場上に敵歩兵がいるため生産できない
    const { economy, ai } = setup({
      name: 't',
      terrain: ['F..'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [{ col: 0, row: 0, unitType: 'infantry', army: 'enemy' }],
    });

    const actions = ai.run();

    expect(actionsOfKind(actions, 'produce')).toHaveLength(0);
    expect(economy.getFunds('enemy')).toBe(10000);
  });

  it('手番の全ユニットがそれぞれ 1 回ずつ行動する', () => {
    const { ai } = setup({
      name: 't',
      terrain: ['.........'],
      units: [
        { col: 0, row: 0, unitType: 'tank', army: 'enemy' },
        { col: 1, row: 0, unitType: 'artillery', army: 'enemy' },
        { col: 8, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });

    const actions = ai.run();
    // 生産以外の行動(攻撃・占領・移動・待機)は敵ユニット数と一致する
    const unitActions = actions.filter((a) => a.kind !== 'produce');
    expect(unitActions).toHaveLength(2);
  });
});
