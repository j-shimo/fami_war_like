import { describe, expect, it } from 'vitest';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { RepairManager } from '@/core/economy/RepairManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { UnitManager } from '@/core/units/UnitManager';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { SYMBOL_TO_TERRAIN } from '@/data/maps/mapDefinition';
import { canRepairAt, getTerrainData } from '@/data/terrainData';
import { producibleUnitTypesAt } from '@/data/unitData';
import { computeRailLinks } from '@/rendering/roadLinks';
import { formatTerrainInfo } from '@/ui/terrainInfo';

/** 地形 1 マスぶんの移動コストを移動タイプ別に取り出す */
function cost(
  terrain: Parameters<typeof getTerrainData>[0],
  movementType: MovementType,
): number | null {
  return getTerrainData(terrain).moveCost[movementType];
}

describe('地形「駅」(station)のパラメータ', () => {
  it('防御・移動コスト・占領・生産は工場と同じ拠点', () => {
    const station = getTerrainData('station');
    const factory = getTerrainData('factory');

    expect(station.terrainName).toBe('駅');
    expect(station.defense).toBe(factory.defense);
    expect(station.canCapture).toBe(true);
    expect(station.canProduce).toBe(true);
    expect(station.canRepair).toBe(true);
    // 地上ユニット(歩兵・装軌・装輪)と飛行ユニットの移動コストは工場と同じ
    for (const movementType of ['infantry', 'vehicle', 'wheeled', 'air'] as const) {
      expect(cost('station', movementType)).toBe(cost('factory', movementType));
    }
  });

  it('海上ユニットは侵入できないが、列車砲(軌道系)はコスト 1 で停車できる', () => {
    expect(cost('station', 'sea')).toBeNull();
    expect(cost('station', 'rail')).toBe(1);
  });

  it('生産できるのは列車砲だけ', () => {
    expect(producibleUnitTypesAt('station')).toEqual(['railgun']);
  });

  it('地上ユニットに加えて、列車砲を修理できる唯一の拠点', () => {
    for (const movementType of ['infantry', 'vehicle', 'wheeled'] as const) {
      expect(canRepairAt('station', movementType)).toBe(true);
    }
    expect(canRepairAt('station', 'rail')).toBe(true);
    expect(canRepairAt('station', 'sea')).toBe(false);
    expect(canRepairAt('station', 'air')).toBe(false);
    // 駅以外の拠点では列車砲を修理できない
    for (const terrain of ['city', 'laboratory', 'factory', 'headquarters'] as const) {
      expect(canRepairAt(terrain, 'rail')).toBe(false);
    }
  });

  it('マップ定義の記号 S で置ける', () => {
    expect(SYMBOL_TO_TERRAIN.S).toBe('station');
  });
});

describe('地形「線路」(railway)のパラメータ', () => {
  it('防御効果は道路と同じ(防御 0・占領も生産もできない)', () => {
    const railway = getTerrainData('railway');
    const road = getTerrainData('road');

    expect(railway.terrainName).toBe('線路');
    expect(railway.defense).toBe(road.defense);
    expect(railway.canCapture).toBe(false);
    expect(railway.canProduce).toBe(false);
    expect(railway.canRepair).toBe(false);
  });

  it('歩兵1・装軌2・装輪4・列車砲1で、海上ユニットは侵入できない', () => {
    expect(cost('railway', 'infantry')).toBe(1);
    // 戦車系・自走砲系(装軌)は枕木に阻まれて道路の 2 倍かかる
    expect(cost('railway', 'vehicle')).toBe(2);
    // 偵察車・ロケット砲系(装輪)はさらに重い
    expect(cost('railway', 'wheeled')).toBe(4);
    expect(cost('railway', 'rail')).toBe(1);
    expect(cost('railway', 'air')).toBe(1);
    expect(cost('railway', 'sea')).toBeNull();
  });

  it('道路より車両が遅い(装軌・装輪とも道路のコストを上回る)', () => {
    expect(cost('railway', 'vehicle')!).toBeGreaterThan(cost('road', 'vehicle')!);
    expect(cost('railway', 'wheeled')!).toBeGreaterThan(cost('road', 'wheeled')!);
    // 歩兵だけは道路と同じ 1 で歩ける
    expect(cost('railway', 'infantry')).toBe(cost('road', 'infantry'));
  });

  it('マップ定義の記号 = で置ける', () => {
    expect(SYMBOL_TO_TERRAIN['=']).toBe('railway');
  });
});

