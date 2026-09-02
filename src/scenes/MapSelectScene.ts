import Phaser from 'phaser';
import { matchesMap, type SaveData } from '@/core/save/SaveData';
import { clearSuspendData, readSuspendData } from '@/core/save/SaveStorage';
import { DEFAULT_DIMENSIONS } from '@/data/gameConfig';
import { INITIAL_FUNDS } from '@/data/economyConfig';
import {
  DEFAULT_AI_CHARACTER,
  aiCharacterLabel,
  getAiCharacter,
} from '@/data/aiCharacters';
import {
  clearRecordOf,
  emptyClearProgress,
  readClearProgress,
  type ClearProgress,
} from '@/core/progress/ClearProgress';
import {
  extraMapsForSide,
  isNewGroupUnlocked,
  remainingForNewGroup,
  remainingRequiredMaps,
  visibleMaps,
} from '@/core/progress/MapUnlock';
import {
  DEFAULT_GAME_MODE,
  gameModeSummary,
  mapGroupLabel,
  type GameMode,
  type MapGroup,
} from '@/core/mode/GameMode';
import { readGameMode } from '@/core/settings/SettingsStorage';
import {
  MAP_LIST,
  STANDARD_MAP_LIST,
  mapsInGroup,
  type ResolvedMapEntry,
} from '@/data/maps';
import { AiCharacterWindow } from '@/rendering/AiCharacterWindow';
import { ConfirmWindow } from '@/rendering/ConfirmWindow';
import { clampScrollOffset, scrollbarMetrics } from '@/ui/listScroll';

/** 選択画面のカードの寸法・間隔 */
const CARD_MARGIN_X = 40;
const CARD_TOP = 134;
/** カードの最低の高さ。説明文が短くてもこの高さは確保する */
const CARD_MIN_HEIGHT = 96;
/** カード上端から説明文の描画開始位置までの距離 */
const CARD_DESC_TOP = 58;
/** 説明文の下に空けるカード内の余白 */
const CARD_DESC_BOTTOM = 14;
/** カードの左右の内側余白(説明文の折り返し幅の計算にも使う) */
const CARD_PADDING_X = 16;
const CARD_GAP = 16;
/** カード一覧の表示領域の下端に空ける余白 */
const LIST_BOTTOM_MARGIN = 12;
/** 一覧の末尾に出す「激ムズマップの解放まであと何枚か」のヒントの高さ */
const UNLOCK_HINT_HEIGHT = 28;
/** スクロールバー(画面右端)の幅と余白 */
const SCROLLBAR_WIDTH = 4;
const SCROLLBAR_MARGIN = 8;
/** カード内のバッジ(激ムズ・クリア済み)どうしの間隔 */
const BADGE_GAP = 10;
/** 激ムズマップのカードの枠色(通常マップと見分けるために変える) */
const EXTRA_STROKE_COLOR = 0xd0704a;

/** ホイール 1 ノッチあたりのスクロール量(px) */
const WHEEL_SCROLL_STEP = 0.5;

/** モード選択画面へ戻るボタンの寸法と位置(左上) */
const BACK_BUTTON_WIDTH = 74;
const BACK_BUTTON_HEIGHT = 30;
const BACK_BUTTON_X = 12;
const BACK_BUTTON_CENTER_Y = 24;

/** 戦闘モード(通常戦・夜戦)を選ぶボタンの寸法と縦位置 */
const MODE_BUTTON_WIDTH = 96;
const MODE_BUTTON_HEIGHT = 26;
const MODE_BUTTON_GAP = 8;
const MODE_ROW_CENTER_Y = 76;

/**
 * 指揮官(自軍・対戦相手)を開くボタンの寸法と縦位置。
 * 指揮官は今後増やせるようにするため、選択画面には現在選んでいる指揮官だけを出し、
 * 一覧と説明は専用ウィンドウ(AiCharacterWindow)で見せる。
 * 自軍と対戦相手を並べて見比べられるよう、同じ行に 2 つ並べる。
 */
const CHARACTER_BUTTON_WIDTH = 190;
const CHARACTER_BUTTON_HEIGHT = 26;
const CHARACTER_ROW_CENTER_Y = 108;
/** ボタンの左に置く見出しラベルのぶんの幅と、ラベルとボタンの間隔 */
const CHARACTER_LABEL_WIDTH = 34;
const CHARACTER_LABEL_GAP = 8;
/** 「自軍」の列と「相手」の列の間隔 */
const CHARACTER_COLUMN_GAP = 24;
/** ボタン内の左端に置くエンブレム(指揮官の識別色の円)の半径と左余白 */
const CHARACTER_EMBLEM_RADIUS = 6;
const CHARACTER_EMBLEM_MARGIN = 10;

/**
 * 見出し・戦闘モード・ゲーム説明といったヘッダー側 UI の表示深度。
 * カード一覧はスクロールするとヘッダーの位置まで重なってくるため、
 * ヘッダーを手前に置いて入力(クリック)を先に受け取らせる。
 */
