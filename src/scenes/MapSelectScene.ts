import Phaser from 'phaser';
import { matchesMap, type SaveData } from '@/core/save/SaveData';
import { clearSuspendData, readSuspendData } from '@/core/save/SaveStorage';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { INITIAL_FUNDS } from '@/data/economyConfig';
import { MAP_LIST, type MapEntry } from '@/data/maps';
import { ConfirmWindow } from '@/rendering/ConfirmWindow';
import { clampScrollOffset, scrollbarMetrics } from '@/ui/listScroll';

/** 選択画面のカードの寸法・間隔 */
const CARD_MARGIN_X = 40;
const CARD_TOP = 96;
// カードの高さ。説明文が 2 行に折り返しても収まる高さにしてある
const CARD_HEIGHT = 96;
const CARD_GAP = 16;
/** カード一覧の表示領域の下端に空ける余白 */
const LIST_BOTTOM_MARGIN = 12;
/** スクロールバー(画面右端)の幅と余白 */
const SCROLLBAR_WIDTH = 4;
const SCROLLBAR_MARGIN = 8;
/** ホイール 1 ノッチあたりのスクロール量(px) */
const WHEEL_SCROLL_STEP = 0.5;

/**
 * インゲームの前段階に表示するマップ選択画面。
 * 登録済みマップ(MAP_LIST)をカードとして縦に並べ、
 * クリックすると選んだマップを MainScene へ渡してゲームを開始する。
 * 選んだマップの中断データが残っている場合は、再開するかどうかを確認ダイアログで尋ね、
 * 「はい」なら中断データから再開し、「いいえ」なら中断データを破棄して新規に開始する。
 */
export class MapSelectScene extends Phaser.Scene {
  /** ドラッグ(スワイプ)をクリックと区別するための移動量しきい値(画面ピクセル) */
  private static readonly DRAG_THRESHOLD = 8;

  /** 中断データの再開確認に使うダイアログ(初回オープン時に生成) */
  private confirmWindow: ConfirmWindow | null = null;
  /** 画面表示時点の中断データ(なければ null)。カードの「中断データあり」表示にも使う */
  private suspendData: SaveData | null = null;
  /** カードをまとめて動かすためのコンテナ(これを上下に動かしてスクロールする) */
  private cardLayer!: Phaser.GameObjects.Container;
  /** スクロールバーの描画先 */
  private scrollbar!: Phaser.GameObjects.Graphics;
  /** カード一覧の表示領域の高さ */
  private viewportHeight = 0;
  /** カード一覧全体の高さ */
  private contentHeight = 0;
  /** 現在のスクロール量(0 が先頭。下へスクロールするほど負) */
  private scrollOffset = 0;
  /** ドラッグ開始時のスクロール量と押下位置 */
  private dragStartOffset = 0;
  private pointerDownY = 0;
  /** 一覧の上で押下中か(押し始めが一覧の外ならスクロールしない) */
  private dragActive = false;
  /** しきい値を超えて動かした(= スクロール操作でありクリックではない)か */
  private isPanning = false;
  /** 押し始めたカード。指を離したカードと一致するときだけ選択として扱う */
  private pressedEntry: MapEntry | null = null;

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

    // カード一覧はマップが増えると画面に収まらなくなるため、
    // コンテナへまとめてドラッグ(スワイプ)・ホイールでスクロールできるようにする。
    this.viewportHeight = DEFAULT_DIMENSIONS.gameHeight - CARD_TOP - LIST_BOTTOM_MARGIN;
    this.contentHeight =
      MAP_LIST.length * (CARD_HEIGHT + CARD_GAP) - (MAP_LIST.length > 0 ? CARD_GAP : 0);
    this.scrollOffset = 0;
    this.dragActive = false;
    this.isPanning = false;
    this.pressedEntry = null;

    this.cardLayer = this.add.container(0, 0);
    // 表示領域の外(タイトル側・画面下端)へカードがはみ出して見えないよう切り抜く
    const maskShape = this.make.graphics({}, false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(0, CARD_TOP, width, this.viewportHeight);
    this.cardLayer.setMask(maskShape.createGeometryMask());

    MAP_LIST.forEach((entry, index) => {
      this.createMapCard(entry, index, width);
    });

    this.scrollbar = this.add.graphics();
    this.drawScrollbar(width);
    this.setupScrollInput(width);
  }

