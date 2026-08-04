// マップ定義のデータ表現。コードから分離した外部データとして扱う。

import type { ArmyType, TerrainType } from '@/core/map/TerrainType';
import type { UnitPlacement } from '@/core/units/UnitManager';

/**
 * 地形を 1 文字で表す記号。マップを人間が読みやすい形で定義するために使う。
 * 大文字・小文字で種別を区別する。
 */
export type TerrainSymbol =
  | '.' // 平地
  | 'f' // 森
  | 'm' // 山
  | 'r' // 道路
  | 'c' // 都市
  | 'F' // 工場
  | 'H'; // 本拠地

/** 地形記号 → 地形種別の対応表 */
export const SYMBOL_TO_TERRAIN: Readonly<Record<TerrainSymbol, TerrainType>> = {
  '.': 'plain',
  f: 'forest',
  m: 'mountain',
  r: 'road',
  c: 'city',
  F: 'factory',
  H: 'headquarters',
};

/** 拠点の所有者を指定するオーバーライド */
export interface OwnerOverride {
  readonly col: number;
  readonly row: number;
  readonly owner: ArmyType;
}

/** マップ 1 枚ぶんの定義 */
export interface MapDefinition {
  /** マップ名(表示用) */
  readonly name: string;
  /**
   * 地形レイアウト。各要素が 1 行を表し、1 文字が 1 マスに対応する。
   * すべての行は同じ長さである必要がある。
   */
  readonly terrain: readonly string[];
  /** 拠点の所有者指定。未指定の占領可能地形は中立(neutral)になる */
  readonly owners?: readonly OwnerOverride[];
  /** ユニットの初期配置。未指定ならユニットなしで開始する */
  readonly units?: readonly UnitPlacement[];
  /**
   * ゲーム開始時に各軍が所持する資金。
   * 未指定なら economyConfig の既定値(INITIAL_FUNDS)を使う。
   * マップごとに序盤の生産テンポを調整するために使う。
   */
  readonly initialFunds?: number;
}
