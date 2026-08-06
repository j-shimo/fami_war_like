// 生産ウィンドウ(工場・本拠地の「生産」コマンドで開くユニット選択画面)。
// 各行に ①ユニットアイコン ②ユニット名 ③料金 を表示し、
// 表示範囲を超えるぶんは上下スクロール(ホイール・ドラッグ)で見られるようにする。
// 純粋なゲームロジックではなく Phaser の描画・入力を扱うため rendering/ に置く。
// 資金判定や生産の実行そのものは呼び出し側(MainScene)が担い、
// このウィンドウは「一覧の表示」と「行の選択・スクロール・閉じる」だけを受け持つ。

import Phaser from 'phaser';

import type { UnitType } from '@/core/units/UnitType';
import { drawUnitIcon } from '@/rendering/unitIcon';

/** 生産ウィンドウに表示する 1 行ぶんのデータ */
export interface ProductionWindowItem {
  readonly unitType: UnitType;
  /** 表示名(日本語) */
  readonly unitName: string;
  /** 料金(生産コスト) */
  readonly cost: number;
  /** 資金が足りて生産できるか(不足ならグレー表示で選択不可) */
  readonly affordable: boolean;
}

/** ウィンドウを開くときの設定 */
export interface ProductionWindowConfig {
  /** 画面全体(ビューポート + 情報パネル)のピクセル幅・高さ(背景の暗幕用) */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** マップ表示領域(ビューポート)のピクセル幅・高さ(ウィンドウはこの中央に置く) */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** 並べるユニット一覧(表示順) */
  readonly items: readonly ProductionWindowItem[];
  /** アイコンの軍色トークン(円)の色 */
  readonly tokenColor: number;
  /** 行が選ばれたときの通知(生産可能な行のみ呼ばれる) */
  readonly onSelect: (unitType: UnitType) => void;
  /** 暗幕や × でウィンドウが閉じられたときの通知 */
  readonly onClose: () => void;
}

/** ウィンドウの幅(ピクセル) */
const WIN_WIDTH = 264;
/** タイトルバーの高さ */
const TITLE_HEIGHT = 34;
/** 1 行の高さ */
const ROW_HEIGHT = 48;
/** 一度に見せる最大行数(これを超えるとスクロールになる) */
const MAX_VISIBLE_ROWS = 4;
/** 行内の左右余白 */
const ROW_PADDING = 12;
/** アイコン(軍色トークン)の半径 */
const ICON_RADIUS = 15;
/** ドラッグとタップを区別する移動量のしきい値(ピクセル) */
const DRAG_THRESHOLD = 6;
/** ウィンドウの描画深度(移動後メニュー・予測ポップアップ・手番バナーより手前) */
const WINDOW_DEPTH = 300;

/** 色(タイトル・枠・文字など) */
const COLOR = {
  backdrop: 0x000000,
  panel: 0x1a1a2b,
  panelStroke: 0x8ad0ff,
  title: 0x8ad0ff,
  rowEven: 0x222236,
  rowOdd: 0x1c1c2e,
  rowDisabled: 0x2a2a30,
  separator: 0x33334a,
  name: '#ffffff',
  nameDisabled: '#888888',
  cost: '#ffe08a',
  costDisabled: '#8a7f5a',
  icon: 0xffffff,
  scrollTrack: 0x333348,
  scrollThumb: 0x8ad0ff,
} as const;

/**
 * 生産ウィンドウ。open() で表示し、close() で片付ける。
 * 1 度作れば使い回せるよう、表示のたびに Phaser オブジェクトを作り直す。
 */
export class ProductionWindow {
  private config: ProductionWindowConfig | null = null;
  private opened = false;

  /** 生成した Phaser オブジェクト(閉じるときにまとめて破棄する) */
  private objects: Phaser.GameObjects.GameObject[] = [];
  /** 行をまとめるコンテナ(スクロールで上下に動かす。マスクで表示範囲を切り取る) */
  private content: Phaser.GameObjects.Container | null = null;
  /** スクロールつまみの描画用グラフィックス(オーバーフロー時のみ) */
  private scrollbar: Phaser.GameObjects.Graphics | null = null;

  /** ウィンドウのスクリーン座標(カメラスクロールを差し引いた固定位置) */
  private winScreenX = 0;
  private winScreenY = 0;
  /** 一覧(スクロール領域)の高さと、行全体の高さ */
  private listHeight = 0;
  private totalHeight = 0;
  /** 現在のスクロール量(0〜minOffset の範囲。上に行くほど負) */
  private offset = 0;
  private minOffset = 0;

