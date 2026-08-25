// 固定翼機 3 種(戦闘機・爆撃機・攻撃機)の仕様テスト。
// パラメータ(コスト・移動力・視界・射程・生産拠点)と、依頼仕様に対応する相性を確認する。
// 仕様は docs/UnitSpec.md「ユニット一覧」「ダメージ相性の初期案」を参照。

import { describe, expect, it } from 'vitest';
import { canAttackUnit, findAttackableTargets } from '@/core/battle/AttackRange';
import { BattleManager } from '@/core/battle/BattleManager';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { canCarry } from '@/core/units/transport';
import {
  AIR_UNIT_TYPES,
  GROUND_UNIT_TYPES,
  NAVAL_UNIT_TYPES,
  UNIT_TYPES,
  type UnitType,
} from '@/core/units/UnitType';
import { getBaseDamage } from '@/data/damageTable';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { canRepairAt } from '@/data/terrainData';
import { getUnitData, isProducibleAt } from '@/data/unitData';

/** テスト用のユニットを 1 体作る */
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

/** 固定翼機 3 種(ヘリ系を除く飛行ユニット) */
const FIXED_WING_TYPES: readonly UnitType[] = ['fighter', 'bomber', 'attackAircraft'];

describe('固定翼機の基本パラメータ', () => {
  it('戦闘機はコスト20000・移動力10・視界2の近接攻撃ユニット', () => {
    const data = getUnitData('fighter');
    expect(data.unitName).toBe('戦闘機');
    expect(data.cost).toBe(20000);
    expect(data.movement).toBe(10);
    expect(data.vision).toBe(2);
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
    expect(data.canCapture).toBe(false);
    expect(makeUnit('fighter').isIndirect).toBe(false);
  });

  it('爆撃機はコスト22000・移動力8・視界2の近接攻撃ユニット', () => {
    const data = getUnitData('bomber');
    expect(data.unitName).toBe('爆撃機');
    expect(data.cost).toBe(22000);
    expect(data.movement).toBe(8);
    expect(data.vision).toBe(2);
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
  });

  it('攻撃機はコスト26500・移動力9・視界2の近接攻撃ユニット', () => {
    const data = getUnitData('attackAircraft');
    expect(data.unitName).toBe('攻撃機');
    expect(data.cost).toBe(26500);
    expect(data.movement).toBe(9);
    expect(data.vision).toBe(2);
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
  });

  it('3 種とも飛行ユニットで、空港でのみ生産・修理できる', () => {
    for (const aircraft of FIXED_WING_TYPES) {
      expect(AIR_UNIT_TYPES).toContain(aircraft);
      expect(getUnitData(aircraft).movementType).toBe('air');
      expect(isProducibleAt('airport', aircraft)).toBe(true);
      expect(isProducibleAt('factory', aircraft)).toBe(false);
      expect(isProducibleAt('headquarters', aircraft)).toBe(false);
      expect(isProducibleAt('port', aircraft)).toBe(false);
      // 飛行ユニットなので地上ユニット扱いはされず、輸送艦にも積めない
      expect(GROUND_UNIT_TYPES).not.toContain(aircraft);
      expect(canCarry(makeUnit('transportShip'), makeUnit(aircraft))).toBe(false);
    }
    expect(canRepairAt('airport', 'air')).toBe(true);
    expect(canRepairAt('factory', 'air')).toBe(false);
  });

  it('戦闘機は移動力10で海も山も越えて飛べる', () => {
    // 横一列: 海と山が交互に並ぶ。地上ユニットは進めないが飛行ユニットは通り抜ける
    const def: MapDefinition = { name: 'fighter-move', terrain: ['~m~m~m~m~m~'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'fighter', army: 'player' }],
      map,
    );
    const fighter = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(fighter, map, units);

    // 移動コストは飛行ユニットなので一律 1。移動力 10 ぶん進める
    expect(range.canReach(gridPosition(10, 0))).toBe(true);
  });
});

describe('戦闘機の相性', () => {
  it('飛行ユニットしか攻撃できない(地上・海上ユニットには 0)', () => {
    for (const ground of GROUND_UNIT_TYPES) {
      expect(getBaseDamage('fighter', ground)).toBe(0);
      expect(canAttackUnit(makeUnit('fighter'), makeUnit(ground, 'enemy'))).toBe(false);
    }
    for (const naval of NAVAL_UNIT_TYPES) {
      expect(getBaseDamage('fighter', naval)).toBe(0);
      expect(canAttackUnit(makeUnit('fighter'), makeUnit(naval, 'enemy'))).toBe(false);
    }
  });

  it('ヘリ系に 9〜10 割・爆撃機に 8〜9 割・攻撃機に 7 割', () => {
    expect(getBaseDamage('fighter', 'attackHelicopter')).toBeGreaterThanOrEqual(90);
    expect(getBaseDamage('fighter', 'transportHelicopter')).toBeGreaterThanOrEqual(90);
    expect(getBaseDamage('fighter', 'bomber')).toBeGreaterThanOrEqual(80);
    expect(getBaseDamage('fighter', 'bomber')).toBeLessThanOrEqual(90);
    expect(getBaseDamage('fighter', 'attackAircraft')).toBe(70);
  });

  it('飛行ユニットの中では対飛行ユニット最強(どの飛行ユニットより空戦の火力が高い)', () => {
    for (const target of AIR_UNIT_TYPES) {
      const byFighter = getBaseDamage('fighter', target);
      for (const attacker of AIR_UNIT_TYPES) {
        if (attacker === 'fighter') {
          continue;
        }
        expect(getBaseDamage(attacker, target)).toBeLessThan(byFighter);
      }
    }
  });
});

