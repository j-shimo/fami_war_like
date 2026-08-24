import { describe, expect, it } from 'vitest';
import { canAttackUnit } from '@/core/battle/AttackRange';
import { BattleManager } from '@/core/battle/BattleManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import {
  calculateMovementRange,
  findUnloadPositions,
} from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { canCarry } from '@/core/units/transport';
import { GROUND_UNIT_TYPES, UNIT_TYPES } from '@/core/units/UnitType';
import { BASE_DAMAGE, getBaseDamage } from '@/data/damageTable';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { canRepairAt, getTerrainData } from '@/data/terrainData';
import { getUnitData, isProducibleAt } from '@/data/unitData';

/** テスト用のユニットを 1 体作る */
function makeUnit(
  unitType: Parameters<typeof getUnitData>[0],
  army: 'player' | 'enemy',
  col = 0,
  row = 0,
): Unit {
  return new Unit({
    id: `${army}-${unitType}`,
    unitType,
    armyType: army,
    position: gridPosition(col, row),
  });
}

describe('輸送車の基本パラメータ', () => {
  it('ユニット種別の一覧と地上ユニットの一覧に含まれる', () => {
    expect(UNIT_TYPES).toContain('transportVehicle');
    expect(GROUND_UNIT_TYPES).toContain('transportVehicle');
  });

  it('コスト5000・移動力6・視界1の装軌車両で、近接攻撃のみを行う', () => {
    const data = getUnitData('transportVehicle');
    expect(data.unitName).toBe('輸送車');
    expect(data.cost).toBe(5000);
    expect(data.movement).toBe(6);
    expect(data.movementType).toBe('vehicle');
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
    expect(data.vision).toBe(1);
    expect(data.mountainVisionBonus).toBe(0);
    expect(data.canCapture).toBe(false);
  });

  it('歩兵だけを1体運べる', () => {
    const data = getUnitData('transportVehicle');
    expect(data.capacity).toBe(1);
    expect(data.carriableTypes).toEqual(['infantry']);
  });

  it('工場・本拠地でのみ生産できる', () => {
    expect(isProducibleAt('factory', 'transportVehicle')).toBe(true);
    expect(isProducibleAt('headquarters', 'transportVehicle')).toBe(true);
    expect(isProducibleAt('airport', 'transportVehicle')).toBe(false);
    expect(isProducibleAt('port', 'transportVehicle')).toBe(false);
  });

  it('地上ユニットなので都市・工場・本拠地で修理できる', () => {
    expect(canRepairAt('city', 'vehicle')).toBe(true);
    expect(canRepairAt('factory', 'vehicle')).toBe(true);
    expect(canRepairAt('headquarters', 'vehicle')).toBe(true);
    expect(canRepairAt('airport', 'vehicle')).toBe(false);
    expect(canRepairAt('port', 'vehicle')).toBe(false);
  });
});

describe('輸送車の地形移動コスト', () => {
  it('道路・占領できる地形・平地は1、森と海岸は2、山・海は進入不可', () => {
    const cost = (terrain: Parameters<typeof getTerrainData>[0]): number | null =>
      getTerrainData(terrain).moveCost[getUnitData('transportVehicle').movementType];

    expect(cost('road')).toBe(1);
    expect(cost('city')).toBe(1);
    expect(cost('factory')).toBe(1);
    expect(cost('airport')).toBe(1);
    expect(cost('port')).toBe(1);
    expect(cost('headquarters')).toBe(1);
    expect(cost('plain')).toBe(1);
    expect(cost('forest')).toBe(2);
    expect(cost('beach')).toBe(2);
    expect(cost('mountain')).toBeNull();
    expect(cost('sea')).toBeNull();
  });

  it('平地は移動力6ぶん進めるが、山へは入れない', () => {
    const def: MapDefinition = { name: 'tv-plain', terrain: ['.......m.'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'transportVehicle', army: 'player' },
    ]);
    const vehicle = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(vehicle, map, units);
    // 平地はコスト 1 なので移動力ぶんの 6 マス先まで届く
    expect(range.getCost(gridPosition(6, 0))).toBe(6);
    // 山(7,0)は装軌車両なので進入できず、その先(8,0)へも回り込めない
    expect(range.canReach(gridPosition(7, 0))).toBe(false);
    expect(range.canReach(gridPosition(8, 0))).toBe(false);
  });

  it('森はコスト2で通れる(装輪車両の偵察車は通れない)', () => {
    const def: MapDefinition = { name: 'tv-forest', terrain: ['.f.'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'transportVehicle', army: 'player' },
    ]);
    const vehicle = units.getUnitAt(gridPosition(0, 0))!;

    const range = calculateMovementRange(vehicle, map, units);
    expect(range.getCost(gridPosition(1, 0))).toBe(2);
    expect(range.getCost(gridPosition(2, 0))).toBe(3);
  });
});

