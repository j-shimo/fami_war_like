// 自軍ターンと敵軍ターンの切り替えを管理する。Phaser には依存しない純粋なロジック。
// 現在の手番の軍勢・ターン数を保持し、ターン開始時に手番軍の行動済み状態をリセットする。
// docs/DevelopmentPlan.md Phase 6、docs/GameDesign.md「ターンの流れ」を参照。

import type { UnitManager } from '@/core/units/UnitManager';

/** 手番を持つ軍勢。MVP では中立は手番を持たず、自軍・敵軍のみが交互に行動する */
export type TurnArmy = 'player' | 'enemy';

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
 */
export class TurnManager {
  /** 手番の巡回順。MVP は自軍・敵軍の 2 陣営のみ(先頭が先手) */
  private readonly order: readonly TurnArmy[];
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
   */
  constructor(
    private readonly units: UnitManager,
    restore?: TurnState,
    first: TurnArmy = 'player',
  ) {
    this.order = first === 'enemy' ? ['enemy', 'player'] : ['player', 'enemy'];
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

  /**
   * 現在の手番を終了し、次の軍勢へ手番を移す。
   * 手番が一巡して先頭(先手の軍勢)に戻る場合はターン数を 1 増やす。
   * 手番を移したあと、新しい手番軍の行動済み状態をリセットする。
   */
  endTurn(): void {
    this.index += 1;
    if (this.index >= this.order.length) {
      this.index = 0;
      this.turn += 1;
    }
    this.startTurn();
  }

  /** 手番開始処理。手番軍の生存ユニットをすべて未行動に戻す */
  private startTurn(): void {
    for (const unit of this.units.getUnitsByArmy(this.currentArmy)) {
      unit.hasActed = false;
    }
  }
}
