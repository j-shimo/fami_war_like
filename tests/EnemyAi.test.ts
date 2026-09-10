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
import type { UnitType } from '@/core/units/UnitType';
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
  roster: [],
  powerCostRatio: 0.5,
  saveForUpgrade: false,
  indirectPriority: false,
  advance: 'captureAndCharge',
  routing: 'path',
  preferNeutralCapture: true,
  avoidUnfavorableAttack: false,
  indirectStandoff: false,
  nightVisionFloor: 0,
  regroupRadius: 0,
};

/**
 * 猟兵長ヴェスパの思考パターン(編成表をそろえてから戦力を一段ずつ引き上げる)。
 * 個々の要素を切り分けて確かめられるよう、テストごとに一部だけ差し替えて使う。
 */
const HUNTER_BEHAVIOR: AiBehavior = {
  production: 'roster',
  infantryQuota: 0,
  roster: [
    { unitType: 'infantry', count: 4 },
    { unitType: 'recon', count: 1 },
  ],
  powerCostRatio: 0.3,
  saveForUpgrade: true,
  indirectPriority: false,
  advance: 'captureAndCharge',
  routing: 'path',
  preferNeutralCapture: true,
  avoidUnfavorableAttack: false,
  indirectStandoff: true,
  nightVisionFloor: 2,
  regroupRadius: 2,
};

/**
 * 城塞長バルドの思考パターン(自陣を固めて受け止める守り型)。
 * 生産まわりを確かめるテストでは、歩兵の目標数だけ 0 に差し替えて使う。
 */
