// 戦車 3 種(軽・中・重)とロケット砲の仕様テスト。
// パラメータ(コスト・移動力・視界・射程・生産拠点)と、依頼仕様に対応する相性を確認する。
// 仕様は docs/UnitSpec.md「ユニット一覧」「ダメージ相性の初期案」を参照。

import { describe, expect, it } from 'vitest';
import {
  canAttackUnit,
  canCounterattack,
  findAttackableTargets,
} from '@/core/battle/AttackRange';
import { BattleManager } from '@/core/battle/BattleManager';
import { forecastBattle } from '@/core/battle/BattleForecast';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { canCarry } from '@/core/units/transport';
import {
  AIR_UNIT_TYPES,
  GROUND_UNIT_TYPES,
  TANK_UNIT_TYPES,
  UNIT_TYPES,
  type UnitType,
} from '@/core/units/UnitType';
import { getBaseDamage } from '@/data/damageTable';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { canRepairAt, getTerrainData } from '@/data/terrainData';
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

describe('戦車 3 種の基本パラメータ', () => {
  it('ユニット種別の一覧に軽・中・重戦車が含まれ、旧「戦車」は無くなっている', () => {
    expect(UNIT_TYPES).toContain('lightTank');
    expect(UNIT_TYPES).toContain('mediumTank');
    expect(UNIT_TYPES).toContain('heavyTank');
    expect(UNIT_TYPES).not.toContain('tank');
    expect(TANK_UNIT_TYPES).toEqual(['lightTank', 'mediumTank', 'heavyTank']);
  });

  it('軽戦車はコスト6000・移動力6・視界3の近接ユニット', () => {
    const data = getUnitData('lightTank');
    expect(data.unitName).toBe('軽戦車');
    expect(data.cost).toBe(6000);
    expect(data.movement).toBe(6);
    expect(data.vision).toBe(3);
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
    expect(data.canCapture).toBe(false);
  });

  it('中戦車はコスト12000・移動力5・視界2の近接ユニット', () => {
    const data = getUnitData('mediumTank');
    expect(data.unitName).toBe('中戦車');
    expect(data.cost).toBe(12000);
    expect(data.movement).toBe(5);
    expect(data.vision).toBe(2);
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
  });

  it('重戦車はコスト18000・移動力4・視界1の近接ユニット', () => {
    const data = getUnitData('heavyTank');
    expect(data.unitName).toBe('重戦車');
    expect(data.cost).toBe(18000);
    expect(data.movement).toBe(4);
    expect(data.vision).toBe(1);
    expect(data.minAttackRange).toBe(1);
    expect(data.maxAttackRange).toBe(1);
  });

  it('3 種とも装軌車両の移動タイプを持ち、工場・本拠地で生産できる', () => {
    for (const tank of TANK_UNIT_TYPES) {
      expect(getUnitData(tank).movementType).toBe('vehicle');
      expect(isProducibleAt('factory', tank)).toBe(true);
      expect(isProducibleAt('headquarters', tank)).toBe(true);
      expect(isProducibleAt('airport', tank)).toBe(false);
      expect(isProducibleAt('port', tank)).toBe(false);
    }
  });

  it('3 種とも地上ユニットとして輸送艦に積め、都市・工場・本拠地で修理できる', () => {
    const transport = makeUnit('transportShip');
    for (const tank of TANK_UNIT_TYPES) {
      expect(GROUND_UNIT_TYPES).toContain(tank);
      expect(canCarry(transport, makeUnit(tank))).toBe(true);
      expect(canRepairAt('city', getUnitData(tank).movementType)).toBe(true);
    }
  });
});