describe('軌道系(rail)の移動範囲', () => {
  // 上段が線路と駅、下段は平地・道路。列車砲は上段から降りられない
  //   row0: S = = = S
  //   row1: . r . r .
  const RAIL_MAP: MapDefinition = {
    name: '線路テストマップ',
    terrain: ['S===S', '.r.r.'],
    owners: [{ col: 0, row: 0, owner: 'player' }],
    units: [{ col: 0, row: 0, unitType: 'railgun', army: 'player' }],
  };

  it('列車砲は線路と駅の上だけを進み、平地・道路へは降りられない', () => {
    const map = MapManager.fromDefinition(RAIL_MAP);
    const units = UnitManager.fromPlacements(RAIL_MAP.units ?? [], map);
    const railgun = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(railgun, map, units);

    // 線路づたいに反対側の駅(4, 0)まで届く(コスト 1 × 4 マス)
    expect(range.canReach(gridPosition(4, 0))).toBe(true);
    expect(range.getCost(gridPosition(4, 0))).toBe(4);
    // 下段の平地・道路には 1 マスも進入できない
    for (let col = 0; col < 5; col++) {
      expect(range.canReach(gridPosition(col, 1))).toBe(false);
    }
  });

  it('線路の上でも他の地上ユニットは進める(装軌はコスト 2)', () => {
    // 一本道: 平地 → 駅 → 線路 3 マス。中戦車(移動力 5)がどこまで進めるかを見る
    const def: MapDefinition = {
      name: '線路の通行',
      terrain: ['.S==='],
      units: [{ col: 0, row: 0, unitType: 'mediumTank', army: 'player' }],
    };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(def.units ?? [], map);
    const tank = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(tank, map, units);

    // 駅は工場と同じコスト 1、線路は 1 マスにつき 2 かかる
    expect(range.getCost(gridPosition(1, 0))).toBe(1);
    expect(range.getCost(gridPosition(2, 0))).toBe(3);
    expect(range.getCost(gridPosition(3, 0))).toBe(5);
    // 移動力 5 では 4 マス目の線路(コスト 7)へは届かない
    expect(range.canReach(gridPosition(4, 0))).toBe(false);
  });

  it('海上ユニットは駅にも線路にも入れない', () => {
    const def: MapDefinition = {
      name: '海に面した駅',
      terrain: ['~S=', '~~~'],
      units: [{ col: 0, row: 0, unitType: 'transportShip', army: 'player' }],
    };
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(def.units ?? [], map);
    const ship = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(ship, map, units);

    expect(range.canReach(gridPosition(1, 0))).toBe(false);
    expect(range.canReach(gridPosition(2, 0))).toBe(false);
  });
});

