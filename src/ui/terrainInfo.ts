// 選択マスの地形情報を表示用テキストに整形する。Phaser には依存しない純粋な関数。

import type { ArmyType } from '@/core/map/TerrainType';
import { INITIAL_CAPTURE_HP, type TileData } from '@/core/map/TileData';
import { getTerrainData } from '@/data/terrainData';
import { armyLabel as turnArmyLabel, type ArmyLabelOptions } from '@/ui/turnInfo';

/**
 * 所有軍の表示名。
 * 対人戦では「自軍 / 敵軍」ではなく先手・後手で「1P / 2P」と呼び分ける
 * (呼び分けの規則は ui/turnInfo の armyLabel を参照)。
 */
export function armyLabel(owner: ArmyType, options: ArmyLabelOptions = {}): string {
  return owner === 'neutral' ? '中立' : turnArmyLabel(owner, options);
}

/** 移動コスト値の表示テキスト(進入不可は「×」) */
function moveCostLabel(cost: number | null): string {
  return cost === null ? '×' : String(cost);
}

/**
 * 占領耐久値の表示テキスト。占領が進行中のときは、
 * どの軍が占領を進めているのかも併せて示す(自軍・敵軍の占領値は別管理)。
 */
export function captureHpLabel(tile: TileData, options: ArmyLabelOptions = {}): string {
  if (tile.captureArmy !== null && tile.captureHp < INITIAL_CAPTURE_HP) {
    return `占領耐久: ${tile.captureHp} (${armyLabel(tile.captureArmy, options)}が占領中)`;
  }
  return `占領耐久: ${tile.captureHp}`;
}

/** formatTerrainInfo の表示オプション(軍勢の呼び分けの設定も受け取る) */
export interface TerrainInfoOptions extends ArmyLabelOptions {
  /**
   * 簡略表示。座標・移動コストを省いて行数を減らす。
   * 同じマスにユニットがいてユニット情報と併記する場合に使い、
   * 占領耐久などの重要な情報がパネル下部のボタンに隠れないようにする。
   */
  compact?: boolean;
}

/**
 * 選択中マスの地形情報を複数行のテキストとして返す。
 * 情報パネルへの表示に使う。
 */
export function formatTerrainInfo(
  tile: TileData,
  options: TerrainInfoOptions = {},
): string[] {
  const data = getTerrainData(tile.terrainType);
  const lines = [`地形: ${data.terrainName}`];

  if (!options.compact) {
    lines.push(`座標: (${tile.position.col}, ${tile.position.row})`);
  }
  lines.push(`防御: ${data.defense}`);
  if (!options.compact) {
    lines.push(`移動コスト 歩兵: ${moveCostLabel(data.moveCost.infantry)}`);
    lines.push(`移動コスト 車両: ${moveCostLabel(data.moveCost.vehicle)}`);
    // 装輪車両(偵察車・ロケット砲)は装軌車両と移動コストが大きく異なる
    // (道路・拠点は 1、平地 2、海岸 4、森・山は進入不可)
    lines.push(`移動コスト 装輪: ${moveCostLabel(data.moveCost.wheeled)}`);
    // 海上ユニットが進入できる地形(海・港)だけ、海上の移動コストも併記する。
    // 進入できない地形では自明に「×」なので、行数を増やさないために省略する。
    if (data.moveCost.sea !== null) {
      lines.push(`移動コスト 海上: ${moveCostLabel(data.moveCost.sea)}`);
    }
  }

  if (data.canCapture) {
    lines.push(`所有: ${armyLabel(tile.owner, options)}`);
    lines.push(captureHpLabel(tile, options));
    lines.push(`生産: ${data.canProduce ? '可' : '不可'}`);
  }

  return lines;
}
