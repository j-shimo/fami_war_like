import { afterEach, describe, expect, it } from 'vitest';
import { EnemyAi } from '@/core/ai/EnemyAi';
import { canAttackUnit, findAttackableTargets } from '@/core/battle/AttackRange';
import { BattleManager } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { gridPosition } from '@/core/map/GridPosition';
import { MapManager } from '@/core/map/MapManager';
import {
  DEFAULT_FOUR_PLAYER_SETUP,
  canStartFourPlayer,
  fourPlayerSideLabel,
  fourPlayerSides,
  fourPlayerSummary,
  hasTeams,
  isFourPlayerSetup,
  slotTeam,
  teamAssignment,
  withSlot,
  type FourPlayerSetup,
} from '@/core/mode/FourPlayerSetup';
import { calculateMovementRange } from '@/core/movement/MovementRange';
import { computeVisibility } from '@/core/night/Visibility';
import {
  areAllied,
  clearAlliances,
  isAllyOf,
  setAlliances,
  teamOf,
} from '@/core/team/Alliance';
import { UnitManager } from '@/core/units/UnitManager';
import { judgeFourPlayer } from '@/core/victory/ArmyElimination';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { formatFourPlayerResult } from '@/ui/resultInfo';

/** 1P・3P を A チーム、2P・4P を B チームにした設定 */
const TEAM_SETUP: FourPlayerSetup = {
  player: { ...DEFAULT_FOUR_PLAYER_SETUP.player, team: 'A' },
  enemy: { ...DEFAULT_FOUR_PLAYER_SETUP.enemy, team: 'B' },
  third: { ...DEFAULT_FOUR_PLAYER_SETUP.third, team: 'A' },
  fourth: { ...DEFAULT_FOUR_PLAYER_SETUP.fourth, team: 'B' },
};

/** 9x9 全面平地 */
const PLAIN_DEF: MapDefinition = {
  name: 'teams',
  terrain: [
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ],
};

afterEach(() => {
  clearAlliances();
});

describe('FourPlayerSetup のチーム分け', () => {
  it('既定ではチームなしで、4 軍がそれぞれ 1 つの陣営になる', () => {
    expect(hasTeams(DEFAULT_FOUR_PLAYER_SETUP)).toBe(false);
    expect(slotTeam(DEFAULT_FOUR_PLAYER_SETUP, 'player')).toBeNull();
    expect(teamAssignment(DEFAULT_FOUR_PLAYER_SETUP)).toEqual({});
    expect(fourPlayerSides(DEFAULT_FOUR_PLAYER_SETUP)).toEqual([
      ['player'],
      ['enemy'],
      ['third'],
      ['fourth'],
    ]);
  });

  it('同じチームの軍勢は 1 つの陣営にまとまる', () => {
    expect(hasTeams(TEAM_SETUP)).toBe(true);
    expect(teamAssignment(TEAM_SETUP)).toEqual({
      player: 'A',
      enemy: 'B',
      third: 'A',
      fourth: 'B',
    });
    expect(fourPlayerSides(TEAM_SETUP)).toEqual([
      ['player', 'third'],
      ['enemy', 'fourth'],
    ]);
    expect(fourPlayerSideLabel(TEAM_SETUP, 'third')).toBe('Aチーム(1P・3P)');
    expect(fourPlayerSideLabel(DEFAULT_FOUR_PLAYER_SETUP, 'third')).toBe('3P');
  });

  it('参加しない軍勢はチームに入っていても数えない', () => {
    const setup = withSlot(TEAM_SETUP, 'fourth', { control: 'none' });
    expect(teamAssignment(setup)).toEqual({ player: 'A', enemy: 'B', third: 'A' });
    expect(fourPlayerSides(setup)).toEqual([['player', 'third'], ['enemy']]);
  });

  it('全員が同じチームだと戦う相手がいないため始められない', () => {
    let setup = DEFAULT_FOUR_PLAYER_SETUP;
    for (const army of ['player', 'enemy', 'third', 'fourth'] as const) {
      setup = withSlot(setup, army, { team: 'A' });
    }
    expect(canStartFourPlayer(setup)).toBe(false);
    // 1 軍だけチームから外せば 3 対 1 で始められる
    expect(canStartFourPlayer(withSlot(setup, 'fourth', { team: null }))).toBe(true);
    // 参加しない軍勢を除いた全員が同じチームでも始められない
    const pair = withSlot(
      withSlot(withSlot(setup, 'third', { control: 'none' }), 'fourth', {
        control: 'none',
      }),
      'enemy',
      { team: 'A' },
    );
    expect(canStartFourPlayer(pair)).toBe(false);
  });

  it('チームは省略しても(チーム分け追加前の保存データ)妥当な設定として読める', () => {
    expect(isFourPlayerSetup(DEFAULT_FOUR_PLAYER_SETUP)).toBe(true);
    expect(isFourPlayerSetup(TEAM_SETUP)).toBe(true);
    expect(isFourPlayerSetup(withSlot(TEAM_SETUP, 'enemy', { team: null }))).toBe(true);
    expect(
      isFourPlayerSetup({
        ...TEAM_SETUP,
        enemy: { control: 'cpu', characterId: 'instructor', team: 'Z' },
      }),
    ).toBe(false);
  });

  it('1 行の要約にチーム名を添える', () => {
    expect(fourPlayerSummary(TEAM_SETUP)).toBe(
      '1P プレイヤー[A] / 2P CPU[B] / 3P CPU[A] / 4P CPU[B]',
    );
    expect(fourPlayerSummary(DEFAULT_FOUR_PLAYER_SETUP)).toBe(
      '1P プレイヤー / 2P CPU / 3P CPU / 4P CPU',
    );
  });
});