const HEADER_DEPTH = 10;

/** 説明文のフォント設定。カードの高さを測るときと描画するときで共有する */
const DESC_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'sans-serif',
  fontSize: '12px',
  color: '#c8c8d8',
};

/** 戦闘モードごとの、見出し下に出す説明文 */
const MODE_HINT: Readonly<Record<'normal' | 'night', string>> = {
  normal: '遊ぶマップを選んでください',
  night: '夜戦: 視界の外は暗く、敵ユニットが見えません',
};

/** まだマップを 1 枚も用意していない区分に出す案内 */
const EMPTY_GROUP_HINT: Readonly<Record<MapGroup, string>> = {
  standard: 'マップがありません',
  new: '新マップは準備中です',
  four: '4Pマップは準備中です',
};

/** 指揮官ボタン 1 つぶんの表示物(選択が変わるたびに塗り替える) */
interface CharacterButton {
  /** ボタンの左端 X 座標(エンブレムの位置の計算に使う) */
  readonly left: number;
  /** 選んでいる指揮官の識別色を描くエンブレム */
  readonly emblem: Phaser.GameObjects.Graphics;
  /** 選んでいる指揮官の肩書つきの名前 */
  readonly label: Phaser.GameObjects.Text;
}

/** カード 1 枚ぶんの配置情報(縦位置と高さは説明文の行数によってマップごとに変わる) */
interface CardLayout {
  readonly entry: ResolvedMapEntry;
  /** カード上端の Y 座標(スクロール量 0 のとき) */
  readonly y: number;
  /** カードの高さ */
  readonly height: number;
}

/**
 * モード選択画面から入るマップ選択画面。
 * モード選択画面で選んだマップ区分(通常 / 新 / 4P)のマップをカードとして縦に並べ、
 * クリックすると選んだマップを MainScene へ渡してゲームを開始する。
 * 見出しの下では戦闘モード(通常戦 / 夜戦)と指揮官(自軍 / 対戦相手)を選べる。
 * 夜戦を選ぶと、自軍の視界の外が暗くなり敵ユニットが見えない状態でゲームを始める
 * (詳細は docs/GameDesign.md「夜戦」を参照)。
 * 対戦相手ごとに敵軍AIの思考パターンが違い、指揮官によっては率いる軍に攻撃補正がかかる。
 * 一覧と説明は「自軍」「相手」ボタンから開く専用ウィンドウで見せる
 * (詳細は docs/GameDesign.md「敵AI」「指揮官の攻撃補正」を参照)。
 * 選んだマップの中断データが残っている場合は、再開するかどうかを確認ダイアログで尋ね、
 * 「はい」なら中断データから再開し、「いいえ」なら中断データを破棄して新規に開始する。
 * 担当サイド・操作の設定(モード選択画面で選ぶ)は見出しの左に表示し、
 * 左上の「戻る」でモード選択画面へ戻って選び直せる。
 * クリア状況(カードの「★ クリア済み」・激ムズマップの解放)は担当サイドごとに分かれており、
 * 選んでいるサイドのぶんだけを反映する。対人戦ではクリア記録に残らないため、これらは表示しない。
 */
export class MapSelectScene extends Phaser.Scene {
  /** ドラッグ(スワイプ)をクリックと区別するための移動量しきい値(画面ピクセル) */
  private static readonly DRAG_THRESHOLD = 8;

  /**
   * 直前に選ばれた戦闘モード。ゲームから戻ってきたときも選択を保つため、
   * シーンをまたいで残るクラス変数として持つ。
   */
  private static lastNightBattle = false;

  /**
   * 直前に選ばれた対戦相手。戦闘モードと同じく、ゲームから戻ってきても選択を保つ。
   */
  private static lastAiCharacterId: string = DEFAULT_AI_CHARACTER.id;

  /**
   * 直前に選ばれた自軍の指揮官。対戦相手と同じく、ゲームから戻ってきても選択を保つ。
   */
  private static lastPlayerCharacterId: string = DEFAULT_AI_CHARACTER.id;

  /**
   * 直前に開いていたマップ区分。ゲームやゲーム説明から戻ってきたときに
   * 同じ区分の一覧へ戻すため、シーンをまたいで残るクラス変数として持つ。
   */
  private static lastGroup: MapGroup = 'standard';

  /** この画面に並べるマップ区分(モード選択画面から渡される) */
  private group: MapGroup = MapSelectScene.lastGroup;
  /** モード選択画面で選んだ遊び方(担当サイド・操作の設定) */
  private mode: GameMode = DEFAULT_GAME_MODE;

