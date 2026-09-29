import { describe, expect, it } from 'vitest';
import type { AttackResult } from '@/core/battle/BattleManager';
import { attackBonusOf } from '@/core/battle/CommanderBonus';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import { INITIAL_CAPTURE_HP } from '@/core/map/TileData';
import {
  DEFAULT_FOUR_PLAYER_SETUP,
  absentArmies,
  canStartFourPlayer,
  fourPlayerSummary,
  humanArmies,
  isCpuArmy,
  isFourPlayerSetup,
  participatingArmies,
  playerNumberLabel,
  withSlot,
} from '@/core/mode/FourPlayerSetup';
import { createSaveData, isSaveData, restoreGameState } from '@/core/save/SaveData';
import {
  readFourPlayerSetup,
  readSettings,
  writeFourPlayerSetup,
} from '@/core/settings/SettingsStorage';
import type { SaveStorageLike } from '@/core/save/SaveStorage';
import { BattleStatsRecorder } from '@/core/stats/BattleStats';
import { TurnManager } from '@/core/turn/TurnManager';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import {
  applyElimination,
  EliminationChecker,
  findHomeHeadquarters,
  judgeFourPlayer,
} from '@/core/victory/ArmyElimination';
import { removeAbsentArmies } from '@/data/maps/armySlots';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { swapMapSides } from '@/data/maps/sideSwap';
import { formatEliminationMessage, formatFourPlayerResult } from '@/ui/resultInfo';
import { armyLabel, formatTurnBanner } from '@/ui/turnInfo';

/** 4 軍が四隅に本拠地と工場を 1 つずつ持つ、7x7 の小さな盤面 */
const SMALL_FOUR_MAP: MapDefinition = {
  name: '小さな4P盤面',
  terrain: [
    'HF...FH', // 0
    '.......', // 1
    '...c...', // 2
    '.......', // 3
    '.......', // 4
    '.......', // 5
    'HF...FH', // 6
  ],
  owners: [
    { col: 0, row: 0, owner: 'player' },
    { col: 1, row: 0, owner: 'player' },
    { col: 6, row: 0, owner: 'enemy' },
    { col: 5, row: 0, owner: 'enemy' },
    { col: 0, row: 6, owner: 'third' },
    { col: 1, row: 6, owner: 'third' },
    { col: 6, row: 6, owner: 'fourth' },
    { col: 5, row: 6, owner: 'fourth' },
  ],
  units: [
    { col: 1, row: 1, unitType: 'infantry', army: 'player' },
    { col: 5, row: 1, unitType: 'infantry', army: 'enemy' },
    { col: 1, row: 5, unitType: 'infantry', army: 'third' },
    { col: 5, row: 5, unitType: 'infantry', army: 'fourth' },
  ],
};

/** 読み書きをメモリ上で行う保存先 */
class MemoryStorage implements SaveStorageLike {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe('FourPlayerSetup(4P マップの遊び方)', () => {
  it('既定では 1P がプレイヤー・2P〜4P がコンピューターで、4 軍とも参加する', () => {
    expect(participatingArmies(DEFAULT_FOUR_PLAYER_SETUP)).toEqual([
      'player',
      'enemy',
      'third',
      'fourth',
    ]);
    expect(humanArmies(DEFAULT_FOUR_PLAYER_SETUP)).toEqual(['player']);
    expect(isCpuArmy(DEFAULT_FOUR_PLAYER_SETUP, 'third')).toBe(true);
    expect(canStartFourPlayer(DEFAULT_FOUR_PLAYER_SETUP)).toBe(true);
  });

  it('「なし」の軍勢は参加せず、参加が 2 軍未満なら始められない', () => {
    let setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'enemy', { control: 'none' });
    setup = withSlot(setup, 'fourth', { control: 'none' });
    expect(participatingArmies(setup)).toEqual(['player', 'third']);
    expect(absentArmies(setup)).toEqual(['enemy', 'fourth']);
    expect(canStartFourPlayer(setup)).toBe(true);
    setup = withSlot(setup, 'third', { control: 'none' });
    expect(canStartFourPlayer(setup)).toBe(false);
  });

  it('withSlot は元の設定を書き換えず、指定した軍勢だけを差し替える', () => {
    const setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'third', {
      characterId: 'vanguard',
    });
    expect(setup.third).toEqual({ control: 'cpu', characterId: 'vanguard' });
    expect(DEFAULT_FOUR_PLAYER_SETUP.third.characterId).toBe('instructor');
  });

