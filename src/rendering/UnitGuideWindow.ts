// ユニット説明ウィンドウ(何もないマスの右クリックで出す情報メニューの「ユニット説明」で開く)。
// 左側のユニット一覧から 1 種類を選ぶと、右側にそのユニットの説明文と、
// 全ユニットとの対戦相性(与ダメージ・被ダメージ)を数値・記号で表示する。
// 純粋なゲームロジックではなく Phaser の描画・入力を扱うため rendering/ に置く。
// 説明文や相性の値・整形は src/data/unitGuide.ts(純粋データ・ロジック)が担う。

import Phaser from 'phaser';

import type { UnitType } from '@/core/units/UnitType';
import { UNIT_TYPES } from '@/core/units/UnitType';
import { getUnitData } from '@/data/unitData';
import {
  getUnitDescription,
  getUnitMatchups,
  type CompatibilityTier,
} from '@/data/unitGuide';
import { drawUnitIcon } from '@/rendering/unitIcon';

/** ウィンドウを開くときの設定 */
export interface UnitGuideWindowConfig {
  /** 画面全体(ビューポート + 情報パネル)のピクセル幅・高さ(背景の暗幕用) */
  readonly gameWidth: number;
  readonly gameHeight: number;
  /** マップ表示領域(ビューポート)のピクセル幅・高さ(ウィンドウはこの中央に置く) */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** アイコンの軍色トークン(円)の色 */
  readonly tokenColor: number;
  /** 暗幕や × でウィンドウが閉じられたときの通知 */
  readonly onClose: () => void;
}

/** ウィンドウの幅(ピクセル) */
const WIN_WIDTH = 452;
/** タイトルバーの高さ */
const TITLE_HEIGHT = 34;
/**
 * タイトルバー下の本体の高さ。
 * 左の一覧(全ユニット種別ぶんの行)と右の相性表(同じ行数)が収まる高さにする。
 */
const BODY_HEIGHT = 400;
/** ウィンドウ全体の高さ */
const WIN_HEIGHT = TITLE_HEIGHT + BODY_HEIGHT;
/** 左側のユニット一覧の幅 */
const LIST_WIDTH = 148;
/** 一覧の 1 行の高さ(全ユニット種別ぶんが BODY_HEIGHT に収まる高さにする) */
const LIST_ROW_HEIGHT = 28;
/** 一覧のアイコン(軍色トークン)の半径 */
const LIST_ICON_RADIUS = 11;
/** 右側の詳細ペインの内側余白 */
const DETAIL_PADDING = 16;
/** 相性表の 1 行の高さ(全ユニット種別ぶんの行が BODY_HEIGHT に収まる高さにする) */
const MATCHUP_ROW_HEIGHT = 16;
/** 相性表のアイコン(軍色トークン)の半径 */
const MATCHUP_ICON_RADIUS = 7;
/** ウィンドウの描画深度(生産・音量ウィンドウと同じく最前面帯) */
const WINDOW_DEPTH = 300;

/** 色(タイトル・枠・一覧・相性など) */
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
  stats: '#ffe08a',
  desc: '#d8d8e8',
  hint: '#9a9ab0',
  sectionHeader: '#8ad0ff',
  icon: 0xffffff,
} as const;

/** 相性の強さ段階ごとの数値表示色 */
const TIER_COLOR: Readonly<Record<CompatibilityTier, string>> = {
  none: '#7a7a8a',
  low: '#ff9a76',
  mid: '#ffe08a',
  high: '#8ae08a',
} as const;

/**
 * ユニット説明ウィンドウ。open() で表示し、close() で片付ける。
 * 1 度作れば使い回せるよう、表示のたびに Phaser オブジェクトを作り直す。
 * 画面固定(setScrollFactor(0))のスクリーン座標で描くため、カメラスクロールの計算は不要。
 */
export class UnitGuideWindow {
  private config: UnitGuideWindowConfig | null = null;
  private opened = false;

  /** 枠・タイトルなど、選択が変わっても作り直さない固定オブジェクト */
  private frameObjects: Phaser.GameObjects.GameObject[] = [];
  /** 一覧の選択行と右ペインの中身。選択が変わるたびに作り直す */
  private contentObjects: Phaser.GameObjects.GameObject[] = [];

  /** ウィンドウの左上スクリーン座標 */
  private winX = 0;
  private winY = 0;
  /** 現在選択しているユニット種別 */
  private selectedType: UnitType = UNIT_TYPES[0];

  /**
   * ウィンドウを開いたクリックの「離し(pointerup)」を 1 回だけ無視するフラグ。
   * 「ユニット説明」メニューのボタン(ウィンドウ外)を押した離しが、ウィンドウ外タップ=閉じる
   * と誤判定されて即座に閉じてしまうのを防ぐ。
   */
  private ignoreNextUp = false;

  private readonly onPointerUp = (p: Phaser.Input.Pointer) => this.handlePointerUp(p);

  constructor(private readonly scene: Phaser.Scene) {}

  /** ウィンドウを表示中か */
  isOpen(): boolean {
    return this.opened;
  }

