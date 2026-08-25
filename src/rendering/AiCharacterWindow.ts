// 対戦相手(敵軍の指揮官)を選ぶウィンドウ。マップ選択画面の「対戦相手」ボタンで開く。
// 左側の一覧から指揮官を選ぶと、その場で対戦相手が切り替わり、
// 右側に肩書・名前・想定するプレイヤー層・思考パターンの説明を表示する。
// 純粋なゲームロジックではなく Phaser の描画・入力を扱うため rendering/ に置く。
// 指揮官のデータは src/data/aiCharacters.ts(純粋データ)が持つ。
//
// 一覧は指揮官が増えても並べられるよう、表示領域からあふれたぶんは
// ホイールとドラッグ(スワイプ)でスクロールする(マップ選択画面のカード一覧と同じ操作感)。

import Phaser from 'phaser';

import { AI_CHARACTERS, aiCharacterLabel, type AiCharacter } from '@/data/aiCharacters';
import { clampScrollOffset, scrollbarMetrics } from '@/ui/listScroll';
import { wrapText } from '@/ui/textWrap';

/** ウィンドウを開くときの設定 */
export interface AiCharacterWindowConfig {
  /** 画面全体のピクセル幅・高さ(背景の暗幕用) */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** ウィンドウを中央に置く領域のピクセル幅・高さ */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** 開いた時点で選ばれている指揮官の識別子 */
  readonly selectedId: string;
  /** 一覧で指揮官が選ばれたときの通知(選んだ時点で対戦相手が切り替わる) */
  readonly onSelect: (id: string) => void;
  /** 暗幕や × でウィンドウが閉じられたときの通知 */
  readonly onClose: () => void;
}

/** ウィンドウの幅(ピクセル) */
const WIN_WIDTH = 520;
/** タイトルバーの高さ */
const TITLE_HEIGHT = 34;
/** タイトルバー下の本体の高さ */
const BODY_HEIGHT = 300;
/** ウィンドウ全体の高さ */
const WIN_HEIGHT = TITLE_HEIGHT + BODY_HEIGHT;
/** 左側の指揮官一覧の幅 */
const LIST_WIDTH = 168;
/** 一覧の 1 行の高さ */
const LIST_ROW_HEIGHT = 34;
/** 一覧のエンブレム(識別色の円)の半径 */
const EMBLEM_RADIUS = 9;
/** 右側の詳細ペインの内側余白 */
const DETAIL_PADDING = 16;
/** 詳細ペインの説明文の 1 行あたりの最大文字数(フォント 12px の全角基準) */
const DETAIL_MAX_CHARS = 26;
/** 詳細ペインの説明文の行の高さ */
const DETAIL_LINE_HEIGHT = 18;
/** 一覧のスクロールバー(一覧の右端)の幅と余白 */
const SCROLLBAR_WIDTH = 3;
const SCROLLBAR_MARGIN = 3;
/** ホイール 1 ノッチあたりのスクロール量(px) */
const WHEEL_SCROLL_STEP = 0.5;
/** ドラッグ(スワイプ)を行のタップと区別するための移動量しきい値(画面ピクセル) */
const DRAG_THRESHOLD = 8;
/** ウィンドウの描画深度(ほかのウィンドウと同じく最前面帯) */
const WINDOW_DEPTH = 300;

/** 色(タイトル・枠・一覧・詳細) */
const COLOR = {
  backdrop: 0x000000,
  panel: 0x1a1a2b,
  panelStroke: 0x8ad0ff,
  title: '#8ad0ff',
  close: '#ffffff',
  divider: 0x33334a,
  rowSelected: 0x2d3b5a,
  rowSelectedStroke: 0x8ad0ff,
  name: '#ffffff',
  nameSelected: '#8ad0ff',
  difficulty: '#ffe08a',
  desc: '#d8d8e8',
  hint: '#9a9ab0',
  emblemStroke: 0xffffff,
  scrollTrack: 0x2a3350,
  scrollThumb: 0x8ad0ff,
} as const;

