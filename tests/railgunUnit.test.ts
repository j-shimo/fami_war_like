import { describe, expect, it } from 'vitest';
import {
  canAttackUnit,
  canCounterattack,
  isWithinAttackRange,
} from '@/core/battle/AttackRange';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { findTransportTargets, findUnloadPositions } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { canCarry, canLoadOn } from '@/core/units/transport';
import {
  AIR_UNIT_TYPES,
  CARRIABLE_GROUND_UNIT_TYPES,
  GROUND_UNIT_TYPES,
  UNIT_TYPES,
  type UnitType,
} from '@/core/units/UnitType';
import { getBaseDamage } from '@/data/damageTable';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getUnitData, isFerryUnit, isProducibleAt, unitLimitOf } from '@/data/unitData';
import { UNIT_DESCRIPTIONS } from '@/data/unitGuide';

/** テスト用のユニットを 1 体作る */
function makeUnit(
  unitType: UnitType,
  army: 'player' | 'enemy' = 'player',
  col = 0,
  row = 0,
): Unit {
  return new Unit({
    id: `${army}-${unitType}-${col}-${row}`,
    unitType,
    armyType: army,
    position: gridPosition(col, row),
  });
}

/** ユーザー指定の被ダメージ表(攻撃側 → 列車砲) */
const DAMAGE_TAKEN: Readonly<Partial<Record<UnitType, number>>> = {
  infantry: 2,
  recon: 3,
  transportVehicle: 3,
  lightTank: 30,
  mediumTank: 45,
  heavyTank: 60,
  newTank: 60,
  artillery: 35,
  rocketArtillery: 40,
  railgun: 60,
  antiAirTank: 5,
  bomber: 85,
  attackAircraft: 60,
  attackHelicopter: 30,
  battleship: 35,
};

describe('列車砲の基本パラメータ', () => {
  it('ユニット一覧・地上ユニットに登録されている', () => {
    expect(UNIT_TYPES).toContain('railgun');
    expect(GROUND_UNIT_TYPES).toContain('railgun');
  });

  it('コスト30000・移動力15・視界1で、射程 2〜6 の間接攻撃ユニット', () => {
    const data = getUnitData('railgun');
    expect(data.unitName).toBe('列車砲');
    expect(data.cost).toBe(30000);
    expect(data.movement).toBe(15);
    expect(data.vision).toBe(1);
    expect(data.minAttackRange).toBe(2);
    expect(data.maxAttackRange).toBe(6);
    expect(data.canCapture).toBe(false);
  });

  it('間接攻撃ユニットなので移動後は攻撃できない', () => {
    expect(makeUnit('railgun').isIndirect).toBe(true);
  });

  it('移動タイプは軌道系(rail)', () => {
    expect(getUnitData('railgun').movementType).toBe('rail');
  });

  it('1 軍に 1 台までの所持上限を持つ(他のユニットに上限はない)', () => {
    expect(unitLimitOf('railgun')).toBe(1);
    for (const unitType of UNIT_TYPES.filter((type) => type !== 'railgun')) {
      expect(unitLimitOf(unitType)).toBeNull();
    }
  });

  it('駅でだけ生産できる', () => {
    expect(isProducibleAt('station', 'railgun')).toBe(true);
    for (const terrain of ['factory', 'headquarters', 'airport', 'port'] as const) {
      expect(isProducibleAt(terrain, 'railgun')).toBe(false);
    }
  });

  it('ユニット説明が用意されている', () => {
    expect(UNIT_DESCRIPTIONS.railgun.length).toBeGreaterThan(0);
  });
});