describe('爆撃機の相性', () => {
  it('地上ユニット全てに 8〜9 割', () => {
    for (const ground of GROUND_UNIT_TYPES) {
      expect(getBaseDamage('bomber', ground)).toBeGreaterThanOrEqual(80);
      expect(getBaseDamage('bomber', ground)).toBeLessThanOrEqual(90);
    }
  });

  it('飛行ユニットにはまったく攻撃できない', () => {
    for (const air of AIR_UNIT_TYPES) {
      expect(getBaseDamage('bomber', air)).toBe(0);
      expect(canAttackUnit(makeUnit('bomber'), makeUnit(air, 'enemy'))).toBe(false);
    }
  });

  it('戦艦に 4〜5 割・護衛艦と輸送艦に 7 割で、潜水艦は攻撃できない', () => {
    expect(getBaseDamage('bomber', 'battleship')).toBeGreaterThanOrEqual(40);
    expect(getBaseDamage('bomber', 'battleship')).toBeLessThanOrEqual(50);
    expect(getBaseDamage('bomber', 'escortShip')).toBe(70);
    expect(getBaseDamage('bomber', 'transportShip')).toBe(70);
    expect(getBaseDamage('bomber', 'submarine')).toBe(0);
  });

  it('攻撃した地上ユニットが対空ユニットでなければ反撃を受けない', () => {
    const def: MapDefinition = { name: 'bomber-counter', terrain: ['..'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'bomber', army: 'player' },
        { col: 1, row: 0, unitType: 'mediumTank', army: 'enemy' },
      ],
      map,
    );
    const bomber = units.getUnitAt(gridPosition(0, 0))!;
    const tank = units.getUnitAt(gridPosition(1, 0))!;

    const result = new BattleManager(map, units).attack(bomber, tank);
    expect(result.damageDealt).toBeGreaterThan(0);
    // 中戦車は固定翼機を撃てないので反撃は起きない
    expect(result.counterDamage).toBe(0);
  });

  it('対空戦車を攻撃したときは反撃を受ける', () => {
    const def: MapDefinition = { name: 'bomber-aa', terrain: ['..'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'bomber', army: 'player' },
        { col: 1, row: 0, unitType: 'antiAirTank', army: 'enemy' },
      ],
      map,
    );
    const bomber = units.getUnitAt(gridPosition(0, 0))!;
    const antiAir = units.getUnitAt(gridPosition(1, 0))!;

    const result = new BattleManager(map, units).attack(bomber, antiAir);
    expect(result.counterDamage).toBeGreaterThan(0);
  });
});

describe('攻撃機の相性', () => {
  it('歩兵・偵察車・輸送車・自走砲に 7 割、戦車は軽 8〜9 割・中 7〜8 割・重 5〜6 割', () => {
    for (const target of [
      'infantry',
      'recon',
      'transportVehicle',
      'artillery',
    ] as const) {
      expect(getBaseDamage('attackAircraft', target)).toBe(70);
    }
    expect(getBaseDamage('attackAircraft', 'lightTank')).toBeGreaterThanOrEqual(80);
    expect(getBaseDamage('attackAircraft', 'lightTank')).toBeLessThanOrEqual(90);
    expect(getBaseDamage('attackAircraft', 'mediumTank')).toBeGreaterThanOrEqual(70);
    expect(getBaseDamage('attackAircraft', 'mediumTank')).toBeLessThanOrEqual(80);
    expect(getBaseDamage('attackAircraft', 'heavyTank')).toBeGreaterThanOrEqual(50);
    expect(getBaseDamage('attackAircraft', 'heavyTank')).toBeLessThanOrEqual(60);
    expect(getBaseDamage('attackAircraft', 'rocketArtillery')).toBe(90);
  });

  it('海上ユニットに強い(戦艦 6〜7 割・護衛艦と輸送艦に 9 割)が、潜水艦は攻撃できない', () => {
    expect(getBaseDamage('attackAircraft', 'battleship')).toBeGreaterThanOrEqual(60);
    expect(getBaseDamage('attackAircraft', 'battleship')).toBeLessThanOrEqual(70);
    expect(getBaseDamage('attackAircraft', 'escortShip')).toBe(90);
    expect(getBaseDamage('attackAircraft', 'transportShip')).toBe(90);
    expect(getBaseDamage('attackAircraft', 'submarine')).toBe(0);
  });

  it('戦闘機には 3〜4 割、爆撃機には 7〜8 割、ヘリ系には 8〜9 割', () => {
    expect(getBaseDamage('attackAircraft', 'fighter')).toBeGreaterThanOrEqual(30);
    expect(getBaseDamage('attackAircraft', 'fighter')).toBeLessThanOrEqual(40);
    expect(getBaseDamage('attackAircraft', 'bomber')).toBeGreaterThanOrEqual(70);
    expect(getBaseDamage('attackAircraft', 'bomber')).toBeLessThanOrEqual(80);
    expect(getBaseDamage('attackAircraft', 'attackHelicopter')).toBeGreaterThanOrEqual(
      80,
    );
    expect(getBaseDamage('attackAircraft', 'attackHelicopter')).toBeLessThanOrEqual(90);
    expect(getBaseDamage('attackAircraft', 'transportHelicopter')).toBeGreaterThanOrEqual(
      80,
    );
    expect(getBaseDamage('attackAircraft', 'transportHelicopter')).toBeLessThanOrEqual(
      90,
    );
  });

  it('戦闘機と爆撃機の中間の性能を持つ(対空は戦闘機未満・対地は爆撃機未満)', () => {
    expect(getBaseDamage('attackAircraft', 'attackHelicopter')).toBeLessThan(
      getBaseDamage('fighter', 'attackHelicopter'),
    );
    expect(getBaseDamage('attackAircraft', 'infantry')).toBeLessThan(
      getBaseDamage('bomber', 'infantry'),
    );
  });
});