/**
 * 対戦相手(敵軍の指揮官)の選択ウィンドウ。
 * ユニット説明ウィンドウと同じく、表示のたびに Phaser オブジェクトを作り直す。
 * 画面固定(setScrollFactor(0))のスクリーン座標で描く。
 */
export class AiCharacterWindow {
  private config: AiCharacterWindowConfig | null = null;
  private opened = false;

  /** 枠・タイトルなど、選択が変わっても作り直さない固定オブジェクト */
  private frameObjects: Phaser.GameObjects.GameObject[] = [];
  /** 一覧の行と右ペインの中身。選択が変わるたびに作り直す */
  private contentObjects: Phaser.GameObjects.GameObject[] = [];
  /** 一覧の行をまとめて動かすためのコンテナ(これを上下に動かしてスクロールする) */
  private listLayer: Phaser.GameObjects.Container | null = null;
  /** 一覧のスクロールバーの描画先 */
  private scrollbar: Phaser.GameObjects.Graphics | null = null;

  /** ウィンドウの左上スクリーン座標 */
  private winX = 0;
  private winY = 0;
  /** 現在選択している指揮官の識別子 */
  private selectedId = '';

  /** 一覧全体の高さと、現在のスクロール量(0 が先頭。下へスクロールするほど負) */
  private contentHeight = 0;
  private scrollOffset = 0;
  /** ドラッグ開始時のスクロール量と押下位置 */
  private dragStartOffset = 0;
  private pointerDownY = 0;
  /** 一覧の上で押下中か(押し始めが一覧の外ならスクロールしない) */
  private dragActive = false;
  /** しきい値を超えて動かした(= スクロール操作であり行のタップではない)か */
  private isPanning = false;

  /**
   * ウィンドウを開いたクリックの「離し(pointerup)」を 1 回だけ無視するフラグ。
   * ウィンドウを開いたボタンの離しが「ウィンドウ外タップ = 閉じる」と
   * 誤判定されて即座に閉じてしまうのを防ぐ。
   */
  private ignoreNextUp = false;

  private readonly onPointerDown = (p: Phaser.Input.Pointer) => this.handlePointerDown(p);
  private readonly onPointerMove = (p: Phaser.Input.Pointer) => this.handlePointerMove(p);
  private readonly onPointerUp = (p: Phaser.Input.Pointer) => this.handlePointerUp(p);
  private readonly onWheel = (
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
  ) => this.handleWheel(pointer, dy);

  constructor(private readonly scene: Phaser.Scene) {}

  /** ウィンドウを表示中か */
  isOpen(): boolean {
    return this.opened;
  }

  /** 対戦相手の選択ウィンドウを開く */
  open(config: AiCharacterWindowConfig): void {
    // 二重に開かないよう、開いていれば一度片付けてから作り直す
    this.close();
    this.config = config;
    this.opened = true;
    this.ignoreNextUp = true;
    this.selectedId = config.selectedId;
    this.dragActive = false;
    this.isPanning = false;

    this.winX = Math.round((config.viewWidth - WIN_WIDTH) / 2);
    this.winY = Math.round((config.viewHeight - WIN_HEIGHT) / 2);
    this.contentHeight = AI_CHARACTERS.length * LIST_ROW_HEIGHT;
    // 選んでいる指揮官が一覧の外にいる場合に備え、その行が見える位置まで送っておく
    this.scrollOffset = clampScrollOffset(
      -this.selectedIndex() * LIST_ROW_HEIGHT,
      this.contentHeight,
      BODY_HEIGHT,
    );

    this.createBackdrop(config);
    this.createFrame();
    this.renderContent();
    this.registerInput();
  }