describe('列車砲の輸送', () => {
  it('地上ユニットを 2 体まで運べる', () => {
    const data = getUnitData('railgun');
    expect(data.capacity).toBe(2);
    expect(data.carriableTypes).toEqual(CARRIABLE_GROUND_UNIT_TYPES);

    const railgun = makeUnit('railgun');
    expect(canCarry(railgun, makeUnit('infantry'))).toBe(true);
    expect(canCarry(railgun, makeUnit('heavyTank'))).toBe(true);
    // 飛行・海上ユニットは運べない
    for (const unitType of ['fighter', 'battleship'] as const) {
      expect(canCarry(railgun, makeUnit(unitType))).toBe(false);
    }
  });

  it('列車砲どうしは運べない(輸送艦にも積めない)', () => {
    expect(CARRIABLE_GROUND_UNIT_TYPES).not.toContain('railgun');
    expect(canCarry(makeUnit('railgun'), makeUnit('railgun', 'player', 1, 0))).toBe(
      false,
    );
    expect(canCarry(makeUnit('transportShip'), makeUnit('railgun'))).toBe(false);
  });

  it('砲撃が本業なので、輸送ユニット(輸送ヘリ・輸送車・輸送艦)には数えない', () => {
    expect(isFerryUnit('railgun')).toBe(false);
    expect(makeUnit('railgun').isFerry).toBe(false);
    for (const unitType of [
      'transportHelicopter',
      'transportVehicle',
      'transportShip',
    ] as const) {
      expect(isFerryUnit(unitType)).toBe(true);
    }
  });

  it('積み降ろしできる地形は駅だけ', () => {
    expect(getUnitData('railgun').loadingTerrainTypes).toEqual(['station']);
    // 他の輸送ユニットには地形の制限がない(どこに停まっていても積み降ろしできる)
    for (const unitType of [
      'transportHelicopter',
      'transportVehicle',
      'transportShip',
    ] as const) {
      expect(getUnitData(unitType).loadingTerrainTypes).toBeUndefined();
    }
    expect(canLoadOn(makeUnit('railgun'), 'station')).toBe(true);
    for (const terrain of ['railway', 'plain', 'road', 'factory'] as const) {
      expect(canLoadOn(makeUnit('railgun'), terrain)).toBe(false);
    }
    expect(canLoadOn(makeUnit('transportShip'), 'sea')).toBe(true);
  });

  it('駅に停車していれば、運んだ歩兵を隣接マス(平地など)へ降ろせる', () => {
    // row0: 駅(col1)を含む線路の上に列車砲、row1 は平地
    const def: MapDefinition = { name: '降車テスト', terrain: ['=S=', '...'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 1, row: 0, unitType: 'railgun', army: 'player' }],
      map,
    );
    const railgun = units.getUnitAt(gridPosition(1, 0))!;
    const infantry = makeUnit('infantry', 'player', 1, 0);
    railgun.carried.push(infantry);

    const positions = findUnloadPositions(railgun, map, units, infantry);
    expect(positions).toContainEqual(gridPosition(1, 1));
  });

  it('線路の上では降ろせない(降車先が 1 マスも出ない)', () => {
    // row0: すべて線路(駅なし)、row1 は平地
    const def: MapDefinition = { name: '線路上降車テスト', terrain: ['===', '...'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 1, row: 0, unitType: 'railgun', army: 'player' }],
      map,
    );
    const railgun = units.getUnitAt(gridPosition(1, 0))!;
    const infantry = makeUnit('infantry', 'player', 1, 0);
    railgun.carried.push(infantry);

    expect(findUnloadPositions(railgun, map, units, infantry)).toHaveLength(0);
  });

  it('駅に停車している列車砲にだけ搭乗できる(線路の上へは乗り込めない)', () => {
    // row0: 駅(col1)を含む線路、row1 は平地。歩兵は row1 から線路・駅へ歩いて上がれる
    const onStation = MapManager.fromDefinition({
      name: '搭乗テスト(駅)',
      terrain: ['=S=', '...'],
    });
    const stationUnits = UnitManager.fromPlacements(
      [
        { col: 1, row: 0, unitType: 'railgun', army: 'player' },
        { col: 1, row: 1, unitType: 'infantry', army: 'player' },
      ],
      onStation,
    );
    const infantry = stationUnits.getUnitAt(gridPosition(1, 1))!;
    expect(findTransportTargets(infantry, onStation, stationUnits)).toEqual([
      stationUnits.getUnitAt(gridPosition(1, 0)),
    ]);

    // 同じ配置でも、列車砲が線路(駅でない)に停まっていれば搭乗先に出てこない
    const onRailway = MapManager.fromDefinition({
      name: '搭乗テスト(線路)',
      terrain: ['===', '...'],
    });
    const railwayUnits = UnitManager.fromPlacements(
      [
        { col: 1, row: 0, unitType: 'railgun', army: 'player' },
        { col: 1, row: 1, unitType: 'infantry', army: 'player' },
      ],
      onRailway,
    );
    expect(
      findTransportTargets(
        railwayUnits.getUnitAt(gridPosition(1, 1))!,
        onRailway,
        railwayUnits,
      ),
    ).toEqual([]);
  });
});