describe('戦車 3 種の地形移動コスト', () => {
  it('道路・占領できる地形・平地は1、森・海岸は2、山・海は進入不可', () => {
    const cost = (terrain: Parameters<typeof getTerrainData>[0]): number | null =>
      getTerrainData(terrain).moveCost.vehicle;

    expect(cost('road')).toBe(1);
    expect(cost('plain')).toBe(1);
    expect(cost('city')).toBe(1);
    expect(cost('factory')).toBe(1);
    expect(cost('airport')).toBe(1);
    expect(cost('port')).toBe(1);
    expect(cost('headquarters')).toBe(1);
    expect(cost('forest')).toBe(2);
    expect(cost('beach')).toBe(2);
    expect(cost('mountain')).toBeNull();
    expect(cost('sea')).toBeNull();
  });

  it('移動力どおり、軽戦車 > 中戦車 > 重戦車 の順に遠くまで進める', () => {
    // 横一列の道路(コスト 1)。移動力がそのまま到達距離になる
    const def: MapDefinition = { name: 'tank-road', terrain: ['rrrrrrrr'] };
    const map = MapManager.fromDefinition(def);
    const reach = (unitType: UnitType): number => {
      const units = UnitManager.fromPlacements(
        [{ col: 0, row: 0, unitType, army: 'player' }],
        map,
      );
      const unit = units.getUnitAt(gridPosition(0, 0))!;
      const range = calculateMovementRange(unit, map, units);
      // 出発マス(自分のいるマス)を除いた到達マス数 = 道路上で進める距離
      return range.tiles.length - 1;
    };

    expect(reach('lightTank')).toBe(6);
    expect(reach('mediumTank')).toBe(5);
    expect(reach('heavyTank')).toBe(4);
  });
});

describe('戦車 3 種の相性', () => {
  it('対歩兵は 軽6割 → 中7〜8割 → 重8〜9割 と重くなるほど強い', () => {
    expect(getBaseDamage('lightTank', 'infantry')).toBe(60);
    expect(getBaseDamage('mediumTank', 'infantry')).toBeGreaterThanOrEqual(70);
    expect(getBaseDamage('mediumTank', 'infantry')).toBeLessThanOrEqual(80);
    expect(getBaseDamage('heavyTank', 'infantry')).toBeGreaterThanOrEqual(80);
    expect(getBaseDamage('heavyTank', 'infantry')).toBeLessThanOrEqual(90);
  });

  it('上位の戦車には不利(軽 < 中 < 重 の順に撃ち勝てる)', () => {
    // 軽戦車は中戦車・重戦車のどちらにも撃ち負ける
    expect(getBaseDamage('lightTank', 'mediumTank')).toBeLessThan(
      getBaseDamage('mediumTank', 'lightTank'),
    );
    expect(getBaseDamage('lightTank', 'heavyTank')).toBeLessThan(
      getBaseDamage('heavyTank', 'lightTank'),
    );
    // 中戦車は軽戦車に 6 割で有利、重戦車には不利
    expect(getBaseDamage('mediumTank', 'lightTank')).toBe(60);
    expect(getBaseDamage('mediumTank', 'heavyTank')).toBeLessThan(
      getBaseDamage('heavyTank', 'mediumTank'),
    );
    // 重戦車は軽戦車に 8 割、中戦車に 6〜7 割
    expect(getBaseDamage('heavyTank', 'lightTank')).toBe(80);
    expect(getBaseDamage('heavyTank', 'mediumTank')).toBeGreaterThanOrEqual(60);
    expect(getBaseDamage('heavyTank', 'mediumTank')).toBeLessThanOrEqual(70);
  });

  it('ヘリ系へは 1〜2 割しか通らず、戦闘ヘリとの相性は 軽=不利 中=五分 重=若干有利', () => {
    for (const tank of TANK_UNIT_TYPES) {
      for (const heli of ['attackHelicopter', 'transportHelicopter'] as const) {
        expect(getBaseDamage(tank, heli)).toBeGreaterThan(0);
        expect(getBaseDamage(tank, heli)).toBeLessThanOrEqual(20);
      }
    }
    // 戦闘ヘリから見た被ダメージ: 軽 65(不利) → 中 55(五分) → 重 45(若干有利)
    expect(getBaseDamage('attackHelicopter', 'lightTank')).toBeGreaterThan(55);
    expect(getBaseDamage('attackHelicopter', 'mediumTank')).toBe(55);
    expect(getBaseDamage('attackHelicopter', 'heavyTank')).toBeLessThan(55);
  });

  it('固定翼機(戦闘機・爆撃機・攻撃機)には攻撃できない(対空ユニットではないため)', () => {
    for (const tank of TANK_UNIT_TYPES) {
      for (const aircraft of ['fighter', 'bomber', 'attackAircraft'] as const) {
        expect(getBaseDamage(tank, aircraft)).toBe(0);
        expect(canAttackUnit(makeUnit(tank, 'player'), makeUnit(aircraft, 'enemy'))).toBe(
          false,
        );
      }
    }
  });

  it('自走砲・対空戦車には有利(軽6割・中7〜8割・重8〜9割)', () => {
    expect(getBaseDamage('lightTank', 'artillery')).toBe(60);
    expect(getBaseDamage('lightTank', 'antiAirTank')).toBe(60);
    expect(getBaseDamage('mediumTank', 'artillery')).toBeGreaterThanOrEqual(70);
    expect(getBaseDamage('mediumTank', 'antiAirTank')).toBeGreaterThanOrEqual(70);
    expect(getBaseDamage('heavyTank', 'artillery')).toBe(80);
    expect(getBaseDamage('heavyTank', 'antiAirTank')).toBeGreaterThanOrEqual(80);
    // 対空戦車から見れば戦車はいずれも不利な相手(重戦車にいたっては攻撃できない)
    for (const tank of TANK_UNIT_TYPES) {
      expect(getBaseDamage('antiAirTank', tank)).toBeLessThan(
        getBaseDamage(tank, 'antiAirTank'),
      );
    }
    expect(getBaseDamage('antiAirTank', 'heavyTank')).toBe(0);
  });

  it('水上艦には 軽1割・中1〜2割・重2割で、潜水艦は攻撃できない', () => {
    for (const ship of ['battleship', 'escortShip', 'transportShip'] as const) {
      expect(getBaseDamage('lightTank', ship)).toBe(10);
      expect(getBaseDamage('mediumTank', ship)).toBeGreaterThanOrEqual(10);
      expect(getBaseDamage('mediumTank', ship)).toBeLessThanOrEqual(20);
      expect(getBaseDamage('heavyTank', ship)).toBe(20);
    }
    for (const tank of TANK_UNIT_TYPES) {
      expect(getBaseDamage(tank, 'submarine')).toBe(0);
      expect(
        canAttackUnit(makeUnit(tank, 'player'), makeUnit('submarine', 'enemy')),
      ).toBe(false);
    }
  });
});