describe('Alliance(同盟の判定)', () => {
  it('登録したチーム分けで味方どうしかを判定する', () => {
    setAlliances(teamAssignment(TEAM_SETUP));
    expect(areAllied('player', 'third')).toBe(true);
    expect(areAllied('enemy', 'fourth')).toBe(true);
    expect(areAllied('player', 'enemy')).toBe(false);
    expect(areAllied('player', 'player')).toBe(true);
    expect(isAllyOf('player', 'player')).toBe(false);
    expect(isAllyOf('player', 'third')).toBe(true);
    // 中立はどの軍勢の味方でもない
    expect(areAllied('neutral', 'player')).toBe(false);
    expect(teamOf('neutral')).toBeNull();
  });

  it('解除すると同盟はなくなる', () => {
    setAlliances({ player: 'A', third: 'A' });
    clearAlliances();
    expect(areAllied('player', 'third')).toBe(false);
  });
});

describe('同盟軍どうしの戦闘・移動・占領', () => {
  it('同盟軍のユニットは攻撃対象にならず、攻撃しようとすると例外になる', () => {
    setAlliances({ player: 'A', third: 'A' });
    const map = MapManager.fromDefinition(PLAIN_DEF);
    const units = UnitManager.fromPlacements([
      { col: 4, row: 4, unitType: 'mediumTank', army: 'player' },
      { col: 4, row: 5, unitType: 'infantry', army: 'third' },
      { col: 5, row: 4, unitType: 'infantry', army: 'enemy' },
    ]);
    const tank = units.getUnitAt(gridPosition(4, 4))!;
    const ally = units.getUnitAt(gridPosition(4, 5))!;
    const enemy = units.getUnitAt(gridPosition(5, 4))!;

    expect(canAttackUnit(tank, ally)).toBe(false);
    expect(canAttackUnit(tank, enemy)).toBe(true);
    expect(findAttackableTargets(tank, units)).toEqual([enemy]);
    expect(() => new BattleManager(map, units).attack(tank, ally)).toThrow();
  });

  it('同盟軍のユニットのマスは通過できるが、停止はできない', () => {
    setAlliances({ player: 'A', third: 'A' });
    const map = MapManager.fromDefinition(PLAIN_DEF);
    // 横一列の通路の途中に同盟軍、もう一方の通路に敵軍を置く
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'third' },
      { col: 0, row: 1, unitType: 'infantry', army: 'enemy' },
    ]);
    const walker = units.getUnitAt(gridPosition(0, 0))!;
    const range = calculateMovementRange(walker, map, units);

    expect(range.canReach(gridPosition(1, 0))).toBe(false);
    // 同盟軍を通り抜けた先へは届く
    expect(range.getCost(gridPosition(2, 0))).toBe(2);
    expect(range.getCost(gridPosition(3, 0))).toBe(3);
    // 敵軍のマスは通過できないため、その先へは回り道になる
    expect(range.canReach(gridPosition(0, 1))).toBe(false);
    expect(range.canReach(gridPosition(0, 2))).toBe(false);
  });

  it('同盟軍の拠点は占領できない', () => {
    setAlliances({ player: 'A', third: 'A' });
    const map = MapManager.fromDefinition({
      name: 'capture',
      terrain: ['cc.', '...'],
      owners: [
        { col: 0, row: 0, owner: 'third' },
        { col: 1, row: 0, owner: 'enemy' },
      ],
    });
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 1, row: 0, unitType: 'infantry', army: 'player' },
    ]);
    const capture = new CaptureSystem();
    const onAlly = units.getUnitAt(gridPosition(0, 0))!;
    const onEnemy = units.getUnitAt(gridPosition(1, 0))!;
    expect(capture.canCapture(onAlly, map.getTile(gridPosition(0, 0))!)).toBe(false);
    expect(capture.canCapture(onEnemy, map.getTile(gridPosition(1, 0))!)).toBe(true);
  });
});

