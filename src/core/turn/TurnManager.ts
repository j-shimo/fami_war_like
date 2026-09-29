// 自軍ターンと敵軍ターンの切り替えを管理する。Phaser には依存しない純粋なロジック。
// 現在の手番の軍勢・ターン数を保持し、ターン開始時に手番軍の行動済み状態をリセットする。
// docs/DevelopmentPlan.md Phase 6、docs/GameDesign.md「ターンの流れ」を参照。

import type { PlayableArmy } from '@/core/map/TerrainType';
import type { UnitManager } from '@/core/units/UnitManager';

/**
 * 手番を持つ軍勢。中立は手番を持たない。
 * 2 人で遊ぶマップでは自軍・敵軍のみが交互に行動し、4P マップでは 3P・4P も加わる。
 */
export type TurnArmy = PlayableArmy;

/** ターンの現在状態のスナップショット */
export interface TurnState {
  /** 1 から始まるターン数(自軍→敵軍で 1 巡し、自軍に戻るときに +1) */
  readonly turnNumber: number;
  /** 現在手番の軍勢 */
  readonly currentArmy: TurnArmy;
}

/**
 * ターンの進行を管理するマネージャ。
 * 手番は先手 → 後手 → 先手 … の順で循環し、
 * 手番が一巡して先手に戻るタイミングでターン数を 1 増やす。
 * 先手は既定では自軍(player)で、2P側を選んだときだけ敵軍(enemy)になる。
 * 4P マップでは参加する軍勢を 1P → 2P → 3P → 4P の順に並べた巡回順を渡し、
 * 脱落した軍勢(eliminate)は手番を飛ばす。
 */
export class TurnManager {
  /** 手番の巡回順(先頭が先手) */
  private readonly order: readonly TurnArmy[];
  /** 脱落して手番を持たなくなった軍勢 */
  private readonly eliminated = new Set<TurnArmy>();
  /** order 上の現在位置 */
  private index = 0;
  /** 現在のターン数(1 始まり) */
  private turn = 1;

  /**
   * @param units ターン開始時に行動済み状態をリセットする対象のユニット群
   * @param restore 中断データからの復元時に、保存されていたターン状態を渡す。
   *   復元時は手番開始処理(行動済みのリセット)を行わず、保存時点の行動済み状態を保つ。
   * @param first 先手の軍勢(省略時は自軍)。2P側を選んだときは敵軍を先手にして
   *   プレイヤーを後手番にする。ターン数は先手へ手番が戻るときに 1 増える。
   *   軍勢の配列を渡すと、その順番をそのまま手番の巡回順にする(4P マップ用)。
   */
  constructor(
    private readonly units: UnitManager,
    restore?: TurnState,
    first: TurnArmy | readonly TurnArmy[] = 'player',
  ) {
    if (Array.isArray(first)) {
      if (first.length === 0) {
        throw new Error('手番の巡回順には 1 つ以上の軍勢が必要です');
      }
      this.order = [...first];
    } else {
      this.order = first === 'enemy' ? ['enemy', 'player'] : ['player', 'enemy'];
    }
    if (restore) {
      this.turn = restore.turnNumber;
      this.index = this.order.indexOf(restore.currentArmy);
      return;
    }
    // 開始時は先手の軍勢のターン。手番軍の行動済み状態を初期化する。
    this.startTurn();
  }

  /** 現在手番の軍勢 */
  get currentArmy(): TurnArmy {
    return this.order[this.index];
  }

  /** 現在のターン数 */
  get turnNumber(): number {
    return this.turn;
  }

  /** 現在のターン状態のスナップショットを返す */
  get state(): TurnState {
    return { turnNumber: this.turn, currentArmy: this.currentArmy };
  }

  /** 指定した軍勢が現在手番かどうか */
  isCurrentArmy(army: string): boolean {
    return army === this.currentArmy;
  }

  /** 手番の巡回順に並べた、まだ脱落していない軍勢 */
  get activeArmies(): readonly TurnArmy[] {
    return this.order.filter((army) => !this.eliminated.has(army));
  }

  /** 脱落した軍勢(巡回順) */
  get eliminatedArmies(): readonly TurnArmy[] {
    return this.order.filter((army) => this.eliminated.has(army));
  }

  /** 指定した軍勢が脱落済みか */
  isEliminated(army: TurnArmy): boolean {
    return this.eliminated.has(army);
  }

  /**
   * 軍勢を脱落させ、以降の手番から外す(4P マップで本拠地を奪われた・全滅したとき)。
   * 手番中の軍勢を脱落させた場合も、次の endTurn() で残りの軍勢へ手番が移る。
   */
  eliminate(army: TurnArmy): void {
    if (this.order.includes(army)) {
      this.eliminated.add(army);
    }
  }

  /**
   * 現在の手番を終了し、次の軍勢へ手番を移す。
   * 手番が一巡して先頭(先手の軍勢)に戻る場合はターン数を 1 増やす。
   * 脱落した軍勢は飛ばす(先手が脱落していても、巡回順の先頭を過ぎればターン数は増える)。
   * 手番を移したあと、新しい手番軍の行動済み状態をリセットする。
   */
  endTurn(): void {
    // 全軍が脱落している(決着済み)ときは手番を回さない
    if (this.activeArmies.length === 0) {
      return;
    }
    do {
      this.index += 1;
      if (this.index >= this.order.length) {
        this.index = 0;
        this.turn += 1;
      }
    } while (this.eliminated.has(this.currentArmy));
    this.startTurn();
  }

  /** 手番開始処理。手番軍の生存ユニットをすべて未行動に戻す */
  private startTurn(): void {
    for (const unit of this.units.getUnitsByArmy(this.currentArmy)) {
      unit.hasActed = false;
    }
  }
}