  it('設定の検証・呼び名・1 行の要約', () => {
    expect(isFourPlayerSetup(DEFAULT_FOUR_PLAYER_SETUP)).toBe(true);
    expect(isFourPlayerSetup({ ...DEFAULT_FOUR_PLAYER_SETUP, third: undefined })).toBe(
      false,
    );
    expect(
      isFourPlayerSetup({
        ...DEFAULT_FOUR_PLAYER_SETUP,
        fourth: { control: 'x', characterId: 'instructor' },
      }),
    ).toBe(false);
    expect(playerNumberLabel('player')).toBe('1P');
    expect(playerNumberLabel('fourth')).toBe('4P');
    expect(
      fourPlayerSummary(
        withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'fourth', { control: 'none' }),
      ),
    ).toBe('1P プレイヤー / 2P CPU / 3P CPU / 4P なし');
  });

  it('ゲーム設定として保存・読み込みでき、壊れた値は既定値に戻る', () => {
    const storage = new MemoryStorage();
    expect(readFourPlayerSetup(storage)).toEqual(DEFAULT_FOUR_PLAYER_SETUP);
    const setup = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'enemy', { control: 'human' });
    expect(writeFourPlayerSetup(setup, storage)).toBe(true);
    expect(readFourPlayerSetup(storage)).toEqual(setup);
    // 他の設定は残したまま保存する
    expect(readSettings(storage).gameMode).toEqual(readSettings(null).gameMode);

    const broken = new MemoryStorage();
    broken.setItem('gridwars:settings', JSON.stringify({ fourPlayer: { player: 1 } }));
    expect(readFourPlayerSetup(broken)).toEqual(DEFAULT_FOUR_PLAYER_SETUP);
  });
});

describe('removeAbsentArmies(参加しない軍勢の陣地を中立にする)', () => {
  it('本拠地は中立の都市に・工場は中立に・初期ユニットは取り除く', () => {
    const def = removeAbsentArmies(SMALL_FOUR_MAP, ['enemy']);
    const map = MapManager.fromDefinition(def);
    expect(map.getTile(gridPosition(6, 0))?.terrainType).toBe('city');
    expect(map.getTile(gridPosition(6, 0))?.owner).toBe('neutral');
    expect(map.getTile(gridPosition(5, 0))?.terrainType).toBe('factory');
    expect(map.getTile(gridPosition(5, 0))?.owner).toBe('neutral');
    expect(def.units?.some((unit) => unit.army === 'enemy')).toBe(false);
    expect(def.units).toHaveLength(3);
    // 参加する軍勢の陣地はそのまま
    expect(map.getTile(gridPosition(0, 6))?.owner).toBe('third');
    // 元の定義は変えない
    expect(SMALL_FOUR_MAP.terrain[0]).toBe('HF...FH');
  });

  it('取り除く軍勢が無ければ元の定義をそのまま返す', () => {
    expect(removeAbsentArmies(SMALL_FOUR_MAP, [])).toBe(SMALL_FOUR_MAP);
  });

  it('2P側の入れ替えは 3P・4P の所属を変えない', () => {
    const swapped = swapMapSides(SMALL_FOUR_MAP);
    expect(swapped.units?.map((unit) => unit.army)).toEqual([
      'enemy',
      'player',
      'third',
      'fourth',
    ]);
    expect(swapped.owners?.find((o) => o.col === 0 && o.row === 6)?.owner).toBe('third');
  });
});