describe('固定翼機への攻撃', () => {
  it('対空ユニット以外の地上ユニットは固定翼機を攻撃できない', () => {
    const antiAirTypes: readonly UnitType[] = [
      'antiAirTank',
      'antiAirArtillery',
      'antiAirRocketArtillery',
    ];
    for (const ground of GROUND_UNIT_TYPES) {
      for (const aircraft of FIXED_WING_TYPES) {
        const damage = getBaseDamage(ground, aircraft);
        if (antiAirTypes.includes(ground)) {
          expect(damage).toBeGreaterThan(0);
        } else {
          expect(damage).toBe(0);
          expect(canAttackUnit(makeUnit(ground), makeUnit(aircraft, 'enemy'))).toBe(
            false,
          );
        }
      }
    }
  });

  it('固定翼機を攻撃できる海上ユニットは戦艦だけ(戦闘機6割・攻撃機7割・爆撃機8割)', () => {
    expect(getBaseDamage('battleship', 'fighter')).toBe(60);
    expect(getBaseDamage('battleship', 'attackAircraft')).toBe(70);
    expect(getBaseDamage('battleship', 'bomber')).toBe(80);
    for (const aircraft of FIXED_WING_TYPES) {
      // 護衛艦の近接対空はヘリ系まで。固定翼機・潜水艦・輸送艦は撃てない
      expect(getBaseDamage('escortShip', aircraft)).toBe(0);
      expect(canAttackUnit(makeUnit('escortShip'), makeUnit(aircraft, 'enemy'))).toBe(
        false,
      );
      expect(getBaseDamage('submarine', aircraft)).toBe(0);
      expect(getBaseDamage('transportShip', aircraft)).toBe(0);
    }
  });

  it('戦闘ヘリは固定翼機を攻撃できない', () => {
    for (const aircraft of FIXED_WING_TYPES) {
      expect(getBaseDamage('attackHelicopter', aircraft)).toBe(0);
      expect(
        canAttackUnit(makeUnit('attackHelicopter'), makeUnit(aircraft, 'enemy')),
      ).toBe(false);
    }
  });

  it('固定翼機を攻撃できるのは対空 3 種・戦艦・戦闘機・攻撃機だけ', () => {
    // 戦闘機・攻撃機は同種対決も成立するため、どの固定翼機を狙うときも顔ぶれは変わらない
    const expected = [
      'antiAirArtillery',
      'antiAirRocketArtillery',
      'antiAirTank',
      'attackAircraft',
      'battleship',
      'fighter',
    ];
    for (const aircraft of FIXED_WING_TYPES) {
      const attackers = UNIT_TYPES.filter(
        (attacker) => getBaseDamage(attacker, aircraft) > 0,
      );
      expect([...attackers].sort()).toEqual(expected);
    }
  });

  it('固定翼機は地形の防御補正を受けない(上空にいる扱い)', () => {
    const antiAir = makeUnit('antiAirTank');
    const fighter = makeUnit('fighter', 'enemy');
    // 防御 3 の山の上にいても、飛行ユニットは防御 0 として計算される
    expect(calculateDamage(antiAir, fighter, 3)).toBe(
      calculateDamage(antiAir, fighter, 0),
    );
  });

  it('射程内でも攻撃できない相手は攻撃対象に含まれない', () => {
    // 爆撃機の隣に敵の戦闘機(攻撃できない)と敵の歩兵(攻撃できる)を置く
    const units = UnitManager.fromPlacements([
      { col: 1, row: 0, unitType: 'bomber', army: 'player' },
      { col: 0, row: 0, unitType: 'fighter', army: 'enemy' },
      { col: 2, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const bomber = units.getUnitAt(gridPosition(1, 0))!;

    expect(findAttackableTargets(bomber, units).map((t) => t.unitType)).toEqual([
      'infantry',
    ]);
  });
});
