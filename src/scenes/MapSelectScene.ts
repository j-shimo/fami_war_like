import Phaser from 'phaser';
import { matchesMap, type SaveData } from '@/core/save/SaveData';
import { clearSuspendData, readSuspendData } from '@/core/save/SaveStorage';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { INITIAL_FUNDS } from '@/data/economyConfig';
import { MAP_LIST, type MapEntry } from '@/data/maps';
import { ConfirmWindow } from '@/rendering/ConfirmWindow';

/** 選択画面のカードの寸法・間隔 */
const CARD_MARGIN_X = 40;
const CARD_TOP = 96;
const CARD_HEIGHT = 84;
const CARD_GAP = 16;

/**
 * インゲームの前段階に表示するマップ選択画面。
 * 登録済みマップ(MAP_LIST)をカードとして縦に並べ、
 * クリックすると選んだマップを MainScene へ渡してゲームを開始する。
 * 選んだマップの中断データが残っている場合は、再開するかどうかを確認ダイアログで尋ね、
 * 「はい」なら中断データから再開し、「いいえ」なら中断データを破棄して新規に開始する。
 */
export class MapSelectScene extends Phaser.Scene {
  /** 中断データの再開確認に使うダイアログ(初回オープン時に生成) */
  private confirmWindow: ConfirmWindow | null = null;
  /** 画面表示時点の中断データ(なければ null)。カードの「中断データあり」表示にも使う */
  private suspendData: SaveData | null = null;

  constructor() {
    super('MapSelectScene');
  }

  create(): void {
    // 保存済みの中断データを読み込む(壊れていた場合は null になり、新規開始の扱いになる)
    this.suspendData = readSuspendData();
    this.confirmWindow = null;
    // 直前に大きなマップを遊んでいた場合に備え、選択画面用の寸法へ戻す
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);

    const width = DEFAULT_DIMENSIONS.gameWidth;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, DEFAULT_DIMENSIONS.gameHeight);

    // タイトル
    this.add
      .text(width / 2, 36, 'マップを選択', {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 68, '遊ぶマップを選んでください', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // ゲーム説明ボタン(右上)。押すとゲームの流れを紹介する GuideScene を開く
    this.createGuideButton(width);

    MAP_LIST.forEach((entry, index) => {
      this.createMapCard(entry, index, width);
    });
  }

  /** ゲームの流れを説明する画面(GuideScene)へ移動するボタンを右上に置く */
  private createGuideButton(width: number): void {
    const w = 108;
    const h = 30;
    const cx = width - w / 2 - 12;
    const cy = 24;

    const button = this.add
      .rectangle(cx, cy, w, h, 0x1f2740)
      .setStrokeStyle(2, 0x3a4a6a)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, '❔ ゲーム説明', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);

    button.on(Phaser.Input.Events.POINTER_OVER, () => {
      button.setStrokeStyle(2, 0x8ad0ff);
      button.setFillStyle(0x263255);
    });
    button.on(Phaser.Input.Events.POINTER_OUT, () => {
      button.setStrokeStyle(2, 0x3a4a6a);
      button.setFillStyle(0x1f2740);
    });
    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.scene.start('GuideScene');
    });
  }

  /** マップ 1 枚ぶんの選択カードを作成する */
  private createMapCard(entry: MapEntry, index: number, width: number): void {
    const x = CARD_MARGIN_X;
    const y = CARD_TOP + index * (CARD_HEIGHT + CARD_GAP);
    const cardWidth = width - CARD_MARGIN_X * 2;

    const rows = entry.definition.terrain.length;
    const cols = entry.definition.terrain[0]?.length ?? 0;

    const card = this.add
      .rectangle(x, y, cardWidth, CARD_HEIGHT, 0x1f2740)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x3a4a6a)
      .setInteractive({ useHandCursor: true });

    // マップ名
    this.add.text(x + 16, y + 12, entry.definition.name, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    });

    // サイズ表記(横×縦)
    this.add.text(x + 16, y + 38, `サイズ: 横${cols} × 縦${rows}`, {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffe08a',
    });

    // 初期軍資金(マップ個別指定がなければ economyConfig の既定値)。
    // マップごとに序盤のテンポが違うため、選ぶ前に把握できるようにする。
    const initialFunds = entry.definition.initialFunds ?? INITIAL_FUNDS;
    this.add
      .text(x + cardWidth - 16, y + 38, `初期軍資金: ${initialFunds.toLocaleString()}`, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#8affc0',
      })
      .setOrigin(1, 0);

    // 1 行説明
    this.add.text(x + 16, y + 58, entry.description, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: '#c8c8d8',
      wordWrap: { width: cardWidth - 32 },
    });

    // ホバーで枠を強調する
    card.on(Phaser.Input.Events.POINTER_OVER, () => {
      card.setStrokeStyle(2, 0x8ad0ff);
      card.setFillStyle(0x263255);
    });
    card.on(Phaser.Input.Events.POINTER_OUT, () => {
      card.setStrokeStyle(2, 0x3a4a6a);
      card.setFillStyle(0x1f2740);
    });
    card.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.selectMap(entry);
    });

    // このマップの中断データが残っていることをカード右上に示す
    if (this.savedDataFor(entry)) {
      this.add
        .text(x + cardWidth - 16, y + 12, '中断データあり', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: '#ffd479',
        })
        .setOrigin(1, 0);
    }
  }

  /** 指定マップで再開できる中断データがあれば返す。なければ null */
  private savedDataFor(entry: MapEntry): SaveData | null {
    const save = this.suspendData;
    if (save && matchesMap(save, entry.id, entry.definition)) {
      return save;
    }
    return null;
  }

  /**
   * マップが選ばれたときの処理。
   * 中断データがあれば再開するか確認し、なければそのまま新規ゲームを始める。
   */
  private selectMap(entry: MapEntry): void {
    const save = this.savedDataFor(entry);
    if (!save) {
      this.startGame(entry);
      return;
    }

    this.confirmWindow ??= new ConfirmWindow(this);
    this.confirmWindow.open({
      gameWidth: DEFAULT_DIMENSIONS.gameWidth,
      gameHeight: DEFAULT_DIMENSIONS.gameHeight,
      viewWidth: DEFAULT_DIMENSIONS.gameWidth,
      viewHeight: DEFAULT_DIMENSIONS.gameHeight,
      title: '中断データ',
      message: '中断データがあります。再開しますか?',
      onYes: () => this.startGame(entry, save),
      onNo: () => {
        // 再開しないと決めたので中断データは破棄し、新規ゲームとして始める
        clearSuspendData();
        this.suspendData = null;
        this.startGame(entry);
      },
    });
  }

  /** 選んだマップでゲームを開始する。save を渡すとその中断データから再開する */
  private startGame(entry: MapEntry, save?: SaveData): void {
    this.scene.start('MainScene', {
      map: entry.definition,
      mapId: entry.id,
      save,
    });
  }
}