describe('同盟軍どうしの夜戦の視界', () => {
  it('同盟軍のユニットの視界・拠点のマスも明るくなり、同盟軍のユニットは常に見える', () => {
    const map = MapManager.fromDefinition({
      ...PLAIN_DEF,
      terrain: PLAIN_DEF.terrain.map((line, row) => (row === 8 ? '........c' : line)),
      owners: [{ col: 8, row: 8, owner: 'third' }],
    });
    const units = UnitManager.fromPlacements([
      { col: 0, row: 0, unitType: 'infantry', army: 'player' },
      { col: 8, row: 0, unitType: 'infantry', army: 'third' },
      // 同盟軍の歩兵(視界 2)が見つけられる敵
      { col: 8, row: 2, unitType: 'infantry', army: 'enemy' },
      // どちらからも見えない敵
      { col: 4, row: 8, unitType: 'infantry', army: 'enemy' },
    ]);

    // チーム分けなしでは、3P の視界は 1P に届かない
    const alone = computeVisibility(map, units, 'player', true);
    expect(alone.isLit(gridPosition(8, 1))).toBe(false);
    expect(alone.isUnitVisible(units.getUnitAt(gridPosition(8, 2))!)).toBe(false);
    expect(alone.isUnitVisible(units.getUnitAt(gridPosition(8, 0))!)).toBe(false);

    setAlliances({ player: 'A', third: 'A' });
    const shared = computeVisibility(map, units, 'player', true);
    expect(shared.isLit(gridPosition(8, 1))).toBe(true);
    // 同盟軍の拠点のマスも明るい
    expect(shared.isLit(gridPosition(8, 8))).toBe(true);
    expect(shared.isUnitVisible(units.getUnitAt(gridPosition(8, 0))!)).toBe(true);
    expect(shared.isUnitVisible(units.getUnitAt(gridPosition(8, 2))!)).toBe(true);
    expect(shared.isUnitVisible(units.getUnitAt(gridPosition(4, 8))!)).toBe(false);

    // 敵のチーム(B)から見た視界に、A チームの視界は混ざらない
    const enemySight = computeVisibility(map, units, 'enemy', true);
    expect(enemySight.isUnitVisible(units.getUnitAt(gridPosition(0, 0))!)).toBe(false);
  });
});

