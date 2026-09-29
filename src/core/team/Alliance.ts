// 4P マップのチーム分け(同盟)を扱う。Phaser には依存しない純粋なロジック。
// docs/GameDesign.md「4Pモード」の「チーム分け」を参照。
//
// 同じチームに入った軍勢どうしは同盟になり、次のように振る舞う。
//   - 互いのユニットを攻撃できない(反撃も起きない)
//   - 互いのユニットのいるマスを通過できる(停止はできない。自軍のユニットと同じ扱い)
//   - 互いの拠点を占領できない
//   - 夜戦の視界を共有する(同盟軍のユニットの視界・拠点のマスも明るくなる)
// チームに入っていない軍勢(チームなし)は、ほかのすべての軍勢と敵対する。
//
// 同盟の判定は戦闘・移動・占領・視界・敵軍AI の各所から呼ばれるため、引数で持ち回らず
// 「いま遊んでいるゲームのチーム分け」をこのモジュールに 1 つだけ登録しておく。
// インゲーム(MainScene)がゲーム開始時に必ず登録し直す(2 人で遊ぶマップではチーム分けなし)。

import type { ArmyType, PlayableArmy } from '@/core/map/TerrainType';

/** チームの識別子 */
export type TeamId = 'A' | 'B';

/** 選べるチームの一覧(4P 設定画面のボタンの並び順) */
export const TEAM_IDS: readonly TeamId[] = ['A', 'B'];

/** チームとして妥当な値か */
export function isTeamId(value: unknown): value is TeamId {
  return value === 'A' || value === 'B';
}

/** チームの表示名(「Aチーム」など) */
export function teamLabel(team: TeamId): string {
  return `${team}チーム`;
}

/** 軍勢ごとの所属チーム(チームに入っていない軍勢は含めない) */
export type TeamAssignment = Readonly<Partial<Record<PlayableArmy, TeamId>>>;

/** いま遊んでいるゲームのチーム分け(既定はチーム分けなし) */
let currentTeams: TeamAssignment = {};

/**
 * いま遊んでいるゲームのチーム分けを登録する。
 * ゲームを始めるたびに呼び、前のゲームのチーム分けが残らないようにすること。
 */
export function setAlliances(teams: TeamAssignment): void {
  currentTeams = { ...teams };
}

/** チーム分けを解除する(2 人で遊ぶマップ・テストの後片付けに使う) */
export function clearAlliances(): void {
  currentTeams = {};
}

/** 登録中のチーム分けを返す */
export function currentAlliances(): TeamAssignment {
  return currentTeams;
}

/** 軍勢の所属チーム(チームなし・中立なら null) */
export function teamOf(army: ArmyType): TeamId | null {
  return army === 'neutral' ? null : (currentTeams[army] ?? null);
}

/**
 * 2 つの軍勢が味方どうしか(同じ軍勢、または同じチームの同盟軍)。
 * 中立はどの軍勢とも味方にならない(中立どうしは同じ所有者として true を返す)。
 */
export function areAllied(a: ArmyType, b: ArmyType): boolean {
  if (a === b) {
    return true;
  }
  const team = teamOf(a);
  return team !== null && team === teamOf(b);
}

/** 2 つの軍勢が同盟軍どうしか(同じ軍勢は含まない) */
export function isAllyOf(a: ArmyType, b: ArmyType): boolean {
  return a !== b && areAllied(a, b);
}