describe('TurnManager(4P マップの手番)', () => {
  const units = (): UnitManager => UnitManager.fromPlacements(SMALL_FOUR_MAP.units ?? []);

  it('渡した順番(1P → 2P → 3P → 4P)で手番が回り、一巡するとターン数が増える', () => {
    const turn = new TurnManager(units(), undefined, [
      'player',
      'enemy',
      'third',
      'fourth',
    ]);
    const seen = [turn.currentArmy];
    for (let i = 0; i < 4; i += 1) {
      turn.endTurn();
      seen.push(turn.currentArmy);
    }
    expect(seen).toEqual(['player', 'enemy', 'third', 'fourth', 'player']);
    expect(turn.turnNumber).toBe(2);
  });

  it('脱落した軍勢は手番を飛ばす(先手が脱落しても一巡でターン数が増える)', () => {
    const turn = new TurnManager(units(), undefined, [
      'player',
      'enemy',
      'third',
      'fourth',
    ]);
    turn.eliminate('enemy');
    turn.endTurn();
    expect(turn.currentArmy).toBe('third');
    turn.eliminate('player');
    turn.endTurn(); // → 4P
    turn.endTurn(); // → 1P・2P を飛ばして 3P(第 2 ターン)
    expect(turn.currentArmy).toBe('third');
    expect(turn.turnNumber).toBe(2);
    expect(turn.activeArmies).toEqual(['third', 'fourth']);
    expect(turn.eliminatedArmies).toEqual(['player', 'enemy']);
  });

  it('手番中の軍勢が脱落しても、次の endTurn で残りの軍勢へ手番が移る', () => {
    const turn = new TurnManager(units(), undefined, ['player', 'third']);
    turn.eliminate('player');
    turn.endTurn();
    expect(turn.currentArmy).toBe('third');
  });

  it('手番開始時に、その軍勢の行動済みをリセットする', () => {
    const manager = units();
    const turn = new TurnManager(manager, undefined, [
      'player',
      'enemy',
      'third',
      'fourth',
    ]);
    const third = manager.getUnitsByArmy('third')[0];
    third.hasActed = true;
    turn.endTurn();
    expect(third.hasActed).toBe(true);
    turn.endTurn();
    expect(third.hasActed).toBe(false);
  });
});

describe('EliminationChecker / applyElimination(4P マップの脱落)', () => {
  function setup() {
    const map = MapManager.fromDefinition(SMALL_FOUR_MAP);
    const units = UnitManager.fromPlacements(SMALL_FOUR_MAP.units ?? [], map);
    const checker = new EliminationChecker(map, units, findHomeHeadquarters(map));
    return { map, units, checker };
  }
  const ALL = ['player', 'enemy', 'third', 'fourth'] as const;

  it('開始時の本拠地を各軍勢の自軍の本拠地とする', () => {
    const { map } = setup();
    const homes = findHomeHeadquarters(map);
    expect(homes.get('player')).toEqual(gridPosition(0, 0));
    expect(homes.get('fourth')).toEqual(gridPosition(6, 6));
  });

  it('誰も脱落していなければ何も返さない', () => {
    expect(setup().checker.check(ALL)).toEqual([]);
  });

  it('本拠地を占領されると脱落し、拠点は占領した軍勢のものになる', () => {
    const { map, units, checker } = setup();
    // 4P が 3P の工場を占領しかけていた途中経過もある
    const factory = map.getTile(gridPosition(1, 6))!;
    factory.captureArmy = 'fourth';
    factory.captureHp = 8;
    map.getTile(gridPosition(0, 6))!.owner = 'player';

    const eliminations = checker.check(ALL);
    expect(eliminations).toEqual([
      { army: 'third', reason: 'hq_captured', capturedBy: 'player' },
    ]);
    const effect = applyElimination(eliminations[0], map, units);
    expect(effect).toEqual({ removedUnits: 1, transferredBases: 1, newOwner: 'player' });
    expect(units.getUnitsByArmy('third')).toHaveLength(0);
    expect(factory.owner).toBe('player');
    // よその軍勢の占領の途中経過はそのまま残す
    expect(factory.captureArmy).toBe('fourth');
    expect(factory.captureHp).toBe(8);
  });

  it('全滅すると脱落し、拠点は中立に戻る(脱落した軍勢の占領の途中経過も消える)', () => {
    const { map, units, checker } = setup();
    const city = map.getTile(gridPosition(3, 2))!;
    city.captureArmy = 'enemy';
    city.captureHp = 10;
    checker.check(ALL); // 配備済みとして記録する
    units.removeUnit(units.getUnitsByArmy('enemy')[0]);

    const eliminations = checker.check(ALL);
    expect(eliminations).toEqual([
      { army: 'enemy', reason: 'annihilated', capturedBy: null },
    ]);
    applyElimination(eliminations[0], map, units);
    expect(map.getTile(gridPosition(6, 0))?.owner).toBe('neutral');
    expect(map.getTile(gridPosition(5, 0))?.owner).toBe('neutral');
    expect(city.captureArmy).toBeNull();
    expect(city.captureHp).toBe(INITIAL_CAPTURE_HP);
  });

  it('一度もユニットを出していない軍勢は、ユニット 0 でも全滅とみなさない', () => {
    const map = MapManager.fromDefinition({ ...SMALL_FOUR_MAP, units: [] });
    const units = UnitManager.fromPlacements([], map);
    const checker = new EliminationChecker(map, units, findHomeHeadquarters(map));
    expect(checker.check(ALL)).toEqual([]);
  });

  it('奪った本拠地を持っていても、自軍の本拠地を奪われたら脱落する', () => {
    const { map, checker } = setup();
    map.getTile(gridPosition(6, 6))!.owner = 'player'; // 1P が 4P の本拠地を奪った
    map.getTile(gridPosition(0, 0))!.owner = 'enemy'; // 2P が 1P の本拠地を奪った
    const eliminations = checker.check(ALL);
    expect(eliminations.map((e) => e.army).sort()).toEqual(['fourth', 'player']);
    expect(eliminations.find((e) => e.army === 'player')?.capturedBy).toBe('enemy');
  });
});

