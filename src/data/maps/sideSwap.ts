// マップ定義の自軍・敵軍を入れ替える。2P側を選んだときに使う純粋な変換で、Phaser には依存しない。
// 地形そのものは変えず、拠点の所有者とユニットの所属だけを入れ替えるため、
// 「これまで敵軍として遊んでいた側」をそのままプレイヤーが担当できる。
// docs/GameDesign.md「モード選択」を参照。

import type { ArmyType } from '@/core/map/TerrainType';
import type { MapDefinition } from '@/data/maps/mapDefinition';

/** 自軍・敵軍を入れ替える(中立はそのまま) */
export function swapArmy(army: ArmyType): ArmyType {
  if (army === 'player') {
    return 'enemy';
  }
  if (army === 'enemy') {
    return 'player';
  }
  return army;
}

/**
 * マップ定義の自軍・敵軍を入れ替えた新しい定義を返す(元の定義は変更しない)。
 * 入れ替えるのは拠点の所有者指定(owners)とユニットの初期配置(units)の所属で、
 * 地形・初期軍資金・マップ名は元のまま使う。
 */
export function swapMapSides(def: MapDefinition): MapDefinition {
  return {
    ...def,
    owners: def.owners?.map((owner) => ({ ...owner, owner: swapArmy(owner.owner) })),
    units: def.units?.map((unit) => ({
      ...unit,
      army: unit.army === 'player' ? 'enemy' : 'player',
    })),
  };
}
