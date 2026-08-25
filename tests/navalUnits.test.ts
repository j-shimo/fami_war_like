import { describe, expect, it } from 'vitest';
import { canAttackUnit, findAttackableTargets } from '@/core/battle/AttackRange';
import { BattleManager } from '@/core/battle/BattleManager';
import { forecastBattle } from '@/core/battle/BattleForecast';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { RepairManager } from '@/core/economy/RepairManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import {
  calculateMovementRange,
  findTransportTargets,
  findUnloadPositions,
} from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import type { UnitType } from '@/core/units/UnitType';
import { canCarry } from '@/core/units/transport';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getUnitData } from '@/data/unitData';

/** 攻撃側・防御側を離して置いた 2 体を作る(位置はテストごとに上書きする) */
function makeUnit(
  unitType: UnitType,
  army: 'player' | 'enemy' = 'player',
  col = 0,
  row = 0,
): Unit {
  return new Unit({
    id: `${unitType}-${army}-${col}-${row}`,
    unitType,
    armyType: army,
    position: gridPosition(col, row),
  });
}

describe('海上ユニットの移動', () => {
  it('海と港の上を進めるが、陸には進入できない', () => {
    // 横一列: 平地・港・海・海・海・海
    const def: MapDefinition = { name: 'sea', terrain: ['.P~~~~'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 1, row: 0, unitType: 'battleship', army: 'player' },
    ]);
    const ship = units.getUnitAt(gridPosition(1, 0))!;

    const range = calculateMovementRange(ship, map, units);
    // 港(出発マス)と、右に続く海は移動力 5 のぶんだけ進める
    expect(range.canReach(gridPosition(1, 0))).toBe(true);
    expect(range.canReach(gridPosition(5, 0))).toBe(true);
    // 左隣の平地には入れない
    expect(range.canReach(gridPosition(0, 0))).toBe(false);
  });

  it('潜水艦は移動力4、戦艦・輸送艦は5、護衛艦は6', () => {
    expect(getUnitData('submarine').movement).toBe(4);
    expect(getUnitData('battleship').movement).toBe(5);
    expect(getUnitData('transportShip').movement).toBe(5);
    expect(getUnitData('escortShip').movement).toBe(6);
  });

  it('地上ユニットは港には入れるが海には入れない', () => {
    const def: MapDefinition = { name: 'coast', terrain: ['.P~~'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const infantry = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(infantry, map, units);
    expect(range.canReach(gridPosition(1, 0))).toBe(true); // 港
    expect(range.canReach(gridPosition(2, 0))).toBe(false); // 海
  });
});

describe('港での生産', () => {
  // 港(0,0)と工場(1,0)を並べた自軍の生産マップ
  const PROD_MAP: MapDefinition = {
    name: 'prod',
    terrain: ['PF~', '...'],
    owners: [
      { col: 0, row: 0, owner: 'player' },
      { col: 1, row: 0, owner: 'player' },
    ],
  };

  function setup(initialFunds = 40000) {
    const map = MapManager.fromDefinition(PROD_MAP);
    const units = UnitManager.fromPlacements([], map);
    const economy = new EconomyManager({ initialFunds });
    const production = new ProductionManager(units, economy);
    return { map, production };
  }

  it('港では海上ユニット 4 種を生産できるが、地上・飛行ユニットは生産できない', () => {
    const { map, production } = setup();
    const port = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduce('player', port, 'battleship')).toBe(true);
    expect(production.canProduce('player', port, 'escortShip')).toBe(true);
    expect(production.canProduce('player', port, 'transportShip')).toBe(true);
    expect(production.canProduce('player', port, 'submarine')).toBe(true);
    expect(production.canProduce('player', port, 'infantry')).toBe(false);
    expect(production.canProduce('player', port, 'attackHelicopter')).toBe(false);
  });

  it('工場では海上ユニットを生産できない', () => {
    const { map, production } = setup();
    const factory = map.getTile(gridPosition(1, 0))!;
    expect(production.canProduce('player', factory, 'battleship')).toBe(false);
    expect(() => production.produce('player', factory, 'submarine')).toThrow();
  });

  it('生産コストは戦艦35000・潜水艦30000・護衛艦22000・輸送艦16500', () => {
    expect(getUnitData('battleship').cost).toBe(35000);
    expect(getUnitData('submarine').cost).toBe(30000);
    expect(getUnitData('escortShip').cost).toBe(22000);
    expect(getUnitData('transportShip').cost).toBe(16500);
  });

  it('資金が足りなければ生産できない(戦艦は35000必要)', () => {
    const { map, production } = setup(34999);
    const port = map.getTile(gridPosition(0, 0))!;
    expect(production.canProduce('player', port, 'battleship')).toBe(false);
    expect(production.canProduce('player', port, 'submarine')).toBe(true);
  });
});