describe('同盟軍と敵軍AI', () => {
  it('敵軍AIは同盟軍のユニットを攻撃せず、敵のユニットを狙う', () => {
    setAlliances({ enemy: 'B', fourth: 'B' });
    const map = MapManager.fromDefinition(PLAIN_DEF);
    const units = UnitManager.fromPlacements([
      { col: 4, row: 4, unitType: 'mediumTank', army: 'enemy' },
      // 隣に同盟軍の歩兵(敵なら動かずに殴れる格好の的)
      { col: 4, row: 5, unitType: 'infantry', army: 'fourth' },
      // 少し離れて本当の敵
      { col: 6, row: 4, unitType: 'infantry', army: 'player' },
    ]);
    const economy = new EconomyManager({ initialFunds: 0 });
    const ai = new EnemyAi(
      {
        map,
        units,
        battle: new BattleManager(map, units),
        capture: new CaptureSystem(),
        production: new ProductionManager(map, units, economy),
      },
      'enemy',
    );
    const actions = ai.run();

    const attacks = actions.filter((action) => action.kind === 'attack');
    expect(attacks).toHaveLength(1);
    expect(attacks[0].kind === 'attack' && attacks[0].result.defender.armyType).toBe(
      'player',
    );
    const ally = units.getUnitAt(gridPosition(4, 5))!;
    expect(ally.currentHp).toBe(ally.maxHp);
  });

  it('敵軍AIは同盟軍の拠点を占領しに行かない', () => {
    setAlliances({ enemy: 'B', fourth: 'B' });
    const map = MapManager.fromDefinition({
      name: 'ai-capture',
      terrain: ['c.c'],
      owners: [{ col: 0, row: 0, owner: 'fourth' }],
    });
    const units = UnitManager.fromPlacements([
      { col: 1, row: 0, unitType: 'infantry', army: 'enemy' },
    ]);
    const economy = new EconomyManager({ initialFunds: 0 });
    const ai = new EnemyAi(
      {
        map,
        units,
        battle: new BattleManager(map, units),
        capture: new CaptureSystem(),
        production: new ProductionManager(map, units, economy),
      },
      'enemy',
    );
    const actions = ai.run();
    const captures = actions.filter((action) => action.kind === 'capture');
    expect(captures).toHaveLength(1);
    expect(captures[0].kind === 'capture' && captures[0].result.tile.position).toEqual(
      gridPosition(2, 0),
    );
  });
});

describe('チーム分けでの決着', () => {
  const allied = (a: string, b: string): boolean =>
    a === b ||
    (['player', 'third'].includes(a) && ['player', 'third'].includes(b)) ||
    (['enemy', 'fourth'].includes(a) && ['enemy', 'fourth'].includes(b));

  it('残った軍勢がすべて同じチームならそのチームの勝利', () => {
    expect(judgeFourPlayer(['player', 'third'], ['player'], allied)).toEqual({
      kind: 'winner',
      army: 'player',
      armies: ['player', 'third'],
    });
    expect(judgeFourPlayer(['enemy', 'fourth'], ['player'], allied).kind).toBe('winner');
  });

  it('プレイヤーが脱落しても同盟軍が残っていれば続く', () => {
    expect(judgeFourPlayer(['enemy', 'third'], ['player'], allied)).toEqual({
      kind: 'ongoing',
    });
    // 同盟軍も脱落して敵のチームだけが残れば、敵のチームの勝利として決着する
    expect(judgeFourPlayer(['enemy', 'fourth'], ['player'], allied).kind).toBe('winner');
  });

  it('既定では登録したチーム分けで判定する', () => {
    setAlliances(teamAssignment(TEAM_SETUP));
    expect(judgeFourPlayer(['player', 'third'], ['player']).kind).toBe('winner');
    clearAlliances();
    expect(judgeFourPlayer(['player', 'third'], ['player']).kind).toBe('ongoing');
  });

  it('チームの勝利は、脱落した同じチームの軍勢も含めて勝利とする', () => {
    const teams = teamAssignment(TEAM_SETUP);
    const won = formatFourPlayerResult(
      { kind: 'winner', army: 'third', armies: ['third'] },
      ['player'],
      {},
      teams,
    );
    expect(won.title).toBe('Aチーム の勝利！');
    expect(won.detail).toBe('1P・3Pの同盟でほかの軍勢をすべて脱落させた');
    expect(won.isVictory).toBe(true);

    const lost = formatFourPlayerResult(
      { kind: 'winner', army: 'enemy', armies: ['enemy', 'fourth'] },
      ['player'],
      {},
      teams,
    );
    expect(lost.title).toBe('Bチーム の勝利！');
    expect(lost.isVictory).toBe(false);

    expect(
      formatFourPlayerResult({ kind: 'humans_defeated' }, ['player'], {}, teams),
    ).toEqual({ title: '敗北…', detail: 'Aチームがすべて脱落した', isVictory: false });
  });
});
