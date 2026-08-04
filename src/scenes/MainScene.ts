import Phaser from 'phaser';
import { SoundManager } from '@/audio/SoundManager';
import { EnemyAi } from '@/core/ai/EnemyAi';
import { findAttackableTargets } from '@/core/battle/AttackRange';
import { forecastBattle } from '@/core/battle/BattleForecast';
import { BattleManager, type AttackResult } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import { ProductionManager } from '@/core/economy/ProductionManager';
import { RepairManager, type RepairResult } from '@/core/economy/RepairManager';
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
  formatRepairLog,
} from '@/ui/economyInfo';
import { formatEnemyTurnSummary } from '@/ui/aiInfo';
import { formatBattleForecast } from '@/ui/forecastInfo';
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

/** ダメージ予測ポップアップの描画深度(ユニットより手前) */
const FORECAST_POPUP_DEPTH = 100;
/** ターン開始演出バナーの描画深度(最前面) */
const TURN_BANNER_DEPTH = 200;

/** HP バーの表示に使う色(HP 割合で塗り分ける) */
const HP_BAR_COLOR = {
  high: 0x5ad469,
  mid: 0xf0c419,
  low: 0xe0533a,
} as const;

/** ターン開始バナーの軍勢別の色 */
const TURN_BANNER_COLOR: Record<ArmyType, number> = {
  player: 0x2f5fae,
  enemy: 0xae2f2f,
  neutral: 0x555566,
};

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
 * 修理: ターン開始時、自軍拠点(都市・工場・本拠地)上のダメージユニットを
 *   資金を消費して回復する(収入計上の直後に実行)。
 * Phase 9: ターン終了で敵軍に手番が移ると、敵軍AIが自動で行動する。
 *   AI は攻撃→占領→接近→生産の優先順位で行動し、終わると自軍へ手番が戻る。
 * 移動後攻撃: 自軍ユニットは移動後、待機の前に攻撃/占領を選べる。
 *   移動先で攻撃できる敵がいれば赤枠で示し、クリックで攻撃する。
 *   ただし間接攻撃(遠距離)ユニットは移動後は攻撃できず、その場からのみ攻撃する。
 */
export class MainScene extends Phaser.Scene {
  private map!: MapManager;
  private units!: UnitManager;
  private battle!: BattleManager;
  private turn!: TurnManager;
  private economy!: EconomyManager;
  private capture!: CaptureSystem;
  private production!: ProductionManager;
  private repair!: RepairManager;
  private victory!: VictoryConditionChecker;
  private ai!: EnemyAi;
  /** 効果音・BGM の再生を統括するサウンドマネージャ */
  private audio!: SoundManager;
  /** 初回のユーザー操作で AudioContext を起動し BGM を開始したか */
  private audioStarted = false;
  /** ミュート切替ボタンのラベル(状態に応じて表示を更新する) */
  private muteLabel!: Phaser.GameObjects.Text;
  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private terrainLabels!: Phaser.GameObjects.Container;
  private unitLayer!: Phaser.GameObjects.Container;
  private rangeGraphics!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;
  private fundsText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  /** ダメージ予測ポップアップ(背景+テキストをまとめたコンテナ。初期は非表示) */
  private forecastPopup!: Phaser.GameObjects.Container;
  private forecastBg!: Phaser.GameObjects.Graphics;
  private forecastText!: Phaser.GameObjects.Text;
  /** 予測ポップアップを現在表示している攻撃対象(重複更新を避ける) */
  private forecastTarget: Unit | null = null;
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
    this.economy = new EconomyManager({ initialFunds: TEST_MAP.initialFunds });
    this.capture = new CaptureSystem();
    this.production = new ProductionManager(this.units, this.economy);
    this.repair = new RepairManager(this.map, this.units, this.economy);
    this.victory = new VictoryConditionChecker(this.map, this.units);
    this.ai = new EnemyAi({
      map: this.map,
      units: this.units,
      battle: this.battle,
      capture: this.capture,
      production: this.production,
    });
    this.audio = new SoundManager();

    this.createTerrainLayer();
    this.drawTerrain();
    this.drawGridLines();
    this.createRangeOverlay();
    this.drawUnits();
    this.createHighlight();
    this.createInfoPanel();
    this.createMuteButton();
    this.createEndTurnButton();
    this.createForecastPopup();