describe('海上ユニットの攻撃対象', () => {
  it('戦艦は潜水艦を攻撃できない', () => {
    expect(canAttackUnit(makeUnit('battleship'), makeUnit('submarine', 'enemy'))).toBe(
      false,
    );
  });

  it('戦艦は潜水艦以外(飛行ユニットを含む)を攻撃できる', () => {
    const battleship = makeUnit('battleship');
    expect(canAttackUnit(battleship, makeUnit('attackHelicopter', 'enemy'))).toBe(true);
    expect(canAttackUnit(battleship, makeUnit('transportHelicopter', 'enemy'))).toBe(
      true,
    );
    expect(canAttackUnit(battleship, makeUnit('infantry', 'enemy'))).toBe(true);
    expect(canAttackUnit(battleship, makeUnit('escortShip', 'enemy'))).toBe(true);
  });

  it('護衛艦はヘリ系と潜水艦だけを攻撃できる', () => {
    const escort = makeUnit('escortShip');
    expect(canAttackUnit(escort, makeUnit('submarine', 'enemy'))).toBe(true);
    expect(canAttackUnit(escort, makeUnit('attackHelicopter', 'enemy'))).toBe(true);
    expect(canAttackUnit(escort, makeUnit('transportHelicopter', 'enemy'))).toBe(true);
    // 固定翼機(戦闘機・爆撃機・攻撃機)は高い高度を速く飛ぶため撃てない
    expect(canAttackUnit(escort, makeUnit('fighter', 'enemy'))).toBe(false);
    expect(canAttackUnit(escort, makeUnit('bomber', 'enemy'))).toBe(false);
    expect(canAttackUnit(escort, makeUnit('attackAircraft', 'enemy'))).toBe(false);
    expect(canAttackUnit(escort, makeUnit('battleship', 'enemy'))).toBe(false);
    expect(canAttackUnit(escort, makeUnit('infantry', 'enemy'))).toBe(false);
    expect(canAttackUnit(escort, makeUnit('transportShip', 'enemy'))).toBe(false);
  });

  it('潜水艦は海上ユニットだけを攻撃できる', () => {
    const submarine = makeUnit('submarine');
    expect(canAttackUnit(submarine, makeUnit('battleship', 'enemy'))).toBe(true);
    expect(canAttackUnit(submarine, makeUnit('escortShip', 'enemy'))).toBe(true);
    expect(canAttackUnit(submarine, makeUnit('transportShip', 'enemy'))).toBe(true);
    expect(canAttackUnit(submarine, makeUnit('infantry', 'enemy'))).toBe(false);
    expect(canAttackUnit(submarine, makeUnit('attackHelicopter', 'enemy'))).toBe(false);
  });

  it('潜水艦を攻撃できるのは護衛艦と潜水艦だけ', () => {
    const submarine = makeUnit('submarine', 'enemy');
    const canHit = (unitType: UnitType): boolean =>
      canAttackUnit(makeUnit(unitType), submarine);
    expect(canHit('escortShip')).toBe(true);
    expect(canHit('submarine')).toBe(true);
    for (const unitType of [
      'infantry',
      'mediumTank',
      'artillery',
      'attackHelicopter',
      'antiAirTank',
      'battleship',
      'transportShip',
    ] as const) {
      expect(canHit(unitType)).toBe(false);
    }
  });

  it('輸送艦は攻撃できず、常に0ダメージ', () => {
    const transport = makeUnit('transportShip');
    expect(transport.canAttack).toBe(false);
    expect(calculateDamage(transport, makeUnit('battleship', 'enemy'), 0)).toBe(0);
  });

  it('攻撃できない相手は射程内にいても攻撃対象に含まれない', () => {
    // 戦艦(射程3〜6)の 3 マス先に敵の潜水艦と敵の輸送艦を置く
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'battleship', army: 'player' },
      { col: 3, row: 0, unitType: 'submarine', army: 'enemy' },
      { col: 4, row: 0, unitType: 'transportShip', army: 'enemy' },
    ]);
    const battleship = units.getUnitAt(gridPosition(0, 0))!;

    const targets = findAttackableTargets(battleship, units);
    // 潜水艦は撃てないので輸送艦だけが対象になる
    expect(targets.map((t) => t.unitType)).toEqual(['transportShip']);
  });

  it('攻撃できない相手を BattleManager で攻撃すると例外を投げる', () => {
    const def: MapDefinition = { name: 'sea', terrain: ['~~~~'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'battleship', army: 'player' },
      { col: 3, row: 0, unitType: 'submarine', army: 'enemy' },
    ]);
    const battle = new BattleManager(map, units);
    const battleship = units.getUnitAt(gridPosition(0, 0))!;
    const submarine = units.getUnitAt(gridPosition(3, 0))!;

    expect(() => battle.attack(battleship, submarine)).toThrow();
  });
});

