import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_BEHAVIOR, type AiBehavior } from '@/core/ai/AiBehavior';
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
function setup(
  def: MapDefinition,
  options: { nightBattle?: boolean; behavior?: AiBehavior; funds?: number } = {},
): {
  map: MapManager;
  units: UnitManager;
  economy: EconomyManager;
  ai: EnemyAi;
} {
  const map = MapManager.fromDefinition(def);
  const units = UnitManager.fromPlacements(def.units ?? [], map);
  const economy = new EconomyManager();
  if (options.funds !== undefined) {
    economy.setFunds('enemy', options.funds);
  }
  const battle = new BattleManager(map, units);
  const capture = new CaptureSystem();
  const production = new ProductionManager(map, units, economy);
  const ai = new EnemyAi({
    map,
    units,
    battle,
    capture,
    production,
    nightBattle: options.nightBattle,
    behavior: options.behavior,
  });
  return { map, units, economy, ai };
}

/** 突撃長ガルムの思考パターン(歩兵をそろえて中立都市を制圧し、本拠地へ突き進む) */
const CHARGE_BEHAVIOR: AiBehavior = {
  production: 'infantryFirst',
  infantryQuota: 6,
  powerCostRatio: 0.5,
  advance: 'captureAndCharge',
  routing: 'path',
  preferNeutralCapture: true,
};

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
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
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
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 3, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });
    const infantry = units.getUnitAt(gridPosition(3, 0))!;

    const actions = ai.run();
    const attacks = actionsOfKind(actions, 'attack');

    expect(attacks).toHaveLength(1);
    expect(attacks[0].movedTo).toEqual(gridPosition(2, 0));
    // 攻撃側の戦車は移動先の col2 にいる
    expect(units.getUnitAt(gridPosition(2, 0))?.unitType).toBe('mediumTank');
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
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
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
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 8, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });

    const actions = ai.run();
    const moves = actionsOfKind(actions, 'move');

    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(gridPosition(5, 0));
    expect(units.getUnitAt(gridPosition(5, 0))?.unitType).toBe('mediumTank');
  });

  it('攻撃対象がいなければ待機する', () => {
    const { units, ai } = setup({
      name: 't',
      terrain: ['...'],
      units: [{ col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' }],
    });
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const actions = ai.run();
    const waits = actionsOfKind(actions, 'wait');

    expect(waits).toHaveLength(1);
    expect(tank.hasActed).toBe(true);
  });

  it('資金があれば、空の生産拠点で最も高価なユニットを生産する', () => {
    // col0 に敵軍の工場(空)。資金 10000 で工場で最も高価な対空戦車(8000)を生産する
    const { units, economy, ai } = setup({
      name: 't',
      terrain: ['F..'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [{ col: 2, row: 0, unitType: 'infantry', army: 'enemy' }],
    });

    const actions = ai.run();
    const produced = actionsOfKind(actions, 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('antiAirTank');
    // 資金 10000 − 対空戦車 8000 = 2000
    expect(economy.getFunds('enemy')).toBe(2000);
    // 生産されたユニットは工場マスに配置され、このターンは行動済み
    const spawned = units.getUnitAt(gridPosition(0, 0));
    expect(spawned?.unitType).toBe('antiAirTank');
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
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
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

describe('EnemyAi.run(夜戦)', () => {
  it('見えていない敵は攻撃せず、近づこうとする', () => {
    // 一本道。敵自走砲(視界1・射程2〜3)から距離 3 の自軍歩兵は視界の外
    const def: MapDefinition = {
      name: 'night-artillery',
      terrain: ['rrrrrrr'],
      units: [
        { col: 0, row: 0, unitType: 'artillery', army: 'enemy' },
        { col: 3, row: 0, unitType: 'infantry', army: 'player' },
      ],
    };

    // 昼戦なら射程 3 に入っているのでその場から砲撃する
    const day = setup(def);
    expect(actionsOfKind(day.ai.run(), 'attack')).toHaveLength(1);

    // 夜戦では見えていないため攻撃しない
    const night = setup(def, { nightBattle: true });
    const actions = night.ai.run();
    expect(actionsOfKind(actions, 'attack')).toHaveLength(0);
  });

  it('進路上の見えない敵に出くわすと手前で強制待機する', () => {
    // 一本道の先に中立都市を置き、敵戦車がそこへ向かうようにする。
    // 敵戦車(視界2)から距離 4 の自軍歩兵は見えておらず、進路上で出くわす。
    const { units, ai } = setup(
      {
        name: 'night-halt',
        terrain: ['rrrrrrrc'],
        units: [
          { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
          { col: 4, row: 0, unitType: 'infantry', army: 'player' },
        ],
      },
      { nightBattle: true },
    );
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const halts = actionsOfKind(ai.run(), 'halt');

    expect(halts).toHaveLength(1);
    expect(halts[0].blockedBy.armyType).toBe('player');
    // 敵歩兵の 1 つ手前(3,0)で止まり、行動を終えている
    expect(tank.position).toEqual(gridPosition(3, 0));
    expect(tank.hasActed).toBe(true);
  });

  it('敵が 1 体も見えていなければ、自軍所有でない拠点へ向かって前進する', () => {
    // 敵戦車の遠くに中立都市。自軍ユニットは見えないので拠点を目標に索敵する
    const { units, ai } = setup(
      {
        name: 'night-scout',
        terrain: ['rrrrrrrc'],
        units: [{ col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' }],
      },
      { nightBattle: true },
    );
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    // 移動力 5 ぶん都市へ近づいている
    expect(tank.position).toEqual(gridPosition(5, 0));
  });
});

describe('EnemyAi.run(生産の絞り込み)', () => {
  /** 敵軍の空港(0,0)と、離れた位置に置いた自軍ユニットだけのマップ */
  function airportMap(playerUnits: MapDefinition['units']): MapDefinition {
    return {
      name: 'airport-production',
      terrain: ['A..........'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: playerUnits,
    };
  }

  it('相手に飛行ユニットがいなければ、戦闘機は買わない', () => {
    // 資金 21000。空港で買えるいちばん高価なユニットは戦闘機(20000)だが、
    // 相手が歩兵だけなら戦闘機は 1 体も攻撃できないので候補から外れる
    const { ai } = setup(
      airportMap([{ col: 10, row: 0, unitType: 'infantry', army: 'player' }]),
      { funds: 21000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('attackHelicopter');
  });

  it('相手に飛行ユニットがいれば、戦闘機を買う', () => {
    const { ai } = setup(
      airportMap([{ col: 10, row: 0, unitType: 'attackHelicopter', army: 'player' }]),
      { funds: 21000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('fighter');
  });

  it('相手に飛行ユニットがいなければ、対空ロケット砲も買わない', () => {
    // 資金 13500。工場で買えるいちばん高価なユニットは対空ロケット砲(13000)だが、
    // 相手が戦車だけなら攻撃できないので、次に高価な中戦車(12000)を買う
    const { ai } = setup(
      {
        name: 'factory-production',
        terrain: ['F..........'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [{ col: 10, row: 0, unitType: 'mediumTank', army: 'player' }],
      },
      { funds: 13500 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('mediumTank');
  });

  it('空港のないマップでは、相手が見えていなくても対空ロケット砲を買わない', () => {
    // 資金 14000 で工場で買えるいちばん高価なユニットは対空ロケット砲(13000)。
    // 空港のあるマップではそれを買うが、空港がなければ飛行ユニットが出てこないため
    // 生産候補から外れ、次に高価な中戦車(12000)を買う。
    const withAirport = setup(
      {
        name: 'airport',
        terrain: ['F.........A'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
      },
      { funds: 14000 },
    );
    const boughtWithAirport = actionsOfKind(withAirport.ai.run(), 'produce');
    expect(boughtWithAirport[0].result.unit.unitType).toBe('antiAirRocketArtillery');

    const withoutAirport = setup(
      {
        name: 'no-airport',
        terrain: ['F..........'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
      },
      { funds: 14000 },
    );
    const boughtWithoutAirport = actionsOfKind(withoutAirport.ai.run(), 'produce');
    expect(boughtWithoutAirport).toHaveLength(1);
    expect(boughtWithoutAirport[0].result.unit.unitType).toBe('mediumTank');
  });

  it('相手が 1 体も見えていなければ、従来どおり最も高価なユニットを買う', () => {
    // 自軍ユニットが盤面にいない(相手の編成が分からない)ときは絞り込まない
    const { ai } = setup(airportMap([]), { funds: 21000 });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('fighter');
  });

  it('夜戦では、見えている敵の編成だけで判断する', () => {
    // 敵歩兵(視界2)から 2 マス先に自軍歩兵、遠くの (10,0) に自軍の戦闘ヘリを置く。
    // 夜戦では戦闘ヘリが見えないため、空港では戦闘機を買わない
    const def: MapDefinition = {
      name: 'night-production',
      terrain: ['A..........'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 3, row: 0, unitType: 'infantry', army: 'player' },
        { col: 10, row: 0, unitType: 'attackHelicopter', army: 'player' },
      ],
    };

    const night = setup(def, { funds: 21000, nightBattle: true });
    const nightProduced = actionsOfKind(night.ai.run(), 'produce');
    expect(nightProduced).toHaveLength(1);
    expect(nightProduced[0].result.unit.unitType).toBe('attackHelicopter');

    // 昼戦なら戦闘ヘリが見えているので、戦闘機を買う
    const day = setup(def, { funds: 21000 });
    const dayProduced = actionsOfKind(day.ai.run(), 'produce');
    expect(dayProduced).toHaveLength(1);
    expect(dayProduced[0].result.unit.unitType).toBe('fighter');
  });
});

describe('EnemyAi.run(思考パターン)', () => {
  it('歩兵がそろうまでは、より高価なユニットを買えても歩兵を生産する', () => {
    // 資金 10000。既定の思考パターンなら対空戦車(8000)を買うところで歩兵を選ぶ
    const { economy, ai } = setup(
      {
        name: 't',
        terrain: ['F..'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
      },
      { behavior: CHARGE_BEHAVIOR },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('infantry');
    expect(economy.getFunds('enemy')).toBe(9000);
  });

  it('歩兵がそろったら、安いユニットは買わずに資金を貯める', () => {
    // 歩兵 6 体で目標数に到達済み。資金 10000 では工場の最強ユニット(重戦車 18000)の
    // 半額 9000 に届くユニットを買えないため、このターンは生産を見送る
    const { economy, ai } = setup(
      {
        name: 't',
        terrain: ['F......'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [1, 2, 3, 4, 5, 6].map((col) => ({
          col,
          row: 0,
          unitType: 'infantry' as const,
          army: 'enemy' as const,
        })),
      },
      { behavior: CHARGE_BEHAVIOR },
    );

    expect(actionsOfKind(ai.run(), 'produce')).toHaveLength(0);
    expect(economy.getFunds('enemy')).toBe(10000);
  });

  it('資金が貯まれば、強力なユニットを生産する', () => {
    const { ai } = setup(
      {
        name: 't',
        terrain: ['F......'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [1, 2, 3, 4, 5, 6].map((col) => ({
          col,
          row: 0,
          unitType: 'infantry' as const,
          army: 'enemy' as const,
        })),
      },
      { behavior: CHARGE_BEHAVIOR, funds: 12000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('mediumTank');
  });

  it('中立優先の思考パターンは、自軍所有の工場より中立都市を先に占領する', () => {
    // (0,0) 中立都市 / (1,0) 自軍の工場 / (2,0) 敵歩兵。どちらも移動範囲内にある
    const def: MapDefinition = {
      name: 't',
      terrain: ['cF.'],
      owners: [{ col: 1, row: 0, owner: 'player' }],
      units: [{ col: 2, row: 0, unitType: 'infantry', army: 'enemy' }],
    };

    const neutralFirst = actionsOfKind(
      setup(def, { behavior: CHARGE_BEHAVIOR }).ai.run(),
      'capture',
    );
    expect(neutralFirst).toHaveLength(1);
    expect(neutralFirst[0].result.tile.position).toEqual(gridPosition(0, 0));

    // 既定の思考パターンは拠点の格(工場 > 都市)を優先するため工場を狙う
    const standard = actionsOfKind(setup(def).ai.run(), 'capture');
    expect(standard).toHaveLength(1);
    expect(standard[0].result.tile.position).toEqual(gridPosition(1, 0));
  });

  it('突撃型の歩兵は、近くの敵ではなく中立都市の制圧へ向かう', () => {
    // (0,0) 中立都市 / (5,0) 敵歩兵 / (11,0) 自軍歩兵。敵歩兵からはどちらも移動範囲外
    const def: MapDefinition = {
      name: 't',
      terrain: ['c...........'],
      units: [
        { col: 5, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 11, row: 0, unitType: 'infantry', army: 'player' },
      ],
    };

    const charge = actionsOfKind(
      setup(def, { behavior: CHARGE_BEHAVIOR }).ai.run(),
      'move',
    );
    expect(charge).toHaveLength(1);
    // 中立都市のある西へ進む
    expect(charge[0].to).toEqual(gridPosition(2, 0));

    // 既定の思考パターンは最寄りの敵(東)へ近づく
    const standard = actionsOfKind(setup(def).ai.run(), 'move');
    expect(standard).toHaveLength(1);
    expect(standard[0].to).toEqual(gridPosition(8, 0));
  });

  it('突撃型は敵が見えていなくても、山を迂回して本拠地へ向かう', () => {
    // col 1 の row 0〜2 を山が塞ぐ。(2,0) の自軍本拠地へは row 3 を回り込むしかない
    const def: MapDefinition = {
      name: 't',
      terrain: ['.mH', '.m.', '.m.', '...'],
      owners: [{ col: 2, row: 0, owner: 'player' }],
      units: [{ col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' }],
    };

    const charge = setup(def, { behavior: CHARGE_BEHAVIOR }).ai.run();
    const moves = actionsOfKind(charge, 'move');
    expect(moves).toHaveLength(1);
    // 直線距離では遠ざかるが、回り込みルートの入口である南へ動く
    expect(moves[0].to).toEqual(gridPosition(2, 3));

    // 既定の思考パターンは直線距離で測るため、山の手前から動けず待機する
    const standard = setup(def).ai.run();
    expect(actionsOfKind(standard, 'move')).toHaveLength(0);
    expect(actionsOfKind(standard, 'wait')).toHaveLength(1);
  });

  it('思考パターンを指定しなければ既定パターンで動く', () => {
    const { ai } = setup({ name: 't', terrain: ['...'] });
    expect(ai.aiBehavior).toEqual(DEFAULT_AI_BEHAVIOR);
  });

  it('移動を伴う行動には、描画に使う移動経路が付く', () => {
    // 12 マス平地。敵戦車は西端、自軍歩兵は届かない東端にいるので東へ近づくだけ
    const { ai } = setup({
      name: 't',
      terrain: ['............'],
      units: [
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 11, row: 0, unitType: 'infantry', army: 'player' },
      ],
    });

    const moves = actionsOfKind(ai.run(), 'move');
    expect(moves).toHaveLength(1);
    const { path, from, to } = moves[0];
    // 経路は移動前の位置から始まり、停止マスで終わる
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // 1 マスずつ通ったマスが抜けなく並んでいる
    expect(path).toHaveLength(to.col - from.col + 1);
    expect(path.map((pos) => pos.col)).toEqual(path.map((_, index) => from.col + index));
  });
});

describe('EnemyAi.runSteps', () => {
  /** 敵戦車・敵歩兵と自軍歩兵を置き、敵軍に生産資金を持たせたテスト用の盤面 */
  const def: MapDefinition = {
    name: 't',
    terrain: ['F...........', '............'],
    owners: [{ col: 0, row: 0, owner: 'enemy' }],
    units: [
      // 自軍歩兵は戦車の移動力では届かない距離に置き、この手番は接近(移動)だけさせる
      { col: 1, row: 1, unitType: 'mediumTank', army: 'enemy' },
      { col: 11, row: 1, unitType: 'infantry', army: 'player' },
    ],
  };

  it('1 行動ずつ実行でき、まとめて実行した run() と同じログになる', () => {
    const stepwise = [...setup(def, { funds: 5000 }).ai.runSteps()];
    const batched = setup(def, { funds: 5000 }).ai.run();

    expect(stepwise.map((action) => action.kind)).toEqual(
      batched.map((action) => action.kind),
    );
    // 移動と生産の両方が含まれる手番であることを確かめておく
    expect(stepwise.some((action) => action.kind === 'move')).toBe(true);
    expect(stepwise.some((action) => action.kind === 'produce')).toBe(true);
  });

  it('next() を呼ぶまで次の行動は実行されない(盤面がまだ変わらない)', () => {
    const { units, economy, ai } = setup(def, { funds: 5000 });
    const steps = ai.runSteps();
    const before = economy.getFunds('enemy');

    // 1 手目(戦車の移動)だけを実行する
    const first = steps.next();
    expect(first.done).toBe(false);
    expect(first.value?.kind).toBe('move');
    // 生産はまだ実行していないので、資金もユニット数も変わっていない
    expect(economy.getFunds('enemy')).toBe(before);
    expect(units.getUnitsByArmy('enemy')).toHaveLength(1);

    // 残りを進めると生産が行われる
    const rest = [...steps];
    expect(rest.some((action) => action.kind === 'produce')).toBe(true);
    expect(economy.getFunds('enemy')).toBeLessThan(before);
    expect(units.getUnitsByArmy('enemy').length).toBeGreaterThan(1);
  });

  it('途中で列挙をやめると、残りのユニットは行動しないまま止まる', () => {
    const twoUnits: MapDefinition = {
      name: 't',
      terrain: ['............'],
      units: [
        { col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 11, row: 0, unitType: 'infantry', army: 'player' },
      ],
    };
    const { units, ai } = setup(twoUnits);
    const steps = ai.runSteps();
    steps.next();

    const acted = units.getUnitsByArmy('enemy').filter((unit) => unit.hasActed);
    expect(acted).toHaveLength(1);
  });
});