    // 開始時(自軍第1ターン)の収入計上と拠点上ユニットの修理を行う
    const repairs = this.runTurnStartEconomy();
    this.updateTurnText();
    this.updateFundsText();
    if (repairs.length > 0) {
      this.drawUnits();
      this.infoText.setText(formatRepairLog(repairs));
    }
    this.setupInput();

    // 開始演出として自軍第1ターンのバナーを表示する
    this.showTurnStartBanner();
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

      // HP が減っている場合のみ、HP バーと数値を表示する
      if (unit.currentHp < unit.maxHp) {
        this.drawHpIndicator(graphics, unit, x, y, radius);
      }
    }
  }

  /**
   * ユニットの残 HP を表す HP バーと数値を描画する。
   * バーは残量に応じて緑→黄→赤に塗り分け、数値は暗い縁取りで視認性を上げる。
   */
  private drawHpIndicator(
    graphics: Phaser.GameObjects.Graphics,
    unit: Unit,
    x: number,
    y: number,
    radius: number,
  ): void {
    const ratio = Math.max(0, unit.currentHp / unit.maxHp);
    const barWidth = TILE_SIZE * 0.66;
    const barHeight = 5;
    const barX = x - barWidth / 2;
    const barY = y + radius + 2;

    // 背景(枠)
    graphics.fillStyle(0x1a1a2e, 0.85);
    graphics.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    // 残量ぶんの塗り(割合で色を変える)
    const fillColor =
      ratio > 0.5
        ? HP_BAR_COLOR.high
        : ratio > 0.25
          ? HP_BAR_COLOR.mid
          : HP_BAR_COLOR.low;
    graphics.fillStyle(fillColor, 1);
    graphics.fillRect(barX, barY, barWidth * ratio, barHeight);

    // 数値(左上に暗い縁取りつきで表示する)
    const hp = this.add
      .text(x - radius, y - radius, String(unit.currentHp), {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#1a1a2e',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5);
    this.unitLayer.add(hp);
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

  /**
   * サウンドのミュート切替ボタンを情報パネル右上に作成する。
   * クリックで全体のミュートを切り替え、ラベルで現在の状態を示す。
   */
  private createMuteButton(): void {
    const width = 64;
    const height = 22;
    const x = MAP_WIDTH + INFO_PANEL_WIDTH - width - 8;
    const y = 60;

    const button = this.add
      .rectangle(x, y, width, height, 0x2a2a3a)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x8ad0ff)
      .setInteractive({ useHandCursor: true });

    this.muteLabel = this.add
      .text(x + width / 2, y + height / 2, '♪ ON', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);

    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      // ミュート切替もユーザー操作なので、この機に AudioContext を起動しておく
      this.ensureAudioStarted();
      const muted = this.audio.toggleMuted();
      this.muteLabel.setText(muted ? '♪ OFF' : '♪ ON');
      this.muteLabel.setColor(muted ? '#888888' : '#8ad0ff');
    });
  }

  /**
   * 初回のユーザー操作時に AudioContext を起動し、戦闘 BGM を開始する。
   * ブラウザの自動再生制限のため、音の再生はユーザー操作を起点にする必要がある。
   */
  private ensureAudioStarted(): void {
    if (this.audioStarted) {
      return;
    }
    this.audioStarted = true;
    this.audio.unlock();
    this.updateBattleBgm();
  }

  /** 現在の手番の軍勢に応じた戦闘 BGM を再生する(同じ曲なら何もしない) */
  private updateBattleBgm(): void {
    if (this.gameOver) {
      return;
    }
    this.audio.startBgm(
      this.turn.currentArmy === 'player' ? 'playerBattle' : 'enemyBattle',
    );
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

    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.audio.playSfx('button');
      this.handleEndTurn();
    });
  }

  /** ダメージ予測ポップアップ(背景+テキスト)を用意する(初期は非表示) */
  private createForecastPopup(): void {
    this.forecastBg = this.add.graphics();
    this.forecastText = this.add.text(8, 6, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      lineSpacing: 3,
    });
    this.forecastPopup = this.add
      .container(0, 0, [this.forecastBg, this.forecastText])
      .setDepth(FORECAST_POPUP_DEPTH)
      .setVisible(false);
  }

  /**
   * ポインタ位置に応じてダメージ予測ポップアップを更新する。
   * 攻撃対象を選択中(移動前・移動後どちらも)で、ポインタが攻撃可能な敵の
   * マス上にあるときだけ、その戦闘結果を予測して表示する。
   */
  private updateForecastPopup(pointer: Phaser.Input.Pointer): void {
    const attacker = this.movingUnit ?? this.commandUnit;
    // 攻撃元がいない・攻撃対象がない・マップ外なら隠す
    if (
      this.gameOver ||
      !attacker ||
      this.attackTargets.length === 0 ||
      pointer.x >= MAP_WIDTH ||
      pointer.y >= MAP_HEIGHT
    ) {
      this.hideForecastPopup();
      return;
    }

    const pos = worldToGrid(pointer.x, pointer.y, TILE_SIZE);
    const target = this.attackTargets.find((t) => equals(t.position, pos));
    if (!target) {
      this.hideForecastPopup();
      return;
    }

    // 同じ対象を指し続けている間は再描画しない
    if (this.forecastTarget === target) {
      return;
    }
    this.forecastTarget = target;
    this.showForecastPopup(attacker, target);
  }

  /** 攻撃側→対象の戦闘予測を計算し、対象マス付近にポップアップ表示する */
  private showForecastPopup(attacker: Unit, target: Unit): void {
    const forecast = forecastBattle(attacker, target, this.map);
    this.forecastText.setText(formatBattleForecast(forecast, attacker, target));

    // テキストサイズに合わせて背景を描き直す
    const padX = 8;
    const padY = 6;
    const width = this.forecastText.width + padX * 2;
    const height = this.forecastText.height + padY * 2;
    this.forecastBg.clear();
    this.forecastBg.fillStyle(0x12121e, 0.92);
    this.forecastBg.fillRect(0, 0, width, height);
    this.forecastBg.lineStyle(2, 0xff5a5a, 0.95);
    this.forecastBg.strokeRect(0, 0, width, height);

    // 対象マスの右上に出す。マップ外へはみ出す場合は反対側へ寄せる
    const { x, y } = gridToWorld(target.position, TILE_SIZE);
    let px = x + TILE_SIZE + 4;
    if (px + width > MAP_WIDTH) {
      px = x - width - 4;
    }
    px = Phaser.Math.Clamp(px, 2, MAP_WIDTH - width - 2);
    const py = Phaser.Math.Clamp(y, 2, MAP_HEIGHT - height - 2);
    this.forecastPopup.setPosition(px, py).setVisible(true);
  }

  /** ダメージ予測ポップアップを隠す */
  private hideForecastPopup(): void {
    if (this.forecastTarget !== null) {
      this.forecastTarget = null;
      this.forecastPopup.setVisible(false);
    }
  }

  /**
   * ターン開始演出のバナーを画面中央に表示する。
   * 現在の手番軍とターン数を大きく示し、スライドインしてフェードアウトする。
   */
  private showTurnStartBanner(): void {
    const army = this.turn.currentArmy;
    const state = this.turn.state;
    // 手番開始のジングルを鳴らし、手番に応じた BGM へ切り替える
    this.audio.playSfx(army === 'player' ? 'turnPlayer' : 'turnEnemy');
    this.updateBattleBgm();
    const label = army === 'player' ? '自軍ターン' : '敵軍ターン';
    const bannerHeight = 72;
    const centerY = GAME_HEIGHT / 2;

    // 帯状の背景(マップ幅いっぱい)
    const bg = this.add.graphics();
    bg.fillStyle(TURN_BANNER_COLOR[army], 0.9);
    bg.fillRect(0, centerY - bannerHeight / 2, MAP_WIDTH, bannerHeight);
    bg.lineStyle(2, 0xffffff, 0.8);
    bg.lineBetween(0, centerY - bannerHeight / 2, MAP_WIDTH, centerY - bannerHeight / 2);
    bg.lineBetween(0, centerY + bannerHeight / 2, MAP_WIDTH, centerY + bannerHeight / 2);

    const title = this.add
      .text(MAP_WIDTH / 2, centerY - 12, label, {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(MAP_WIDTH / 2, centerY + 20, `第${state.turnNumber}ターン`, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const banner = this.add.container(0, 0, [bg, title, sub]).setDepth(TURN_BANNER_DEPTH);

    // 左からスライドインし、少し待ってフェードアウトして破棄する
    banner.setAlpha(0).setX(-40);
    this.tweens.add({
      targets: banner,
      x: 0,
      alpha: 1,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          delay: 620,
          duration: 320,
          ease: 'Cubic.easeIn',
          onComplete: () => banner.destroy(),
        });
      },
    });
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
   * 自軍のターンを終了する。
   * 敵軍へ手番を移して敵軍AIを自動実行し、決着しなければ自軍へ手番を戻す。
   * 手番が移るたびに、その軍の収入計上と拠点上ユニットの修理を行う。
   */
  private handleEndTurn(): void {
    // 勝敗が決した後はターン終了も受け付けない
    if (this.gameOver) {
      return;
    }
    this.clearSelection();

    // 自軍 → 敵軍。敵軍の開始時経済処理(収入・修理)を行う。
    this.turn.endTurn();
    this.runTurnStartEconomy();
    this.drawUnits();

    // 敵軍AIを実行する。占領・撃破で勝敗が決したらそこで止める。
    this.runEnemyTurn();
    if (this.gameOver) {
      return;
    }

    // 敵軍 → 自軍。自軍の開始時経済処理を行い、表示を更新する。
    this.turn.endTurn();
    const repairs = this.runTurnStartEconomy();
    this.updateTurnText();
    this.updateFundsText();
    // 占領による所有者変更・修理での HP 変化・行動済みリセットを反映して再描画する
    this.drawTerrain();
    this.drawUnits();
    // 修理があればその内容を、なければ敵軍の行動サマリを表示したままにする
    if (repairs.length > 0) {
      this.audio.playSfx('repair');
      this.infoText.setText(formatRepairLog(repairs));
    }
    // 自軍ターンの開始演出を表示する
    this.showTurnStartBanner();
  }

  /**
   * 敵軍AIの手番を実行する。
   * AI が盤面を更新したあと表示を再描画し、行動サマリを表示して勝敗を判定する。
   */
  private runEnemyTurn(): void {
    const actions = this.ai.run();
    // 占領で所有者が、移動・撃破でユニット配置が変わるため再描画する
    this.drawTerrain();
    this.drawUnits();
    this.updateFundsText();
    this.infoText.setText(formatEnemyTurnSummary(actions));
    // 敵軍の占領・撃破で勝敗が決していないか判定する
    this.checkGameEnd();
  }

  /**
   * ターン開始時の経済処理をまとめて実行する。
   * 現在手番の軍勢の所有拠点数に応じた収入を計上したあと、
   * 自軍拠点上のダメージユニットを資金を消費して修理する。
   * 実行した修理の結果を返す(呼び出し側で表示更新に使う)。
   */
  private runTurnStartEconomy(): RepairResult[] {
    this.economy.collectIncome(this.turn.currentArmy, this.map);
    return this.repair.repairAll(this.turn.currentArmy);
  }

  /** クリック入力とホバー入力を設定する */
  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 初回クリックで AudioContext を起動し BGM を鳴らし始める(自動再生制限への対応)
      this.ensureAudioStarted();
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

    // 攻撃対象へのホバーでダメージ予測ポップアップを出す
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.updateForecastPopup(pointer);
    });
  }

  /**
   * マスクリックを処理する。行動対象を選択中かどうかで挙動を分岐させる。
   * 0. 移動後のコマンド選択待ち中なら、攻撃対象クリックで攻撃、それ以外は待機として確定する
   * 1. 行動対象を選択中で、クリック先が攻撃対象の敵 → 攻撃する
   * 2. 行動対象を選択中で、クリック先が移動可能範囲内 → そのマスへ移動する
   * 3. それ以外 → クリック先のマスを選択する(自軍の未行動ユニットなら行動対象にする)
   */
  private handleClick(pos: GridPosition): void {
    const tile = this.map.getTile(pos);
    if (!tile) {
      return;
    }

    // 移動後のコマンド選択待ち中は、攻撃対象クリックで攻撃、それ以外は待機として確定する。
    // 待機確定後は続けてクリック先のマスを選択できるよう、そのまま下の選択処理へ流す。
    if (this.commandUnit) {
      const commandTarget = this.attackTargets.find((t) => equals(t.position, pos));
      if (commandTarget) {
        this.attackTarget(commandTarget);
        return;
      }
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
      this.audio.playSfx('select');
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
   * 行動済みにせずに移動し、移動後の攻撃/占領/待機を選ばせる状態に入る。
   */
  private moveSelectedUnit(pos: GridPosition, tile: TileData): void {
    const unit = this.movingUnit;
    if (!unit) {
      return;
    }

    this.units.moveUnit(unit, pos, { markActed: false });
    this.audio.playSfx('move');
    this.drawUnits();
    this.enterPostMoveCommand(unit, tile);
  }

  /**
   * 移動後、待機の前に選べる行動(攻撃・占領)を提示する。
   * 攻撃できる敵がいれば赤枠で示し、占領できる拠点なら占領コマンドを出す。
   * ただし間接攻撃(遠距離)ユニットは移動後は攻撃できないため攻撃対象を出さない。
   * 攻撃も占領もできない場合は、その場で待機として確定する。
   */
  private enterPostMoveCommand(unit: Unit, tile: TileData): void {
    // 間接攻撃ユニットは移動後攻撃できない。直接攻撃ユニットのみ移動先から攻撃対象を探す
    const targets = unit.isIndirect ? [] : findAttackableTargets(unit, this.units);
    const canOfferCapture =
      unit.canCapture &&
      getTerrainData(tile.terrainType).canCapture &&
      tile.owner !== unit.armyType;

    // 攻撃も占領もできないなら、待機として即確定する
    if (targets.length === 0 && !canOfferCapture) {
      unit.hasActed = true;
      this.clearSelection();
      this.drawUnits();
      return;
    }

    // コマンド選択状態へ移行する。移動範囲は消し、攻撃対象だけを赤枠で示す
    this.movingUnit = null;
    this.movementRange = null;
    this.rangeGraphics.clear();
    this.clearActionButtons();

    this.commandUnit = unit;
    this.attackTargets = targets;
    this.selected = unit.position;
    this.drawSelectionHighlight(unit.position);
    if (targets.length > 0) {
      this.drawAttackTargets(targets);
    }

    const info: string[] = ['コマンド選択', unit.unitName];
    if (targets.length > 0) {
      info.push('攻撃: 赤枠の敵を選択');
    }
    let buttonIndex = 0;
    if (canOfferCapture) {
      info.push(`占領耐久: ${tile.captureHp}`);
      this.addActionButton(buttonIndex++, '占領する', true, () =>
        this.executeCapture(unit, tile),
      );
    }
    this.addActionButton(buttonIndex, '待機', true, () => this.commitWait());
    this.infoText.setText(info);
  }

  /** 占領を選択待ちのユニットを待機として確定する */
  private commitWait(): void {
    if (this.commandUnit) {
      this.commandUnit.hasActed = true;
      this.audio.playSfx('button');
    }
    this.resetSelection();
    this.infoText.setText('マスを選択してください');
    this.drawUnits();
  }

  /**
   * 攻撃対象を攻撃し、結果を表示して行動済みにする。
   * 攻撃元は、移動前に選択中のユニット(movingUnit)か、
   * 移動後にコマンド選択中のユニット(commandUnit)のいずれか。
   */
  private attackTarget(target: Unit): void {
    const attacker = this.movingUnit ?? this.commandUnit;
    if (!attacker) {
      return;
    }
    const result = this.battle.attack(attacker, target);
    this.audio.playSfx('attack');
    // 撃破があれば、打撃音に少し続けて撃破音を鳴らす
    if (result.defenderDefeated || result.attackerDefeated) {
      this.time.delayedCall(160, () => this.audio.playSfx('defeat'));
    }
    this.resetSelection();
    this.drawUnits();
    this.infoText.setText(this.buildBattleLog(result));
    // 撃破により全滅が発生していないか判定する
    this.checkGameEnd();
  }

  /** 指定ユニットで拠点を占領し、結果を表示する */
  private executeCapture(unit: Unit, tile: TileData): void {
    const result = this.capture.capture(unit, tile);
    this.audio.playSfx('capture');
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
    // 戦闘 BGM を止め、勝敗に応じたジングルを鳴らす
    this.audio.stopBgm();
    this.audio.playSfx(result.outcome === 'player_victory' ? 'victory' : 'lose');
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
    this.audio.playSfx('produce');
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
    this.strokeAttackTargets(targets);
  }

  /** 攻撃可能な敵マスだけを赤枠で表示する(移動範囲は描かない。移動後コマンド用) */
  private drawAttackTargets(targets: readonly Unit[]): void {
    this.rangeGraphics.clear();
    this.strokeAttackTargets(targets);
  }

  /** 攻撃対象マスに赤枠を描く(rangeGraphics のクリアは呼び出し側で行う) */
  private strokeAttackTargets(targets: readonly Unit[]): void {
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
    this.hideForecastPopup();
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
