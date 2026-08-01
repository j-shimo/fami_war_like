import Phaser from 'phaser';
import { findAttackableTargets } from '@/core/battle/AttackRange';
import { BattleManager, type AttackResult } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { equals, type GridPosition } from '@/core/map/GridPosition';
import { gridToWorld, gridToWorldCenter, worldToGrid } from '@/core/map/coordinates';
import { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import {
  calculateMovementRange,
  type MovementRange,
} from '@/core/movement/MovementRange';
import { TurnManager } from '@/core/turn/TurnManager';
import type { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import type { UnitType } from '@/core/units/UnitType';
import {
  VictoryConditionChecker,
  type VictoryResult,
} from '@/core/victory/VictoryConditionChecker';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  INFO_PANEL_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
} from '@/data/gameConfig';
import { TEST_MAP } from '@/data/maps/testMap';
import { getTerrainData } from '@/data/terrainData';
import { PRODUCIBLE_UNIT_TYPES } from '@/data/unitData';
import {
  formatCaptureLog,
  formatFunds,
  formatProductionLabel,
  formatProductionLog,
} from '@/ui/economyInfo';
import { formatResultMessage } from '@/ui/resultInfo';
import { formatTerrainInfo } from '@/ui/terrainInfo';
import { formatTurnBanner } from '@/ui/turnInfo';
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

/** コマンド・生産ボタンの描画開始 Y 座標(情報パネル内) */
const ACTION_BUTTON_TOP = 300;
/** コマンド・生産ボタン 1 個の高さ */
const ACTION_BUTTON_HEIGHT = 30;
/** コマンド・生産ボタンの縦間隔 */
const ACTION_BUTTON_GAP = 6;

/**
 * ゲーム本体のメインシーン。
 * Phase 2: 10x10 のマップを地形色で描画し、マスをクリックで選択して情報表示する。
 * Phase 3: ユニットを配置し、選択でユニット情報を表示する。
 * Phase 4: 自軍の未行動ユニットを選択すると移動可能範囲を表示し、
 *   範囲内のマスをクリックで移動して行動済みにする。
 * Phase 5: 選択中の自軍ユニットの射程内に敵がいれば攻撃対象として強調表示し、
 *   クリックで攻撃する。ダメージ・撃破・反撃を処理して行動済みにする。
 * Phase 6: 現在の手番の軍勢とターン数を管理し、ターン終了ボタンで手番を切り替える。
 *   操作できるのは手番の軍勢の未行動ユニットのみで、手番開始時に行動済み状態をリセットする。
 * Phase 7: 拠点の占領・収入・生産を追加する。
 *   歩兵で拠点を占領し、ターン開始時に所有拠点数に応じた収入を得て、
 *   工場・本拠地で資金を消費してユニットを生産する。
 * Phase 8: 攻撃・占領のたびに勝敗を判定する。
 *   敵本拠地の占領・敵軍全滅で勝利、自軍本拠地の占領・自軍全滅で敗北とし、
 *   決着したら結果オーバーレイを表示して以降の操作を止める。
 */
export class MainScene extends Phaser.Scene {
  private map!: MapManager;
  private units!: UnitManager;
  private battle!: BattleManager;
  private turn!: TurnManager;
  private economy!: EconomyManager;
  private capture!: CaptureSystem;
  private production!: ProductionManager;
  private victory!: VictoryConditionChecker;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private terrainLabels!: Phaser.GameObjects.Container;
  private unitLayer!: Phaser.GameObjects.Container;
  private rangeGraphics!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;
  private fundsText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private selected: GridPosition | null = null;
  /** 移動対象として選択中の自軍ユニット(未選択なら null) */
  private movingUnit: Unit | null = null;
  /** movingUnit の移動可能範囲 */
  private movementRange: MovementRange | null = null;
  /** movingUnit が現在位置から攻撃できる敵ユニット */
  private attackTargets: Unit[] = [];
  /** 移動後に占領/待機の選択待ちになっているユニット(いなければ null) */
  private commandUnit: Unit | null = null;
  /** 動的に生成する占領・生産コマンドのボタン群 */
  private actionButtons: Phaser.GameObjects.GameObject[] = [];
  /** 勝敗が決したかどうか。決着後は操作を受け付けない */
  private gameOver = false;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.map = MapManager.fromDefinition(TEST_MAP);
    this.units = UnitManager.fromPlacements(TEST_MAP.units ?? [], this.map);
    this.battle = new BattleManager(this.map, this.units);
    this.turn = new TurnManager(this.units);
    this.economy = new EconomyManager();
    this.capture = new CaptureSystem();
    this.production = new ProductionManager(this.units, this.economy);
    this.victory = new VictoryConditionChecker(this.map, this.units);

    this.createTerrainLayer();
    this.drawTerrain();
    this.drawGridLines();
    this.createRangeOverlay();
    this.drawUnits();
    this.createHighlight();
    this.createInfoPanel();
    this.createEndTurnButton();

    // 開始時(自軍第1ターン)の収入を計上する
    this.economy.collectIncome(this.turn.currentArmy, this.map);
    this.updateTurnText();
    this.updateFundsText();
    this.setupInput();
  }

  /** 地形描画用のグラフィックスとラベルコンテナを用意する(最背面) */
  private createTerrainLayer(): void {
    this.terrainGraphics = this.add.graphics();
    this.terrainLabels = this.add.container(0, 0);
  }

  /** 移動範囲・攻撃範囲の塗り用グラフィックスを用意する(ユニットより下に描く) */
  private createRangeOverlay(): void {
    this.rangeGraphics = this.add.graphics();
  }

  /**
   * 地形を種別ごとの色で塗り、占領拠点には所有者を示す枠を描く。
   * 占領で所有者が変わったときに再描画できるよう、永続グラフィックスへ描く。
   */
  private drawTerrain(): void {
    this.terrainGraphics.clear();
    this.terrainLabels.removeAll(true);

    this.map.forEachTile((tile) => {
      const data = getTerrainData(tile.terrainType);
      const { x, y } = gridToWorld(tile.position, TILE_SIZE);

      this.terrainGraphics.fillStyle(data.color, 1);
      this.terrainGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      if (data.canCapture) {
        this.terrainGraphics.lineStyle(3, OWNER_COLOR[tile.owner], 1);
        this.terrainGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        this.drawTerrainLabel(tile);
      }
    });
  }

  /** 拠点マスに地形名の頭文字を表示して種別を分かりやすくする */
  private drawTerrainLabel(tile: TileData): void {
    const data = getTerrainData(tile.terrainType);
    const { x, y } = gridToWorld(tile.position, TILE_SIZE);
    const initial = data.terrainName.charAt(0);
    const label = this.add
      .text(x + TILE_SIZE / 2, y + TILE_SIZE / 2, initial, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.terrainLabels.add(label);
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

    // 現在のターン数と手番の軍勢を示す見出し
    this.turnText = this.add.text(MAP_WIDTH + 12, 12, '', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#8ad0ff',
      fontStyle: 'bold',
    });

    // 現在手番の軍勢の資金
    this.fundsText = this.add.text(MAP_WIDTH + 12, 36, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#ffe08a',
    });

    this.add.text(MAP_WIDTH + 12, 64, 'マス情報', {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#ffd479',
    });

    this.infoText = this.add.text(MAP_WIDTH + 12, 92, 'マスを選択してください', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: '#eaeaea',
      lineSpacing: 6,
      wordWrap: { width: INFO_PANEL_WIDTH - 24 },
    });
  }

  /** ターン終了ボタンを情報パネル下部に作成する */
  private createEndTurnButton(): void {
    const width = INFO_PANEL_WIDTH - 24;
    const height = 40;
    const x = MAP_WIDTH + 12;
    const y = GAME_HEIGHT - height - 12;

    const button = this.add
      .rectangle(x, y, width, height, 0x2f5fae)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x8ad0ff)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x + width / 2, y + height / 2, 'ターン終了', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    button.on(Phaser.Input.Events.POINTER_DOWN, () => this.handleEndTurn());
  }

  /** 手番の見出しを現在のターン状態に合わせて更新する */
  private updateTurnText(): void {
    this.turnText.setText(formatTurnBanner(this.turn.state));
  }

  /** 現在手番の軍勢の資金表示を更新する */
  private updateFundsText(): void {
    const army = this.turn.currentArmy;
    this.fundsText.setText(formatFunds(army, this.economy.getFunds(army)));
  }

  /**
   * ターンを終了し、次の軍勢へ手番を移す。
   * 手番が移ったあと、その軍の所有拠点数に応じた収入を計上する。
   */
  private handleEndTurn(): void {
    // 勝敗が決した後はターン終了も受け付けない
    if (this.gameOver) {
      return;
    }
    this.clearSelection();
    this.turn.endTurn();
    this.economy.collectIncome(this.turn.currentArmy, this.map);
    this.updateTurnText();
    this.updateFundsText();
    // 新しい手番軍の行動済み状態がリセットされるため、ユニットの見た目も更新する
    this.drawUnits();
  }

  /** クリック入力を設定する */
  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 勝敗が決した後はマップ操作を受け付けない
      if (this.gameOver) {
        return;
      }
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
   * 0. 移動後に占領/待機の選択待ち中なら、マップクリックは待機として確定する
   * 1. 行動対象を選択中で、クリック先が攻撃対象の敵 → 攻撃する
   * 2. 行動対象を選択中で、クリック先が移動可能範囲内 → そのマスへ移動する
   * 3. それ以外 → クリック先のマスを選択する(自軍の未行動ユニットなら行動対象にする)
   */
  private handleClick(pos: GridPosition): void {
    const tile = this.map.getTile(pos);
    if (!tile) {
      return;
    }

    // 移動後の占領/待機選択待ち中にマップをクリックしたら、待機として確定する
    if (this.commandUnit) {
      this.commitWait();
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
        this.moveSelectedUnit(pos, tile);
        return;
      }
      // 範囲外クリックはいったん選択解除し、通常選択に切り替える
      this.clearSelection();
    }

    this.selectTile(pos, tile);
  }

  /** 指定マスを選択し、ハイライト・移動範囲・情報表示・コマンドを更新する */
  private selectTile(pos: GridPosition, tile: TileData): void {
    // 同じマスを再度クリックしたら選択を解除する
    if (this.selected && equals(this.selected, pos)) {
      this.clearSelection();
      return;
    }

    this.clearActionButtons();
    this.selected = pos;
    this.drawSelectionHighlight(pos);
    this.infoText.setText(this.buildInfo(tile));

    const unit = this.units.getUnitAt(pos);
    // 手番の軍勢の未行動ユニットを選択したら移動可能範囲と攻撃対象を表示する
    if (unit && this.turn.isCurrentArmy(unit.armyType) && !unit.hasActed) {
      this.movingUnit = unit;
      this.movementRange = calculateMovementRange(unit, this.map, this.units);
      this.attackTargets = findAttackableTargets(unit, this.units);
      this.drawActionRange(this.movementRange, this.attackTargets);
      // すでに占領対象の拠点上にいる歩兵なら、その場で占領コマンドを出せる
      if (this.capture.canCapture(unit, tile)) {
        this.addActionButton(0, '占領する', true, () => this.executeCapture(unit, tile));
      }
      return;
    }

    this.movingUnit = null;
    this.movementRange = null;
    this.attackTargets = [];
    this.rangeGraphics.clear();

    // ユニットのいない自軍の生産拠点を選んだら生産メニューを表示する
    if (!unit && this.production.canProduceAt(this.turn.currentArmy, tile)) {
      this.renderProductionMenu(tile);
    }
  }

  /**
   * 選択中ユニットを指定マスへ移動する。
   * 移動先が自軍所有でない占領可能拠点なら、行動済みにせず占領/待機を選ばせる。
   * それ以外はその場で行動済みにして選択を解除する。
   */
  private moveSelectedUnit(pos: GridPosition, tile: TileData): void {
    const unit = this.movingUnit;
    if (!unit) {
      return;
    }

    const canOfferCapture =
      unit.canCapture &&
      getTerrainData(tile.terrainType).canCapture &&
      tile.owner !== unit.armyType;

    if (canOfferCapture) {
      this.units.moveUnit(unit, pos, { markActed: false });
      this.enterCaptureCommand(unit, tile);
      this.drawUnits();
      return;
    }

    this.units.moveUnit(unit, pos);
    this.clearSelection();
    this.drawUnits();
  }

  /** 移動後、占領対象の拠点上で占領/待機を選ばせる状態に入る */
  private enterCaptureCommand(unit: Unit, tile: TileData): void {
    this.movingUnit = null;
    this.movementRange = null;
    this.attackTargets = [];
    this.rangeGraphics.clear();
    this.clearActionButtons();

    this.commandUnit = unit;
    this.selected = unit.position;
    this.drawSelectionHighlight(unit.position);
    this.infoText.setText([
      'コマンド選択',
      `${unit.unitName}`,
      `占領耐久: ${tile.captureHp}`,
    ]);
    this.addActionButton(0, '占領する', true, () => this.executeCapture(unit, tile));
    this.addActionButton(1, '待機', true, () => this.commitWait());
  }

  /** 占領を選択待ちのユニットを待機として確定する */
  private commitWait(): void {
    if (this.commandUnit) {
      this.commandUnit.hasActed = true;
    }
    this.resetSelection();
    this.infoText.setText('マスを選択してください');
    this.drawUnits();
  }

  /** 選択中ユニットで対象を攻撃し、結果を表示して行動済みにする */
  private attackTarget(target: Unit): void {
    const attacker = this.movingUnit;
    if (!attacker) {
      return;
    }
    const result = this.battle.attack(attacker, target);
    this.resetSelection();
    this.drawUnits();
    this.infoText.setText(this.buildBattleLog(result));
    // 撃破により全滅が発生していないか判定する
    this.checkGameEnd();
  }

  /** 指定ユニットで拠点を占領し、結果を表示する */
  private executeCapture(unit: Unit, tile: TileData): void {
    const result = this.capture.capture(unit, tile);
    this.commandUnit = null;
    this.resetSelection();
    // 所有者が変わった場合に備えて地形の枠を描き直す
    this.drawTerrain();
    this.drawUnits();
    this.infoText.setText(formatCaptureLog(result));
    // 本拠地の占領により勝敗が決していないか判定する
    this.checkGameEnd();
  }

  /**
   * 現在の盤面で勝敗が決していないか判定する。
   * 決着していれば結果オーバーレイを表示し、以降の操作を止める。
   */
  private checkGameEnd(): void {
    const result = this.victory.check();
    if (result.outcome === 'ongoing') {
      return;
    }
    this.gameOver = true;
    this.resetSelection();
    this.showResultOverlay(result);
  }

  /** 勝敗結果を画面中央のオーバーレイとして表示する */
  private showResultOverlay(result: VictoryResult): void {
    const isVictory = result.outcome === 'player_victory';
    const message = formatResultMessage(result);

    // 画面全体を暗くする半透明オーバーレイ
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    // 見出し(勝利は金色、敗北は赤色)
    this.add
      .text(centerX, centerY - 24, message.title, {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: isVictory ? '#ffd479' : '#ff6a6a',
      })
      .setOrigin(0.5);

    // 決着理由の説明
    this.add
      .text(centerX, centerY + 28, message.detail, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }

  /** ユニットのいない自軍生産拠点の生産メニューを表示する */
  private renderProductionMenu(tile: TileData): void {
    const army = this.turn.currentArmy;
    PRODUCIBLE_UNIT_TYPES.forEach((unitType, index) => {
      const affordable = this.production.canProduce(army, tile, unitType);
      this.addActionButton(index, formatProductionLabel(unitType), affordable, () =>
        this.executeProduction(tile, unitType),
      );
    });
  }

  /** 選択中の生産拠点で unitType を生産し、資金・表示を更新する */
  private executeProduction(tile: TileData, unitType: UnitType): void {
    const army = this.turn.currentArmy;
    if (!this.production.canProduce(army, tile, unitType)) {
      return;
    }
    const result = this.production.produce(army, tile, unitType);
    this.resetSelection();
    this.updateFundsText();
    this.drawUnits();
    this.infoText.setText(formatProductionLog(result));
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

  /** 占領・生産コマンドのボタンを 1 つ追加する(無効時はグレー表示) */
  private addActionButton(
    index: number,
    label: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const width = INFO_PANEL_WIDTH - 24;
    const x = MAP_WIDTH + 12;
    const y = ACTION_BUTTON_TOP + index * (ACTION_BUTTON_HEIGHT + ACTION_BUTTON_GAP);

    const fill = enabled ? 0x2f7f4f : 0x3a3a44;
    const stroke = enabled ? 0x8affb0 : 0x666666;
    const rect = this.add
      .rectangle(x, y, width, ACTION_BUTTON_HEIGHT, fill)
      .setOrigin(0, 0)
      .setStrokeStyle(2, stroke);

    const text = this.add
      .text(x + width / 2, y + ACTION_BUTTON_HEIGHT / 2, label, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: enabled ? '#ffffff' : '#999999',
      })
      .setOrigin(0.5);

    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on(Phaser.Input.Events.POINTER_DOWN, onClick);
    }

    this.actionButtons.push(rect, text);
  }

  /** 動的に生成した占領・生産ボタンをすべて破棄する */
  private clearActionButtons(): void {
    for (const button of this.actionButtons) {
      button.destroy();
    }
    this.actionButtons = [];
  }

  /** 選択・行動対象・コマンドの状態と、それらの表示をすべて初期化する */
  private resetSelection(): void {
    this.selected = null;
    this.movingUnit = null;
    this.movementRange = null;
    this.attackTargets = [];
    this.commandUnit = null;
    this.highlight.setVisible(false);
    this.rangeGraphics.clear();
    this.clearActionButtons();
  }

  /** 選択を解除し、移動範囲・攻撃範囲・コマンドの表示も消す */
  private clearSelection(): void {
    this.resetSelection();
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