const DEFEND_BEHAVIOR: AiBehavior = {
  production: 'infantryFirst',
  infantryQuota: 8,
  roster: [],
  powerCostRatio: 0,
  saveForUpgrade: false,
  indirectPriority: true,
  advance: 'defendBase',
  routing: 'path',
  preferNeutralCapture: true,
  avoidUnfavorableAttack: true,
  indirectStandoff: false,
  nightVisionFloor: 0,
  regroupRadius: 0,
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

  it('攻撃できない敵しか見えていないときは、その敵ではなく拠点を目標に前進する', () => {
    // 海の潜水艦(5,1)は中戦車では攻撃できない相手。目標にすると海岸に貼りついたまま
    // 攻撃も前進もできなくなるため、中立都市(2,0)のほうへ向かう
    const { units, ai } = setup({
      name: 'unattackable',
      terrain: ['..c.....', '~~~~~~~~'],
      units: [
        { col: 5, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 5, row: 1, unitType: 'submarine', army: 'player' },
      ],
    });

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    // 占領できない中戦車は拠点の上で止まらないため、1 マス手前の(3,0)まで進む
    expect(moves[0].to).toEqual(gridPosition(3, 0));
    expect(units.getUnitAt(gridPosition(3, 0))?.unitType).toBe('mediumTank');
  });

  it('占領できないユニットは、未占領の拠点の上では足を止めず 1 マス手前で止まる', () => {
    // 1 マスには 1 体しか立てないため、戦車が中立都市に居座ると自軍の歩兵が占領できなくなる。
    // 目標が都市そのものでも、隣のマスで止まって歩兵に道を空ける
    const { units, ai } = setup({
      name: 't',
      terrain: ['rrrc'],
      units: [{ col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' }],
    });

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(gridPosition(2, 0));
    expect(units.getUnitAt(gridPosition(3, 0))).toBeUndefined();
  });

  it('未占領の拠点の上にいる占領できないユニットは、そこから退く', () => {
    // すでに都市の上にいる戦車。そのままでは自軍の歩兵が永久に占領できないので隣へどく
    const { units, ai } = setup({
      name: 't',
      terrain: ['rcr'],
      units: [{ col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' }],
    });
    const tank = units.getUnitAt(gridPosition(1, 0))!;

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    expect(tank.position).not.toEqual(gridPosition(1, 0));
  });

  it('占領できる歩兵は、拠点の上で止まってそのまま占領する', () => {
    // 上の 2 件と同じ盤面でも、歩兵は拠点へ乗って占領する(退く対象は占領できないユニットだけ)
    const { map, ai } = setup({
      name: 't',
      terrain: ['rrrc'],
      units: [{ col: 0, row: 0, unitType: 'infantry', army: 'enemy' }],
    });

    const captures = actionsOfKind(ai.run(), 'capture');

    expect(captures).toHaveLength(1);
    expect(captures[0].movedTo).toEqual(gridPosition(3, 0));
    expect(map.getTile(gridPosition(3, 0))?.captureHp).toBeLessThan(20);
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

  it('占領役の歩兵が目標数に届くまでは、高価なユニットより歩兵を先に生産する', () => {
    // 資金は十分にあるが、歩兵が 1 体もいないうちは占領役をそろえる。
    // 収入の多いマップで戦車だけを買い続け、拠点を 1 つも占領できなくなるのを防ぐ
    const { units, ai } = setup(
      {
        name: 'infantry-floor',
        // 生産した歩兵が工場から出ていくよう、占領先の中立都市を並べてある
        terrain: ['F.c.c.c..'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
      },
      { funds: 40000 },
    );

    const bought: string[] = [];
    for (let turn = 1; turn <= 4; turn++) {
      for (const unit of units.getUnitsByArmy('enemy')) {
        unit.hasActed = false;
      }
      const produced = actionsOfKind(ai.run(), 'produce');
      bought.push(...produced.map((action) => action.result.unit.unitType));
    }

    // 既定の目標数は 3 体。そろったあとは通常どおり最も高価なユニット(重戦車)を買う
    expect(bought).toEqual(['infantry', 'infantry', 'infantry', 'heavyTank']);
  });

  it('歩兵がそろっていれば、空の生産拠点で最も高価なユニットを生産する', () => {
    // col0 に敵軍の工場(空)。資金 10000 で工場で最も高価な対空戦車(8000)を生産する。
    // 生産したユニットの行き先になるよう、端に中立都市を置いてある。
    // 占領役の歩兵は目標数(既定は 3 体)を満たしているので、生産は強力なユニットへ回る
    const { units, economy, ai } = setup({
      name: 't',
      terrain: ['F.c..'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [
        { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 3, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 4, row: 0, unitType: 'infantry', army: 'enemy' },
      ],
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
  /**
   * 敵軍の空港(0,0)と、離れた位置に置いた自軍ユニットだけのマップ。
   * 端の中立都市は、生産したユニットの行き先(占領目標)として置いてある
   * (行き先がまったく無い盤面では、そもそも戦力を生産しないため)。
   */
  function airportMap(playerUnits: MapDefinition['units']): MapDefinition {
    return {
      name: 'airport-production',
      terrain: ['A.........c'],
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
    // (占領役の歩兵は目標数を満たしている)
    const { ai } = setup(
      {
        name: 'factory-production',
        terrain: ['F..........'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 3, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 10, row: 0, unitType: 'mediumTank', army: 'player' },
        ],
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
    const infantrySquad = [
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
      { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
      { col: 3, row: 0, unitType: 'infantry', army: 'enemy' },
    ] as const;
    const withAirport = setup(
      {
        name: 'airport',
        terrain: ['F.........A'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [...infantrySquad],
      },
      { funds: 14000 },
    );
    const boughtWithAirport = actionsOfKind(withAirport.ai.run(), 'produce');
    expect(boughtWithAirport[0].result.unit.unitType).toBe('antiAirRocketArtillery');

    const withoutAirport = setup(
      {
        name: 'no-airport',
        terrain: ['F.........c'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [...infantrySquad],
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
        terrain: ['F.....c'],
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
        terrain: ['F.....c'],
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

describe('EnemyAi.run(編成表と資金の積み上げ)', () => {
  /** 敵軍の工場 1 つと、生産の絞り込みに使う自軍の歩兵 1 体だけを置いたマップ */
  function factoryMap(enemyUnits: readonly UnitType[]): MapDefinition {
    return {
      name: 't',
      terrain: ['F.........'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [
        { col: 9, row: 0, unitType: 'infantry', army: 'player' },
        ...enemyUnits.map((unitType, index) => ({
          col: index + 1,
          row: 0,
          unitType,
          army: 'enemy' as const,
        })),
      ],
    };
  }

  it('編成表に足りない種別があれば、強力なユニットより先に補充する', () => {
    // 資金 10000。編成表を持たなければ対空戦車(8000)を買うところで、歩兵から埋める
    const { economy, ai } = setup(factoryMap([]), {
      behavior: HUNTER_BEHAVIOR,
      funds: 10000,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('infantry');
    expect(economy.getFunds('enemy')).toBe(9000);
  });

  it('歩兵がそろえば、編成表の次の種別(偵察車)を補充する', () => {
    const { ai } = setup(factoryMap(['infantry', 'infantry', 'infantry', 'infantry']), {
      behavior: HUNTER_BEHAVIOR,
      funds: 10000,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('recon');
  });

  it('編成表がそろったら、買える中で最も強力なユニットを生産する', () => {
    // 歩兵 4 体・偵察車 1 台で編成表を満たしている。資金 10000 で買える最強は対空戦車(8000)
    const roster: UnitType[] = ['infantry', 'infantry', 'infantry', 'infantry', 'recon'];
    const { ai } = setup(factoryMap(roster), {
      behavior: HUNTER_BEHAVIOR,
      funds: 10000,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('antiAirTank');
  });

  it('すでに持っている種別しか買えないターンは、一段上のために資金を貯める', () => {
    // 対空戦車(8000)はもう 1 台持っている。より高価な中戦車(12000)がまだ無いので見送る
    const roster: UnitType[] = [
      'infantry',
      'infantry',
      'infantry',
      'infantry',
      'recon',
      'antiAirTank',
    ];
    const { economy, ai } = setup(factoryMap(roster), {
      behavior: HUNTER_BEHAVIOR,
      funds: 10000,
    });

    expect(actionsOfKind(ai.run(), 'produce')).toHaveLength(0);
    expect(economy.getFunds('enemy')).toBe(10000);
  });

  it('資金が一段上に届けば、まだ持っていない強力なユニットを生産する', () => {
    const roster: UnitType[] = [
      'infantry',
      'infantry',
      'infantry',
      'infantry',
      'recon',
      'antiAirTank',
    ];
    const { ai } = setup(factoryMap(roster), {
      behavior: HUNTER_BEHAVIOR,
      funds: 12000,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('mediumTank');
  });

  it('戦力で負けているあいだは貯めず、いま買えるものを買って頭数を戻す', () => {
    // 編成は「すでに持っている種別しか買えない」状態(通常なら一段上のために見送る)。
    // ただし相手の中戦車 2 両(24000)に対して自軍の戦力は 15500 で劣勢なので、貯めずに買う
    const roster: UnitType[] = [
      'infantry',
      'infantry',
      'infantry',
      'infantry',
      'recon',
      'antiAirTank',
    ];
    const { ai } = setup(
      {
        name: 't',
        terrain: ['F...................'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          // 敵AIの手が届かない遠くに置き、このターンに撃破されないようにする
          { col: 18, row: 0, unitType: 'mediumTank', army: 'player' },
          { col: 19, row: 0, unitType: 'mediumTank', army: 'player' },
          ...roster.map((unitType, index) => ({
            col: index + 1,
            row: 0,
            unitType,
            army: 'enemy' as const,
          })),
        ],
      },
      { behavior: HUNTER_BEHAVIOR, funds: 10000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('antiAirTank');
  });

  it('傷ついた相手は戦力を割り引いて数える(HP が減っていれば劣勢にならない)', () => {
    // 相手の中戦車 2 両は HP1 まで削れており、戦力は 24000 × 0.1 × 2 = 4800。
    // 自軍(15500)のほうが上なので、従来どおり一段上のために資金を貯める
    const roster: UnitType[] = [
      'infantry',
      'infantry',
      'infantry',
      'infantry',
      'recon',
      'antiAirTank',
    ];
    const { units, ai } = setup(
      {
        name: 't',
        terrain: ['F...................'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          // 敵AIの手が届かない遠くに置き、このターンに撃破されないようにする
          { col: 18, row: 0, unitType: 'mediumTank', army: 'player' },
          { col: 19, row: 0, unitType: 'mediumTank', army: 'player' },
          ...roster.map((unitType, index) => ({
            col: index + 1,
            row: 0,
            unitType,
            army: 'enemy' as const,
          })),
        ],
      },
      { behavior: HUNTER_BEHAVIOR, funds: 10000 },
    );
    for (const col of [18, 19]) {
      units.getUnitAt(gridPosition(col, 0))!.currentHp = 1;
    }

    expect(actionsOfKind(ai.run(), 'produce')).toHaveLength(0);
  });

  it('資金を貯める思考パターンでなければ、同じ種別でも買い足す', () => {
    const roster: UnitType[] = [
      'infantry',
      'infantry',
      'infantry',
      'infantry',
      'recon',
      'antiAirTank',
    ];
    const { ai } = setup(factoryMap(roster), {
      behavior: { ...HUNTER_BEHAVIOR, saveForUpgrade: false },
      funds: 10000,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('antiAirTank');
  });

  it('夜戦では、視界の狭い重戦車を買わずに目の利く中戦車を選ぶ', () => {
    // 資金 20000。重戦車(18000)は視界 1 で夜戦では敵を見つけられないため候補から外れ、
    // 次に高価で視界 2 を持つ中戦車(12000)を買う
    const roster: UnitType[] = ['infantry', 'infantry', 'infantry', 'infantry', 'recon'];
    const { ai } = setup(factoryMap(roster), {
      behavior: HUNTER_BEHAVIOR,
      funds: 20000,
      nightBattle: true,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('mediumTank');
  });

  it('昼戦では視界を気にせず、最も強力な重戦車を買う', () => {
    const roster: UnitType[] = ['infantry', 'infantry', 'infantry', 'infantry', 'recon'];
    const { ai } = setup(factoryMap(roster), {
      behavior: HUNTER_BEHAVIOR,
      funds: 20000,
    });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('heavyTank');
  });
});

describe('EnemyAi.run(間合いと隊列)', () => {
  /**
   * 自走砲(射程 2〜3・移動 4)と自軍歩兵だけを平地に置いたマップ。
   * 自走砲はその場から届かないため、接近の判断だけがログに出る。
   */
  const STANDOFF_MAP: MapDefinition = {
    name: 't',
    terrain: ['..........'],
    units: [
      { col: 0, row: 0, unitType: 'artillery', army: 'enemy' },
      { col: 4, row: 0, unitType: 'infantry', army: 'player' },
    ],
  };

  it('間合いを取る思考パターンの間接攻撃ユニットは、最小射程より内側へ踏み込まない', () => {
    const { ai } = setup(STANDOFF_MAP, {
      behavior: { ...HUNTER_BEHAVIOR, regroupRadius: 0 },
    });

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    // 次のターンにその場から撃てるよう、射程 2〜3 に収まるマスで止まる
    const distance = 4 - moves[0].to.col;
    expect(distance).toBeGreaterThanOrEqual(2);
    expect(distance).toBeLessThanOrEqual(3);
  });

  it('間合いを取らない思考パターンでは、撃てなくなる距離まで詰めてしまう', () => {
    const { ai } = setup(STANDOFF_MAP, {
      behavior: { ...HUNTER_BEHAVIOR, regroupRadius: 0, indirectStandoff: false },
    });

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    // 敵の隣(最小射程 2 の内側)まで踏み込むため、次のターンも攻撃できない
    expect(moves[0].to).toEqual(gridPosition(3, 0));
  });

  it('隊列を保つ思考パターンでは、味方を置き去りにして突出しない', () => {
    // 中戦車(移動 5)は足の遅い味方の重戦車(移動 4)から 2 マス以内に留まり、col6 まで走らない
    const { ai } = setup(
      {
        name: 't',
        terrain: ['............'],
        units: [
          { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
          { col: 0, row: 0, unitType: 'heavyTank', army: 'enemy' },
          { col: 11, row: 0, unitType: 'infantry', army: 'player' },
        ],
      },
      { behavior: { ...HUNTER_BEHAVIOR, indirectStandoff: false } },
    );

    const tankMove = actionsOfKind(ai.run(), 'move').find(
      (move) => move.unit.unitType === 'mediumTank',
    );

    expect(tankMove?.to).toEqual(gridPosition(2, 0));
  });

  it('占領役(歩兵)は隊列に縛られず、拠点を取りに散らばる', () => {
    // 歩兵は味方から離れても中立都市へ向かう(拠点は散らばっているため)
    const { ai } = setup(
      {
        name: 't',
        terrain: ['..........c'],
        units: [
          { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 0, row: 0, unitType: 'heavyTank', army: 'enemy' },
        ],
      },
      { behavior: HUNTER_BEHAVIOR },
    );

    const infantryMove = actionsOfKind(ai.run(), 'move').find(
      (move) => move.unit.unitType === 'infantry',
    );

    // 移動力 3 ぶん都市へ近づく(味方の重戦車から 2 マス以内には収まらない)
    expect(infantryMove?.to).toEqual(gridPosition(4, 0));
  });

  it('味方が 1 体もいなければ、隊列を気にせず前進する', () => {
    const { ai } = setup(
      {
        name: 't',
        terrain: ['............'],
        units: [
          { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
          { col: 11, row: 0, unitType: 'infantry', army: 'player' },
        ],
      },
      { behavior: { ...HUNTER_BEHAVIOR, indirectStandoff: false } },
    );

    const moves = actionsOfKind(ai.run(), 'move');

    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(gridPosition(6, 0));
  });
});

describe('EnemyAi.run(守りの思考パターン)', () => {
  it('戦闘ユニットは敵へ突撃せず、自軍の拠点のそばまで下がる', () => {
    // (0,0) 敵軍の工場 / (3,0) 敵中戦車 / (10,0) 自軍歩兵。中戦車からは攻撃も占領もできない
    const def: MapDefinition = {
      name: 't',
      terrain: ['F.........c'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [
        { col: 3, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: 10, row: 0, unitType: 'infantry', army: 'player' },
      ],
    };

    const defend = actionsOfKind(
      setup(def, { behavior: DEFEND_BEHAVIOR }).ai.run(),
      'move',
    );
    expect(defend).toHaveLength(1);
    // 敵から離れて工場のそば(2 マス以内)まで下がる。ただし工場そのものには乗らない
    // (居座っているあいだ、その工場では生産できなくなるため)
    expect(defend[0].to.row).toBe(0);
    expect(defend[0].to.col).toBeGreaterThanOrEqual(1);
    expect(defend[0].to.col).toBeLessThanOrEqual(2);

    // 既定の思考パターンは最寄りの敵(東)へ近づく
    const standard = actionsOfKind(setup(def).ai.run(), 'move');
    expect(standard).toHaveLength(1);
    expect(standard[0].to).toEqual(gridPosition(8, 0));
  });

  it('守る拠点は、見えている敵にいちばん近い自軍拠点を選ぶ', () => {
    // (0,0) と (10,0) が敵軍の都市。(5,0) の敵中戦車は、敵の来ている側の都市を守る
    const twoCities = (enemyCol: number): MapDefinition => ({
      name: 't',
      terrain: [
        'c.........c',
        '...........',
        '...........',
        '...........',
        '...........',
      ],
      owners: [
        { col: 0, row: 0, owner: 'enemy' },
        { col: 10, row: 0, owner: 'enemy' },
      ],
      units: [
        { col: 5, row: 0, unitType: 'mediumTank', army: 'enemy' },
        { col: enemyCol, row: 4, unitType: 'infantry', army: 'player' },
      ],
    });

    // 自軍歩兵が東(10,4)にいれば東の都市へ、西(0,4)にいれば西の都市へ向かう
    const east = actionsOfKind(
      setup(twoCities(10), { behavior: DEFEND_BEHAVIOR }).ai.run(),
      'move',
    );
    expect(east).toHaveLength(1);
    expect(east[0].to).toEqual(gridPosition(10, 0));

    const west = actionsOfKind(
      setup(twoCities(0), { behavior: DEFEND_BEHAVIOR }).ai.run(),
      'move',
    );
    expect(west).toHaveLength(1);
    expect(west[0].to).toEqual(gridPosition(0, 0));
  });

  it('占領役の歩兵は守りに縛られず、拠点を取りに向かう', () => {
    // (0,0) 中立都市 / (5,0) 敵歩兵 / (10,0) 敵軍の工場(守る拠点)
    const { ai } = setup(
      {
        name: 't',
        terrain: ['c.........F'],
        owners: [{ col: 10, row: 0, owner: 'enemy' }],
        units: [{ col: 5, row: 0, unitType: 'infantry', army: 'enemy' }],
      },
      { behavior: DEFEND_BEHAVIOR },
    );

    const moves = actionsOfKind(ai.run(), 'move');

    // 守る拠点(東)ではなく、中立都市のある西へ移動力 3 ぶん進む
    expect(moves).toHaveLength(1);
    expect(moves[0].to).toEqual(gridPosition(2, 0));
  });

  it('相性で不利な戦闘(反撃のほうが重い攻撃)はしかけない', () => {
    // 敵歩兵の隣に自軍の中戦車。歩兵の攻撃は通りが悪く、反撃のほうが重い
    const def: MapDefinition = {
      name: 't',
      terrain: ['...'],
      units: [
        { col: 0, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 1, row: 0, unitType: 'mediumTank', army: 'player' },
      ],
    };

    expect(
      actionsOfKind(setup(def, { behavior: DEFEND_BEHAVIOR }).ai.run(), 'attack'),
    ).toHaveLength(0);

    // 既定の思考パターンは相性を気にせず攻撃する
    const standard = actionsOfKind(setup(def).ai.run(), 'attack');
    expect(standard).toHaveLength(1);
    // 与ダメージより反撃のほうが重い(不利な戦闘だった)ことを確かめる
    expect(standard[0].result.counterDamage).toBeGreaterThan(
      standard[0].result.damageDealt,
    );
  });

  it('不利な相性でも、撃破できるなら攻撃する', () => {
    const { units, ai } = setup(
      {
        name: 't',
        terrain: ['...'],
        units: [
          { col: 0, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 1, row: 0, unitType: 'mediumTank', army: 'player' },
        ],
      },
      { behavior: DEFEND_BEHAVIOR },
    );
    // 残り HP 1 の中戦車なら歩兵でも撃破でき、撃破すれば反撃も受けない
    units.getUnitAt(gridPosition(1, 0))!.currentHp = 1;

    const attacks = actionsOfKind(ai.run(), 'attack');

    expect(attacks).toHaveLength(1);
    expect(attacks[0].result.defenderDefeated).toBe(true);
  });

  it('頭数がそろったあとは、遠距離ユニットを優先して生産する', () => {
    // 敵軍の工場と中戦車 1 台。資金 12000 なら既定では中戦車を買うところ
    const { ai } = setup(
      {
        name: 't',
        terrain: ['F.......', '........'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          { col: 0, row: 1, unitType: 'mediumTank', army: 'enemy' },
          { col: 7, row: 1, unitType: 'infantry', army: 'player' },
        ],
      },
      { behavior: { ...DEFEND_BEHAVIOR, infantryQuota: 0 }, funds: 12000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    // ロケット砲(15000)には資金が足りないため、買える中で最も高価な間接攻撃ユニットを選ぶ
    expect(produced[0].result.unit.unitType).toBe('artillery');
  });

  it('遠距離ユニットが前に立つ戦力を上回ったら、通常どおり強力なユニットを買う', () => {
    // 自走砲 2 両に対して中戦車 1 両。遠距離が多すぎるため、今回は戦車を買い足す
    const { ai } = setup(
      {
        name: 't',
        terrain: ['F.......', '........'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          { col: 0, row: 1, unitType: 'mediumTank', army: 'enemy' },
          { col: 1, row: 1, unitType: 'artillery', army: 'enemy' },
          { col: 2, row: 1, unitType: 'artillery', army: 'enemy' },
          { col: 7, row: 1, unitType: 'infantry', army: 'player' },
        ],
      },
      { behavior: { ...DEFEND_BEHAVIOR, infantryQuota: 0 }, funds: 12000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('mediumTank');
  });

  it('歩兵の目標数に届くまでは、遠距離より先に歩兵を生産する', () => {
    const { ai } = setup(
      {
        name: 't',
        terrain: ['F.......', '........'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          { col: 0, row: 1, unitType: 'mediumTank', army: 'enemy' },
          { col: 7, row: 1, unitType: 'infantry', army: 'player' },
        ],
      },
      { behavior: DEFEND_BEHAVIOR, funds: 12000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('infantry');
  });
});

describe('EnemyAi.run(輸送)', () => {
  /**
   * 海で 2 つに分かれたマップ。
   * 上段(row 0)が敵軍の陸地で、港・浜辺・敵歩兵を置く。下段(row 2)は海を挟んだ対岸で、
   * 中立都市がある。歩兵は自力では渡れないため、輸送艦に乗らないと占領できない。
   */
  const SPLIT_MAP: MapDefinition = {
    name: 'split',
    terrain: ['P.b...', '~~~~~~', 'b.c...'],
    owners: [{ col: 0, row: 0, owner: 'enemy' }],
  };

  /** SPLIT_MAP に敵軍のユニットを置いた盤面を作る */
  function splitMap(units: MapDefinition['units']): MapDefinition {
    return { ...SPLIT_MAP, units };
  }

  it('自分の足で行けない拠点が残っていれば、味方の輸送艦へ乗り込む', () => {
    // 対岸の中立都市(2,2)は歩兵では届かない。港に停泊した輸送艦へ乗り込む
    const { units, ai } = setup(
      splitMap([
        { col: 0, row: 0, unitType: 'transportShip', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
      ]),
    );
    const ship = units.getUnitAt(gridPosition(0, 0))!;

    const boards = actionsOfKind(ai.run(), 'board');

    expect(boards).toHaveLength(1);
    expect(boards[0].unit.unitType).toBe('infantry');
    expect(boards[0].transport).toBe(ship);
    // 搭乗した歩兵は盤面から外れ、輸送艦が抱える
    expect(ship.carried).toHaveLength(1);
    expect(units.getUnitAt(gridPosition(1, 0))).toBeUndefined();
  });

  it('陸続きの拠点が占領役の数より多いうちは、船に乗らず自分の足で向かう', () => {
    // 自陣側にも中立都市を 2 つ置く。歩兵 1 体では取り切れないので、まず陸の拠点へ向かう
    const { units, ai } = setup({
      name: 'split-with-local-cities',
      terrain: ['P.b.cc', '~~~~~~', 'b.c...'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [
        { col: 0, row: 0, unitType: 'transportShip', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
      ],
    });
    const ship = units.getUnitAt(gridPosition(0, 0))!;

    const actions = ai.run();

    expect(actionsOfKind(actions, 'board')).toHaveLength(0);
    expect(ship.carried).toHaveLength(0);
    // 歩兵は陸の中立都市へ向かって前進する
    expect(actionsOfKind(actions, 'move')).not.toHaveLength(0);
  });

  it('移動範囲の外にいる輸送艦へは、乗船地点まで歩いて向かう', () => {
    // 輸送艦は港(0,0)、歩兵は 7 マス離れた(7,0)。1 ターンでは届かないため歩いて合流する。
    // 海の潜水艦(7,1)は歩兵では攻撃できない相手で、これを目標にすると
    // 海岸に貼りついたまま輸送艦のところへ行かなくなってしまう
    const { units, ai } = setup({
      name: 'ferry-far',
      terrain: ['P.b.....', '~~~~~~~~', 'b.c.....'],
      owners: [{ col: 0, row: 0, owner: 'enemy' }],
      units: [
        { col: 0, row: 0, unitType: 'transportShip', army: 'enemy' },
        { col: 7, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 7, row: 1, unitType: 'submarine', army: 'player' },
      ],
    });

    // 1 ターン目は輸送艦へ向かって前進する(移動力 3 ぶん)
    const infantry = units.getUnitAt(gridPosition(7, 0))!;
    ai.run();
    expect(infantry.position).toEqual(gridPosition(4, 0));

    // 2 ターン目に浜辺(2,0)で待つ輸送艦へ乗り込む
    for (const unit of units.getUnitsByArmy('enemy')) {
      unit.hasActed = false;
    }
    const boards = actionsOfKind(ai.run(), 'board');

    expect(boards).toHaveLength(1);
    expect(boards[0].unit).toBe(infantry);
  });

  it('まだ輸送艦が着いていない乗船地点には立たず、隣を空けて待つ', () => {
    // 歩兵は浜辺(2,0)の上にいる。そこに居座ると輸送艦が入れず、海の上で止まったまま
    // 永久に乗り込めなくなるため、輸送艦が着くまでは隣のマスへどく
    const { units, ai } = setup({
      name: 'berth-reserve',
      terrain: ['..b.....', '~~~~~~~~', 'b.c.....'],
      units: [
        { col: 7, row: 1, unitType: 'transportShip', army: 'enemy' },
        { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
      ],
    });
    const infantry = units.getUnitAt(gridPosition(2, 0))!;

    ai.run();

    expect(infantry.position).not.toEqual(gridPosition(2, 0));

    // 空いた浜辺へ輸送艦が着き、次のターンに乗り込める
    for (const unit of units.getUnitsByArmy('enemy')) {
      unit.hasActed = false;
    }
    const boards = actionsOfKind(ai.run(), 'board');

    expect(boards).toHaveLength(1);
    expect(boards[0].unit).toBe(infantry);
  });

  it('空の輸送艦は、渡る必要のない味方ではなく海を渡りたい歩兵を迎えに行く', () => {
    // 直線距離では対岸の中戦車(6,2)のほうが近いが、渡る必要があるのは自陣の歩兵(0,0)。
    // 中戦車を迎えに目の前の浜辺(5,2)へ着けてしまうと、歩兵は置き去りで海を渡れない
    const { units, ai } = setup({
      name: 'ferry-pickup',
      terrain: ['b.......', '~~~~~~~~', '.....b.c'],
      units: [
        { col: 5, row: 1, unitType: 'transportShip', army: 'enemy' },
        { col: 0, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 6, row: 2, unitType: 'mediumTank', army: 'enemy' },
      ],
    });
    const ship = units.getUnitAt(gridPosition(5, 1))!;
    const infantry = units.getUnitAt(gridPosition(0, 0))!;

    ai.run();

    // 歩兵が待つ浜辺(0,0)の目の前まで寄る(対岸の浜辺(5,2)ではない)
    expect(ship.position).toEqual(gridPosition(0, 1));

    for (const unit of units.getUnitsByArmy('enemy')) {
      unit.hasActed = false;
    }
    const boards = actionsOfKind(ai.run(), 'board');

    expect(boards).toHaveLength(1);
    expect(boards[0].unit).toBe(infantry);
  });

  it('海を渡れない輸送車には乗り込まない(荷物のまま岸で止まらないように)', () => {
    const { units, ai } = setup(
      splitMap([
        { col: 0, row: 0, unitType: 'transportVehicle', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
      ]),
    );
    const truck = units.getUnitAt(gridPosition(0, 0))!;

    expect(actionsOfKind(ai.run(), 'board')).toHaveLength(0);
    expect(truck.carried).toHaveLength(0);
  });

  it('積んだ輸送艦は対岸へ渡り、降ろせる岸で歩兵を降ろす', () => {
    const { map, units, ai } = setup(
      splitMap([{ col: 0, row: 0, unitType: 'transportShip', army: 'enemy' }]),
    );
    const ship = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.spawnUnit({
      unitType: 'infantry',
      army: 'enemy',
      position: gridPosition(1, 0),
    });
    units.carryUnit(ship, infantry);
    infantry.hasActed = false;

    const unloads = actionsOfKind(ai.run(), 'unload');

    expect(unloads).toHaveLength(1);
    expect(unloads[0].passenger).toBe(infantry);
    // 目的地の中立都市(2,2)へ横付けし、そのマスへ直接降ろす(次のターンから占領できる)
    expect(unloads[0].droppedAt).toEqual(gridPosition(2, 2));
    expect(units.getUnitAt(gridPosition(2, 2))).toBe(infantry);
    expect(ship.carried).toHaveLength(0);
    expect(map.getTile(gridPosition(2, 2))?.owner).toBe('neutral');
  });

  it('空の輸送艦は、歩兵が乗り込める浜辺で待つ(港をふさがない)', () => {
    // 輸送艦は港(0,0)にいる。港に居座ると生産が止まるため、浜辺(2,0)へ移って待つ
    const { units, ai } = setup(
      splitMap([
        { col: 0, row: 0, unitType: 'transportShip', army: 'enemy' },
        { col: 5, row: 0, unitType: 'infantry', army: 'enemy' },
      ]),
    );
    const ship = units.getUnitAt(gridPosition(0, 0))!;

    ai.run();

    expect(ship.position).toEqual(gridPosition(2, 0));
  });

  it('運ぶ相手がいなければ、輸送ユニットは前線へ出ずにその場で待つ', () => {
    const { units, ai } = setup(
      splitMap([{ col: 0, row: 0, unitType: 'transportShip', army: 'enemy' }]),
    );
    const ship = units.getUnitAt(gridPosition(0, 0))!;

    const waits = actionsOfKind(ai.run(), 'wait');

    expect(waits).toHaveLength(1);
    expect(ship.position).toEqual(gridPosition(0, 0));
  });

  it('海を挟んだ拠点が残っていれば、港で輸送艦を生産する', () => {
    // 対岸の中立都市へ渡る足が無い。資金があれば戦艦より先に輸送艦を買う
    const { ai } = setup(
      splitMap([{ col: 1, row: 0, unitType: 'infantry', army: 'enemy' }]),
      { funds: 40000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('transportShip');
  });

  it('輸送ユニットをすでに持っていれば、輸送艦を買い足さない', () => {
    const { ai } = setup(
      splitMap([
        { col: 2, row: 0, unitType: 'transportShip', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
      ]),
      { funds: 40000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced[0]?.result.unit.unitType).not.toBe('transportShip');
  });

  it('運ぶ相手(歩兵)がいなければ、輸送艦は買わない', () => {
    const { ai } = setup(splitMap([]), { funds: 40000 });

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced[0]?.result.unit.unitType).not.toBe('transportShip');
  });
});

describe('EnemyAi.run(行き先の無いユニットは作らない)', () => {
  it('海を渡れない戦車は、対岸の拠点しか残っていなければ生産しない', () => {
    // 工場(0,0)は敵軍のもの。中立都市は対岸(2,2)だけで、地上ユニットでは届かない。
    // 歩兵は輸送ユニットで運べるため、行き先が無くても生産の候補に残る
    const { ai } = setup(
      {
        name: 'no-land-target',
        terrain: ['F.....', '~~~~~~', '..c...'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [{ col: 1, row: 0, unitType: 'infantry', army: 'enemy' }],
      },
      { funds: 40000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('infantry');
  });

  it('陸続きの拠点が残っていれば、従来どおり強力な地上ユニットを生産する', () => {
    const { ai } = setup(
      {
        name: 'land-target',
        terrain: ['F....c', '~~~~~~', '..c...'],
        owners: [{ col: 0, row: 0, owner: 'enemy' }],
        units: [
          { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
          { col: 3, row: 0, unitType: 'infantry', army: 'enemy' },
        ],
      },
      { funds: 40000 },
    );

    const produced = actionsOfKind(ai.run(), 'produce');

    expect(produced).toHaveLength(1);
    expect(produced[0].result.unit.unitType).toBe('heavyTank');
  });
});

describe('EnemyAi.run(自軍の生産拠点をふさがない)', () => {
  it('同じだけ目標へ近づけるなら、自軍の工場では足を止めない', () => {
    // 敵戦車(移動 5)から目標の中立都市(9,1)まで、自軍の工場(5,0)と平地(4,1)は
    // どちらも距離 5 で並ぶ。工場で止まるとそのあいだ生産が止まるため、平地のほうを選ぶ
    const { units, ai } = setup({
      name: 'own-factory',
      terrain: ['.....F....', '.........c'],
      owners: [{ col: 5, row: 0, owner: 'enemy' }],
      units: [{ col: 0, row: 0, unitType: 'mediumTank', army: 'enemy' }],
    });
    const tank = units.getUnitAt(gridPosition(0, 0))!;

    ai.run();

    expect(tank.position).toEqual(gridPosition(4, 1));
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
