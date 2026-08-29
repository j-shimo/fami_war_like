// 敵軍AIの行動 1 件を「どこまで・どこを見せるか」に落とし込む純粋モジュール。
// moveSequence / attackSequence と同じ考え方で Phaser には依存させず、
// 演出の段取り(カメラを寄せる位置・経路のどこで姿を見せるか・各段の待ち時間)だけを
// データとして扱えるようにしてある。実際の描画は MainScene と BattleEffects が担う。
//
// 夜戦では「自軍から見えていない(暗い)範囲での敵の行動は写さない」。
// 経路の途中で明るいマスへ出てくる移動は、明るいマスに入ってから姿を見せる。

import type { AiAction } from '@/core/ai/EnemyAi';
import type { GridPosition } from '@/core/map/GridPosition';
import type { Unit } from '@/core/units/Unit';

/** 敵ユニットを選択したことを見せる(選択枠を出してから動き出すまでの)時間(ミリ秒) */
export const ENEMY_SELECT_HOLD_MS = 260;

/** カメラを行動するマスへ寄せるのにかける時間(ミリ秒) */
export const ENEMY_CAMERA_PAN_MS = 300;

/** 占領・生産の結果を見せてから次の行動へ移るまでの時間(ミリ秒) */
export const ENEMY_RESULT_HOLD_MS = 460;

/** 1 行動を見せ終えてから次の行動へ移るまでの間(ミリ秒) */
export const ENEMY_ACTION_GAP_MS = 200;

/** 敵軍ターン開始のバナーを見せ終えるまでの時間(ミリ秒) */
export const ENEMY_TURN_BANNER_MS = 1200;

/** 自軍から見た明るさの判定(夜戦の暗いマスを除くために使う) */
export interface EnemySight {
  /** そのマスが自軍から見えている(明るい)か。昼戦では常に true */
  readonly isLit: (pos: GridPosition) => boolean;
}

/** 敵の行動 1 件を自軍から見てどう見せるか */
export interface EnemyActionView {
  /** 演出を見せるか。false なら盤面へ反映するだけで何も見せない */
  readonly shown: boolean;
  /** カメラを寄せるマス(見せない場合は null) */
  readonly focus: GridPosition | null;
  /**
   * 移動経路。先頭は移動前の位置で、動かない行動では 1 マスだけ、
   * 移動を伴わない行動(生産・待機)では空になる。
   */
  readonly path: readonly GridPosition[];
  /** path と同じ長さで、各マスで敵ユニットの姿を見せるか(暗いマスでは隠す) */
  readonly pathVisibility: readonly boolean[];
}

/** 見せない行動を表す共通の戻り値 */
const HIDDEN: EnemyActionView = {
  shown: false,
  focus: null,
  path: [],
  pathVisibility: [],
};

/**
 * 行動したユニットを返す(生産・待機のように演出でユニットを動かさない行動では null)。
 * 攻撃は攻撃側、占領は占領したユニットを返す。
 * 搭乗は乗り込む側(歩兵)、降車は降ろした輸送ユニットが画面を動く。
 */
export function enemyActionUnit(action: AiAction): Unit | null {
  switch (action.kind) {
    case 'attack':
      return action.result.attacker;
    case 'capture':
      return action.result.unit;
    case 'move':
    case 'halt':
    case 'board':
    case 'unload':
      return action.unit;
    default:
      return null;
  }
}

/** 行動に紐づく移動経路を返す(移動を伴わない行動では空) */
export function enemyActionPath(action: AiAction): readonly GridPosition[] {
  switch (action.kind) {
    case 'attack':
    case 'capture':
    case 'move':
    case 'halt':
    case 'board':
    case 'unload':
      return action.path;
    default:
      return [];
  }
}

/**
 * 敵の行動 1 件から演出の段取りを組み立てる。
 *
 * @param action 実行済みの行動ログ
 * @param sight 行動を始める前の時点での、自軍から見た明るさ
 */
export function buildEnemyActionView(
  action: AiAction,
  sight: EnemySight,
): EnemyActionView {
  // 待機は盤面が何も変わらないため、カメラを動かしてまで見せない
  if (action.kind === 'wait') {
    return HIDDEN;
  }

  // 生産は拠点のマスが明るいときだけ見せる(暗い後方での生産は分からない)
  if (action.kind === 'produce') {
    const pos = action.result.unit.position;
    return sight.isLit(pos)
      ? { shown: true, focus: pos, path: [], pathVisibility: [] }
      : HIDDEN;
  }

  const path = action.path;
  const pathVisibility = path.map((pos) => sight.isLit(pos));
  // 行動そのもの(攻撃・占領)が起きるマス。経路が暗くてもここが明るければ見せる
  const climax = enemyActionClimax(action);
  const climaxLit = climax !== null && sight.isLit(climax);

  const firstLit = pathVisibility.findIndex((lit) => lit);
  if (firstLit < 0 && !climaxLit) {
    return HIDDEN;
  }

  // 経路が明るくなる最初のマス(そこから姿が見える)へ寄る。
  // 経路がすべて暗い場合は、行動そのものが起きるマスへ寄る。
  const focus = firstLit >= 0 ? path[firstLit] : climax;
  return { shown: true, focus, path, pathVisibility };
}

/**
 * 行動の山場(攻撃なら防御側のマス、占領なら占領するマス)を返す。
 * 搭乗は乗り込んだ輸送ユニットのマス、降車は降ろした先のマスが山場になる。
 * 移動だけの行動には山場が無いため null を返す。
 */
function enemyActionClimax(action: AiAction): GridPosition | null {
  switch (action.kind) {
    case 'attack':
      return action.result.defender.position;
    case 'capture':
      return action.result.tile.position;
    case 'board':
      return action.to;
    case 'unload':
      return action.droppedAt;
    default:
      return null;
  }
}