describe('海上ユニットの射程と相性', () => {
  it('戦艦は射程3〜6の間接攻撃ユニット(隣接した敵は撃てない)', () => {
    const battleship = makeUnit('battleship');
    expect(battleship.minAttackRange).toBe(3);
    expect(battleship.maxAttackRange).toBe(6);
    expect(battleship.isIndirect).toBe(true);
  });

  it('戦艦は対戦車系に 7〜8 割、対歩兵は 6 割', () => {
    const battleship = makeUnit('battleship');
    const vsInfantry = calculateDamage(battleship, makeUnit('infantry', 'enemy'), 0);
    // 戦車・自走砲・対空戦車はいずれも「戦車系」として 7〜8 割
    const vsTankFamily = (['mediumTank', 'artillery', 'antiAirTank'] as const).map(
      (type) => calculateDamage(battleship, makeUnit(type, 'enemy'), 0),
    );
    // 基礎ダメージ: 歩兵60 → 6
    expect(vsInfantry).toBe(6);
    for (const damage of vsTankFamily) {
      expect(damage).toBeGreaterThanOrEqual(7);
      expect(damage).toBeLessThanOrEqual(8);
      expect(damage).toBeGreaterThan(vsInfantry);
    }
  });

  it('戦艦はヘリ系に 8〜9 割、固定翼機には 戦闘機6割・攻撃機7割・爆撃機8割', () => {
    const battleship = makeUnit('battleship');
    for (const type of ['attackHelicopter', 'transportHelicopter'] as const) {
      const damage = calculateDamage(battleship, makeUnit(type, 'enemy'), 0);
      expect(damage).toBeGreaterThanOrEqual(8);
      expect(damage).toBeLessThanOrEqual(9);
    }
    // 速い固定翼機はヘリ系より捉えにくい。戦艦は固定翼機を撃てる唯一の海上ユニット
    expect(calculateDamage(battleship, makeUnit('fighter', 'enemy'), 0)).toBe(6);
    expect(calculateDamage(battleship, makeUnit('attackAircraft', 'enemy'), 0)).toBe(7);
    expect(calculateDamage(battleship, makeUnit('bomber', 'enemy'), 0)).toBe(8);
  });

  it('隣接したヘリは戦艦の最小射程(3)の内側に入るため撃たれない', () => {
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'battleship', army: 'player' },
      { col: 1, row: 0, unitType: 'attackHelicopter', army: 'enemy' },
      { col: 3, row: 0, unitType: 'transportHelicopter', army: 'enemy' },
    ]);
    const battleship = units.getUnitAt(gridPosition(0, 0))!;
    // 射程 3〜6 なので、隣接(距離1)のヘリは対象外・距離3のヘリだけが対象になる
    expect(findAttackableTargets(battleship, units).map((t) => t.unitType)).toEqual([
      'transportHelicopter',
    ]);
  });

  it('戦艦は輸送艦・護衛艦に 9 割のダメージを与える', () => {
    const battleship = makeUnit('battleship');
    expect(calculateDamage(battleship, makeUnit('transportShip', 'enemy'), 0)).toBe(9);
    expect(calculateDamage(battleship, makeUnit('escortShip', 'enemy'), 0)).toBe(9);
  });

  it('潜水艦は戦艦・輸送艦に強いが、護衛艦にはほとんど通らない', () => {
    const submarine = makeUnit('submarine');
    const vsBattleship = calculateDamage(submarine, makeUnit('battleship', 'enemy'), 0);
    const vsTransport = calculateDamage(submarine, makeUnit('transportShip', 'enemy'), 0);
    const vsEscort = calculateDamage(submarine, makeUnit('escortShip', 'enemy'), 0);
    expect(vsBattleship).toBe(9);
    expect(vsTransport).toBeGreaterThanOrEqual(8);
    expect(vsEscort).toBeLessThanOrEqual(3);
  });

  it('護衛艦は潜水艦に 9 割、ヘリには 7〜8 割', () => {
    const escort = makeUnit('escortShip');
    expect(calculateDamage(escort, makeUnit('submarine', 'enemy'), 0)).toBe(9);
    const vsHeli = calculateDamage(escort, makeUnit('attackHelicopter', 'enemy'), 0);
    expect(vsHeli).toBeGreaterThanOrEqual(7);
    expect(vsHeli).toBeLessThanOrEqual(8);
  });

  it('護衛艦は夜戦用に広い視界(5)を持ち、潜水艦は隠密ユニット', () => {
    expect(makeUnit('escortShip').vision).toBe(5);
    expect(makeUnit('submarine').nightStealth).toBe(true);
    expect(makeUnit('battleship').nightStealth).toBe(false);
    expect(makeUnit('battleship').vision).toBeLessThan(makeUnit('escortShip').vision);
  });
});