  /** 現在選んでいる戦闘モードが夜戦かどうか */
  private nightBattle = MapSelectScene.lastNightBattle;
  /** 現在選んでいる対戦相手(敵指揮官)の識別子 */
  private aiCharacterId: string = MapSelectScene.lastAiCharacterId;
  /** 現在選んでいる自軍の指揮官の識別子 */
  private playerCharacterId: string = MapSelectScene.lastPlayerCharacterId;
  /** 見出し下の説明文(戦闘モードの切替で書き換える) */
  private hintText!: Phaser.GameObjects.Text;
  /** 戦闘モードのボタン(選択状態に応じて色を塗り替える) */
  private modeButtons: {
    readonly night: boolean;
    readonly rect: Phaser.GameObjects.Rectangle;
    readonly label: Phaser.GameObjects.Text;
  }[] = [];
  /** 自軍・対戦相手それぞれの指揮官ボタン(選んでいる指揮官名と識別色を出す) */
  private playerCharacterButton: CharacterButton | null = null;
  private enemyCharacterButton: CharacterButton | null = null;
  /** 指揮官の一覧・説明を見せるウィンドウ(初回オープン時に生成。自軍・相手で共用する) */
  private characterWindow: AiCharacterWindow | null = null;

  /** 中断データの再開確認に使うダイアログ(初回オープン時に生成) */
  private confirmWindow: ConfirmWindow | null = null;
  /** 画面表示時点の中断データ(なければ null)。カードの「中断データあり」表示にも使う */
  private suspendData: SaveData | null = null;
  /**
   * 画面表示時点のクリア状況。カードの「クリア済み」表示と激ムズマップの解放判定に使う。
   * 記録は担当サイド(1P側 / 2P側)ごとに分かれているため、参照するときは選んでいるサイドを渡す。
   */
  private clearProgress: ClearProgress = emptyClearProgress();
  /** この画面に並べるマップ(別サイド向けのマップと、未解放の激ムズマップは含まれない) */
  private entries: readonly ResolvedMapEntry[] = [];
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
  private pressedEntry: ResolvedMapEntry | null = null;

  constructor() {
    super('MapSelectScene');
  }

  /**
   * モード選択画面から、どの区分のマップ一覧を出すかを受け取る。
   * インゲームやゲーム説明から戻ってきたときは指定が無いため、直前の区分をそのまま使う。
   */
  init(data: { group?: MapGroup } = {}): void {
    if (data.group) {
      MapSelectScene.lastGroup = data.group;
    }
    this.group = MapSelectScene.lastGroup;
  }

  create(): void {
    // 保存済みの中断データを読み込む(壊れていた場合は null になり、新規開始の扱いになる)
    this.suspendData = readSuspendData();
    // クリア状況を読み込み、並べるマップを決める。
    // 激ムズマップは、選んでいるサイドで通常マップをすべてクリアするまで一覧に出さない。
    this.clearProgress = readClearProgress();
    // モード選択画面で選んだ遊び方(担当サイド・操作の設定)を読み込む
    this.mode = readGameMode();
    // 新マップは通常マップをすべてクリアするまで開かない(未解放ならカードを並べない)
    this.entries = this.isGroupUnlocked()
      ? visibleMaps(this.groupMaps(), this.clearProgress, this.mode.side)
      : [];
    this.confirmWindow = null;
    this.nightBattle = MapSelectScene.lastNightBattle;
    this.aiCharacterId = MapSelectScene.lastAiCharacterId;
    this.playerCharacterId = MapSelectScene.lastPlayerCharacterId;
    this.playerCharacterButton = null;
    this.enemyCharacterButton = null;
    this.modeButtons = [];
    this.characterWindow = null;
    // 直前に大きなマップを遊んでいた場合に備え、選択画面用の寸法へ戻す
    this.scale.resize(DEFAULT_DIMENSIONS.gameWidth, DEFAULT_DIMENSIONS.gameHeight);

    const width = DEFAULT_DIMENSIONS.gameWidth;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x12121e, 1);
    bg.fillRect(0, 0, width, DEFAULT_DIMENSIONS.gameHeight);