  /**
   * ウィンドウを開いたクリックの「離し(pointerup)」を 1 回だけ無視するフラグ。
   * 「生産」コマンドのボタン(ウィンドウ外)を押した離しが、ウィンドウ外タップ=閉じる
   * と誤判定されて即座に閉じてしまうのを防ぐ。開いた直後の最初の up でだけ立てておく。
   */
  private ignoreNextUp = false;
  /** ドラッグ判定用の押下開始情報 */
  private pointerActive = false;
  private dragging = false;
  private downX = 0;
  private downY = 0;
  private downOffset = 0;

  private readonly onPointerDown = (p: Phaser.Input.Pointer) => this.handlePointerDown(p);
  private readonly onPointerMove = (p: Phaser.Input.Pointer) => this.handlePointerMove(p);
  private readonly onPointerUp = (p: Phaser.Input.Pointer) => this.handlePointerUp(p);
  private readonly onWheel = (
    _p: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ) => this.handleWheel(dy);

  constructor(private readonly scene: Phaser.Scene) {}

  /** ウィンドウを表示中か */
  isOpen(): boolean {
    return this.opened;
  }

  /** 生産ウィンドウを開く */
  open(config: ProductionWindowConfig): void {
    // 二重に開かないよう、開いていれば一度片付けてから作り直す
    this.close();
    this.config = config;
    this.opened = true;

    const camera = this.scene.cameras.main;
    const scrollX = camera.scrollX;
    const scrollY = camera.scrollY;

    const visibleRows = Math.min(config.items.length, MAX_VISIBLE_ROWS);
    this.listHeight = visibleRows * ROW_HEIGHT;
    this.totalHeight = config.items.length * ROW_HEIGHT;
    this.minOffset = Math.min(0, this.listHeight - this.totalHeight);
    this.offset = 0;
    // 開いたクリックの離しは、ウィンドウ外タップ(閉じる)と誤認しないよう 1 回無視する
    this.ignoreNextUp = true;
    this.pointerActive = false;
    this.dragging = false;

    const winHeight = TITLE_HEIGHT + this.listHeight;
    // ビューポート(マップ領域)の中央に置く。スクリーン座標で保持しておく
    this.winScreenX = Math.round((config.viewWidth - WIN_WIDTH) / 2);
    this.winScreenY = Math.round((config.viewHeight - winHeight) / 2);
    // マップと一緒にスクロールしないよう、世界座標へはカメラスクロールを足して配置する
    const winX = scrollX + this.winScreenX;
    const winY = scrollY + this.winScreenY;
    const contentTop = winY + TITLE_HEIGHT;

    this.createBackdrop(scrollX, scrollY, config);
    this.createPanel(winX, winY, winHeight);
    this.createRows(winX, contentTop, config);
    this.createScrollbar(winX, contentTop);
    this.updateScrollPositions();
    this.registerInput();
  }