describe('重戦車は対空戦車から攻撃を受けない', () => {
  const FLAT_MAP: MapDefinition = { name: 'flat', terrain: ['rrr', 'rrr', 'rrr'] };

  it('相性表は一方通行(重戦車 → 対空戦車は通るが、逆向きは攻撃できない)', () => {
    expect(getBaseDamage('heavyTank', 'antiAirTank')).toBeGreaterThanOrEqual(80);
    // 対空戦車から重戦車へは攻撃できない(基礎ダメージ 0 = 攻撃対象にならない)
    expect(getBaseDamage('antiAirTank', 'heavyTank')).toBe(0);
    expect(
      canAttackUnit(makeUnit('antiAirTank', 'player'), makeUnit('heavyTank', 'enemy')),
    ).toBe(false);
    // 軽戦車・中戦車には引き続き攻撃できる
    expect(getBaseDamage('antiAirTank', 'lightTank')).toBeGreaterThan(0);
    expect(getBaseDamage('antiAirTank', 'mediumTank')).toBeGreaterThan(0);
  });

  it('隣接して攻撃しても反撃ダメージが 0 になる(実行・予測とも)', () => {
    const map = MapManager.fromDefinition(FLAT_MAP);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'heavyTank', army: 'player' },
        { col: 1, row: 0, unitType: 'antiAirTank', army: 'enemy' },
      ],
      map,
    );
    const heavy = units.getUnitAt(gridPosition(0, 0))!;
    const antiAir = units.getUnitAt(gridPosition(1, 0))!;

    expect(canCounterattack(antiAir, heavy, 1)).toBe(false);

    const forecast = forecastBattle(heavy, antiAir, map);
    expect(forecast.willCounter).toBe(false);
    expect(forecast.counterDamage).toBe(0);

    const result = new BattleManager(map, units).attack(heavy, antiAir);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(result.counterDamage).toBe(0);
    expect(heavy.currentHp).toBe(heavy.maxHp);
  });

  it('対空戦車は隣接した重戦車を攻撃対象にできない', () => {
    const map = MapManager.fromDefinition(FLAT_MAP);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'antiAirTank', army: 'player' },
        { col: 1, row: 0, unitType: 'heavyTank', army: 'enemy' },
      ],
      map,
    );
    const antiAir = units.getUnitAt(gridPosition(0, 0))!;
    const heavy = units.getUnitAt(gridPosition(1, 0))!;

    // 射程内にいても攻撃対象の一覧に出てこない
    expect(findAttackableTargets(antiAir, units)).not.toContain(heavy);
    expect(() => new BattleManager(map, units).attack(antiAir, heavy)).toThrow();
  });

  it('中戦車が攻撃した場合は、これまでどおり対空戦車が反撃する', () => {
    const map = MapManager.fromDefinition(FLAT_MAP);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'mediumTank', army: 'player' },
        { col: 1, row: 0, unitType: 'antiAirTank', army: 'enemy' },
      ],
      map,
    );
    const medium = units.getUnitAt(gridPosition(0, 0))!;
    const antiAir = units.getUnitAt(gridPosition(1, 0))!;

    // 一撃で倒しきらないよう HP を満タンのままにしておく(中戦車 → 対空戦車は 7〜8 割)
    const result = new BattleManager(map, units).attack(medium, antiAir);
    expect(result.defenderDefeated).toBe(false);
    expect(result.counterDamage).toBeGreaterThan(0);
  });
});