describe('輸送車の攻撃相性', () => {
  it('与ダメージ・被ダメージとも偵察車とまったく同じ値になる', () => {
    for (const opponent of UNIT_TYPES) {
      // 攻撃側としての相性(輸送車 → 相手)
      expect(BASE_DAMAGE.transportVehicle[opponent]).toBe(BASE_DAMAGE.recon[opponent]);
    }
    for (const attacker of UNIT_TYPES) {
      // 防御側としての相性(相手 → 輸送車)
      expect(BASE_DAMAGE[attacker].transportVehicle).toBe(BASE_DAMAGE[attacker].recon);
    }
  });

  it('海上ユニットには攻撃できない', () => {
    for (const target of [
      'battleship',
      'escortShip',
      'transportShip',
      'submarine',
    ] as const) {
      expect(getBaseDamage('transportVehicle', target)).toBe(0);
      expect(
        canAttackUnit(makeUnit('transportVehicle', 'player'), makeUnit(target, 'enemy')),
      ).toBe(false);
    }
  });

  it('隣接した歩兵は攻撃できる(近接攻撃)', () => {
    const def: MapDefinition = { name: 'tv-attack', terrain: ['..'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'transportVehicle', army: 'player' },
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
      ],
      map,
    );
    const battle = new BattleManager(map, units);
    const vehicle = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;

    const result = battle.attack(vehicle, infantry);
    expect(result.damageDealt).toBeGreaterThan(0);
  });
});

describe('輸送車の輸送', () => {
  const PLAIN: MapDefinition = { name: 'tv-carry', terrain: ['...', '...'] };

  it('味方の歩兵だけを1体搭乗させられる', () => {
    const vehicle = makeUnit('transportVehicle', 'player');
    expect(canCarry(vehicle, makeUnit('infantry', 'player', 1, 0))).toBe(true);
    // 歩兵以外は運べない
    expect(canCarry(vehicle, makeUnit('mediumTank', 'player', 1, 0))).toBe(false);
    // 敵の歩兵も運べない
    expect(canCarry(vehicle, makeUnit('infantry', 'enemy', 1, 0))).toBe(false);
  });

  it('1体乗せると空き枠が無くなる', () => {
    const map = MapManager.fromDefinition(PLAIN);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'transportVehicle', army: 'player' },
        { col: 1, row: 0, unitType: 'infantry', army: 'player' },
        { col: 2, row: 0, unitType: 'infantry', army: 'player' },
      ],
      map,
    );
    const vehicle = units.getUnitAt(gridPosition(0, 0))!;
    const first = units.getUnitAt(gridPosition(1, 0))!;
    const second = units.getUnitAt(gridPosition(2, 0))!;

    units.carryUnit(vehicle, first);
    expect(vehicle.carried).toEqual([first]);
    expect(vehicle.freeCapacity).toBe(0);
    expect(canCarry(vehicle, second)).toBe(false);
  });

  it('運んでいる歩兵を隣接マスへ降ろせる', () => {
    const map = MapManager.fromDefinition(PLAIN);
    const units = UnitManager.fromPlacements(
      [
        { col: 1, row: 0, unitType: 'transportVehicle', army: 'player' },
        { col: 2, row: 0, unitType: 'infantry', army: 'player' },
      ],
      map,
    );
    const vehicle = units.getUnitAt(gridPosition(1, 0))!;
    const infantry = units.getUnitAt(gridPosition(2, 0))!;
    units.carryUnit(vehicle, infantry);

    const positions = findUnloadPositions(vehicle, map, units);
    expect(positions).toContainEqual(gridPosition(0, 0));

    const dropped = units.dropUnit(vehicle, gridPosition(0, 0), infantry);
    expect(dropped).toBe(infantry);
    expect(units.getUnitAt(gridPosition(0, 0))).toBe(infantry);
    expect(vehicle.carried).toEqual([]);
  });

  it('輸送艦にも積める地上ユニットである', () => {
    const ship = makeUnit('transportShip', 'player');
    expect(canCarry(ship, makeUnit('transportVehicle', 'player', 1, 0))).toBe(true);
  });
});

describe('輸送車が被弾したときの輸送中のユニット', () => {
  const PLAIN: MapDefinition = { name: 'tv-damage', terrain: ['...'] };

  function setup() {
    const map = MapManager.fromDefinition(PLAIN);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'transportVehicle', army: 'player' },
        { col: 1, row: 0, unitType: 'infantry', army: 'player' },
        { col: 2, row: 0, unitType: 'mediumTank', army: 'enemy' },
      ],
      map,
    );
    const vehicle = units.getUnitAt(gridPosition(0, 0))!;
    const infantry = units.getUnitAt(gridPosition(1, 0))!;
    const tank = units.getUnitAt(gridPosition(2, 0))!;
    units.carryUnit(vehicle, infantry);
    // 空いたマスへ敵戦車を寄せて隣接させる
    units.moveUnit(tank, gridPosition(1, 0), { markActed: false });
    return { map, units, vehicle, infantry, tank, battle: new BattleManager(map, units) };
  }

  it('輸送中の歩兵も同じダメージを受ける', () => {
    const { battle, vehicle, infantry, tank } = setup();
    const result = battle.attack(tank, vehicle);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(infantry.currentHp).toBe(infantry.maxHp - result.damageDealt);
  });

  it('撃破されると輸送中の歩兵も一緒に失われる', () => {
    const { battle, units, vehicle, infantry, tank } = setup();
    vehicle.currentHp = 1;
    const result = battle.attack(tank, vehicle);
    expect(result.defenderDefeated).toBe(true);
    expect(result.lostPassengers).toContain(infantry);
    expect(units.getAllUnits()).not.toContain(infantry);
  });
});

describe('ヘリ系の生産コスト改定', () => {
  it('戦闘ヘリは8500・輸送ヘリは5500', () => {
    expect(getUnitData('attackHelicopter').cost).toBe(8500);
    expect(getUnitData('transportHelicopter').cost).toBe(5500);
  });
});