  /**
   * ウィンドウを片付ける(暗幕・枠・行・入力ハンドラをすべて破棄する)。
   * onClose は呼ばない(呼び出し側からの明示的な close 用)。
   * 暗幕クリックや × による「ユーザー操作での閉じる」は requestClose() を使う。
   */
  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.unregisterInput();
    if (this.content) {
      this.content.clearMask(true);
    }
    for (const obj of this.objects) {
      obj.destroy();
    }
    this.objects = [];
    this.content = null;
    this.scrollbar = null;
    this.config = null;
  }

  /** 暗幕全体の暗幕(クリックで閉じられるよう画面全体を覆う) */
  private createBackdrop(
    scrollX: number,
    scrollY: number,
    config: ProductionWindowConfig,
  ): void {
    const backdrop = this.scene.add
      .rectangle(scrollX, scrollY, config.gameWidth, config.gameHeight, COLOR.backdrop, 0.5)
      .setOrigin(0, 0)
      .setDepth(WINDOW_DEPTH);
    this.objects.push(backdrop);
  }

  /** タイトルバー付きの枠を描く */
  private createPanel(winX: number, winY: number, winHeight: number): void {
    const panel = this.scene.add.graphics().setDepth(WINDOW_DEPTH + 1);
    // 枠の下地
    panel.fillStyle(COLOR.panel, 1);
    panel.fillRect(winX, winY, WIN_WIDTH, winHeight);
    // タイトルバー
    panel.fillStyle(COLOR.panelStroke, 0.14);
    panel.fillRect(winX, winY, WIN_WIDTH, TITLE_HEIGHT);
    // 外枠
    panel.lineStyle(2, COLOR.panelStroke, 1);
    panel.strokeRect(winX, winY, WIN_WIDTH, winHeight);
    this.objects.push(panel);

    const title = this.scene.add
      .text(winX + ROW_PADDING, winY + TITLE_HEIGHT / 2, '生産', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0, 0.5)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(title);

    // 閉じるボタン(×)。当たり判定はタイトルバー右端の領域で扱う(handlePointerUp)
    const close = this.scene.add
      .text(winX + WIN_WIDTH - ROW_PADDING, winY + TITLE_HEIGHT / 2, '✕', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(1, 0.5)
      .setDepth(WINDOW_DEPTH + 2);
    this.objects.push(close);
  }

  /** 各ユニットの行(アイコン・名前・料金)をコンテナに描く */
  private createRows(
    winX: number,
    contentTop: number,
    config: ProductionWindowConfig,
  ): void {
    const content = this.scene.add.container(0, 0).setDepth(WINDOW_DEPTH + 2);
    // 行の下地・区切り線・アイコンを 1 枚のグラフィックスにまとめて描く
    const g = this.scene.add.graphics();
    content.add(g);

    config.items.forEach((item, index) => {
      const rowTop = contentTop + index * ROW_HEIGHT;
      // 行の下地(生産不可の行は暗く、偶奇で薄く塗り分ける)
      const rowColor = !item.affordable
        ? COLOR.rowDisabled
        : index % 2 === 0
          ? COLOR.rowEven
          : COLOR.rowOdd;
      g.fillStyle(rowColor, 1);
      g.fillRect(winX, rowTop, WIN_WIDTH, ROW_HEIGHT);
      // 区切り線
      g.lineStyle(1, COLOR.separator, 1);
      g.lineBetween(winX, rowTop + ROW_HEIGHT, winX + WIN_WIDTH, rowTop + ROW_HEIGHT);

      // ①アイコン: 軍色トークンの上に種別シルエットを重ねる
      const cx = winX + ROW_PADDING + ICON_RADIUS;
      const cy = rowTop + ROW_HEIGHT / 2;
      const iconAlpha = item.affordable ? 1 : 0.4;
      g.fillStyle(config.tokenColor, iconAlpha);
      g.fillCircle(cx, cy, ICON_RADIUS);
      g.lineStyle(2, COLOR.icon, item.affordable ? 0.9 : 0.4);
      g.strokeCircle(cx, cy, ICON_RADIUS);
      drawUnitIcon(item.unitType, {
        graphics: g,
        cx,
        cy,
        radius: ICON_RADIUS,
        color: COLOR.icon,
        alpha: iconAlpha,
      });

      // ②ユニット名
      const name = this.scene.add
        .text(cx + ICON_RADIUS + 10, cy, item.unitName, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: item.affordable ? COLOR.name : COLOR.nameDisabled,
        })
        .setOrigin(0, 0.5);
      content.add(name);

      // ③料金(右寄せ)
      const cost = this.scene.add
        .text(winX + WIN_WIDTH - ROW_PADDING, cy, String(item.cost), {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: item.affordable ? COLOR.cost : COLOR.costDisabled,
        })
        .setOrigin(1, 0.5);
      content.add(cost);
    });

    // 一覧の表示範囲だけを見せるマスクを設定する
    const mask = this.scene.make.graphics({}, false);
    mask.fillStyle(0xffffff, 1);
    mask.fillRect(winX, contentTop, WIN_WIDTH, this.listHeight);
    content.setMask(mask.createGeometryMask());

    this.content = content;
    this.objects.push(content, mask);
  }

  /** スクロールが必要なときだけ、右端にスクロールバーを描く */
  private createScrollbar(winX: number, contentTop: number): void {
    if (this.totalHeight <= this.listHeight) {
      return;
    }
    const bar = this.scene.add.graphics().setDepth(WINDOW_DEPTH + 3);
    this.scrollbar = bar;
    this.objects.push(bar);
    // つまみの位置・大きさは updateScrollPositions で描く
    this.drawScrollbar(winX, contentTop);
  }

  /** スクロールバーのつまみを現在のスクロール量に合わせて描き直す */
  private drawScrollbar(winX: number, contentTop: number): void {
    const bar = this.scrollbar;
    if (!bar) {
      return;
    }
    const barWidth = 4;
    const barX = winX + WIN_WIDTH - barWidth - 2;
    bar.clear();
    // トラック(背景)
    bar.fillStyle(COLOR.scrollTrack, 0.6);
    bar.fillRect(barX, contentTop + 2, barWidth, this.listHeight - 4);
    // つまみ(表示範囲の割合ぶんの高さ)
    const track = this.listHeight - 4;
    const thumbHeight = Math.max(20, track * (this.listHeight / this.totalHeight));
    const scrollRange = this.totalHeight - this.listHeight;
    const ratio = scrollRange > 0 ? -this.offset / scrollRange : 0;
    const thumbY = contentTop + 2 + ratio * (track - thumbHeight);
    bar.fillStyle(COLOR.scrollThumb, 0.9);
    bar.fillRect(barX, thumbY, barWidth, thumbHeight);
  }

  /** スクロール量に合わせて行コンテナとスクロールバーの位置を更新する */
  private updateScrollPositions(): void {
    if (this.content) {
      this.content.y = this.offset;
    }
    const camera = this.scene.cameras.main;
    const winX = camera.scrollX + this.winScreenX;
    const contentTop = camera.scrollY + this.winScreenY + TITLE_HEIGHT;
    this.drawScrollbar(winX, contentTop);
  }

  /** スクロール量を範囲内に収めて設定し、表示を更新する */
  private setOffset(value: number): void {
    const clamped = Phaser.Math.Clamp(value, this.minOffset, 0);
    if (clamped === this.offset) {
      return;
    }
    this.offset = clamped;
    this.updateScrollPositions();
  }

  private registerInput(): void {
    const input = this.scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
  }

  private unregisterInput(): void {
    const input = this.scene.input;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointerActive = true;
    this.dragging = false;
    this.downX = pointer.x;
    this.downY = pointer.y;
    this.downOffset = this.offset;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerActive || !pointer.isDown) {
      return;
    }
    const dy = pointer.y - this.downY;
    if (!this.dragging && Math.hypot(pointer.x - this.downX, dy) > DRAG_THRESHOLD) {
      this.dragging = true;
    }
    // ドラッグ中は一覧をスクロールする(スクロール不要なら何も起きない)
    if (this.dragging) {
      this.setOffset(this.downOffset + dy);
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    // ウィンドウを開いたクリックの離しは 1 回だけ無視する(即閉じの防止)
    if (this.ignoreNextUp) {
      this.ignoreNextUp = false;
      this.pointerActive = false;
      this.dragging = false;
      return;
    }
    // 押下開始を自分で拾っていない離しは無視する
    if (!this.pointerActive) {
      return;
    }
    this.pointerActive = false;
    // ドラッグ(スクロール)だったらタップとして扱わない
    if (this.dragging) {
      this.dragging = false;
      return;
    }
    this.handleTap(pointer.x, pointer.y);
  }

  private handleWheel(dy: number): void {
    this.setOffset(this.offset - dy);
  }

  /**
   * タップ位置に応じて処理を振り分ける。
   * ウィンドウ外・× → 閉じる、一覧の行 → その行を選択(生産可能なときだけ)。
   */
  private handleTap(screenX: number, screenY: number): void {
    const config = this.config;
    if (!config) {
      return;
    }
    const left = this.winScreenX;
    const top = this.winScreenY;
    const right = left + WIN_WIDTH;
    const winHeight = TITLE_HEIGHT + this.listHeight;
    const bottom = top + winHeight;

    // ウィンドウの外をタップしたら閉じる
    if (screenX < left || screenX > right || screenY < top || screenY > bottom) {
      this.requestClose();
      return;
    }
    // タイトルバー: 右端の × 領域なら閉じる。それ以外のタイトルバーは無視する
    if (screenY < top + TITLE_HEIGHT) {
      if (screenX >= right - TITLE_HEIGHT) {
        this.requestClose();
      }
      return;
    }
    // 一覧領域: スクロール量を差し引いて行番号を求める
    const listTop = top + TITLE_HEIGHT;
    const localY = screenY - listTop - this.offset;
    const index = Math.floor(localY / ROW_HEIGHT);
    if (index < 0 || index >= config.items.length) {
      return;
    }
    const item = config.items[index];
    // 資金が足りない行は選択できない
    if (!item.affordable) {
      return;
    }
    config.onSelect(item.unitType);
  }

  /** ユーザー操作で閉じる(片付けたうえで onClose を通知する) */
  private requestClose(): void {
    const onClose = this.config?.onClose;
    this.close();
    onClose?.();
  }
}