describe('列車砲の相性', () => {
  it('攻撃できる相手への火力は、すべてロケット砲を上回る', () => {
    for (const defender of UNIT_TYPES) {
      const byRailgun = getBaseDamage('railgun', defender);
      const byRocket = getBaseDamage('rocketArtillery', defender);
      if (byRailgun === 0) {
        // 撃てない相手(飛行ユニット・潜水艦)はロケット砲も撃てない
        expect(byRocket).toBe(0);
        continue;
      }
      expect(byRailgun).toBeGreaterThan(byRocket);
    }
  });

  it('飛行ユニットには 1 機も攻撃できない', () => {
    for (const air of AIR_UNIT_TYPES) {
      expect(getBaseDamage('railgun', air)).toBe(0);
      expect(canAttackUnit(makeUnit('railgun'), makeUnit(air, 'enemy'))).toBe(false);
    }
  });

  it('潜水艦は撃てないが、水上艦は射程内なら叩ける', () => {
    expect(getBaseDamage('railgun', 'submarine')).toBe(0);
    for (const naval of ['battleship', 'escortShip', 'transportShip'] as const) {
      expect(getBaseDamage('railgun', naval)).toBeGreaterThan(0);
    }
  });

  it('他ユニットから受けるダメージが仕様どおり', () => {
    for (const [attacker, expected] of Object.entries(DAMAGE_TAKEN)) {
      expect(getBaseDamage(attacker as UnitType, 'railgun')).toBe(expected);
    }
  });

  it('攻撃できない側(戦闘機・輸送系・対空 2 種・護衛艦・潜水艦)からは 0', () => {
    for (const attacker of [
      'fighter',
      'transportHelicopter',
      'antiAirArtillery',
      'antiAirRocketArtillery',
      'escortShip',
      'transportShip',
      'submarine',
    ] as const) {
      expect(getBaseDamage(attacker, 'railgun')).toBe(0);
    }
  });

  it('戦車の主砲には中戦車ほど耐えられないが、機関銃・機関砲はほとんど効かない', () => {
    // 戦車の主砲(重戦車)から見ると、中戦車(65)より硬く重戦車(50)より軟らかい
    const byHeavyTank = getBaseDamage('heavyTank', 'railgun');
    expect(byHeavyTank).toBeLessThan(getBaseDamage('heavyTank', 'mediumTank'));
    expect(byHeavyTank).toBeGreaterThan(getBaseDamage('heavyTank', 'heavyTank'));

    // 一方、歩兵・偵察車・輸送車・対空戦車の弾は装甲列車の車体にほとんど通らない(5 以下)
    for (const attacker of [
      'infantry',
      'recon',
      'transportVehicle',
      'antiAirTank',
    ] as const) {
      expect(getBaseDamage(attacker, 'railgun')).toBeLessThanOrEqual(5);
    }
    // 歩兵・偵察車・輸送車から見れば、重戦車(5)よりさらに通らない相手
    for (const attacker of ['infantry', 'recon', 'transportVehicle'] as const) {
      expect(getBaseDamage(attacker, 'railgun')).toBeLessThan(
        getBaseDamage(attacker, 'heavyTank'),
      );
    }
  });
});

describe('列車砲の攻撃範囲', () => {
  it('距離 2〜6 の敵だけを狙える(隣接した敵は撃てない)', () => {
    const railgun = makeUnit('railgun', 'player', 0, 0);
    expect(isWithinAttackRange(railgun, gridPosition(1, 0))).toBe(false);
    expect(isWithinAttackRange(railgun, gridPosition(2, 0))).toBe(true);
    expect(isWithinAttackRange(railgun, gridPosition(6, 0))).toBe(true);
    expect(isWithinAttackRange(railgun, gridPosition(7, 0))).toBe(false);
  });

  it('間接攻撃なので、隣接から殴られても反撃できない', () => {
    const railgun = makeUnit('railgun', 'player', 0, 0);
    const tank = makeUnit('heavyTank', 'enemy', 1, 0);
    expect(canCounterattack(railgun, tank, 1)).toBe(false);
  });
});