describe('重戦車は軽装甲の車両からほとんどダメージを受けない', () => {
  it('偵察車・輸送車からの被ダメージは 5', () => {
    expect(getBaseDamage('recon', 'heavyTank')).toBe(5);
    expect(getBaseDamage('transportVehicle', 'heavyTank')).toBe(5);
    // 軽戦車・中戦車への 1〜2 割よりもさらに通らない
    for (const attacker of ['recon', 'transportVehicle'] as const) {
      expect(getBaseDamage(attacker, 'heavyTank')).toBeLessThan(
        getBaseDamage(attacker, 'mediumTank'),
      );
    }
  });

  it('反対向きの重戦車 → 偵察車・輸送車は 8〜9 割のまま', () => {
    expect(getBaseDamage('heavyTank', 'recon')).toBe(85);
    expect(getBaseDamage('heavyTank', 'transportVehicle')).toBe(85);
  });

  it('軽装甲の車両(偵察車・輸送車・対空戦車)から見て、生産できる地上ユニットで最も通らない相手', () => {
    // 工場・本拠地で生産できない特別な 2 種は比較から外す。
    // 新型戦車(研究所の占領で手に入る)は重戦車以上の装甲を持ち、
    // 列車砲(駅で 1 台だけ作れる)も装甲列車の車体で機関銃・機関砲をはね返す
    // (偵察車・輸送車から 3、対空戦車から 5)。
    const otherGround = GROUND_UNIT_TYPES.filter(
      (t) => t !== 'heavyTank' && t !== 'newTank' && t !== 'railgun',
    );
    for (const attacker of ['recon', 'transportVehicle', 'antiAirTank'] as const) {
      const vsHeavy = getBaseDamage(attacker, 'heavyTank');
      for (const defender of otherGround) {
        expect(vsHeavy).toBeLessThan(getBaseDamage(attacker, defender));
      }
    }
  });

  it('どの攻撃側から見ても、戦車は装甲が厚いほど通らない(軽 >= 中 >= 重)', () => {
    for (const attacker of UNIT_TYPES) {
      const [vsLight, vsMedium, vsHeavy] = TANK_UNIT_TYPES.map((tank) =>
        getBaseDamage(attacker, tank),
      );
      expect(vsLight).toBeGreaterThanOrEqual(vsMedium);
      expect(vsMedium).toBeGreaterThanOrEqual(vsHeavy);
    }
  });
});

