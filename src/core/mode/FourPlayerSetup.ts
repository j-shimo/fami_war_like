// 4P マップの遊び方(1P〜4P の各軍勢を誰が操作するか・どの指揮官が率いるか・どのチームか)の型と判定。
// Phaser には依存しない純粋なロジックとして持ち、4P 設定画面・マップ選択・インゲーム・中断データで共有する。
// docs/GameDesign.md「4Pモード」を参照。

import { PLAYABLE_ARMIES } from '@/core/map/TerrainType';
import {
  isTeamId,
  teamLabel,
  type TeamAssignment,
  type TeamId,
} from '@/core/team/Alliance';
import type { TurnArmy } from '@/core/turn/TurnManager';

/**
 * 1 つの軍勢(スロット)の操作。
 * - human: プレイヤーが操作する(1 台の画面を交代で使う)
 * - cpu: コンピューター(敵軍AI)が操作する
 * - none: 参加しない。その軍勢の陣地は中立の拠点になり、手番も回ってこない
 */
export type SlotControl = 'human' | 'cpu' | 'none';

/** 選べる操作の一覧(4P 設定画面のボタンの並び順) */
export const SLOT_CONTROLS: readonly SlotControl[] = ['human', 'cpu', 'none'];

/** 軍勢 1 つぶんの設定 */
export interface ArmySlot {
  /** 誰が操作するか */
  readonly control: SlotControl;
  /**
   * 率いる指揮官の識別子(AiCharacter.id)。
   * プレイヤー操作なら攻撃補正だけが、コンピューター操作なら思考パターンと攻撃補正が効く。
   */
  readonly characterId: string;
  /**
   * 所属するチーム(省略・null ならチームなし)。
   * 同じチームの軍勢どうしは同盟になり、互いに攻撃できず、夜戦の視界を共有する。
   * チーム分けを追加する前に保存した設定・中断データには無いため、省略を許す。
   */
  readonly team?: TeamId | null;
}

/** 4P マップの遊び方(1P〜4P の各軍勢の設定) */
export type FourPlayerSetup = Readonly<Record<TurnArmy, ArmySlot>>;

/** 4P マップの軍勢の並び(1P → 2P → 3P → 4P。手番もこの順に回る) */
export const FOUR_PLAYER_ARMIES: readonly TurnArmy[] = PLAYABLE_ARMIES;

/** 対戦を始めるのに必要な、参加する軍勢の最小数 */
export const MIN_PARTICIPANTS = 2;

/** 選べるチームの一覧(4P 設定画面のボタンの並び順。null はチームなし) */
export const TEAM_CHOICES: readonly (TeamId | null)[] = [null, 'A', 'B'];

/** 既定の指揮官(aiCharacters の先頭と同じ識別子) */
const DEFAULT_CHARACTER_ID = 'instructor';

/** 何も選んでいないときの既定の設定(1P だけプレイヤー、2P〜4P はコンピューター) */
export const DEFAULT_FOUR_PLAYER_SETUP: FourPlayerSetup = {
  player: { control: 'human', characterId: DEFAULT_CHARACTER_ID },
  enemy: { control: 'cpu', characterId: DEFAULT_CHARACTER_ID },
  third: { control: 'cpu', characterId: DEFAULT_CHARACTER_ID },
  fourth: { control: 'cpu', characterId: DEFAULT_CHARACTER_ID },
};

/** 軍勢の呼び名(1P〜4P) */
const PLAYER_NUMBER_LABEL: Readonly<Record<TurnArmy, string>> = {
  player: '1P',
  enemy: '2P',
  third: '3P',
  fourth: '4P',
};

/** 操作の表示名 */
const CONTROL_LABEL: Readonly<Record<SlotControl, string>> = {
  human: 'プレイヤー',
  cpu: 'コンピューター',
  none: 'なし',
};

/** 軍勢の呼び名(1P / 2P / 3P / 4P)を返す */
export function playerNumberLabel(army: TurnArmy): string {
  return PLAYER_NUMBER_LABEL[army];
}

/** 操作の表示名を返す */
export function slotControlLabel(control: SlotControl): string {
  return CONTROL_LABEL[control];
}

/** 操作として妥当な値か */
export function isSlotControl(value: unknown): value is SlotControl {
  return value === 'human' || value === 'cpu' || value === 'none';
}

/** 値がオブジェクト(配列・null を除く)かどうか */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 軍勢 1 つぶんの設定として妥当か(チームは省略・null も認める) */
function isArmySlot(value: unknown): value is ArmySlot {
  return (
    isRecord(value) &&
    isSlotControl(value.control) &&
    typeof value.characterId === 'string' &&
    (value.team === undefined || value.team === null || isTeamId(value.team))
  );
}

/** 4P マップの設定として妥当か(保存データ・中断データの検証に使う) */
export function isFourPlayerSetup(value: unknown): value is FourPlayerSetup {
  return isRecord(value) && FOUR_PLAYER_ARMIES.every((army) => isArmySlot(value[army]));
}

/** 参加する(操作が「なし」でない)軍勢を 1P → 4P の順に返す。手番の巡回順にもなる */
export function participatingArmies(setup: FourPlayerSetup): readonly TurnArmy[] {
  return FOUR_PLAYER_ARMIES.filter((army) => setup[army].control !== 'none');
}