    // タイトル
    this.add
      .text(width / 2, 26, `${mapGroupLabel(this.group)}を選択`, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5);
    this.hintText = this.add
      .text(width / 2, 50, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // 左上にモード選択画面へ戻るボタン、その下に選んでいる遊び方を出す
    this.createBackButton();
    this.createModeSummary();

    // 戦闘モード(通常戦 / 夜戦)の選択
    this.createModeSelector(width);

    // 指揮官(自軍・対戦相手)の選択。対戦相手は敵軍AIの思考パターンが変わり、
    // どちらも攻撃補正を持つ指揮官なら、その軍の全ユニットの火力が上がる。
    // 対人戦では AI と戦わず補正もかけないため、指揮官は選ばせずその旨だけを出す。
    if (this.mode.versus === 'human') {
      this.createVersusHumanNotice(width);
    } else {
      this.createCharacterSelector(width);
    }

    // ゲーム説明ボタン(右上)。押すとゲームの流れを紹介する GuideScene を開く
    this.createGuideButton(width);

    // カード一覧はマップが増えると画面に収まらなくなるため、
    // コンテナへまとめてドラッグ(スワイプ)・ホイールでスクロールできるようにする。
    this.viewportHeight = DEFAULT_DIMENSIONS.gameHeight - CARD_TOP - LIST_BOTTOM_MARGIN;
    // カードの高さは説明文の折り返し行数によって変わるため、先に実測してから縦位置を決める
    const layouts = this.layoutCards(width - CARD_MARGIN_X * 2);
    const last = layouts[layouts.length - 1];
    const listBottom = last ? last.y + last.height : CARD_TOP;
    // 未解放の激ムズマップがあるときは、一覧の末尾に解放条件のヒントを出す
    const unlockHint = this.unlockHintText();
    this.contentHeight =
      listBottom - CARD_TOP + (unlockHint ? CARD_GAP + UNLOCK_HINT_HEIGHT : 0);
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

    for (const layout of layouts) {
      this.createMapCard(layout, width);
    }
    if (unlockHint) {
      this.cardLayer.add(
        this.add
          .text(width / 2, listBottom + CARD_GAP, unlockHint, {
            fontFamily: 'sans-serif',
            fontSize: '13px',
            color: '#ff9a6a',
          })
          .setOrigin(0.5, 0),
      );
    }

    // まだマップを用意していない区分(新マップ・4Pマップ)や、
    // 未解放の区分では、その旨を中央に出す
    if (this.entries.length === 0) {
      this.add
        .text(width / 2, CARD_TOP + this.viewportHeight / 2, this.emptyHintText(), {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: '#8a8aa0',
        })
        .setOrigin(0.5);
    }

    this.scrollbar = this.add.graphics();
    this.drawScrollbar(width);
    this.setupScrollInput(width);

    // シーンを抜けるときに、開いたままのウィンドウと入力ハンドラを片付ける
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.characterWindow?.close();
      this.characterWindow = null;
    });
  }

  /**
   * 一覧の末尾に出す、激ムズマップの解放条件のヒント文を返す。
   * 選んでいるサイド向けの激ムズマップが未登録のとき、
   * またはそのサイドですでに解放済み(一覧に並んでいる)ときは null を返す。
   * 対人戦ではクリア状況を出さないため、ヒントも出さない。
   */
  private unlockHintText(): string | null {
    if (!this.showsClearProgress()) {
      return null;
    }
    const entries = this.groupMaps();
    if (extraMapsForSide(entries, this.mode.side).length === 0) {
      return null;
    }
    const remaining = remainingRequiredMaps(entries, this.clearProgress, this.mode.side);
    if (remaining.length === 0) {
      return null;
    }
    return `あと ${remaining.length} マップをクリアすると、激ムズマップが現れる…`;
  }

  /**
   * クリア状況(カードの「★ クリア済み」・解放条件のヒント)を表示するか。
   * 対人戦は勝ってもクリア記録に残らないため、クリア状況は出さない。
   */
  private showsClearProgress(): boolean {
    return this.mode.versus !== 'human';
  }

  /**
   * 各カードの縦位置と高さを決める。
   * 説明文はカード幅で折り返すため、マップによって 1〜3 行と行数が変わる。
   * 画面に出さないテキストで実際の高さを測り、折り返したぶんだけカードを高くすることで
   * 説明文がカードの下へはみ出して読めなくなるのを防ぐ。
   */
  private layoutCards(cardWidth: number): CardLayout[] {
    const probe = this.add
      .text(0, 0, '', {
        ...DESC_TEXT_STYLE,
        wordWrap: { width: cardWidth - CARD_PADDING_X * 2 },
      })
      .setVisible(false);

    let y = CARD_TOP;
    const layouts = this.entries.map((entry) => {
      probe.setText(entry.description);
      const height = Math.max(
        CARD_MIN_HEIGHT,
        CARD_DESC_TOP + Math.ceil(probe.height) + CARD_DESC_BOTTOM,
      );
      const layout: CardLayout = { entry, y, height };
      y += height + CARD_GAP;
      return layout;
    });

    probe.destroy();
    return layouts;
  }

  /**
   * カード一覧のスクロール操作(ドラッグ・スワイプ・ホイール)を設定する。
   * わずかな移動はカードのクリックとして扱い、しきい値を超えて動いた場合だけ
   * スクロールと見なして選択は行わない(MainScene のマップスクロールと同じ操作感)。
   */
  private setupScrollInput(width: number): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 確認ダイアログ・対戦相手ウィンドウの表示中は、そちらが入力を処理する
      if (this.isWindowOpen()) {
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
        if (this.isWindowOpen()) {
          return;
        }
        this.setScrollOffset(this.scrollOffset - dy * WHEEL_SCROLL_STEP, width);
      },
    );
  }

  /**
   * 見出しの下に戦闘モード(通常戦 / 夜戦)の切替ボタンを並べる。
   * 選んだモードはカードを押したときに MainScene へ渡され、次回以降の初期選択にも残る。
   */
  private createModeSelector(width: number): void {
    const totalWidth = MODE_BUTTON_WIDTH * 2 + MODE_BUTTON_GAP;
    const left = width / 2 - totalWidth / 2;

    this.add
      .text(left - 12, MODE_ROW_CENTER_Y, '戦闘モード', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#c8c8d8',
      })
      .setOrigin(1, 0.5)
      .setDepth(HEADER_DEPTH);

    ([false, true] as const).forEach((night, index) => {
      const x = left + index * (MODE_BUTTON_WIDTH + MODE_BUTTON_GAP);
      const cx = x + MODE_BUTTON_WIDTH / 2;
      const rect = this.add
        .rectangle(
          x,
          MODE_ROW_CENTER_Y - MODE_BUTTON_HEIGHT / 2,
          MODE_BUTTON_WIDTH,
          MODE_BUTTON_HEIGHT,
          0x1f2740,
        )
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x3a4a6a)
        // スクロールしたカードがボタンの上へ重なってもクリックを奪われないよう手前に置く
        .setDepth(HEADER_DEPTH)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(cx, MODE_ROW_CENTER_Y, night ? '🌙 夜戦' : '☀ 通常戦', {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#c8c8d8',
        })
        .setOrigin(0.5)
        .setDepth(HEADER_DEPTH);
      rect.on(Phaser.Input.Events.POINTER_DOWN, () => this.selectMode(night));
      this.modeButtons.push({ night, rect, label });
    });

    this.updateModeSelector();
  }

  /**
   * 戦闘モードの下に、指揮官(自軍・対戦相手)を開くボタンを 2 つ並べて置く。
   * 指揮官は今後増やせるようにするため、ここには現在選んでいる指揮官だけを出し、
   * 押すと一覧と説明(攻撃補正・思考パターン)を並べた専用ウィンドウを開く。
   * 選んだ指揮官は MainScene へ渡され、次回以降の初期選択にも残る。
   */
  private createCharacterSelector(width: number): void {
    // 「見出し + ボタン」の列を 2 つ、行全体で中央へ寄せる
    const columnWidth =
      CHARACTER_LABEL_WIDTH + CHARACTER_LABEL_GAP + CHARACTER_BUTTON_WIDTH;
    const rowLeft = width / 2 - (columnWidth * 2 + CHARACTER_COLUMN_GAP) / 2;
    const playerLeft = rowLeft + CHARACTER_LABEL_WIDTH + CHARACTER_LABEL_GAP;
    const enemyLeft =
      rowLeft +
      columnWidth +
      CHARACTER_COLUMN_GAP +
      CHARACTER_LABEL_WIDTH +
      CHARACTER_LABEL_GAP;

    this.playerCharacterButton = this.createCharacterButton(playerLeft, '自軍', () =>
      this.openCharacterWindow('player'),
    );
    this.enemyCharacterButton = this.createCharacterButton(enemyLeft, '相手', () =>
      this.openCharacterWindow('enemy'),
    );
    this.updateCharacterButtons();
  }

  /**
   * 指揮官ボタン 1 つぶん(見出し・枠・エンブレム・名前・▼ 印)を作る。
   * 選んでいる指揮官の描き分けは updateCharacterButtons() が行う。
   */
  private createCharacterButton(
    left: number,
    heading: string,
    onOpen: () => void,
  ): CharacterButton {
    this.add
      .text(left - CHARACTER_LABEL_GAP, CHARACTER_ROW_CENTER_Y, heading, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#c8c8d8',
      })
      .setOrigin(1, 0.5)
      .setDepth(HEADER_DEPTH);

    const button = this.add
      .rectangle(
        left,
        CHARACTER_ROW_CENTER_Y - CHARACTER_BUTTON_HEIGHT / 2,
        CHARACTER_BUTTON_WIDTH,
        CHARACTER_BUTTON_HEIGHT,
        0x1f2740,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x3a4a6a)
      // 戦闘モードと同じく、スクロールしてきたカードにクリックを奪われないよう手前に置く
      .setDepth(HEADER_DEPTH)
      .setInteractive({ useHandCursor: true });

    // 選んでいる指揮官のエンブレム(識別色の円)をボタンの左端に描く
    const emblem = this.add.graphics().setDepth(HEADER_DEPTH + 1);

    const label = this.add
      .text(
        left + CHARACTER_EMBLEM_MARGIN + CHARACTER_EMBLEM_RADIUS * 2 + 8,
        CHARACTER_ROW_CENTER_Y,
        '',
        {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#8ad0ff',
        },
      )
      .setOrigin(0, 0.5)
      .setDepth(HEADER_DEPTH + 1);

    // 一覧を開けることが分かるよう、右端に印を出す
    this.add
      .text(left + CHARACTER_BUTTON_WIDTH - 8, CHARACTER_ROW_CENTER_Y, '▼', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        color: '#8ad0ff',
      })
      .setOrigin(1, 0.5)
      .setDepth(HEADER_DEPTH + 1);

    button.on(Phaser.Input.Events.POINTER_OVER, () => {
      button.setStrokeStyle(2, 0x8ad0ff);
      button.setFillStyle(0x263255);
    });
    button.on(Phaser.Input.Events.POINTER_OUT, () => {
      button.setStrokeStyle(2, 0x3a4a6a);
      button.setFillStyle(0x1f2740);
    });
    button.on(Phaser.Input.Events.POINTER_DOWN, onOpen);

    return { left, emblem, label };
  }

  /** 指揮官ボタンのエンブレムと名前を、現在の選択に合わせて描き直す */
  private updateCharacterButtons(): void {
    this.paintCharacterButton(this.playerCharacterButton, this.playerCharacterId);
    this.paintCharacterButton(this.enemyCharacterButton, this.aiCharacterId);
  }

  /** 指揮官ボタン 1 つを、指定の指揮官の識別色・名前で塗り直す */
  private paintCharacterButton(button: CharacterButton | null, id: string): void {
    if (!button) {
      return;
    }
    const character = getAiCharacter(id);
    // 攻撃補正を持つ指揮官は、ボタンの時点で分かるよう名前のうしろに添える
    const bonus =
      character.attackBonus > 0 ? ` +${Math.round(character.attackBonus * 100)}%` : '';
    button.label.setText(`${aiCharacterLabel(character)}${bonus}`);
    const cx = button.left + CHARACTER_EMBLEM_MARGIN + CHARACTER_EMBLEM_RADIUS;
    button.emblem.clear();
    button.emblem.fillStyle(character.emblemColor, 1);
    button.emblem.fillCircle(cx, CHARACTER_ROW_CENTER_Y, CHARACTER_EMBLEM_RADIUS);
    button.emblem.lineStyle(2, 0xffffff, 0.9);
    button.emblem.strokeCircle(cx, CHARACTER_ROW_CENTER_Y, CHARACTER_EMBLEM_RADIUS);
  }

  /**
   * 指揮官の一覧・説明を見せるウィンドウを開く。
   * 自軍・対戦相手のどちらを選び直すかで、見出しと操作案内・選択の反映先が変わる。
   */
  private openCharacterWindow(target: 'player' | 'enemy'): void {
    const width = DEFAULT_DIMENSIONS.gameWidth;
    const forPlayer = target === 'player';
    this.characterWindow ??= new AiCharacterWindow(this);
    this.characterWindow.open({
      gameWidth: width,
      gameHeight: DEFAULT_DIMENSIONS.gameHeight,
      viewWidth: width,
      viewHeight: DEFAULT_DIMENSIONS.gameHeight,
      selectedId: forPlayer ? this.playerCharacterId : this.aiCharacterId,
      title: forPlayer ? '自軍の指揮官を選ぶ' : '対戦相手を選ぶ',
      hint: forPlayer
        ? '一覧から選ぶと自軍の指揮官が切り替わります(攻撃補正のみ)'
        : '一覧から選ぶと対戦相手が切り替わります',
      onSelect: (id) => this.selectCharacter(target, id),
      onClose: () => {
        // 一覧を閉じた直後の押下がカードの選択として扱われないよう、状態を片付ける
        this.pressedEntry = null;
        this.isPanning = false;
        this.dragActive = false;
      },
    });
  }

  /** 自軍・対戦相手の指揮官を切り替え、ボタンの表示を更新する */
  private selectCharacter(target: 'player' | 'enemy', id: string): void {
    if (target === 'player') {
      if (this.playerCharacterId === id) {
        return;
      }
      this.playerCharacterId = id;
      MapSelectScene.lastPlayerCharacterId = id;
    } else {
      if (this.aiCharacterId === id) {
        return;
      }
      this.aiCharacterId = id;
      MapSelectScene.lastAiCharacterId = id;
    }
    this.updateCharacterButtons();
  }

  /** 戦闘モードを切り替え、ボタンの見た目と説明文を更新する */
  private selectMode(night: boolean): void {
    if (this.nightBattle === night) {
      return;
    }
    this.nightBattle = night;
    MapSelectScene.lastNightBattle = night;
    this.updateModeSelector();
  }

  /** 戦闘モードのボタンと説明文を、現在の選択に合わせて描き直す */
  private updateModeSelector(): void {
    for (const button of this.modeButtons) {
      const selected = button.night === this.nightBattle;
      button.rect.setFillStyle(selected ? 0x2d3b5a : 0x1f2740);
      button.rect.setStrokeStyle(2, selected ? 0x8ad0ff : 0x3a4a6a);
      button.label.setColor(selected ? '#8ad0ff' : '#c8c8d8');
    }
    this.hintText.setText(MODE_HINT[this.nightBattle ? 'night' : 'normal']);
  }

  /** 手前にウィンドウ(確認ダイアログ・対戦相手一覧)が開いているか */
  private isWindowOpen(): boolean {
    return (
      this.confirmWindow?.isOpen() === true || this.characterWindow?.isOpen() === true
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

  /**
   * この画面の区分が解放されているか。
   * 新マップは通常マップをすべてクリアするまで開かない
   * (1P側・2P側のどちらかで達成すればよい)。それ以外の区分は常に開いている。
   */
  private isGroupUnlocked(): boolean {
    if (this.group !== 'new') {
      return true;
    }
    return isNewGroupUnlocked(STANDARD_MAP_LIST, this.clearProgress);
  }

  /** カードが 1 枚も並ばないときに中央へ出す案内文(未解放なら解放条件を示す) */
  private emptyHintText(): string {
    if (!this.isGroupUnlocked()) {
      const remaining = remainingForNewGroup(STANDARD_MAP_LIST, this.clearProgress);
      return `通常マップをあと ${remaining} マップクリアすると解放されます`;
    }
    return EMPTY_GROUP_HINT[this.group];
  }

  /** この画面に出す対象(選んでいる区分のマップ)を返す */
  private groupMaps(): readonly ResolvedMapEntry[] {
    return mapsInGroup(MAP_LIST, this.group);
  }

  /** モード選択画面へ戻るボタンを左上に置く */
  private createBackButton(): void {
    const cx = BACK_BUTTON_X + BACK_BUTTON_WIDTH / 2;
    const button = this.add
      .rectangle(
        cx,
        BACK_BUTTON_CENTER_Y,
        BACK_BUTTON_WIDTH,
        BACK_BUTTON_HEIGHT,
        0x1f2740,
      )
      .setStrokeStyle(2, 0x3a4a6a)
      // スクロールしてきたカードにクリックを奪われないよう手前に置く
      .setDepth(HEADER_DEPTH)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, BACK_BUTTON_CENTER_Y, '← 戻る', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5)
      .setDepth(HEADER_DEPTH);

    button.on(Phaser.Input.Events.POINTER_OVER, () => {
      button.setStrokeStyle(2, 0x8ad0ff);
      button.setFillStyle(0x263255);
    });
    button.on(Phaser.Input.Events.POINTER_OUT, () => {
      button.setStrokeStyle(2, 0x3a4a6a);
      button.setFillStyle(0x1f2740);
    });
    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.scene.start('ModeSelectScene');
    });
  }

  /** モード選択画面で選んだ遊び方(担当サイド・操作の設定)を左上に表示する */
  private createModeSummary(): void {
    this.add
      .text(BACK_BUTTON_X, 50, gameModeSummary(this.mode), {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#ffd479',
      })
      .setOrigin(0, 0.5)
      .setDepth(HEADER_DEPTH);
  }

  /** 対人戦のときに、対戦相手(敵指揮官)の代わりに出す案内 */
  private createVersusHumanNotice(width: number): void {
    this.add
      .text(
        width / 2,
        CHARACTER_ROW_CENTER_Y,
        '対戦相手: もう 1 人のプレイヤー(指揮官の攻撃補正はどちらにもかかりません)',
        {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: '#c8c8d8',
        },
      )
      .setOrigin(0.5)
      .setDepth(HEADER_DEPTH);
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
      // 戦闘モードのボタンと同じく、重なってきたカードにクリックを奪われないようにする
      .setDepth(HEADER_DEPTH)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, cy, '❔ ゲーム説明', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#8ad0ff',
      })
      .setOrigin(0.5)
      .setDepth(HEADER_DEPTH);

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
  private createMapCard(layout: CardLayout, width: number): void {
    const { entry, y, height } = layout;
    const x = CARD_MARGIN_X;
    const cardWidth = width - CARD_MARGIN_X * 2;

    const rows = entry.definition.terrain.length;
    const cols = entry.definition.terrain[0]?.length ?? 0;

    // 激ムズマップは通常マップと見分けが付くよう、枠の色を変える
    const isExtra = entry.category === 'extra';
    const baseStroke = isExtra ? EXTRA_STROKE_COLOR : 0x3a4a6a;

    const card = this.add
      .rectangle(x, y, cardWidth, height, 0x1f2740)
      .setOrigin(0, 0)
      .setStrokeStyle(2, baseStroke)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(0, 0, cardWidth, height),
        hitAreaCallback: this.cardHitTest,
        useHandCursor: true,
      });
    this.cardLayer.add(card);

    // マップ名
    const nameText = this.add.text(x + CARD_PADDING_X, y + 12, entry.definition.name, {
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    });
    this.cardLayer.add(nameText);

    // マップ名の右へバッジを並べる(激ムズ表示 → クリア済み表示の順)
    let badgeX = x + CARD_PADDING_X + nameText.width + BADGE_GAP;
    const addBadge = (label: string, color: string): void => {
      const badge = this.add
        .text(badgeX, y + 17, label, {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color,
        })
        .setOrigin(0, 0);
      this.cardLayer.add(badge);
      badgeX += badge.width + BADGE_GAP;
    };
    if (isExtra) {
      addBadge('💀 激ムズ', '#ff9a6a');
    }
    // クリア済みのマップには実績としてクリア回数を出す(2 回目以降は「×N」を添える)。
    // クリア記録は担当サイドごとに分かれているため、選んでいるサイドのぶんだけを見る。
    const record = this.showsClearProgress()
      ? clearRecordOf(this.clearProgress, this.mode.side, entry.id)
      : null;
    if (record) {
      const count = record.clearCount > 1 ? ` ×${record.clearCount}` : '';
      const night = record.nightCleared ? '(夜戦)' : '';
      addBadge(`★ クリア済み${night}${count}`, '#8affc0');
    }

    // サイズ表記(横×縦)
    this.cardLayer.add(
      this.add.text(x + CARD_PADDING_X, y + 38, `サイズ: 横${cols} × 縦${rows}`, {
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
          x + cardWidth - CARD_PADDING_X,
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
      this.add.text(x + CARD_PADDING_X, y + CARD_DESC_TOP, entry.description, {
        ...DESC_TEXT_STYLE,
        wordWrap: { width: cardWidth - CARD_PADDING_X * 2 },
      }),
    );

    // ホバーで枠を強調する
    card.on(Phaser.Input.Events.POINTER_OVER, () => {
      card.setStrokeStyle(2, 0x8ad0ff);
      card.setFillStyle(0x263255);
    });
    card.on(Phaser.Input.Events.POINTER_OUT, () => {
      card.setStrokeStyle(2, baseStroke);
      card.setFillStyle(0x1f2740);
    });
    card.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // 一覧の外(切り抜かれて見えていない部分)の押下は無視する
      this.pressedEntry =
        !this.isWindowOpen() && this.isInsideList(pointer) ? entry : null;
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
    const save = this.savedDataFor(entry);
    if (save) {
      this.cardLayer.add(
        this.add
          .text(
            x + cardWidth - CARD_PADDING_X,
            y + 12,
            save.nightBattle ? '中断データあり(夜戦)' : '中断データあり',
            {
              fontFamily: 'sans-serif',
              fontSize: '12px',
              fontStyle: 'bold',
              color: '#ffd479',
            },
          )
          .setOrigin(1, 0),
      );
    }
  }

  /**
   * カードの当たり判定。カードの矩形内であっても、一覧の表示領域(マスクで切り抜いた範囲)から
   * はみ出した部分は反応させない。スクロールでヘッダーの位置まで上がってきたカードが
   * 戦闘モードやゲーム説明のボタンのクリックを横取りするのを防ぐ。
   * Phaser から呼ばれるため、this を固定できるようアロー関数のプロパティとして持つ。
   */
  private readonly cardHitTest = (
    hitArea: Phaser.Geom.Rectangle,
    localX: number,
    localY: number,
    card: Phaser.GameObjects.GameObject,
  ): boolean => {
    if (!Phaser.Geom.Rectangle.Contains(hitArea, localX, localY)) {
      return false;
    }
    // localY はカード上端からの距離。コンテナのスクロール量を足すと画面上の Y になる
    const screenY = this.cardLayer.y + (card as Phaser.GameObjects.Rectangle).y + localY;
    return screenY >= CARD_TOP && screenY <= CARD_TOP + this.viewportHeight;
  };

  /** 指定マップで再開できる中断データがあれば返す。なければ null */
  private savedDataFor(entry: ResolvedMapEntry): SaveData | null {
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
  private selectMap(entry: ResolvedMapEntry): void {
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

  /**
   * 選んだマップでゲームを開始する。save を渡すとその中断データから再開する。
   * 再開時の戦闘モード・指揮官・モード選択の内容は中断データに保存されたものを使い、
   * 新規開始時はこの画面で選んでいるものを使う。
   */
  private startGame(entry: ResolvedMapEntry, save?: SaveData): void {
    this.scene.start('MainScene', {
      map: entry.definition,
      mapId: entry.id,
      nightBattle: save ? save.nightBattle : this.nightBattle,
      aiCharacterId: save ? save.aiCharacterId : this.aiCharacterId,
      playerCharacterId: save ? save.playerCharacterId : this.playerCharacterId,
      // 担当サイド・操作の設定も、再開時は中断データに保存されたものを使う
      playerSide: save ? save.playerSide : this.mode.side,
      versusMode: save ? save.versusMode : this.mode.versus,
      save,
    });
  }
}