describe('攻撃できない相手からは反撃を受けない', () => {
  const SEA: MapDefinition = { name: 'sea', terrain: ['~~'] };

  it('潜水艦に隣接攻撃された戦艦は反撃しない(潜水艦を撃てないため)', () => {
    const map = MapManager.fromDefinition(SEA);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'submarine', army: 'enemy' },
      { col: 1, row: 0, unitType: 'battleship', army: 'player' },
    ]);
    const battle = new BattleManager(map, units);
    const submarine = units.getUnitAt(gridPosition(0, 0))!;
    const battleship = units.getUnitAt(gridPosition(1, 0))!;

    const result = battle.attack(submarine, battleship);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(result.counterDamage).toBe(0);
    expect(submarine.currentHp).toBe(submarine.maxHp);
  });

  it('戦闘予測でも反撃なしと判定される', () => {
    const map = MapManager.fromDefinition(SEA);
    const submarine = makeUnit('submarine', 'enemy', 0, 0);
    const battleship = makeUnit('battleship', 'player', 1, 0);
    expect(forecastBattle(submarine, battleship, map).willCounter).toBe(false);
  });

  it('護衛艦に攻撃された潜水艦は反撃できる(互いに攻撃できる相手)', () => {
    const map = MapManager.fromDefinition(SEA);
    const escort = makeUnit('escortShip', 'player', 0, 0);
    const submarine = makeUnit('submarine', 'enemy', 1, 0);
    expect(forecastBattle(escort, submarine, map).willCounter).toBe(true);
  });
});

describe('輸送艦による地上ユニットの輸送', () => {
  /** 港(0,0)に輸送艦、隣の平地に地上ユニットを置いた小さなマップ */
  const COAST: MapDefinition = { name: 'coast', terrain: ['P..', '~..'] };

  function setup() {
    const map = MapManager.fromDefinition(COAST);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'transportShip', army: 'player' },
        { col: 1, row: 0, unitType: 'mediumTank', army: 'player' },
        { col: 2, row: 0, unitType: 'infantry', army: 'player' },
        { col: 1, row: 1, unitType: 'artillery', army: 'player' },
      ],
      map,
    );
    return {
      map,
      units,
      transport: units.getUnitAt(gridPosition(0, 0))!,
      tank: units.getUnitAt(gridPosition(1, 0))!,
      infantry: units.getUnitAt(gridPosition(2, 0))!,
      artillery: units.getUnitAt(gridPosition(1, 1))!,
    };
  }

  it('歩兵・戦車など地上ユニットを乗せられる(飛行・海上ユニットは乗せられない)', () => {
    const { transport, tank, infantry } = setup();
    expect(canCarry(transport, tank)).toBe(true);
    expect(canCarry(transport, infantry)).toBe(true);
    expect(canCarry(transport, makeUnit('attackHelicopter'))).toBe(false);
    expect(canCarry(transport, makeUnit('submarine'))).toBe(false);
  });

  it('最大 2 体まで乗せられ、3 体目は乗せられない', () => {
    const { units, transport, tank, infantry, artillery } = setup();
    expect(transport.capacity).toBe(2);

    units.carryUnit(transport, tank);
    units.carryUnit(transport, infantry);
    expect(transport.carried).toHaveLength(2);
    expect(transport.freeCapacity).toBe(0);

    // 3 体目は空き枠がないので搭乗できない
    expect(canCarry(transport, artillery)).toBe(false);
    expect(() => units.carryUnit(transport, artillery)).toThrow();
  });

  it('搭乗したユニットは盤面から取り除かれ、行動済みになる', () => {
    const { units, transport, tank } = setup();
    units.carryUnit(transport, tank);
    expect(units.getUnitAt(gridPosition(1, 0))).toBeUndefined();
    expect(tank.hasActed).toBe(true);
  });

  it('港に停泊している輸送艦は、地上ユニットの搭乗先として見つかる', () => {
    const { map, units, tank, transport } = setup();
    expect(findTransportTargets(tank, map, units)).toContain(transport);
  });

  it('「降ろす」で搭乗ユニットを 1 体ずつ隣接マスへ降ろせる', () => {
    const { map, units, transport, tank, infantry } = setup();
    units.carryUnit(transport, tank);
    units.carryUnit(transport, infantry);

    // 戦車を降ろせるのは隣接の空き陸マス。海(0,1)は車両が進入できないので除く
    const positions = findUnloadPositions(transport, map, units, tank);
    expect(positions).toContainEqual(gridPosition(1, 0));
    expect(positions).not.toContainEqual(gridPosition(0, 1));

    const dropped = units.dropUnit(transport, gridPosition(1, 0), tank);
    expect(dropped).toBe(tank);
    expect(units.getUnitAt(gridPosition(1, 0))).toBe(tank);
    // もう 1 体(歩兵)はまだ乗ったまま
    expect(transport.carried).toEqual([infantry]);
  });
});