describe('judgeFourPlayer(4P マップの決着)', () => {
  it('最後の 1 軍が残ればその軍勢の勝利', () => {
    expect(judgeFourPlayer(['third'], ['player'])).toEqual({
      kind: 'winner',
      army: 'third',
      armies: ['third'],
    });
  });

  it('プレイヤーの軍勢がすべて脱落したら、コンピューターが残っていても決着する', () => {
    expect(judgeFourPlayer(['enemy', 'fourth'], ['player', 'third'])).toEqual({
      kind: 'humans_defeated',
    });
  });

  it('プレイヤーが残っていて 2 軍以上いれば続く。プレイヤーのいない観戦は最後の 1 軍まで続く', () => {
    expect(judgeFourPlayer(['player', 'enemy'], ['player'])).toEqual({ kind: 'ongoing' });
    expect(judgeFourPlayer(['enemy', 'third'], [])).toEqual({ kind: 'ongoing' });
  });
});

describe('4P マップの中断データ', () => {
  it('1P〜4P の設定・脱落した軍勢・4 軍の資金・手番を保存して復元できる', () => {
    const setupDef = withSlot(DEFAULT_FOUR_PLAYER_SETUP, 'fourth', { control: 'none' });
    const def = removeAbsentArmies(SMALL_FOUR_MAP, absentArmies(setupDef));
    const map = MapManager.fromDefinition(def);
    const units = UnitManager.fromPlacements(def.units ?? [], map);
    const turn = new TurnManager(units, undefined, participatingArmies(setupDef));
    const economy = new EconomyManager({ initialFunds: 0 });
    economy.setFunds('third', 7000);
    turn.endTurn(); // → 2P
    turn.eliminate('player');
    turn.endTurn(); // → 3P

    const save = createSaveData({
      mapId: 'small',
      nightBattle: false,
      aiCharacterId: 'instructor',
      playerCharacterId: 'instructor',
      playerSide: '1p',
      versusMode: 'cpu',
      fourPlayer: setupDef,
      map,
      units,
      turn,
      economy,
    });
    const json = JSON.parse(JSON.stringify(save));
    expect(isSaveData(json)).toBe(true);
    expect(save.fourPlayer).toEqual(setupDef);
    expect(save.eliminated).toEqual(['player']);
    expect(save.funds.third).toBe(7000);

    const restored = restoreGameState(json, MapManager.fromDefinition(def));
    expect(restored.turn.currentArmy).toBe('third');
    expect(restored.turn.activeArmies).toEqual(['enemy', 'third']);
    expect(restored.economy.getFunds('third')).toBe(7000);
    restored.turn.endTurn();
    expect(restored.turn.currentArmy).toBe('enemy');
    expect(restored.turn.turnNumber).toBe(2);
  });

  it('2 人で遊ぶマップの中断データは 4P の設定を持たない', () => {
    const map = MapManager.fromDefinition(SMALL_FOUR_MAP);
    const units = UnitManager.fromPlacements([], map);
    const save = createSaveData({
      mapId: 'small',
      nightBattle: false,
      aiCharacterId: 'instructor',
      playerCharacterId: 'instructor',
      playerSide: '1p',
      versusMode: 'cpu',
      map,
      units,
      turn: new TurnManager(units),
      economy: new EconomyManager(),
    });
    expect(save.fourPlayer).toBeNull();
    expect(save.eliminated).toEqual([]);
    expect(isSaveData(JSON.parse(JSON.stringify(save)))).toBe(true);
    expect(isSaveData({ ...save, fourPlayer: { player: 'x' } })).toBe(false);
    expect(isSaveData({ ...save, eliminated: ['neutral'] })).toBe(false);
  });
});