  /**
   * ウィンドウを片付ける(暗幕・枠・中身・入力ハンドラをすべて破棄する)。
   * onClose は呼ばない(暗幕クリックや × による閉じるは requestClose() を使う)。
   */
  close(): void {
    if (!this.opened) {
      return;
    }
    this.opened = false;
    this.unregisterInput();
    this.clearContent();
    this.listLayer?.destroy();
    this.listLayer = null;
    this.scrollbar?.destroy();
    this.scrollbar = null;
    for (const obj of this.frameObjects) {
      obj.destroy();
    }
    this.frameObjects = [];
    this.config = null;
  }

  /** 一覧での現在の選択位置(見つからなければ先頭) */
  private selectedIndex(): number {
    const index = AI_CHARACTERS.findIndex((c) => c.id === this.selectedId);
    return index >= 0 ? index : 0;
  }

  /** 現在選択している指揮官 */
  private selectedCharacter(): AiCharacter {
    return AI_CHARACTERS[this.selectedIndex()];
  }

  /**
   * 画面全体を覆う暗幕。
   * 入力を受け取れるようにして、ウィンドウの下にあるマップカードが
   * クリックを拾ってしまう(ゲームが始まってしまう)のを防ぐ。
   */
  private createBackdrop(config: AiCharacterWindowConfig): void {
    const backdrop = this.scene.add
      .rectangle(0, 0, config.gameWidth, config.gameHeight, COLOR.backdrop, 0.6)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH)
      .setInteractive();
    this.frameObjects.push(backdrop);
  }

  /** タイトルバー付きの枠・区切り線・タイトル・閉じるボタン・一覧のコンテナを作る */
  private createFrame(): void {
    const panel = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 1);
    panel.fillStyle(COLOR.panel, 1);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    panel.fillStyle(COLOR.panelStroke, 0.14);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, TITLE_HEIGHT);
    // 一覧と詳細を分ける縦の区切り線
    panel.lineStyle(1, COLOR.divider, 1);
    panel.lineBetween(
      this.winX + LIST_WIDTH,
      this.winY + TITLE_HEIGHT,
      this.winX + LIST_WIDTH,
      this.winY + WIN_HEIGHT,
    );
    panel.lineStyle(2, COLOR.panelStroke, 1);
    panel.strokeRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    this.frameObjects.push(panel);

    const title = this.scene.add
      .text(this.winX + 16, this.winY + TITLE_HEIGHT / 2, '対戦相手を選ぶ', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: COLOR.title,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.frameObjects.push(title);

    // 閉じるボタン(×)。当たり判定はタイトルバー右端の領域で扱う(handleTap)
    const close = this.scene.add
      .text(this.winX + WIN_WIDTH - 14, this.winY + TITLE_HEIGHT / 2, '✕', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: COLOR.close,
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.frameObjects.push(close);

    // 一覧はコンテナへまとめ、表示領域からはみ出したぶんは切り抜いてスクロールする
    this.listLayer = this.scene.add
      .container(0, this.scrollOffset)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    const maskShape = this.scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRect(this.winX, this.winY + TITLE_HEIGHT, LIST_WIDTH, BODY_HEIGHT);
    this.listLayer.setMask(maskShape.createGeometryMask());

    this.scrollbar = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 3);
  }

  /** 一覧と右ペインの中身を、現在の選択に合わせて作り直す */
  private renderContent(): void {
    this.clearContent();
    this.renderList();
    this.renderDetail();
    this.drawScrollbar();
  }

  /** 左側の指揮官一覧(エンブレム + 肩書・名前 + 想定プレイヤー層)を描く */
  private renderList(): void {
    const layer = this.listLayer;
    if (!layer) {
      return;
    }
    const listTop = this.winY + TITLE_HEIGHT;
    const g = this.scene.add.graphics().setScrollFactor(0);
    layer.add(g);
    this.contentObjects.push(g);

    AI_CHARACTERS.forEach((character, index) => {
      const rowTop = listTop + index * LIST_ROW_HEIGHT;
      const cy = rowTop + LIST_ROW_HEIGHT / 2;
      const selected = character.id === this.selectedId;

      if (selected) {
        g.fillStyle(COLOR.rowSelected, 1);
        g.fillRect(this.winX, rowTop, LIST_WIDTH, LIST_ROW_HEIGHT);
        g.lineStyle(2, COLOR.rowSelectedStroke, 1);
        g.strokeRect(this.winX + 1, rowTop + 1, LIST_WIDTH - 2, LIST_ROW_HEIGHT - 2);
      }

      // エンブレム(指揮官ごとの識別色の円)
      const cx = this.winX + 10 + EMBLEM_RADIUS;
      g.fillStyle(character.emblemColor, 1);
      g.fillCircle(cx, cy, EMBLEM_RADIUS);
      g.lineStyle(2, COLOR.emblemStroke, 0.9);
      g.strokeCircle(cx, cy, EMBLEM_RADIUS);

      const textX = cx + EMBLEM_RADIUS + 8;
      const name = this.scene.add
        .text(textX, cy - 7, aiCharacterLabel(character), {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: selected ? 'bold' : 'normal',
          color: selected ? COLOR.nameSelected : COLOR.name,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      layer.add(name);
      this.contentObjects.push(name);

      const difficulty = this.scene.add
        .text(textX, cy + 8, character.difficulty, {
          fontFamily: 'sans-serif',
          fontSize: '10px',
          color: COLOR.difficulty,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0);
      layer.add(difficulty);
      this.contentObjects.push(difficulty);
    });
  }

  /** 右側の詳細ペイン(エンブレム・肩書と名前・想定プレイヤー層・説明文)を描く */
  private renderDetail(): void {
    const character = this.selectedCharacter();
    const px = this.winX + LIST_WIDTH + DETAIL_PADDING;
    let y = this.winY + TITLE_HEIGHT + 16;

    // エンブレムと肩書つきの名前(見出し)
    const emblem = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 3);
    emblem.fillStyle(character.emblemColor, 1);
    emblem.fillCircle(px + EMBLEM_RADIUS, y + 10, EMBLEM_RADIUS);
    emblem.lineStyle(2, COLOR.emblemStroke, 0.9);
    emblem.strokeCircle(px + EMBLEM_RADIUS, y + 10, EMBLEM_RADIUS);
    this.contentObjects.push(emblem);

    this.addText(px + EMBLEM_RADIUS * 2 + 8, y, aiCharacterLabel(character), {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: COLOR.name,
    });
    y += 28;

    this.addText(px, y, `対象: ${character.difficulty}`, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: COLOR.difficulty,
    });
    y += 22;

    // 思考パターンの説明。日本語はスペースが無く Phaser の wordWrap では折り返せないため、
    // 文字数で折り返してから 1 行ずつ描く
    for (const line of wrapText(character.description, DETAIL_MAX_CHARS).split('\n')) {
      this.addText(px, y, line, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLOR.desc,
      });
      y += DETAIL_LINE_HEIGHT;
    }

    // 操作の案内(ウィンドウ下端)
    this.addText(
      px,
      this.winY + WIN_HEIGHT - 26,
      '一覧から選ぶと対戦相手が切り替わります',
      {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: COLOR.hint,
      },
    );
  }

  /** 一覧の右端のスクロールバーを描く。スクロール不要なら何も描かない */
  private drawScrollbar(): void {
    const bar = this.scrollbar;
    if (!bar) {
      return;
    }
    bar.clear();
    const metrics = scrollbarMetrics(this.scrollOffset, this.contentHeight, BODY_HEIGHT);
    if (!metrics) {
      return;
    }
    const x = this.winX + LIST_WIDTH - SCROLLBAR_MARGIN - SCROLLBAR_WIDTH;
    const top = this.winY + TITLE_HEIGHT;
    bar.fillStyle(COLOR.scrollTrack, 1);
    bar.fillRect(x, top, SCROLLBAR_WIDTH, BODY_HEIGHT);
    bar.fillStyle(COLOR.scrollThumb, 1);
    bar.fillRect(x, top + metrics.thumbTop, SCROLLBAR_WIDTH, metrics.thumbHeight);
  }

  /** テキストを追加してコンテンツ管理に登録する(共通の深度・固定設定つき) */
  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const obj = this.scene.add
      .text(x, y, text, style)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 3);
    this.contentObjects.push(obj);
    return obj;
  }

  /** 一覧の行と右ペインの中身を破棄する(枠とコンテナはそのまま使い回す) */
  private clearContent(): void {
    for (const obj of this.contentObjects) {
      obj.destroy();
    }
    this.contentObjects = [];
  }

  private registerInput(): void {
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
  }

  private unregisterInput(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isInsideList(pointer.x, pointer.y)) {
      return;
    }
    this.dragActive = true;
    this.isPanning = false;
    this.pointerDownY = pointer.y;
    this.dragStartOffset = this.scrollOffset;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragActive || !pointer.isDown) {
      return;
    }
    const dy = pointer.y - this.pointerDownY;
    if (!this.isPanning && Math.abs(dy) > DRAG_THRESHOLD) {
      this.isPanning = true;
    }
    if (this.isPanning) {
      this.setScrollOffset(this.dragStartOffset + dy);
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    const wasPanning = this.isPanning;
    this.dragActive = false;
    this.isPanning = false;

    // ウィンドウを開いたクリックの離しは 1 回だけ無視する(即閉じの防止)
    if (this.ignoreNextUp) {
      this.ignoreNextUp = false;
      return;
    }
    // スクロール操作だった場合は行を選ばない
    if (wasPanning) {
      return;
    }
    this.handleTap(pointer.x, pointer.y);
  }

  private handleWheel(pointer: Phaser.Input.Pointer, dy: number): void {
    if (!this.isInsideList(pointer.x, pointer.y)) {
      return;
    }
    this.setScrollOffset(this.scrollOffset - dy * WHEEL_SCROLL_STEP);
  }

  /** 指定のスクリーン座標が一覧の表示領域内か */
  private isInsideList(screenX: number, screenY: number): boolean {
    const listTop = this.winY + TITLE_HEIGHT;
    return (
      screenX >= this.winX &&
      screenX <= this.winX + LIST_WIDTH &&
      screenY >= listTop &&
      screenY <= listTop + BODY_HEIGHT
    );
  }

  /** スクロール量を範囲内に丸めて反映し、スクロールバーも描き直す */
  private setScrollOffset(offset: number): void {
    const clamped = clampScrollOffset(offset, this.contentHeight, BODY_HEIGHT);
    if (clamped === this.scrollOffset) {
      return;
    }
    this.scrollOffset = clamped;
    this.listLayer?.setY(clamped);
    this.drawScrollbar();
  }

  /** タップ位置に応じて処理を振り分ける(ウィンドウ外・× → 閉じる、一覧 → 選択) */
  private handleTap(screenX: number, screenY: number): void {
    const left = this.winX;
    const top = this.winY;
    const right = left + WIN_WIDTH;
    const bottom = top + WIN_HEIGHT;

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
    // 左側の一覧: 行を選んで対戦相手を切り替える(スクロール量ぶんを差し引いて行を求める)
    if (this.isInsideList(screenX, screenY)) {
      const listTop = top + TITLE_HEIGHT;
      const index = Math.floor((screenY - listTop - this.scrollOffset) / LIST_ROW_HEIGHT);
      const character = AI_CHARACTERS[index];
      if (character) {
        this.select(character);
      }
    }
    // 右側の詳細ペインは表示のみ(タップしても何もしない)
  }

  /** 一覧で選ばれた指揮官へ切り替え、表示を更新して呼び出し側へ通知する */
  private select(character: AiCharacter): void {
    if (character.id === this.selectedId) {
      return;
    }
    this.selectedId = character.id;
    this.renderContent();
    this.config?.onSelect(character.id);
  }

  /** ユーザー操作で閉じる(片付けたうえで onClose を通知する) */
  private requestClose(): void {
    const onClose = this.config?.onClose;
    this.close();
    onClose?.();
  }
}