  /**
   * カード一覧のスクロール操作(ドラッグ・スワイプ・ホイール)を設定する。
   * わずかな移動はカードのクリックとして扱い、しきい値を超えて動いた場合だけ
   * スクロールと見なして選択は行わない(MainScene のマップスクロールと同じ操作感)。
   */
  private setupScrollInput(width: number): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 確認ダイアログ表示中はダイアログ側が入力を処理する
      if (this.confirmWindow?.isOpen()) {
        return;
      }
      // 一覧の表示領域内で押し始めたときだけドラッグの対象にする
      if (!this.isInsideList(pointer)) {
        return;
      }
      this.dragActive = true;
      this.isPanning = false;
      this.pointerDownY = pointer.y;
      this.dragStartOffset = this.scrollOffset;
    });

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!this.dragActive || !pointer.isDown) {
        return;
      }
      const dy = pointer.y - this.pointerDownY;
      if (!this.isPanning && Math.abs(dy) > MapSelectScene.DRAG_THRESHOLD) {
        this.isPanning = true;
      }
      if (this.isPanning) {
        // 押下点を掴んで動かす操作感にするため、指の移動量ぶんだけ一覧を動かす
        this.setScrollOffset(this.dragStartOffset + dy, width);
      }
    });

    const endDrag = (): void => {
      this.dragActive = false;
      // カード側の pointerup はこの前に呼ばれるため、ここで判定用の状態を片付ける
      this.isPanning = false;
      this.pressedEntry = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, endDrag);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, endDrag);

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        if (this.confirmWindow?.isOpen()) {
          return;
        }
        this.setScrollOffset(this.scrollOffset - dy * WHEEL_SCROLL_STEP, width);
      },
    );
  }

  /** ポインタがカード一覧の表示領域内にあるか */
  private isInsideList(pointer: Phaser.Input.Pointer): boolean {
    return pointer.y >= CARD_TOP && pointer.y <= CARD_TOP + this.viewportHeight;
  }

  /** スクロール量を範囲内に丸めて反映し、スクロールバーも描き直す */
  private setScrollOffset(offset: number, width: number): void {
    const clamped = clampScrollOffset(offset, this.contentHeight, this.viewportHeight);
    if (clamped === this.scrollOffset) {
      return;
    }
    this.scrollOffset = clamped;
    this.cardLayer.setY(clamped);
    this.drawScrollbar(width);
  }

  /** 画面右端のスクロールバーを描く。スクロール不要なら何も描かない */
  private drawScrollbar(width: number): void {
    this.scrollbar.clear();
    const metrics = scrollbarMetrics(
      this.scrollOffset,
      this.contentHeight,
      this.viewportHeight,
    );
    if (!metrics) {
      return;
    }
    const x = width - SCROLLBAR_MARGIN - SCROLLBAR_WIDTH;
    // 溝(全体の長さ)を薄く、つまみ(見えている範囲)を明るく描く
    this.scrollbar.fillStyle(0x2a3350, 1);
    this.scrollbar.fillRect(x, CARD_TOP, SCROLLBAR_WIDTH, this.viewportHeight);
    this.scrollbar.fillStyle(0x8ad0ff, 1);
    this.scrollbar.fillRect(
      x,
      CARD_TOP + metrics.thumbTop,
      SCROLLBAR_WIDTH,
      metrics.thumbHeight,
    );
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

  /**
   * マップ 1 枚ぶんの選択カードを作成し、スクロールするコンテナへ入れる。
   * カードの確定は指を離したときに行い、しきい値を超えて動かした場合(スクロール操作)は
   * 選択しない。押し始めたカードと離したカードが違う場合も選択しない。
   */
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
    this.cardLayer.add(card);

    // マップ名
    this.cardLayer.add(
      this.add.text(x + 16, y + 12, entry.definition.name, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#ffffff',
      }),
    );

    // サイズ表記(横×縦)
    this.cardLayer.add(
      this.add.text(x + 16, y + 38, `サイズ: 横${cols} × 縦${rows}`, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#ffe08a',
      }),
    );

    // 初期軍資金(マップ個別指定がなければ economyConfig の既定値)。
    // マップごとに序盤のテンポが違うため、選ぶ前に把握できるようにする。
    const initialFunds = entry.definition.initialFunds ?? INITIAL_FUNDS;
    this.cardLayer.add(
      this.add
        .text(
          x + cardWidth - 16,
          y + 38,
          `初期軍資金: ${initialFunds.toLocaleString()}`,
          {
            fontFamily: 'sans-serif',
            fontSize: '13px',
            color: '#8affc0',
          },
        )
        .setOrigin(1, 0),
    );

    // 1 行説明
    this.cardLayer.add(
      this.add.text(x + 16, y + 58, entry.description, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#c8c8d8',
        wordWrap: { width: cardWidth - 32 },
      }),
    );

    // ホバーで枠を強調する
    card.on(Phaser.Input.Events.POINTER_OVER, () => {
      card.setStrokeStyle(2, 0x8ad0ff);
      card.setFillStyle(0x263255);
    });
    card.on(Phaser.Input.Events.POINTER_OUT, () => {
      card.setStrokeStyle(2, 0x3a4a6a);
      card.setFillStyle(0x1f2740);
    });
    card.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 一覧の外(切り抜かれて見えていない部分)の押下は無視する
      this.pressedEntry = this.isInsideList(pointer) ? entry : null;
    });
    card.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const pressed = this.pressedEntry;
      this.pressedEntry = null;
      // スクロール操作だった場合や、押し始めが別のカード・一覧の外だった場合は選択しない
      if (this.isPanning || pressed !== entry || !this.isInsideList(pointer)) {
        return;
      }
      this.selectMap(entry);
    });

    // このマップの中断データが残っていることをカード右上に示す
    if (this.savedDataFor(entry)) {
      this.cardLayer.add(
        this.add
          .text(x + cardWidth - 16, y + 12, '中断データあり', {
            fontFamily: 'sans-serif',
            fontSize: '12px',
            fontStyle: 'bold',
            color: '#ffd479',
          })
          .setOrigin(1, 0),
      );
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