describe('ロケット砲の基本パラメータ', () => {
  it('コスト15000・移動力4・視界1・射程3〜5の間接攻撃ユニット', () => {
    const data = getUnitData('rocketArtillery');
    expect(data.unitName).toBe('ロケット砲');
    expect(data.cost).toBe(15000);
    expect(data.movement).toBe(4);
    expect(data.vision).toBe(1);
    expect(data.minAttackRange).toBe(3);
    expect(data.maxAttackRange).toBe(5);
    expect(data.canCapture).toBe(false);
    // 最小射程 2 以上なので、移動後は攻撃できない間接攻撃ユニットになる
    expect(makeUnit('rocketArtillery').isIndirect).toBe(true);
  });

  it('工場・本拠地で生産でき、地上ユニットとして輸送艦に積める', () => {
    expect(isProducibleAt('factory', 'rocketArtillery')).toBe(true);
    expect(isProducibleAt('headquarters', 'rocketArtillery')).toBe(true);
    expect(isProducibleAt('airport', 'rocketArtillery')).toBe(false);
    expect(isProducibleAt('port', 'rocketArtillery')).toBe(false);
    expect(GROUND_UNIT_TYPES).toContain('rocketArtillery');
    expect(canCarry(makeUnit('transportShip'), makeUnit('rocketArtillery'))).toBe(true);
  });

  it('装輪車両なので、道路・拠点は1・平地は2・海岸は4・森・山・海は進入不可', () => {
    expect(getUnitData('rocketArtillery').movementType).toBe('wheeled');
    const cost = (terrain: Parameters<typeof getTerrainData>[0]): number | null =>
      getTerrainData(terrain).moveCost.wheeled;

    expect(cost('road')).toBe(1);
    expect(cost('city')).toBe(1);
    expect(cost('factory')).toBe(1);
    expect(cost('airport')).toBe(1);
    expect(cost('port')).toBe(1);
    expect(cost('headquarters')).toBe(1);
    expect(cost('plain')).toBe(2);
    expect(cost('beach')).toBe(4);
    expect(cost('forest')).toBeNull();
    expect(cost('mountain')).toBeNull();
    expect(cost('sea')).toBeNull();
  });

  it('森・山へは進入できず、道路は移動力4ぶん進める', () => {
    // 横一列: 道路が続き、途中に森を挟む
    const def: MapDefinition = { name: 'rocket-road', terrain: ['rrrrfrr'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [{ col: 0, row: 0, unitType: 'rocketArtillery', army: 'player' }],
      map,
    );
    const rocket = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(rocket, map, units);

    expect(range.canReach(gridPosition(4, 0))).toBe(false); // 森は進入不可
    expect(range.canReach(gridPosition(3, 0))).toBe(true);
  });
});

describe('ロケット砲の攻撃', () => {
  it('射程 3〜5 の相手だけを攻撃でき、隣接した敵は撃てない', () => {
    // 横一列の道路。ロケット砲を左端に置き、距離 1〜6 に敵を並べる
    const def: MapDefinition = { name: 'rocket-range', terrain: ['rrrrrrr'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'rocketArtillery', army: 'player' },
        { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 3, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 5, row: 0, unitType: 'infantry', army: 'enemy' },
        { col: 6, row: 0, unitType: 'infantry', army: 'enemy' },
      ],
      map,
    );
    const rocket = units.getUnitAt(gridPosition(0, 0))!;
    const targets = findAttackableTargets(rocket, units).map((u) => u.position.col);

    expect(targets).toEqual([3, 5]);
  });

  it('飛行ユニットには攻撃できない', () => {
    for (const air of AIR_UNIT_TYPES) {
      expect(getBaseDamage('rocketArtillery', air)).toBe(0);
      expect(
        canAttackUnit(makeUnit('rocketArtillery', 'player'), makeUnit(air, 'enemy')),
      ).toBe(false);
    }
  });

  it('対歩兵は8〜9割、戦車は 軽8割・中6〜7割・重4〜5割', () => {
    expect(getBaseDamage('rocketArtillery', 'infantry')).toBeGreaterThanOrEqual(80);
    expect(getBaseDamage('rocketArtillery', 'infantry')).toBeLessThanOrEqual(90);
    expect(getBaseDamage('rocketArtillery', 'lightTank')).toBe(80);
    expect(getBaseDamage('rocketArtillery', 'mediumTank')).toBeGreaterThanOrEqual(60);
    expect(getBaseDamage('rocketArtillery', 'mediumTank')).toBeLessThanOrEqual(70);
    expect(getBaseDamage('rocketArtillery', 'heavyTank')).toBeGreaterThanOrEqual(40);
    expect(getBaseDamage('rocketArtillery', 'heavyTank')).toBeLessThanOrEqual(50);
  });

  it('自走砲は6〜7割・対空戦車は8割、海上は戦艦3〜4割・護衛艦/輸送艦6割で潜水艦は不可', () => {
    expect(getBaseDamage('rocketArtillery', 'artillery')).toBeGreaterThanOrEqual(60);
    expect(getBaseDamage('rocketArtillery', 'artillery')).toBeLessThanOrEqual(70);
    expect(getBaseDamage('rocketArtillery', 'antiAirTank')).toBe(80);
    expect(getBaseDamage('rocketArtillery', 'battleship')).toBeGreaterThanOrEqual(30);
    expect(getBaseDamage('rocketArtillery', 'battleship')).toBeLessThanOrEqual(40);
    expect(getBaseDamage('rocketArtillery', 'escortShip')).toBe(60);
    expect(getBaseDamage('rocketArtillery', 'transportShip')).toBe(60);
    expect(getBaseDamage('rocketArtillery', 'submarine')).toBe(0);
  });

  it('地上ユニットの中で最も防御力が低い(どの攻撃側から見ても被ダメージが最大)', () => {
    // 対空ロケット砲は「防御力はロケット砲と同じ」ユニットなので、比較対象から外す
    const otherGround = GROUND_UNIT_TYPES.filter(
      (t) => t !== 'rocketArtillery' && t !== 'antiAirRocketArtillery',
    );

    for (const attacker of UNIT_TYPES) {
      const vsRocket = getBaseDamage(attacker, 'rocketArtillery');
      const maxVsOthers = Math.max(
        ...otherGround.map((defender) => getBaseDamage(attacker, defender)),
      );
      // 地上ユニットを攻撃できない種別(護衛艦・潜水艦・輸送系)は 0 同士で並ぶ
      expect(vsRocket).toBeGreaterThanOrEqual(maxVsOthers);
      if (maxVsOthers > 0) {
        expect(vsRocket).toBeGreaterThan(maxVsOthers);
      }
    }
  });

  it('対空ロケット砲はロケット砲とまったく同じ防御力(被ダメージ)を持つ', () => {
    for (const attacker of UNIT_TYPES) {
      expect(getBaseDamage(attacker, 'antiAirRocketArtillery')).toBe(
        getBaseDamage(attacker, 'rocketArtillery'),
      );
    }
  });

  it('間接攻撃なので反撃を受けない', () => {
    const def: MapDefinition = { name: 'rocket-counter', terrain: ['rrrr'] };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(
      [
        { col: 0, row: 0, unitType: 'rocketArtillery', army: 'player' },
        { col: 3, row: 0, unitType: 'mediumTank', army: 'enemy' },
      ],
      map,
    );
    const rocket = units.getUnitAt(gridPosition(0, 0))!;
    const tank = units.getUnitAt(gridPosition(3, 0))!;

    const result = new BattleManager(map, units).attack(rocket, tank);
    expect(result.damageDealt).toBeGreaterThan(0);
    expect(result.counterDamage).toBe(0);
  });
});
