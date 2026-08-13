// ユニット説明ウィンドウで表示する「各ユニットの説明」と「対戦相性」のデータ・整形ロジック。
// バランス調整に関わる数値(相性)は BASE_DAMAGE を参照し、ここでは表示用の整形のみを行う。
// Phaser には依存しない純粋なロジック・データとして切り出し、Vitest でテストする。
// 詳細な仕様は docs/UnitSpec.md を参照。

import { BASE_DAMAGE } from '@/data/damageTable';
import type { UnitType } from '@/core/units/UnitType';
import { UNIT_TYPES } from '@/core/units/UnitType';

/**
 * ユニットごとの説明文(1 要素 = 1 行ぶん)。
 * 生産コストや相性表などの数値は別途表示するため、ここでは役割・強み・弱みを短くまとめる。
 */
export const UNIT_DESCRIPTIONS: Readonly<Record<UnitType, readonly string[]>> = {
  infantry: [
    '拠点を占領できる唯一のユニット。',
    '低コストで数を揃えやすいが、',
    '車両や航空機との撃ち合いには弱い。',
  ],
  tank: [
    '直接戦闘の主力となる車両。',
    '移動力が高く地上ユニットに広く強いが、',
    '飛行ユニットへの攻撃力は低い。',
  ],
  artillery: [
    '射程2〜3で攻撃する間接攻撃ユニット。',
    '移動すると攻撃できず反撃も受けないため、',
    '前線の後ろから味方を支援する。',
  ],
  attackHelicopter: [
    '高い移動力を持つ直接攻撃機。',
    '対歩兵・対車両に強いが、',
    '対空戦車には非常に弱い。',
  ],
  transportHelicopter: [
    '歩兵を1体だけ運べる飛行ユニット。',
    '攻撃はできず反撃もしないため、',
    '前線への輸送に専念する。',
  ],
  antiAirTank: [
    '飛行ユニットと歩兵に強い車両。',
    '航空戦力への主力となるが、',
    '戦車との撃ち合いには弱い。',
  ],
};

/** 対戦相性の強さの段階(数値の色分けやニュアンス表示に使う) */
export type CompatibilityTier = 'none' | 'low' | 'mid' | 'high';

/** 攻撃できない(基礎ダメージ 0)ことを表す記号 */
export const NO_ATTACK_SYMBOL = '×';

/**
 * 基礎ダメージ(0-100)を表示用の文字列へ整形する。
 * 0(攻撃できない)は記号「×」、それ以外は「100 を最大とした与ダメージの数値」をそのまま返す。
 */
export function formatCompatibility(value: number): string {
  return value <= 0 ? NO_ATTACK_SYMBOL : String(value);
}

/**
 * 基礎ダメージ(0-100)から強さの段階を求める。
 * 0=none(攻撃不可)、1〜39=low、40〜69=mid、70以上=high。
 */
export function compatibilityTier(value: number): CompatibilityTier {
  if (value <= 0) {
    return 'none';
  }
  if (value >= 70) {
    return 'high';
  }
  if (value >= 40) {
    return 'mid';
  }
  return 'low';
}

/** 1 種類の相手に対する相性(与ダメージ・被ダメージ) */
export interface UnitMatchup {
  /** 相手のユニット種別 */
  readonly opponent: UnitType;
  /** このユニットが相手を攻撃したときの基礎ダメージ(0-100) */
  readonly dealt: number;
  /** dealt の表示用文字列(0 は「×」) */
  readonly dealtSymbol: string;
  /** dealt の強さ段階 */
  readonly dealtTier: CompatibilityTier;
  /** 相手がこのユニットを攻撃したときの基礎ダメージ(0-100) */
  readonly taken: number;
  /** taken の表示用文字列(0 は「×」) */
  readonly takenSymbol: string;
  /** taken の強さ段階 */
  readonly takenTier: CompatibilityTier;
}

/**
 * 指定したユニットと、全ユニット(自分自身=同種対決を含む)との相性一覧を返す。
 * 並び順は UNIT_TYPES と同じ。各要素に与ダメージ(dealt)と被ダメージ(taken)を持つ。
 */
export function getUnitMatchups(unitType: UnitType): readonly UnitMatchup[] {
  return UNIT_TYPES.map((opponent) => {
    const dealt = BASE_DAMAGE[unitType][opponent];
    const taken = BASE_DAMAGE[opponent][unitType];
    return {
      opponent,
      dealt,
      dealtSymbol: formatCompatibility(dealt),
      dealtTier: compatibilityTier(dealt),
      taken,
      takenSymbol: formatCompatibility(taken),
      takenTier: compatibilityTier(taken),
    };
  });
}

/** 指定したユニットの説明文を返す(未定義の場合は空配列) */
export function getUnitDescription(unitType: UnitType): readonly string[] {
  return UNIT_DESCRIPTIONS[unitType] ?? [];
}