  /** ユニット説明ウィンドウを開く */
  open(config: UnitGuideWindowConfig): void {
    // 二重に開かないよう、開いていれば一度片付けてから作り直す
    this.close();
    this.config = config;
    this.opened = true;
    this.ignoreNextUp = true;
    this.selectedType = UNIT_TYPES[0];

    // ビューポート(マップ領域)の中央に置く。画面固定なのでスクリーン座標をそのまま使う
    this.winX = Math.round((config.viewWidth - WIN_WIDTH) / 2);
    this.winY = Math.round((config.viewHeight - WIN_HEIGHT) / 2);

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
    for (const obj of this.frameObjects) {
      obj.destroy();
    }
    this.frameObjects = [];
    this.config = null;
  }

  /** 画面全体を覆う暗幕(クリックで閉じられるよう画面全体を覆う) */
  private createBackdrop(config: UnitGuideWindowConfig): void {
    const backdrop = this.scene.add
      .rectangle(0, 0, config.gameWidth, config.gameHeight, COLOR.backdrop, 0.5)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH);
    this.frameObjects.push(backdrop);
  }

  /** タイトルバー付きの枠・左右の区切り線・タイトル・閉じるボタンを描く */
  private createFrame(): void {
    const panel = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 1);
    // 枠の下地
    panel.fillStyle(COLOR.panel, 1);
    panel.fillRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    // タイトルバー
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
    // 外枠
    panel.lineStyle(2, COLOR.panelStroke, 1);
    panel.strokeRect(this.winX, this.winY, WIN_WIDTH, WIN_HEIGHT);
    this.frameObjects.push(panel);

    const title = this.scene.add
      .text(this.winX + 16, this.winY + TITLE_HEIGHT / 2, 'ユニット説明', {
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
  }

  /** 一覧の選択行ハイライトと右ペインの中身を、現在の選択に合わせて作り直す */
  private renderContent(): void {
    this.clearContent();
    this.renderList();
    this.renderDetail();
  }

  /** 左側のユニット一覧(アイコン + 名前)を描く。選択行はハイライトする */
  private renderList(): void {
    const listTop = this.winY + TITLE_HEIGHT;
    const g = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.contentObjects.push(g);

    UNIT_TYPES.forEach((unitType, index) => {
      const rowTop = listTop + index * LIST_ROW_HEIGHT;
      const cy = rowTop + LIST_ROW_HEIGHT / 2;
      const selected = unitType === this.selectedType;

      if (selected) {
        // 選択行の下地とふち
        g.fillStyle(COLOR.rowSelected, 1);
        g.fillRect(this.winX, rowTop, LIST_WIDTH, LIST_ROW_HEIGHT);
        g.lineStyle(2, COLOR.rowSelectedStroke, 1);
        g.strokeRect(this.winX + 1, rowTop + 1, LIST_WIDTH - 2, LIST_ROW_HEIGHT - 2);
      }

      // アイコン: 軍色トークンの上に種別シルエットを重ねる
      const cx = this.winX + 10 + LIST_ICON_RADIUS;
      g.fillStyle(this.config?.tokenColor ?? 0xffffff, 1);
      g.fillCircle(cx, cy, LIST_ICON_RADIUS);
      g.lineStyle(2, COLOR.icon, 0.9);
      g.strokeCircle(cx, cy, LIST_ICON_RADIUS);
      drawUnitIcon(unitType, {
        graphics: g,
        cx,
        cy,
        radius: LIST_ICON_RADIUS,
        color: COLOR.icon,
        alpha: 1,
      });

      // ユニット名
      const name = this.scene.add
        .text(cx + LIST_ICON_RADIUS + 8, cy, getUnitData(unitType).unitName, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: selected ? 'bold' : 'normal',
          color: selected ? COLOR.nameSelected : COLOR.name,
        })
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(WINDOW_DEPTH + 3);
      this.contentObjects.push(name);
    });
  }

  /** 右側の詳細ペイン(名前・基本性能・説明・相性表)を描く */
  private renderDetail(): void {
    const data = getUnitData(this.selectedType);
    const px = this.winX + LIST_WIDTH + DETAIL_PADDING;
    const rightWidth = WIN_WIDTH - LIST_WIDTH - DETAIL_PADDING * 2;
    let y = this.winY + TITLE_HEIGHT + 12;

    // ユニット名(見出し)
    this.addText(px, y, data.unitName, {
      fontFamily: 'sans-serif',
      fontSize: '17px',
      fontStyle: 'bold',
      color: COLOR.name,
    });
    y += 24;

    // 基本性能(コスト / HP / 移動 / 射程)
    const rangeLabel =
      data.maxAttackRange <= 0
        ? '攻撃不可'
        : data.minAttackRange === data.maxAttackRange
          ? String(data.maxAttackRange)
          : `${data.minAttackRange}〜${data.maxAttackRange}`;
    const stats = `コスト${data.cost} / HP${data.maxHp} / 移動${data.movement} / 射程${rangeLabel}`;
    this.addText(px, y, stats, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: COLOR.stats,
    });
    y += 16;

    // 夜戦の視界(歩兵は山の上でさらに広がる)
    const visionLabel =
      data.mountainVisionBonus > 0
        ? `夜戦の視界${data.vision}(山では${data.vision + data.mountainVisionBonus})`
        : `夜戦の視界${data.vision}`;
    this.addText(px, y, visionLabel, {
      fontFamily: 'sans-serif',
      fontSize: '12px',
      color: COLOR.stats,
    });
    y += 20;

    // 説明文(1 要素 = 1 行)
    for (const line of getUnitDescription(this.selectedType)) {
      this.addText(px, y, line, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLOR.desc,
      });
      y += 16;
    }
    y += 6;

    // 相性表の見出しと凡例
    this.addText(px, y, '対戦相性', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: COLOR.sectionHeader,
    });
    this.addText(px + rightWidth, y + 2, '数字=100が最大 / ×=攻撃不可', {
      fontFamily: 'sans-serif',
      fontSize: '10px',
      color: COLOR.hint,
    }).setOrigin(1, 0);
    y += 20;

    this.renderMatchups(px, y, rightWidth);
  }

  /**
   * 相性表を描く。相手ごとに 1 行(アイコン + 名前 + 与ダメージ + 被ダメージ)。
   * 「与」= このユニットが相手を攻撃したときのダメージ、
   * 「被」= 相手がこのユニットを攻撃したときのダメージ(いずれも 100 が最大、× は攻撃不可)。
   */
  private renderMatchups(px: number, top: number, rightWidth: number): void {
    const dealtX = px + rightWidth - 68;
    const takenX = px + rightWidth - 6;

    // 見出し行(与ダメージ・被ダメージの列見出し)
    this.addText(px, top, '相手', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: COLOR.hint,
    });
    this.addText(dealtX, top, '与ダメ', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: COLOR.hint,
    }).setOrigin(1, 0);
    this.addText(takenX, top, '被ダメ', {
      fontFamily: 'sans-serif',
      fontSize: '11px',
      color: COLOR.hint,
    }).setOrigin(1, 0);

    const rowsTop = top + 18;
    const g = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(WINDOW_DEPTH + 2);
    this.contentObjects.push(g);

    getUnitMatchups(this.selectedType).forEach((matchup, index) => {
      const cy = rowsTop + index * MATCHUP_ROW_HEIGHT + MATCHUP_ROW_HEIGHT / 2;

      // 相手アイコン(軍色トークン + シルエット)
      const cx = px + MATCHUP_ICON_RADIUS;
      g.fillStyle(this.config?.tokenColor ?? 0xffffff, 1);
      g.fillCircle(cx, cy, MATCHUP_ICON_RADIUS);
      g.lineStyle(1.5, COLOR.icon, 0.9);
      g.strokeCircle(cx, cy, MATCHUP_ICON_RADIUS);
      drawUnitIcon(matchup.opponent, {
        graphics: g,
        cx,
        cy,
        radius: MATCHUP_ICON_RADIUS,
        color: COLOR.icon,
        alpha: 1,
      });

      // 相手名
      this.addText(
        cx + MATCHUP_ICON_RADIUS + 6,
        cy,
        getUnitData(matchup.opponent).unitName,
        {
          fontFamily: 'sans-serif',
          fontSize: '11px',
          color: COLOR.desc,
        },
      ).setOrigin(0, 0.5);

      // 与ダメージ(このユニット → 相手)
      this.addText(dealtX, cy, matchup.dealtSymbol, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: TIER_COLOR[matchup.dealtTier],
      }).setOrigin(1, 0.5);

      // 被ダメージ(相手 → このユニット)
      this.addText(takenX, cy, matchup.takenSymbol, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: TIER_COLOR[matchup.takenTier],
      }).setOrigin(1, 0.5);
    });
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

  /** 選択が変わっても作り直さないもの以外(一覧の選択行・右ペイン)を破棄する */
  private clearContent(): void {
    for (const obj of this.contentObjects) {
      obj.destroy();
    }
    this.contentObjects = [];
  }

  private registerInput(): void {
    this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  private unregisterInput(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    // ウィンドウを開いたクリックの離しは 1 回だけ無視する(即閉じの防止)
    if (this.ignoreNextUp) {
      this.ignoreNextUp = false;
      return;
    }
    this.handleTap(pointer.x, pointer.y);
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
    // 左側の一覧: 行を選んで詳細を切り替える
    if (screenX < left + LIST_WIDTH) {
      const listTop = top + TITLE_HEIGHT;
      const index = Math.floor((screenY - listTop) / LIST_ROW_HEIGHT);
      if (index >= 0 && index < UNIT_TYPES.length) {
        this.selectType(UNIT_TYPES[index]);
      }
    }
    // 右側の詳細ペインは表示のみ(タップしても何もしない)
  }

  /** 一覧で選ばれたユニットに切り替え、表示を更新する(同じなら何もしない) */
  private selectType(unitType: UnitType): void {
    if (unitType === this.selectedType) {
      return;
    }
    this.selectedType = unitType;
    this.renderContent();
  }

  /** ユーザー操作で閉じる(片付けたうえで onClose を通知する) */
  private requestClose(): void {
    const onClose = this.config?.onClose;
    this.close();
    onClose?.();
  }
}
