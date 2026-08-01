import Phaser from 'phaser';
import { findAttackableTargets } from '@/core/battle/AttackRange';
import { BattleManager, type AttackResult } from '@/core/battle/BattleManager';
import { equals, type GridPosition } from '@/core/map/GridPosition';
import { gridToWorld, gridToWorldCenter, worldToGrid } from '@/core/map/coordinates';
import { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import {
  calculateMovementRange,
  type MovementRange,
} from '@/core/movement/MovementRange';
import type { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import {
  GAME_HEIGHT,
  INFO_PANEL_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
} from '@/data/gameConfig';
import { TEST_MAP } from '@/data/maps/testMap';
import { getTerrainData } from '@/data/terrainData';
import { formatTerrainInfo } from '@/ui/terrainInfo';
import { formatUnitInfo } from '@/ui/unitInfo';

/** 占領地形の所有者を示す枠の色 */
const OWNER_COLOR: Record<'player' | 'enemy' | 'neutral', number> = {
  player: 0x3a7bd5,
  enemy: 0xd53a3a,
  neutral: 0xdddddd,
};

/** ユニット本体を軍勢ごとに塗り分ける色 */
const UNIT_BODY_COLOR: Record<ArmyType, number> = {
  player: 0x2f5fae,
  enemy: 0xae2f2f,
  neutral: 0x777777,
};

/**
 * ゲーム本体のメインシーン。
 * Phase 2: 10x10 のマップを地形色で描画し、マスをクリックで選択して情報表示する。
 * Phase 3: ユニットを配置し、選択でユニット情報を表示する。
 * Phase 4: 自軍の未行動ユニットを選択すると移動可能範囲を表示し、
 *   範囲内のマスをクリックで移動して行動済みにする。
 * Phase 5: 選択中の自軍ユニットの射程内に敵がいれば攻撃対象として強調表示し、
 *   クリックで攻撃する。ダメージ・撃破・反撃を処理して行動済みにする。
 */
export class MainScene extends Phaser.Scene {
  private map!: MapManager;
  private units!: UnitManager;
  private battle!: BattleManager;
  private unitLayer!: Phaser.GameObjects.Container;
  private rangeGraphics!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private selected: GridPosition | null = null;
  /** 移動対象として選択中の自軍ユニット(未選択なら null) */
  private movingUnit: Unit | null = null;
  /** movingUnit の移動可能範囲 */
  private movementRange: MovementRange | null = null;
  /** movingUnit が現在位置から攻撃できる敵ユニット */
  private attackTargets: Unit[] = [];

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.map = MapManager.fromDefinition(TEST_MAP);
    this.units = UnitManager.fromPlacements(TEST_MAP.units ?? [], this.map);
    this.battle = new BattleManager(this.map, this.units);

    this.drawTerrain();
    this.drawGridLines();
    this.createRangeOverlay();
    this.drawUnits();
    this.createHighlight();
    this.createInfoPanel();
    this.setupInput();
  }

  /** 移動範囲・攻撃範囲の塗り用グラフィックスを用意する(ユニットより下に描く) */
  private createRangeOverlay(): void {
    this.rangeGraphics = this.add.graphics();
  }

  /** 地形を種別ごとの色で塗り、占領拠点には所有者を示す枠を描く */
  private drawTerrain(): void {
    const graphics = this.add.graphics();

    this.map.forEachTile((tile) => {
      const data = getTerrainData(tile.terrainType);
      const { x, y } = gridToWorld(tile.position, TILE_SIZE);

      graphics.fillStyle(data.color, 1);
      graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      if (data.canCapture) {
        graphics.lineStyle(3, OWNER_COLOR[tile.owner], 1);
        graphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        this.drawTerrainLabel(tile);
      }
    });
  }

  /** 拠点マスに地形名の頭文字を表示して種別を分かりやすくする */
  private drawTerrainLabel(tile: TileData): void {
    const data = getTerrainData(tile.terrainType);
    const { x, y } = gridToWorld(tile.position, TILE_SIZE);
    const initial = data.terrainName.charAt(0);
    this.add
      .text(x + TILE_SIZE / 2, y + TILE_SIZE / 2, initial, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  /** マスの区切り線を描画する */
  private drawGridLines(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a2e, 0.6);

    for (let col = 0; col <= this.map.cols; col++) {
      const x = col * TILE_SIZE;
      graphics.lineBetween(x, 0, x, MAP_HEIGHT);
    }
    for (let row = 0; row <= this.map.rows; row++) {
      const y = row * TILE_SIZE;
      graphics.lineBetween(0, y, MAP_WIDTH, y);
    }
  }

  /**
   * 全ユニットをグリッド上に描画する。
   * コンテナにまとめて描くことで、移動・撃破時に再描画しやすくする。
   */
  private drawUnits(): void {
    if (!this.unitLayer) {
      this.unitLayer = this.add.container(0, 0);
    }
    this.unitLayer.removeAll(true);

    const graphics = this.add.graphics();
    this.unitLayer.add(graphics);

    const radius = TILE_SIZE * 0.32;
    for (const unit of this.units.getAllUnits()) {
      const { x, y } = gridToWorldCenter(unit.position, TILE_SIZE);
      // 行動済みのユニットは半透明にして待機中と区別する
      const bodyAlpha = unit.hasActed ? 0.45 : 1;

      graphics.fillStyle(UNIT_BODY_COLOR[unit.armyType], bodyAlpha);
      graphics.fillCircle(x, y, radius);
      graphics.lineStyle(2, 0xffffff, unit.hasActed ? 0.5 : 0.9);
      graphics.strokeCircle(x, y, radius);

      const label = this.add
        .text(x, y, unit.unitName.charAt(0), {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setAlpha(unit.hasActed ? 0.5 : 1);
      this.unitLayer.add(label);

      // HP が減っている場合のみ右下に数値を表示する
      if (unit.currentHp < unit.maxHp) {
        const hp = this.add
          .text(x + radius, y + radius, String(unit.currentHp), {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            color: '#ffe08a',
          })
          .setOrigin(1, 1);
        this.unitLayer.add(hp);
      }
    }
  }

  /** 選択マスのハイライト用グラフィックスを用意する(初期は非表示) */
  private createHighlight(): void {
    this.highlight = this.add.graphics();
    this.highlight.setVisible(false);
  }

  /** 右側の情報パネルを作成する */
  private createInfoPanel(): void {
    const panel = this.add.graphics();
    panel.fillStyle(0x12121e, 1);
    panel.fillRect(MAP_WIDTH, 0, INFO_PANEL_WIDTH, GAME_HEIGHT);

    this.add.text(MAP_WIDTH + 12, 12, 'マス情報', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#ffd479',
    });

    this.infoText = this.add.text(MAP_WIDTH + 12, 44, 'マスを選択してください', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#eaeaea',
      lineSpacing: 6,
      wordWrap: { width: INFO_PANEL_WIDTH - 24 },
    });
  }

  /** クリック入力を設定する */
  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // マップ描画領域外(情報パネル側)のクリックは無視する
      if (pointer.x >= MAP_WIDTH || pointer.y >= MAP_HEIGHT) {
        return;
      }
      const pos = worldToGrid(pointer.x, pointer.y, TILE_SIZE);
      this.handleClick(pos);
    });
  }

  /**
   * マスクリックを処理する。行動対象を選択中かどうかで挙動を分岐させる。
   * 1. 行動対象を選択中で、クリック先が攻撃対象の敵 → 攻撃する
   * 2. 行動対象を選択中で、クリック先が移動可能範囲内 → そのマスへ移動する
   * 3. それ以外 → クリック先のマスを選択する(自軍の未行動ユニットなら行動対象にする)
   */
  private handleClick(pos: GridPosition): void {
    const tile = this.map.getTile(pos);
    if (!tile) {
      return;
    }

    // 行動対象を選択中なら、攻撃・移動を優先して判定する
    if (this.movingUnit) {
      // 攻撃対象の敵をクリックしたら攻撃する
      const target = this.attackTargets.find((t) => equals(t.position, pos));
      if (target) {
        this.attackTarget(target);
        return;
      }
      // 行動対象ユニット自身を再クリックしたら選択解除
      if (equals(this.movingUnit.position, pos)) {
        this.clearSelection();
        return;
      }
      if (this.movementRange?.canReach(pos)) {
        this.moveSelectedUnit(pos);
        return;
      }
      // 範囲外クリックはいったん選択解除し、通常選択に切り替える
      this.clearSelection();
    }

    this.selectTile(pos, tile);
  }

  /** 指定マスを選択し、ハイライト・移動範囲・情報表示を更新する */
  private selectTile(pos: GridPosition, tile: TileData): void {
    // 同じマスを再度クリックしたら選択を解除する
    if (this.selected && equals(this.selected, pos)) {
      this.clearSelection();
      return;
    }

    this.selected = pos;
    this.drawSelectionHighlight(pos);
    this.infoText.setText(this.buildInfo(tile));

    // 自軍の未行動ユニットを選択したら移動可能範囲と攻撃対象を表示する
    const unit = this.units.getUnitAt(pos);
    if (unit && unit.armyType === 'player' && !unit.hasActed) {
      this.movingUnit = unit;
      this.movementRange = calculateMovementRange(unit, this.map, this.units);
      this.attackTargets = findAttackableTargets(unit, this.units);
      this.drawActionRange(this.movementRange, this.attackTargets);
    } else {
      this.movingUnit = null;
      this.movementRange = null;
      this.attackTargets = [];
      this.rangeGraphics.clear();
    }
  }

  /** 選択中ユニットを指定マスへ移動し、行動済みにして再描画する */
  private moveSelectedUnit(pos: GridPosition): void {
    const unit = this.movingUnit;
    if (!unit) {
      return;
    }
    this.units.moveUnit(unit, pos);
    this.clearSelection();
    this.drawUnits();
  }

  /** 選択中ユニットで対象を攻撃し、結果を表示して行動済みにする */
  private attackTarget(target: Unit): void {
    const attacker = this.movingUnit;
    if (!attacker) {
      return;
    }
    const result = this.battle.attack(attacker, target);
    this.clearSelection();
    this.drawUnits();
    this.infoText.setText(this.buildBattleLog(result));
  }

  /** 攻撃結果を情報パネル用のテキストに整形する */
  private buildBattleLog(result: AttackResult): string[] {
    const lines = [
      '戦闘結果',
      `${result.attacker.unitName} → ${result.defender.unitName}`,
      `与ダメージ: ${result.damageDealt}`,
    ];
    if (result.defenderDefeated) {
      lines.push(`${result.defender.unitName}を撃破`);
    }
    if (result.counterDamage > 0) {
      lines.push(`反撃ダメージ: ${result.counterDamage}`);
    }
    if (result.attackerDefeated) {
      lines.push(`${result.attacker.unitName}は反撃で撃破された`);
    }
    return lines;
  }

  /** 移動可能範囲(青)と攻撃可能な敵(赤)を重ねて表示する */
  private drawActionRange(range: MovementRange, targets: readonly Unit[]): void {
    this.rangeGraphics.clear();

    // 移動可能範囲を半透明の青塗りで表示する(行動対象マス自身は除く)
    this.rangeGraphics.fillStyle(0x3a7bd5, 0.35);
    for (const { position } of range.tiles) {
      if (this.movingUnit && equals(this.movingUnit.position, position)) {
        continue;
      }
      const { x, y } = gridToWorld(position, TILE_SIZE);
      this.rangeGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }

    // 攻撃可能な敵マスを赤枠で強調表示する
    this.rangeGraphics.lineStyle(3, 0xff5a5a, 0.95);
    for (const target of targets) {
      const { x, y } = gridToWorld(target.position, TILE_SIZE);
      this.rangeGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
  }

  /**
   * 選択マスの情報テキストを組み立てる。
   * ユニットがいる場合はユニット情報を先頭に、続けて地形情報を並べる。
   */
  private buildInfo(tile: TileData): string[] {
    const unit = this.units.getUnitAt(tile.position);
    if (unit) {
      return [...formatUnitInfo(unit), '', ...formatTerrainInfo(tile)];
    }
    return formatTerrainInfo(tile);
  }

  /** 選択を解除し、移動範囲・攻撃範囲の表示も消す */
  private clearSelection(): void {
    this.selected = null;
    this.movingUnit = null;
    this.movementRange = null;
    this.attackTargets = [];
    this.highlight.setVisible(false);
    this.rangeGraphics.clear();
    this.infoText.setText('マスを選択してください');
  }

  /** 選択マスの枠を描画する */
  private drawSelectionHighlight(pos: GridPosition): void {
    const { x, y } = gridToWorld(pos, TILE_SIZE);
    this.highlight.clear();
    this.highlight.lineStyle(3, 0xffd479, 1);
    this.highlight.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    this.highlight.setVisible(true);
  }
}
