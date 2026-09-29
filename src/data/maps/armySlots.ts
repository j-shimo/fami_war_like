// 4P マップで「なし」(参加しない)を選んだ軍勢を、マップ定義から取り除く。
// Phaser には依存しない純粋な変換で、元のマップ定義は変更しない。
// docs/GameDesign.md「4Pモード」を参照。
//
// 参加しない軍勢の陣地は、どの軍勢のものでもない中立の拠点として盤面に残す。
//   - 本拠地は中立の都市に置き換える(本拠地は「占領されると脱落する」特別な拠点なので、
//     持ち主のいない本拠地を残すと、占領した軍勢の本拠地が 2 つになってしまう)
//   - 工場などほかの拠点は、所有者の指定を外して中立にする
//   - 初期配置のユニットは取り除く

import type { TurnArmy } from '@/core/turn/TurnManager';
import type { MapDefinition, TerrainSymbol } from '@/data/maps/mapDefinition';

/** 参加しない軍勢の本拠地を置き換える地形記号(中立の都市) */
const VACANT_HEADQUARTERS: TerrainSymbol = 'c';

/**
 * 参加しない軍勢(absent)を取り除いたマップ定義を返す。
 * absent が空なら元の定義をそのまま返す。
 */
export function removeAbsentArmies(
  def: MapDefinition,
  absent: readonly TurnArmy[],
): MapDefinition {
  if (absent.length === 0) {
    return def;
  }
  const isAbsent = (army: string): boolean => absent.includes(army as TurnArmy);
  const vacated = (def.owners ?? []).filter((owner) => isAbsent(owner.owner));

  const terrain = def.terrain.map((line, row) => {
    const chars = [...line];
    for (const owner of vacated) {
      if (owner.row === row && chars[owner.col] === 'H') {
        chars[owner.col] = VACANT_HEADQUARTERS;
      }
    }
    return chars.join('');
  });

  return {
    ...def,
    terrain,
    owners: def.owners?.filter((owner) => !isAbsent(owner.owner)),
    units: def.units?.filter((unit) => !isAbsent(unit.army)),
  };
}