describe('輸送中のユニットへのダメージ波及', () => {
  const SEA: MapDefinition = { name: 'sea', terrain: ['P.', '~~'] };

  it('輸送艦が被弾すると、輸送中のユニットも同じダメージを受ける', () => {
    const map = MapManager.fromDefinition(SEA);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 1, unitType: 'transportShip', army: 'player' },
        { col: 1, row: 1, unitType: 'submarine', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'player' },
      ],
      map,
    );
    const battle = new BattleManager(map, units);
    const transport = units.getUnitAt(gridPosition(0, 1))!;
    const submarine = units.getUnitAt(gridPosition(1, 1))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    // 輸送艦を港へ寄せて歩兵を乗せてから、海上へ戻す
    units.moveUnit(transport, gridPosition(0, 0), { markActed: false });
    units.carryUnit(transport, infantry);
    units.moveUnit(transport, gridPosition(0, 1), { markActed: false });

    const result = battle.attack(submarine, transport);
    expect(result.damageDealt).toBeGreaterThan(0);
    // 輸送中の歩兵も同じダメージを受けている
    expect(infantry.currentHp).toBe(infantry.maxHp - result.damageDealt);
  });

  it('輸送艦が撃沈されると、輸送中のユニットも失われる', () => {
    const map = MapManager.fromDefinition(SEA);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 1, unitType: 'transportShip', army: 'player' },
        { col: 1, row: 1, unitType: 'submarine', army: 'enemy' },
        { col: 1, row: 0, unitType: 'infantry', army: 'player' },
      ],
      map,
    );
    const battle = new BattleManager(map, units);
    const transport = units.getUnitAt(gridPosition(0, 1))!;
    const submarine = units.getUnitAt(gridPosition(1, 1))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    units.moveUnit(transport, gridPosition(0, 0), { markActed: false });
    units.carryUnit(transport, infantry);
    units.moveUnit(transport, gridPosition(0, 1), { markActed: false });
    // 撃沈されるところまで HP を減らしておく(潜水艦→輸送艦は 8〜9 ダメージ)
    transport.currentHp = 2;

    const result = battle.attack(submarine, transport);
    expect(result.defenderDefeated).toBe(true);
    expect(result.lostPassengers).toContain(infantry);
    // 沈んだ輸送艦の搭乗ユニットは盤面へ戻らない
    expect(units.getAllUnits()).not.toContain(infantry);
  });
});

describe('港での修理', () => {
  const PORT_MAP: MapDefinition = {
    name: 'repair',
    terrain: ['Pc~'],
    owners: [
      { col: 0, row: 0, owner: 'player' },
      { col: 1, row: 0, owner: 'player' },
    ],
  };

  function setup() {
    const map = MapManager.fromDefinition(PORT_MAP);
    const units = UnitManager.fromPlacements([], map);
    const economy = new EconomyManager({ initialFunds: 100000 });
    const repair = new RepairManager(map, units, economy);
    return { units, repair };
  }

  it('海上ユニットは自軍の港で修理できる', () => {
    const { units, repair } = setup();
    const ship = units.spawnUnit({
      unitType: 'escortShip',
      army: 'player',
      position: gridPosition(0, 0),
    });
    ship.currentHp = 5;
    expect(repair.canRepair(ship, 'player')).toBe(true);
  });

  it('地上ユニットは港では修理できない(都市など地上拠点で修理する)', () => {
    const { units, repair } = setup();
    const infantry = units.spawnUnit({
      unitType: 'infantry',
      army: 'player',
      position: gridPosition(0, 0),
    });
    infantry.currentHp = 5;
    expect(repair.canRepair(infantry, 'player')).toBe(false);

    units.moveUnit(infantry, gridPosition(1, 0));
    expect(repair.canRepair(infantry, 'player')).toBe(true);
  });
});
