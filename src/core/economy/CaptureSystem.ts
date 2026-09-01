// 歩兵系ユニットによる拠点占領を処理する。Phaser には依存しない純粋なロジック。
// 占領コマンドで拠点の占領耐久値を減らし、0 になった時点で所有者を変更する。
// 中立の研究所を占領し切ったときだけは、占領した歩兵が新型戦車へ進化する
// (docs/GameDesign.md「研究所」を参照)。
// docs/DevelopmentPlan.md Phase 7、docs/GameDesign.md「占領」、docs/TerrainSpec.md「占領耐久値」を参照。

import { equals } from '@/core/map/GridPosition';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import type { Unit } from '@/core/units/Unit';
import type { UnitType } from '@/core/units/UnitType';
import { getTerrainData } from '@/data/terrainData';
import { laboratoryEvolutionOf } from '@/data/unitData';

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
  /**
   * 別の軍が進めていた占領を引き継がず、耐久値を初期値へ戻してから
   * 計算したか(自軍と敵軍の占領値を分けるためのリセット)。
   */
  readonly reset: boolean;
  /**
   * 中立の研究所を占領し切って進化したときの、進化前のユニット種別(進化しなければ null)。
   * ログ表示で「歩兵が占領した」と伝えるために、進化で書き換わる前の種別を残しておく。
   */
  readonly evolvedFrom: UnitType | null;
  /** 進化したときの、進化後のユニット種別(進化しなければ null) */
  readonly evolvedTo: UnitType | null;
}

/**
 * 占領の完了により unit が進化する種別を返す(進化しないなら null)。
 * 進化するのは「中立の研究所」を占領し切ったときだけで、
 * いったん所有者が決まった研究所を奪い合っても進化は起きない
 * (研究所は占領後、都市と同等の拠点として振る舞う)。
 */
export function evolutionOnCapture(unit: Unit, tile: TileData): UnitType | null {
  if (tile.terrainType !== 'laboratory' || tile.owner !== 'neutral') {
    return null;
  }
  return laboratoryEvolutionOf(unit.unitType);
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
   * unit がこの拠点で占領を開始・継続するときの、計算の起点となる占領耐久値を返す。
   * 自軍と敵軍の占領値を分けるため、別の軍が占領を進めていた(あるいは進行がない)
   * 場合は初期値から始め、同じ軍が続けて占領する場合のみ現在値を引き継ぐ。
   */
  effectiveCaptureHp(unit: Unit, tile: TileData): number {
    return tile.captureArmy === unit.armyType ? tile.captureHp : INITIAL_CAPTURE_HP;
  }

  /**
   * unit で tile を占領する。
   * 中立の研究所を占領し切った場合は、その場で占領したユニットを進化させる
   * (歩兵 → 新型戦車。進化の有無は結果の evolvedTo で分かる)。
   * 占領耐久値を歩兵の現在 HP ぶんだけ減らし、
   * 0 以下になったら所有者を占領した軍へ変更して耐久値を初期値に戻す。
   * 占領は軍ごとに独立しており、別の軍が進めていた占領を引き継ぐことはない。
   * 直前まで別の軍が占領を進めていた場合は、耐久値を初期値へ戻してから計算する。
   * 占領を実行したユニットは行動済みになる。
   * 占領できない状況で呼ばれた場合はデータ不整合として例外を投げる。
   */
  capture(unit: Unit, tile: TileData): CaptureResult {
    if (!this.canCapture(unit, tile)) {
      throw new Error(
        `このマスは占領できません(col ${tile.position.col}, row ${tile.position.row})`,
      );
    }

    // 別の軍が占領を進めていたら、その進行は破棄して初期値から数え直す
    const reset = tile.captureArmy !== null && tile.captureArmy !== unit.armyType;
    const baseHp = this.effectiveCaptureHp(unit, tile);
    const reduced = Math.min(baseHp, unit.currentHp);
    const remaining = baseHp - reduced;
    const captured = remaining <= 0;
    // 進化の判定は所有者を書き換える前に行う(中立の研究所であることが条件のため)
    const evolvedTo = captured ? evolutionOnCapture(unit, tile) : null;
    const evolvedFrom = evolvedTo === null ? null : unit.unitType;

    if (captured) {
      tile.owner = unit.armyType;
      tile.captureHp = INITIAL_CAPTURE_HP;
      // 占領が完了したので進行状態はクリアする
      tile.captureArmy = null;
    } else {
      tile.captureHp = remaining;
      // この軍が占領を進めていることを記録する
      tile.captureArmy = unit.armyType;
    }

    unit.hasActed = true;

    // 中立の研究所を占領し切った歩兵は、その場で新型戦車へ進化する
    // (同じ 1 体として位置・HP・行動済み状態を引き継ぐ)
    if (evolvedTo !== null) {
      unit.evolveTo(evolvedTo);
    }

    return {
      tile,
      unit,
      reduced,
      remainingHp: captured ? 0 : tile.captureHp,
      captured,
      reset,
      evolvedFrom,
      evolvedTo,
    };
  }
}
