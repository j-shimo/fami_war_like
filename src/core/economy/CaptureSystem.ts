// 歩兵系ユニットによる拠点占領を処理する。Phaser には依存しない純粋なロジック。
// 占領コマンドで拠点の占領耐久値を減らし、0 になった時点で所有者を変更する。
// docs/DevelopmentPlan.md Phase 7、docs/GameDesign.md「占領」、docs/TerrainSpec.md「占領耐久値」を参照。

import { equals } from '@/core/map/GridPosition';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import type { Unit } from '@/core/units/Unit';
import { getTerrainData } from '@/data/terrainData';

/** 占領コマンド 1 回ぶんの結果 */
export interface CaptureResult {
  /** 占領対象のマス */
  readonly tile: TileData;
  /** 占領を行ったユニット */
  readonly unit: Unit;
  /** このコマンドで減らした占領耐久値 */
  readonly reduced: number;
  /** コマンド後の残り占領耐久値。占領完了時は 0 を返す */
  readonly remainingHp: number;
  /** 占領が完了し、所有者が変わったか */
  readonly captured: boolean;
}

/** 拠点占領の実行を担うシステム */
export class CaptureSystem {
  /**
   * unit が tile を占領できるか判定する。
   * 占領できるのは、占領能力を持つ生存ユニットが、
   * 自軍所有でない占領可能地形の上に立っている場合に限る。
   */
  canCapture(unit: Unit, tile: TileData): boolean {
    if (!unit.isAlive || !unit.canCapture) {
      return false;
    }
    if (!getTerrainData(tile.terrainType).canCapture) {
      return false;
    }
    // すでに自軍が所有している拠点は占領対象にならない
    if (tile.owner === unit.armyType) {
      return false;
    }
    // ユニットが占領対象マスに立っていること
    return equals(unit.position, tile.position);
  }

  /**
   * unit で tile を占領する。
   * 占領耐久値を歩兵の現在 HP ぶんだけ減らし、
   * 0 以下になったら所有者を占領した軍へ変更して耐久値を初期値に戻す。
   * 占領を実行したユニットは行動済みになる。
   * 占領できない状況で呼ばれた場合はデータ不整合として例外を投げる。
   */
  capture(unit: Unit, tile: TileData): CaptureResult {
    if (!this.canCapture(unit, tile)) {
      throw new Error(
        `このマスは占領できません(col ${tile.position.col}, row ${tile.position.row})`,
      );
    }

    const reduced = Math.min(tile.captureHp, unit.currentHp);
    const remaining = tile.captureHp - reduced;
    const captured = remaining <= 0;

    if (captured) {
      tile.owner = unit.armyType;
      tile.captureHp = INITIAL_CAPTURE_HP;
    } else {
      tile.captureHp = remaining;
    }

    unit.hasActed = true;

    return {
      tile,
      unit,
      reduced,
      remainingHp: captured ? 0 : tile.captureHp,
      captured,
    };
  }
}