describe('駅での生産', () => {
  // 自軍の駅を 2 つ並べ、「1 台持っていると 2 つ目の駅でも作れない」ことを確かめられるようにする
  //   row0: S = = S   (左 2 つが自軍の駅、右が敵軍の駅)
  //   row1: S . . H
  const def: MapDefinition = {
    name: '駅の生産テスト',
    terrain: ['S==S', 'S..H'],
    owners: [
      { col: 0, row: 0, owner: 'player' },
      { col: 0, row: 1, owner: 'player' },
      { col: 3, row: 0, owner: 'enemy' },
      { col: 3, row: 1, owner: 'enemy' },
    ],
  };

  function setup(funds = 100000) {
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements([], map);
    const economy = new EconomyManager({ initialFunds: funds });
    const production = new ProductionManager(map, units, economy);
    const station = map.getTile(gridPosition(0, 0))!;
    const otherStation = map.getTile(gridPosition(0, 1))!;
    return { map, units, economy, production, station, otherStation };
  }

  it('自軍の駅で列車砲を生産できる', () => {
    const { production, station, units } = setup();
    expect(production.canProduce('player', station, 'railgun')).toBe(true);

    const result = production.produce('player', station, 'railgun');
    expect(result.cost).toBe(30000);
    expect(units.getUnitAt(gridPosition(0, 0))?.unitType).toBe('railgun');
  });

  it('列車砲は 1 軍に 1 台まで。持っているあいだは生産一覧からも消える', () => {
    const { production, station, otherStation } = setup();
    production.produce('player', station, 'railgun');

    // 空いている 2 つ目の自軍の駅でも、すでに 1 台持っているので作れない。
    // 駅で作れるのは列車砲だけなので、候補が 1 つも残らず「生産」自体を選べなくなる
    // (中身の無い生産ウィンドウを開かせないため)
    expect(production.canProduceAt('player', otherStation)).toBe(false);
    expect(production.canProduce('player', otherStation, 'railgun')).toBe(false);
    expect(() => production.produce('player', otherStation, 'railgun')).toThrow();
    expect(
      producibleUnitTypesAt('station', production.mapContext('player')),
    ).not.toContain('railgun');
    // 相手軍はまだ 1 台も持っていないので、上限には掛からない
    expect(producibleUnitTypesAt('station', production.mapContext('enemy'))).toContain(
      'railgun',
    );
  });

  it('撃破されれば作り直せる(数えるのは盤面に残っている 1 台だけ)', () => {
    const { production, station, otherStation, units } = setup();
    const railgun = production.produce('player', station, 'railgun').unit;
    units.removeUnit(railgun);

    expect(production.canProduce('player', otherStation, 'railgun')).toBe(true);
  });

  it('敵軍所有の駅では生産できない', () => {
    const { production, map } = setup();
    const enemyStation = map.getTile(gridPosition(3, 0))!;
    expect(production.canProduce('player', enemyStation, 'railgun')).toBe(false);
  });

  it('工場・本拠地・空港・港では列車砲を生産できない', () => {
    for (const terrain of ['factory', 'headquarters', 'airport', 'port'] as const) {
      expect(producibleUnitTypesAt(terrain)).not.toContain('railgun');
    }
  });

  it('傷ついた列車砲は自軍の駅でターン開始時に修理できる', () => {
    const { map, units, economy, production, station } = setup();
    const railgun = production.produce('player', station, 'railgun').unit;
    railgun.currentHp = 5;

    const repair = new RepairManager(map, units, economy);
    expect(repair.canRepair(railgun, 'player')).toBe(true);
    expect(repair.repairAll('player').length).toBe(1);
    expect(railgun.currentHp).toBeGreaterThan(5);
  });
});

describe('駅・線路の表示', () => {
  it('地形情報に軌道の移動コストが並ぶ(線路・駅だけ)', () => {
    const railway: TileData = {
      position: gridPosition(1, 0),
      terrainType: 'railway',
      owner: 'neutral',
      captureHp: INITIAL_CAPTURE_HP,
      captureArmy: null,
    };
    const lines = formatTerrainInfo(railway);
    expect(lines[0]).toBe('地形: 線路');
    expect(lines).toContain('移動コスト 軌道: 1');

    // 列車砲が入れない地形では軌道の行を出さない(行数を増やさない)
    const plain: TileData = { ...railway, terrainType: 'plain' };
    expect(
      formatTerrainInfo(plain).some((line) => line.startsWith('移動コスト 軌道')),
    ).toBe(false);
  });

  it('駅の情報には所有・占領耐久・生産可が並ぶ', () => {
    const station: TileData = {
      position: gridPosition(0, 0),
      terrainType: 'station',
      owner: 'player',
      captureHp: INITIAL_CAPTURE_HP,
      captureArmy: null,
    };
    const lines = formatTerrainInfo(station);
    expect(lines[0]).toBe('地形: 駅');
    expect(lines).toContain('所有: 自軍');
    expect(lines).toContain('生産: 可');
  });

  it('線路は線路と駅へつながり、道路や平地へはつながらない', () => {
    // row0: . = .
    // row1: = = S
    // row2: . r .
    const def: MapDefinition = { name: '線路の連結', terrain: ['.=.', '==S', '.r.'] };
    const map = MapManager.fromDefinition(def);

    // 中央 (1,1): 上=線路 / 左=線路 / 右=駅 → true、下=道路 → false
    expect(computeRailLinks(map, gridPosition(1, 1))).toEqual({
      up: true,
      down: false,
      left: true,
      right: true,
    });
  });
});