/** 参加しない(操作が「なし」の)軍勢を返す */
export function absentArmies(setup: FourPlayerSetup): readonly TurnArmy[] {
  return FOUR_PLAYER_ARMIES.filter((army) => setup[army].control === 'none');
}

/** プレイヤーが操作する軍勢を 1P → 4P の順に返す */
export function humanArmies(setup: FourPlayerSetup): readonly TurnArmy[] {
  return FOUR_PLAYER_ARMIES.filter((army) => setup[army].control === 'human');
}

/** 指定した軍勢をコンピューターが操作するか */
export function isCpuArmy(setup: FourPlayerSetup, army: TurnArmy): boolean {
  return setup[army].control === 'cpu';
}

/** 軍勢の所属チーム(チームなしなら null) */
export function slotTeam(setup: FourPlayerSetup, army: TurnArmy): TeamId | null {
  return setup[army].team ?? null;
}

/** チームの表示名(チームなしは「なし」) */
export function teamChoiceLabel(team: TeamId | null): string {
  return team === null ? 'なし' : team;
}

/**
 * 参加する軍勢のチーム分けを返す(Alliance の setAlliances に渡す形)。
 * 参加しない軍勢・チームなしの軍勢は含めない。
 */
export function teamAssignment(setup: FourPlayerSetup): TeamAssignment {
  const teams: Partial<Record<TurnArmy, TeamId>> = {};
  for (const army of participatingArmies(setup)) {
    const team = slotTeam(setup, army);
    if (team !== null) {
      teams[army] = team;
    }
  }
  return teams;
}

/**
 * 参加する軍勢を、互いに戦う陣営ごとにまとめる(1P → 4P の順)。
 * 同じチームの軍勢は 1 つの陣営に、チームなしの軍勢はそれぞれ 1 軍で 1 つの陣営になる。
 */
export function fourPlayerSides(
  setup: FourPlayerSetup,
): readonly (readonly TurnArmy[])[] {
  const sides: TurnArmy[][] = [];
  const byTeam = new Map<TeamId, TurnArmy[]>();
  for (const army of participatingArmies(setup)) {
    const team = slotTeam(setup, army);
    if (team === null) {
      sides.push([army]);
      continue;
    }
    const side = byTeam.get(team);
    if (side) {
      side.push(army);
    } else {
      const created = [army];
      byTeam.set(team, created);
      sides.push(created);
    }
  }
  return sides;
}

/** チーム分けをしているか(参加する軍勢のうち、どこかのチームに入っている軍勢がいるか) */
export function hasTeams(setup: FourPlayerSetup): boolean {
  return participatingArmies(setup).some((army) => slotTeam(setup, army) !== null);
}

/**
 * 対戦を始められる設定か。
 * 参加する軍勢が 2 つ以上あり、かつ全員が同じチームではない(戦う相手がいる)こと。
 */
export function canStartFourPlayer(setup: FourPlayerSetup): boolean {
  return (
    participatingArmies(setup).length >= MIN_PARTICIPANTS &&
    fourPlayerSides(setup).length >= MIN_PARTICIPANTS
  );
}

/**
 * 陣営の呼び名。チームに入っていればチーム名と顔ぶれ(「Aチーム(1P・3P)」)、
 * チームなしの 1 軍なら軍勢の番号(「2P」)を返す。
 */
export function fourPlayerSideLabel(setup: FourPlayerSetup, army: TurnArmy): string {
  const team = slotTeam(setup, army);
  if (team === null) {
    return playerNumberLabel(army);
  }
  const members = participatingArmies(setup).filter((other) =>
    areAlliedIn(setup, army, other),
  );
  return `${teamLabel(team)}(${members.map(playerNumberLabel).join('・')})`;
}

/** 設定の上で 2 つの軍勢が同じ陣営か(同じ軍勢、または同じチーム) */
export function areAlliedIn(setup: FourPlayerSetup, a: TurnArmy, b: TurnArmy): boolean {
  if (a === b) {
    return true;
  }
  const team = slotTeam(setup, a);
  return team !== null && team === slotTeam(setup, b);
}

/** 操作の短い表示名(1 行の要約に使う) */
const CONTROL_SHORT_LABEL: Readonly<Record<SlotControl, string>> = {
  human: 'プレイヤー',
  cpu: 'CPU',
  none: 'なし',
};

/**
 * 4P マップの遊び方を 1 行にまとめた表示("1P プレイヤー / 2P CPU / 3P CPU / 4P なし")。
 * チーム分けをしていれば、参加する軍勢にチーム名を添える("1P プレイヤー[A] / 2P CPU[B] …")。
 */
export function fourPlayerSummary(setup: FourPlayerSetup): string {
  const teams = hasTeams(setup);
  return FOUR_PLAYER_ARMIES.map((army) => {
    const base = `${playerNumberLabel(army)} ${CONTROL_SHORT_LABEL[setup[army].control]}`;
    const team = slotTeam(setup, army);
    if (!teams || setup[army].control === 'none' || team === null) {
      return base;
    }
    return `${base}[${team}]`;
  }).join(' / ');
}

/** 指定した軍勢の設定だけを差し替えた新しい設定を返す */
export function withSlot(
  setup: FourPlayerSetup,
  army: TurnArmy,
  slot: Partial<ArmySlot>,
): FourPlayerSetup {
  return { ...setup, [army]: { ...setup[army], ...slot } };
}
