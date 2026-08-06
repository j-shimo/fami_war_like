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
import { computeGameDimensions, INFO_PANEL_WIDTH, TILE_SIZE } from '@/data/gameConfig';
import { DEFAULT_MAP_ENTRY } from '@/data/maps';
import type { MapDefinition } from '@/data/maps/mapDefinition';
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
import { computeRoadLinks } from '@/rendering/roadLinks';
import { drawTerrainDecoration } from '@/rendering/terrainDecoration';
import { drawUnitIcon } from '@/rendering/unitIcon';

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
/** マップ上に浮かせて表示する移動後メニューのボタン幅 */
const MENU_BUTTON_WIDTH = 104;
/** 移動後メニューとマスの間の余白(ピクセル) */
const MENU_MARGIN = 4;
/** 移動後メニュー(マップ上に浮かせるボタン)の描画深度(ユニットより手前) */
const MENU_DEPTH = 150;

/**
 * 何もないマスの右クリックで出す情報メニューの項目。
 * 各項目の画面は今後実装する(現時点ではメニュー表示までを行う)。
 */
const INFO_MENU_ITEMS = ['ユニット説明', '操作', '地形効果'] as const;

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
 * 移動後コマンド: 自軍ユニットは移動先のマスの近くに出る「攻撃 / 占領 / 待機」メニューから選ぶ。
 *   「攻撃」は射程内に敵がいるときだけ表示し、押すと攻撃対象の選択に移って赤枠の敵をクリックして攻撃する。
 *   「占領」は占領できる拠点のときだけ表示する。「待機」は常に表示する。
 *   攻撃も占領もできない移動先でも即確定はせず、必ずメニューを出して「待機」を選ばせる
 *   (誤って移動しただけで行動が確定するのを防ぐ)。メニュー外のマスを押すと移動そのものを取り消せる。
 *   ただし間接攻撃(遠距離)ユニットは移動後は攻撃できず、その場からのみ攻撃する。
 *   移動先として「元々居たマス」を選んでも同じメニューを出す(その場で待機/占領/攻撃を選べる)。
 *   このため、占領は情報パネルの専用ボタンではなくこのメニューから行う。
 * 情報メニュー: 何もないマス(ユニットのいないマス)を右クリックすると、移動後メニューと同じ位置に
 *   「ユニット説明 / 操作 / 地形効果」のメニューを出す。各項目の画面は今後実装する。
 *   タッチ端末では右クリックの代わりに長押し(その場で一定時間押し続ける)で同じメニューを出す。
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
  /** 移動後に攻撃/占領/待機の選択待ちになっているユニット(いなければ null) */
  private commandUnit: Unit | null = null;
  /** commandUnit が乗っているマス(占領コマンドの対象。いなければ null) */
  private commandTile: TileData | null = null;
  /** commandUnit の移動前の位置(メニュー外クリックで移動を取り消して戻すのに使う。いなければ null) */
  private commandOrigin: GridPosition | null = null;
  /** 移動後、コマンドメニューの「攻撃」を押すと攻撃対象にできる敵(メニュー表示中に保持) */
  private pendingAttackTargets: Unit[] = [];
  /** コマンドメニューで「攻撃」を選び、攻撃対象のクリック待ちになっているか */
  private awaitingAttackTarget = false;
  /** 何もないマスの右クリックで出す情報メニューを表示中か */
  private infoMenuOpen = false;
  /** 動的に生成する占領・生産コマンドのボタン群 */
  private actionButtons: Phaser.GameObjects.GameObject[] = [];
  /**
   * 直前の押下がコマンドボタンで消費されたか。
   * マップ上に浮かせた移動後メニューはマップ表示領域と重なるため、ボタン押下時に
   * マス選択(メニュー外クリック=移動取り消し)まで走らないよう、この間だけ抑止する。
   */
  private pointerConsumedByButton = false;
  /** 勝敗が決したかどうか。決着後は操作を受け付けない */
  private gameOver = false;
  /** 遊ぶマップの定義(マップ選択画面から渡される。未指定なら既定マップ) */
  private mapDef: MapDefinition = DEFAULT_MAP_ENTRY.definition;
  /** マップ描画領域(全体)のピクセル幅(マップのマス数から算出) */
  private mapWidth = 0;
  /** マップ描画領域(全体)のピクセル高さ(マップのマス数から算出) */
  private mapHeight = 0;
  /** マップを映すビューポートのピクセル幅(マップが大きいときはマップより小さい) */
  private viewWidth = 0;
  /** マップを映すビューポートのピクセル高さ */
  private viewHeight = 0;
  /** ゲーム画面全体のピクセル幅(ビューポート + 情報パネル) */
  private gameWidth = 0;
  /** ゲーム画面全体のピクセル高さ(= ビューポート高さ) */
  private gameHeight = 0;
  /** ドラッグ(スワイプ)によるマップスクロールを受付中か(マップ領域で押下したか) */
  private dragActive = false;
  /** 押下後、しきい値を超えて動いた=スクロール中か(true ならクリック選択は行わない) */
  private isPanning = false;
  /** 押下開始時のポインタ画面座標(ドラッグ量の算出用) */
  private pointerDownX = 0;
  private pointerDownY = 0;
  /** 押下開始時のカメラスクロール位置(ドラッグ量を加減してスクロールさせる) */
  private scrollStartX = 0;
  private scrollStartY = 0;
  /** タッチ長押し判定用のタイマー(押下中のみ有効。なければ null) */
  private longPressTimer: Phaser.Time.TimerEvent | null = null;
  /** 現在のジェスチャで長押し(=情報メニュー表示)が発火したか。指を離すときのクリック抑止に使う */
  private longPressFired = false;

  constructor() {
    super('MainScene');
  }

  /** マップ選択画面から遊ぶマップを受け取る(未指定なら既定マップ) */
  init(data: { map?: MapDefinition }): void {
    this.mapDef = data.map ?? DEFAULT_MAP_ENTRY.definition;
    // シーンを再入場したときのために状態を初期化しておく
    this.gameOver = false;
    this.audioStarted = false;
  }

  create(): void {
    this.map = MapManager.fromDefinition(this.mapDef);
    this.units = UnitManager.fromPlacements(this.mapDef.units ?? [], this.map);

    // マップのマス数に合わせて画面各部の寸法を決め、キャンバスをリサイズする。
    // これにより横長マップ(例: 横15マス)でも全マスが表示・操作できる。
    const dims = computeGameDimensions(this.map.cols, this.map.rows);
    this.mapWidth = dims.mapWidth;
    this.mapHeight = dims.mapHeight;
    this.viewWidth = dims.viewWidth;
    this.viewHeight = dims.viewHeight;
    this.gameWidth = dims.gameWidth;
    this.gameHeight = dims.gameHeight;
    this.scale.resize(this.gameWidth, this.gameHeight);
    this.setupCamera();
    this.battle = new BattleManager(this.map, this.units);
    this.turn = new TurnManager(this.units);
    this.economy = new EconomyManager({ initialFunds: this.mapDef.initialFunds });
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

  /**
   * マップスクロール用のカメラ設定を行う。
   * カメラのスクロール範囲をマップ全体に合わせておき、マップがビューポートより
   * 大きいときにドラッグ(スワイプ)で全体を見られるようにする。
   * 情報パネルぶんの余白を右に足すことで、マップ右端の列もビューポート内(パネルの左)へ寄せられる。
   * マップがビューポートに収まる場合はスクロール量が 0 に固定され、従来どおりの表示になる。
   */
  private setupCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.mapWidth + INFO_PANEL_WIDTH, this.mapHeight);
    camera.setScroll(0, 0);
  }

  /** 地形描画用のグラフィックスを用意する(最背面) */
  private createTerrainLayer(): void {
    this.terrainGraphics = this.add.graphics();
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

    this.map.forEachTile((tile) => {
      const data = getTerrainData(tile.terrainType);
      const { x, y } = gridToWorld(tile.position, TILE_SIZE);

      this.terrainGraphics.fillStyle(data.color, 1);
      this.terrainGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      // 下地の上に地形ごとの模様(草・木・山・道路)や拠点の建物を描き込む
      drawTerrainDecoration(tile.terrainType, {
        graphics: this.terrainGraphics,
        x,
        y,
        size: TILE_SIZE,
        col: tile.position.col,
        row: tile.position.row,
        roadLinks:
          tile.terrainType === 'road'
            ? computeRoadLinks(this.map, tile.position)
            : undefined,
        ownerColor: data.canCapture ? OWNER_COLOR[tile.owner] : undefined,
      });

      // 拠点は所有者を示す枠で囲む(建物上の旗と合わせて所有が分かるようにする)
      if (data.canCapture) {
        this.terrainGraphics.lineStyle(3, OWNER_COLOR[tile.owner], 1);
        this.terrainGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    });
  }

  /** マスの区切り線を描画する */
  private drawGridLines(): void {
    const graphics = this.add.graphics();
    graphics.lineStyle(1, 0x1a1a2e, 0.6);

    for (let col = 0; col <= this.map.cols; col++) {
      const x = col * TILE_SIZE;
      graphics.lineBetween(x, 0, x, this.mapHeight);
    }
    for (let row = 0; row <= this.map.rows; row++) {
      const y = row * TILE_SIZE;
      graphics.lineBetween(0, y, this.mapWidth, y);
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

      // 軍色トークンの上に種別のシルエットアイコンを描く
      drawUnitIcon(unit.unitType, {
        graphics,
        cx: x,
        cy: y,
        radius,
        color: 0xffffff,
        alpha: unit.hasActed ? 0.5 : 1,
      });

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

  /**
   * 右側の情報パネルを作成する。
   * パネルはマップのスクロールに追従せず常に画面右に固定するため、
   * ビューポート右端(viewWidth)を基準に配置し、setScrollFactor(0) で固定する。
   */
  private createInfoPanel(): void {
    const panel = this.add.graphics().setScrollFactor(0);
    panel.fillStyle(0x12121e, 1);
    panel.fillRect(this.viewWidth, 0, INFO_PANEL_WIDTH, this.gameHeight);

    // 現在のターン数と手番の軍勢を示す見出し
    this.turnText = this.add
      .text(this.viewWidth + 12, 12, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#8ad0ff',
        fontStyle: 'bold',
      })
      .setScrollFactor(0);

    // 現在手番の軍勢の資金
    this.fundsText = this.add
      .text(this.viewWidth + 12, 36, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#ffe08a',
      })
      .setScrollFactor(0);

    this.add
      .text(this.viewWidth + 12, 64, 'マス情報', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffd479',
      })
      .setScrollFactor(0);

    this.infoText = this.add
      .text(this.viewWidth + 12, 92, 'マスを選択してください', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#eaeaea',
        lineSpacing: 6,
        wordWrap: { width: INFO_PANEL_WIDTH - 24 },
      })
      .setScrollFactor(0);
  }

  /**
   * サウンドのミュート切替ボタンを情報パネル右上に作成する。
   * クリックで全体のミュートを切り替え、ラベルで現在の状態を示す。
   */
  private createMuteButton(): void {
    const width = 64;
    const height = 22;
    const x = this.viewWidth + INFO_PANEL_WIDTH - width - 8;
    const y = 60;

    const button = this.add
      .rectangle(x, y, width, height, 0x2a2a3a)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(1, 0x8ad0ff)
      .setInteractive({ useHandCursor: true });

    this.muteLabel = this.add
      .text(x + width / 2, y + height / 2, '♪ ON', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#8ad0ff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

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
    const x = this.viewWidth + 12;
    const y = this.gameHeight - height - 12;

    const button = this.add
      .rectangle(x, y, width, height, 0x2f5fae)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(2, 0x8ad0ff)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x + width / 2, y + height / 2, 'ターン終了', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

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
    // 攻撃元がいない・攻撃対象がない・ビューポート外なら隠す
    if (
      this.gameOver ||
      !attacker ||
      this.attackTargets.length === 0 ||
      pointer.x >= this.viewWidth ||
      pointer.y >= this.viewHeight
    ) {
      this.hideForecastPopup();
      return;
    }

    // カメラのスクロールを加味したワールド座標からマスを求める
    const pos = worldToGrid(pointer.worldX, pointer.worldY, TILE_SIZE);
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

    // 対象マスの右上に出す。表示中のビューポート右端をはみ出す場合は反対側へ寄せる。
    // ポップアップはマップと一緒にスクロールするため、位置はワールド座標で扱い、
    // カメラのスクロール量を基準に「今見えている範囲」へ収める。
    const camera = this.cameras.main;
    const viewLeft = camera.scrollX;
    const viewTop = camera.scrollY;
    const { x, y } = gridToWorld(target.position, TILE_SIZE);
    let px = x + TILE_SIZE + 4;
    if (px + width > viewLeft + this.viewWidth) {
      px = x - width - 4;
    }
    px = Phaser.Math.Clamp(px, viewLeft + 2, viewLeft + this.viewWidth - width - 2);
    const py = Phaser.Math.Clamp(y, viewTop + 2, viewTop + this.viewHeight - height - 2);
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
    // マップのスクロールに追従せず、常にビューポート中央へ表示する
    const centerY = this.viewHeight / 2;

    // 帯状の背景(ビューポート幅いっぱい)
    const bg = this.add.graphics();
    bg.fillStyle(TURN_BANNER_COLOR[army], 0.9);
    bg.fillRect(0, centerY - bannerHeight / 2, this.viewWidth, bannerHeight);
    bg.lineStyle(2, 0xffffff, 0.8);
    bg.lineBetween(
      0,
      centerY - bannerHeight / 2,
      this.viewWidth,
      centerY - bannerHeight / 2,
    );
    bg.lineBetween(
      0,
      centerY + bannerHeight / 2,
      this.viewWidth,
      centerY + bannerHeight / 2,
    );

    const title = this.add
      .text(this.viewWidth / 2, centerY - 12, label, {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(this.viewWidth / 2, centerY + 20, `第${state.turnNumber}ターン`, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const banner = this.add
      .container(0, 0, [bg, title, sub])
      .setDepth(TURN_BANNER_DEPTH)
      .setScrollFactor(0);

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

  /** ドラッグ(スワイプ)をクリックと区別するための移動量しきい値(画面ピクセル) */
  private static readonly DRAG_THRESHOLD = 8;

  /** タッチ長押しを右クリック相当と判定するまでの押下継続時間(ミリ秒) */
  private static readonly LONG_PRESS_DELAY = 500;

  /**
   * クリック・ドラッグ・ホバー入力を設定する。
   * マップがビューポートより大きいときは、マップ領域のドラッグ(スマホのスワイプ)で
   * カメラをスクロールして全体を見られるようにする。
   * わずかな移動はクリック(マス選択)として扱い、しきい値を超えて動いた場合のみ
   * スクロールと見なして選択は行わない。
   * タッチ端末では、指を動かさずに一定時間押し続ける長押しを右クリック相当とし、
   * 何もないマスでは情報メニューを表示する。
   */
  private setupInput(): void {
    // 右クリックをゲーム操作(情報メニュー表示)に使うため、ブラウザの右クリックメニューを抑止する
    this.input.mouse?.disableContextMenu();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 初回クリックで AudioContext を起動し BGM を鳴らし始める(自動再生制限への対応)
      this.ensureAudioStarted();
      // 勝敗が決した後はマップ操作を受け付けない
      if (this.gameOver) {
        return;
      }
      // 直前にコマンドボタン(マップ上に浮かせた移動後メニュー等)が押されていたら、
      // その押下はボタンで消費済みとしてマップ操作(選択・移動取り消し)は行わない。
      if (this.pointerConsumedByButton) {
        this.pointerConsumedByButton = false;
        return;
      }
      // 右クリックは情報メニューの表示に使う(ドラッグ/マス選択の対象にはしない)
      if (pointer.rightButtonDown()) {
        this.showInfoMenuAtPointer(pointer);
        return;
      }
      // マップ表示領域(ビューポート)内で押し始めたときだけ、ドラッグ/クリックの対象にする。
      // 情報パネル側のボタンは各自の押下ハンドラで処理するため、ここでは扱わない。
      if (pointer.x >= this.viewWidth || pointer.y >= this.viewHeight) {
        return;
      }
      this.dragActive = true;
      this.isPanning = false;
      this.longPressFired = false;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      this.scrollStartX = this.cameras.main.scrollX;
      this.scrollStartY = this.cameras.main.scrollY;
      // タッチ端末の長押しを右クリック相当(情報メニュー表示)として扱うためのタイマー。
      // 一定時間、指が動かず押し続けられたら長押しと判定する。
      this.startLongPressTimer(pointer);
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      // マップ領域で押下中なら、移動量に応じてスクロール(スワイプ)する
      if (this.dragActive && pointer.isDown) {
        const dx = pointer.x - this.pointerDownX;
        const dy = pointer.y - this.pointerDownY;
        if (!this.isPanning && Math.hypot(dx, dy) > MainScene.DRAG_THRESHOLD) {
          this.isPanning = true;
          // スクロール(スワイプ)を始めたら長押し判定は取り消す
          this.cancelLongPressTimer();
          // スクロール開始時はホバー中の予測ポップアップを隠す
          this.hideForecastPopup();
        }
        if (this.isPanning) {
          // 押下点を掴んで動かす操作感にするため、移動量ぶんだけ逆向きにスクロールする。
          // カメラ境界(setBounds)により、マップ端を超えてスクロールすることはない。
          this.cameras.main.setScroll(this.scrollStartX - dx, this.scrollStartY - dy);
          return;
        }
      }
      // スクロール中でなければ、攻撃対象へのホバーでダメージ予測ポップアップを出す
      this.updateForecastPopup(pointer);
    });

    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const wasActive = this.dragActive;
      const wasPanning = this.isPanning;
      const wasLongPress = this.longPressFired;
      this.dragActive = false;
      this.isPanning = false;
      this.longPressFired = false;
      // 押下中に走らせていた長押しタイマーを止める(まだ発火していなければ取り消し)
      this.cancelLongPressTimer();
      if (this.gameOver || !wasActive) {
        return;
      }
      // 長押しで情報メニューを開いていたら、指を離したときのマス選択は行わない
      if (wasLongPress) {
        return;
      }
      // スクロール操作だった場合はマス選択を行わない
      if (wasPanning) {
        return;
      }
      // 指を離した位置がマップ表示領域の外(情報パネル側)なら無視する
      if (pointer.x >= this.viewWidth || pointer.y >= this.viewHeight) {
        return;
      }
      // カメラのスクロールを加味したワールド座標からマスを求める
      const pos = worldToGrid(pointer.worldX, pointer.worldY, TILE_SIZE);
      this.handleClick(pos);
    });
  }

  /**
   * タッチ長押し判定用のタイマーを開始する。
   * 一定時間、指が動かず(スクロールに転じず)押し続けられていて、かつタッチ入力なら、
   * 右クリック相当として情報メニューを表示する。以降のスクロール・クリックは抑止する。
   */
  private startLongPressTimer(pointer: Phaser.Input.Pointer): void {
    this.cancelLongPressTimer();
    this.longPressTimer = this.time.delayedCall(MainScene.LONG_PRESS_DELAY, () => {
      this.longPressTimer = null;
      // 押下が続いていて、スクロールに転じておらず、タッチ入力のときだけ長押しとして扱う。
      // (マウスの長押しは対象外。PC は右クリックで情報メニューを開く)
      if (this.gameOver || !this.dragActive || this.isPanning || !pointer.wasTouch) {
        return;
      }
      this.longPressFired = true;
      // 長押し後にそのまま指を動かしてもスクロールしないよう、ドラッグ受付を終了しておく
      this.dragActive = false;
      this.showInfoMenuAtPointer(pointer);
    });
  }

  /** 押下中の長押しタイマーを取り消す(発火前に指を離す・スクロールを始めたときなど) */
  private cancelLongPressTimer(): void {
    if (this.longPressTimer) {
      this.longPressTimer.remove(false);
      this.longPressTimer = null;
    }
  }

  /**
   * マスクリックを処理する。行動対象を選択中かどうかで挙動を分岐させる。
   * 0. 移動後のコマンド選択中の挙動:
   *    - 「攻撃」を押して攻撃対象の選択待ち中 → 赤枠の敵クリックで攻撃、それ以外はメニューへ戻る
   *    - メニュー表示中(攻撃未選択) → メニュー外のマスクリックで移動を取り消して元の位置へ戻す
   *      (待機はメニューのボタンで選ぶ)
   * 1. 行動対象を選択中で、クリック先が攻撃対象の敵 → 攻撃する
   * 2. 行動対象を選択中で、クリック先が移動可能範囲内(元居たマス自身を含む) → そのマスへ移動する
   *    (元居たマスを選ぶと「その場で待機」となり、移動後と同じコマンドメニューを出す)
   * 3. それ以外 → クリック先のマスを選択する(自軍の未行動ユニットなら行動対象にする)
   *
   * なお、右クリックによる情報メニュー表示中は、メニュー外のマスクリックでメニューを閉じる。
   */
  private handleClick(pos: GridPosition): void {
    const tile = this.map.getTile(pos);
    if (!tile) {
      return;
    }

    // 右クリックの情報メニュー表示中は、メニュー外のマスを押すとメニューを閉じる
    if (this.infoMenuOpen) {
      this.closeInfoMenu();
      return;
    }

    // 移動後のコマンド選択中はメニューの状態で分岐する。
    if (this.commandUnit) {
      // 「攻撃」を選んで攻撃対象の選択待ち中の挙動:
      //  - 赤枠の敵(射程内)をクリック → 攻撃する
      //  - 射程外の敵をクリック → 攻撃できないので「操作不能」の音を鳴らして選択を続ける
      //  - 空きマスをクリック → 攻撃を取りやめ、コマンドメニューへ戻る
      if (this.awaitingAttackTarget) {
        const target = this.attackTargets.find((t) => equals(t.position, pos));
        if (target) {
          this.attackTarget(target);
          return;
        }
        // 射程外の敵を選んだときは「攻撃できない」と分かるように音で知らせる
        const other = this.units.getUnitAt(pos);
        if (other && other.armyType !== this.commandUnit.armyType) {
          this.audio.playSfx('denied');
          return;
        }
        this.showPostMoveMenu();
        return;
      }
      // メニュー表示中(攻撃未選択)にメニュー外のマスを押したら、移動を取り消して
      // ユニットを移動前の位置へ戻す。誤操作で待機が確定してしまうのを避けるため、
      // 行動の確定(待機・攻撃・占領)はメニューのボタンからのみ行う。
      this.cancelMove();
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
      // 移動可能範囲内(元居たマス自身も含む)をクリックしたらそのマスへ移動する。
      // 元居たマスを選んだ場合は「その場で待機」に相当し、移動後と同じコマンドメニュー
      // (攻撃 / 占領 / 待機)を出す。
      if (this.movementRange?.canReach(pos)) {
        this.moveSelectedUnit(pos, tile);
        return;
      }
      // 範囲外クリックはいったん選択解除し、通常選択に切り替える
      this.clearSelection();
    }

    this.selectTile(pos, tile);
  }

  /**
   * ポインタ位置が「何もないマス(ユニットのいないマス)」なら情報メニューを表示する。
   * PC の右クリックと、タッチ端末の長押しの両方から呼ばれる。
   * ビューポート外(情報パネル側)やマップ外、ユニットのいるマスでは何もしない。
   */
  private showInfoMenuAtPointer(pointer: Phaser.Input.Pointer): void {
    // 情報パネル側(ビューポート外)の右クリックは扱わない
    if (pointer.x >= this.viewWidth || pointer.y >= this.viewHeight) {
      return;
    }
    // カメラのスクロールを加味したワールド座標からマスを求める
    const pos = worldToGrid(pointer.worldX, pointer.worldY, TILE_SIZE);
    const tile = this.map.getTile(pos);
    if (!tile) {
      return;
    }
    // 「何もない場所」= ユニットのいないマスのときだけメニューを出す
    if (this.units.getUnitAt(pos)) {
      return;
    }
    this.audio.playSfx('select');
    this.showInfoMenu(pos);
  }

  /**
   * 右クリックしたマスの近くに情報メニュー(ユニット説明 / 操作 / 地形効果)を表示する。
   * 表示位置は移動後コマンドメニューと同じ算出(マスの右隣、はみ出すなら左隣)を使う。
   * 各項目の画面は今後実装するため、現時点では項目を押すとメニューを閉じる。
   */
  private showInfoMenu(pos: GridPosition): void {
    // 進行中の選択・コマンド状態を一度クリアしてからメニューを開く
    this.resetSelection();
    this.infoMenuOpen = true;
    this.selected = pos;
    this.drawSelectionHighlight(pos);

    const anchor = this.commandMenuAnchor(pos, INFO_MENU_ITEMS.length);
    INFO_MENU_ITEMS.forEach((label, index) => {
      this.addActionButton(
        index,
        label,
        true,
        () => this.selectInfoMenuItem(label),
        anchor,
      );
    });
    this.infoText.setText('情報メニュー');
  }

  /**
   * 情報メニューの項目が選ばれたときの処理。
   * 各画面は今後実装する。現時点ではメニューを閉じ、選んだ項目名を表示するだけにとどめる。
   */
  private selectInfoMenuItem(label: string): void {
    this.audio.playSfx('button');
    this.closeInfoMenu();
    this.infoText.setText([label, '(準備中)']);
  }

  /** 情報メニューを閉じ、ハイライト・ボタンを片付ける */
  private closeInfoMenu(): void {
    this.infoMenuOpen = false;
    this.selected = null;
    this.clearActionButtons();
    this.highlight.setVisible(false);
    this.infoText.setText('マスを選択してください');
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
      // 占領は移動先(元居たマスを含む)を選んだあとのコマンドメニューから行う。
      // 情報パネルに占領ボタンは出さない。
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

    // メニュー外クリックで移動を取り消せるよう、移動前の位置を控えておく
    const origin = unit.position;
    this.units.moveUnit(unit, pos, { markActed: false });
    this.audio.playSfx('move');
    this.drawUnits();
    this.enterPostMoveCommand(unit, tile, origin);
  }

  /**
   * 移動後のコマンド選択に入る。
   * 攻撃・占領の可否にかかわらず、必ずコマンドメニューを表示する。
   * これにより、攻撃も占領もできない移動先でも「待機」を明示的に選ぶことになり、
   * 誤って移動しただけで行動が確定してしまうのを防ぐ(メニュー外クリックで取り消しもできる)。
   * ただし間接攻撃(遠距離)ユニットは移動後は攻撃できず、その場からのみ攻撃できる。
   * 自走砲などの間接攻撃ユニットも、移動せず元居たマスに留まった場合は射程内の敵を攻撃できる。
   */
  private enterPostMoveCommand(unit: Unit, tile: TileData, origin: GridPosition): void {
    // 直接攻撃ユニットは移動先から攻撃できる。
    // 間接攻撃ユニットは移動後は攻撃できないが、移動せず元居たマスに留まったときだけ
    // その場から射程内の敵を攻撃できる(自走砲などが動かず撃てるように)。
    const canAttackHere = !unit.isIndirect || equals(unit.position, origin);
    const targets = canAttackHere ? findAttackableTargets(unit, this.units) : [];

    // コマンド選択状態へ移行する。移動範囲は消し、攻撃対象はメニューを介して確定させる
    this.movingUnit = null;
    this.movementRange = null;
    this.rangeGraphics.clear();

    this.commandUnit = unit;
    this.commandTile = tile;
    this.commandOrigin = origin;
    this.pendingAttackTargets = targets;
    this.showPostMoveMenu();
  }

  /**
   * 移動後のコマンドメニュー(攻撃 / 占領 / 待機)を、移動先のマスの近くに縦に並べて表示する。
   * 「攻撃」は射程内に敵がいるときだけ、「占領」は占領できる拠点のときだけ出す。
   * 「待機」は常に出し、攻撃も占領もできない移動先でも待機を選べるようにする。
   * メニュー外のマスを押すと移動が取り消され、ユニットは移動前の位置へ戻る。
   * この段階では攻撃対象のクリックは受け付けず、「攻撃」を押して初めて対象選択に移る。
   */
  private showPostMoveMenu(): void {
    const unit = this.commandUnit;
    const tile = this.commandTile;
    if (!unit || !tile) {
      return;
    }
    // メニュー表示中は攻撃対象クリックを受け付けない(攻撃はメニューの「攻撃」から始める)
    this.awaitingAttackTarget = false;
    this.attackTargets = [];
    this.rangeGraphics.clear();
    this.hideForecastPopup();
    this.clearActionButtons();

    this.selected = unit.position;
    this.drawSelectionHighlight(unit.position);

    // 表示するボタンを先に決め、その数からメニューの表示位置(マスの近く)を求める
    const buttons: Array<{ label: string; onClick: () => void }> = [];
    const info: string[] = ['コマンド選択', unit.unitName];
    if (this.pendingAttackTargets.length > 0) {
      info.push('攻撃: 射程内に敵');
      buttons.push({ label: '攻撃', onClick: () => this.enterAttackSelection() });
    }
    if (this.canOfferCapture(unit, tile)) {
      // 別の軍が占領を進めていた拠点は初期値へ戻してから占領するため、
      // この軍が実際に減らし始める耐久値(実効値)を表示する
      info.push(`占領耐久: ${this.capture.effectiveCaptureHp(unit, tile)}`);
      buttons.push({ label: '占領する', onClick: () => this.executeCapture(unit, tile) });
    }
    // 待機は常に選べるようにする(メニュー外クリックで移動を取り消せる)
    buttons.push({ label: '待機', onClick: () => this.commitWait() });

    const anchor = this.commandMenuAnchor(unit.position, buttons.length);
    buttons.forEach((button, index) => {
      this.addActionButton(index, button.label, true, button.onClick, anchor);
    });
    this.infoText.setText(info);
  }

  /**
   * 移動後メニューを移動先マスの近くに表示するための、ボタン群の左上スクリーン座標を求める。
   * 既定ではマスの右隣に置き、右へはみ出す場合は左隣へ回す。
   * 縦はマス上端に合わせつつ、メニュー全体がビューポート内に収まるよう clamp する。
   */
  private commandMenuAnchor(
    pos: GridPosition,
    buttonCount: number,
  ): { x: number; y: number } {
    const camera = this.cameras.main;
    const world = gridToWorld(pos, TILE_SIZE);
    // カメラのスクロールを差し引いてスクリーン座標(固定表示のボタン基準)に変換する
    const screenX = world.x - camera.scrollX;
    const screenY = world.y - camera.scrollY;
    const menuHeight =
      buttonCount * ACTION_BUTTON_HEIGHT + (buttonCount - 1) * ACTION_BUTTON_GAP;

    // 既定はマスの右隣。ビューポート右端を超えるなら左隣へ置く
    let x = screenX + TILE_SIZE + MENU_MARGIN;
    if (x + MENU_BUTTON_WIDTH > this.viewWidth - MENU_MARGIN) {
      x = screenX - MENU_BUTTON_WIDTH - MENU_MARGIN;
    }
    x = Math.max(
      MENU_MARGIN,
      Math.min(x, this.viewWidth - MENU_BUTTON_WIDTH - MENU_MARGIN),
    );

    let y = screenY;
    y = Math.max(MENU_MARGIN, Math.min(y, this.viewHeight - menuHeight - MENU_MARGIN));
    return { x, y };
  }

  /**
   * 移動を取り消して、ユニットを移動前の位置へ戻す。
   * 行動済みにはせず、移動前の選択状態(移動範囲の表示)に戻して移動先を選び直せるようにする。
   * 移動先を誤って押してしまったときの取り消し手段で、コマンドメニュー外のマスを押すと呼ばれる。
   */
  private cancelMove(): void {
    const unit = this.commandUnit;
    const origin = this.commandOrigin;
    if (!unit || !origin) {
      return;
    }
    this.audio.playSfx('button');
    // 移動を巻き戻す(行動済みにはしない)
    this.units.moveUnit(unit, origin, { markActed: false });
    this.drawUnits();

    // 選択状態を一度クリアしてから、移動前のマスを選び直して移動範囲を再表示する
    const tile = this.map.getTile(origin);
    this.resetSelection();
    if (tile) {
      this.selectTile(origin, tile);
    } else {
      this.infoText.setText('マスを選択してください');
    }
  }

  /**
   * コマンドメニューで「攻撃」を選んだときの、攻撃対象の選択に移る。
   * 射程内の敵を赤枠で示してクリック待ちにする。コマンドメニュー(待機ボタン)は
   * いったん閉じ、攻撃対象の選択と移動メニューが同時に出ないようにする。
   * 攻撃可能な敵が 1 体だけなら自動でロックオンして戦闘予測を表示する。
   * 攻撃対象以外(範囲外の敵・空きマス)をクリックしたときの挙動は handleClick で扱う。
   */
  private enterAttackSelection(): void {
    const unit = this.commandUnit;
    if (!unit || this.pendingAttackTargets.length === 0) {
      return;
    }
    this.audio.playSfx('select');
    this.awaitingAttackTarget = true;
    this.attackTargets = this.pendingAttackTargets;
    // 待機ボタンなどのコマンドメニューを閉じ、攻撃対象の選択だけに集中させる
    this.clearActionButtons();
    this.drawSelectionHighlight(unit.position);
    this.drawAttackTargets(this.attackTargets);
    // 攻撃対象が 1 体だけならその敵を自動ロックオンし、戦闘予測を先に見せる
    if (this.attackTargets.length === 1) {
      this.forecastTarget = this.attackTargets[0];
      this.showForecastPopup(unit, this.attackTargets[0]);
    }
    this.infoText.setText([
      '攻撃対象を選択',
      unit.unitName,
      '赤枠の敵をクリック',
      '空きマスで取り消し',
    ]);
  }

  /** unit が(移動後に)tile を占領できる状況か(占領能力・占領地形・非自軍所有) */
  private canOfferCapture(unit: Unit, tile: TileData): boolean {
    return (
      unit.canCapture &&
      getTerrainData(tile.terrainType).canCapture &&
      tile.owner !== unit.armyType
    );
  }

  /** 移動後コマンドのユニットを待機として確定する */
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

    // 画面全体を暗くする半透明オーバーレイ(マップスクロールに追従せず画面へ固定する)
    const overlay = this.add.graphics().setScrollFactor(0);
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, this.gameWidth, this.gameHeight);

    const centerX = this.gameWidth / 2;
    const centerY = this.gameHeight / 2;

    // 見出し(勝利は金色、敗北は赤色)
    this.add
      .text(centerX, centerY - 24, message.title, {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: isVictory ? '#ffd479' : '#ff6a6a',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // 決着理由の説明
    this.add
      .text(centerX, centerY + 28, message.detail, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // マップ選択画面へ戻るボタン(もう一度別のマップを遊べるようにする)
    const btnWidth = 220;
    const btnHeight = 44;
    const btnX = centerX - btnWidth / 2;
    const btnY = centerY + 72;
    const button = this.add
      .rectangle(btnX, btnY, btnWidth, btnHeight, 0x2f5fae)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(2, 0x8ad0ff)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(centerX, btnY + btnHeight / 2, 'マップ選択へ戻る', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);
    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.audio.stopBgm();
      this.scene.start('MapSelectScene');
    });
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
      // ユニット情報と併記すると行数が多くなり、占領耐久などが下部のボタンに
      // 隠れてしまうため、地形情報は簡略表示にして重要な行を残す
      return [...formatUnitInfo(unit), '', ...formatTerrainInfo(tile, { compact: true })];
    }
    return formatTerrainInfo(tile);
  }

  /**
   * 占領・生産コマンドのボタンを 1 つ追加する(無効時はグレー表示)。
   * anchor を渡すとその左上スクリーン座標を基準にマップ上へ浮かせて表示し(移動後メニュー用)、
   * 省略すると従来どおり情報パネル内に縦積みで表示する。
   */
  private addActionButton(
    index: number,
    label: string,
    enabled: boolean,
    onClick: () => void,
    anchor?: { x: number; y: number },
  ): void {
    const width = anchor ? MENU_BUTTON_WIDTH : INFO_PANEL_WIDTH - 24;
    const baseX = anchor ? anchor.x : this.viewWidth + 12;
    const baseY = anchor ? anchor.y : ACTION_BUTTON_TOP;
    const x = baseX;
    const y = baseY + index * (ACTION_BUTTON_HEIGHT + ACTION_BUTTON_GAP);

    const fill = enabled ? 0x2f7f4f : 0x3a3a44;
    const stroke = enabled ? 0x8affb0 : 0x666666;
    const rect = this.add
      .rectangle(x, y, width, ACTION_BUTTON_HEIGHT, fill)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(2, stroke);

    const text = this.add
      .text(x + width / 2, y + ACTION_BUTTON_HEIGHT / 2, label, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: enabled ? '#ffffff' : '#999999',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // マップ上に浮かせるメニューはユニット等より手前に描く
    if (anchor) {
      rect.setDepth(MENU_DEPTH);
      text.setDepth(MENU_DEPTH);
    }

    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on(Phaser.Input.Events.POINTER_DOWN, () => {
        // マップ上のメニューはマップ表示領域と重なるため、この押下がマス選択として
        // 二重に処理されないよう、直後のマップ押下判定を 1 回だけ抑止する。
        this.pointerConsumedByButton = true;
        onClick();
      });
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
    this.commandTile = null;
    this.commandOrigin = null;
    this.pendingAttackTargets = [];
    this.awaitingAttackTarget = false;
    this.infoMenuOpen = false;
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