describe('4P マップの戦績・攻撃補正', () => {
  /** 攻撃結果を組み立てる(戦績の振り分けだけを確かめる) */
  function attack(
    attackerArmy: 'player' | 'enemy' | 'third' | 'fourth',
    defenderArmy: 'player' | 'enemy' | 'third' | 'fourth',
    options: { defenderDefeated?: boolean; attackerDefeated?: boolean } = {},
  ): AttackResult {
    const make = (army: typeof attackerArmy, col: number): Unit =>
      new Unit({
        id: `${army}-${col}`,
        unitType: 'infantry',
        armyType: army,
        position: gridPosition(col, 0),
      });
    return {
      attacker: make(attackerArmy, 0),
      defender: make(defenderArmy, 1),
      damageDealt: 5,
      counterDamage: 0,
      countered: false,
      defenderDefeated: options.defenderDefeated ?? false,
      attackerDefeated: options.attackerDefeated ?? false,
      lostPassengers: [],
    };
  }

  it('撃破は実際に戦った相手の軍勢へ数える', () => {
    const recorder = new BattleStatsRecorder();
    recorder.recordAttack(attack('third', 'fourth', { defenderDefeated: true }));
    recorder.recordAttack(attack('enemy', 'third', { attackerDefeated: true }));
    const stats = recorder.snapshot();
    expect(stats.third.attacks).toBe(1);
    expect(stats.third.defeated).toBe(2);
    expect(stats.fourth.lost).toBe(1);
    expect(stats.enemy.lost).toBe(1);
    expect(stats.player.defeated).toBe(0);
  });

  it('攻撃補正は書かれていない軍勢には 0 を返す', () => {
    const bonus = { player: 0.1, third: 0.2 };
    expect(attackBonusOf(bonus, 'third')).toBe(0.2);
    expect(attackBonusOf(bonus, 'fourth')).toBe(0);
    expect(attackBonusOf(bonus, 'neutral')).toBe(0);
  });
});

describe('4P マップの表示', () => {
  it('軍勢を 1P〜4P の番号で呼ぶ', () => {
    const options = { fourPlayer: true };
    expect(armyLabel('player', options)).toBe('1P');
    expect(armyLabel('enemy', options)).toBe('2P');
    expect(armyLabel('third', options)).toBe('3P');
    expect(armyLabel('fourth', options)).toBe('4P');
    expect(formatTurnBanner({ turnNumber: 3, currentArmy: 'third' }, options)).toBe(
      '第3ターン / 3P',
    );
  });

  it('決着のメッセージ', () => {
    expect(
      formatFourPlayerResult({ kind: 'winner', army: 'third', armies: ['third'] }, [
        'third',
      ]),
    ).toEqual({
      title: '3P の勝利！',
      detail: 'ほかの軍勢をすべて脱落させた',
      isVictory: true,
    });
    expect(
      formatFourPlayerResult({ kind: 'winner', army: 'enemy', armies: ['enemy'] }, [
        'player',
      ]).isVictory,
    ).toBe(false);
    // プレイヤーのいない観戦のゲームは勝利として締めくくる
    expect(
      formatFourPlayerResult({ kind: 'winner', army: 'enemy', armies: ['enemy'] }, [])
        .isVictory,
    ).toBe(true);
    expect(formatFourPlayerResult({ kind: 'humans_defeated' }, ['player'])).toEqual({
      title: '敗北…',
      detail: '1Pが脱落した',
      isVictory: false,
    });
    expect(
      formatFourPlayerResult({ kind: 'humans_defeated' }, ['player', 'third']).detail,
    ).toBe('プレイヤーの軍勢がすべて脱落した');
  });

  it('脱落のメッセージ', () => {
    expect(
      formatEliminationMessage({
        army: 'third',
        reason: 'hq_captured',
        capturedBy: 'player',
      }),
    ).toEqual({
      title: '3P 脱落！',
      detail: '本拠地を1Pに占領された(拠点は1Pへ)',
      lines: ['3P 脱落！', '本拠地を1Pに占領された', '拠点は1Pへ'],
    });
    expect(
      formatEliminationMessage({
        army: 'fourth',
        reason: 'annihilated',
        capturedBy: null,
      }),
    ).toEqual({
      title: '4P 脱落！',
      detail: '全滅した(拠点は中立へ)',
      lines: ['4P 脱落！', '全滅した', '拠点は中立へ'],
    });
  });
});
