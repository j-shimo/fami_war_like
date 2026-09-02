import Phaser from 'phaser';
import { SoundManager } from '@/audio/SoundManager';
import { EnemyAi, type AiAction } from '@/core/ai/EnemyAi';
import {
  findAttackableTargets,
  type AttackTargetOptions,
} from '@/core/battle/AttackRange';
import { forecastBattle } from '@/core/battle/BattleForecast';
import { NO_COMMANDER_BONUS, type CommanderBonus } from '@/core/battle/CommanderBonus';
import { BattleManager, type AttackResult } from '@/core/battle/BattleManager';
import { CaptureSystem } from '@/core/economy/CaptureSystem';
import { EconomyManager } from '@/core/economy/EconomyManager';
import {
  ProductionManager,
  type ProductionResult,
} from '@/core/economy/ProductionManager';
import { RepairManager, type RepairResult } from '@/core/economy/RepairManager';
import { equals, gridPosition, type GridPosition } from '@/core/map/GridPosition';
import { gridToWorld, gridToWorldCenter, worldToGrid } from '@/core/map/coordinates';
import { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import {
  calculateMovementRange,
  findMergeTargets,
  findTransportTargets,
  findUnloadPositions,
  resolveMovePath,
  type MovementOptions,
  type MovementRange,
  type MovePathResult,
} from '@/core/movement/MovementRange';
import {
  DEFAULT_GAME_MODE,
  firstArmy,
  swapsSides,
  type PlayerSide,
  type VersusMode,
} from '@/core/mode/GameMode';
import { computeVisibility, unitVision, Visibility } from '@/core/night/Visibility';
import {
  BattleStatsRecorder,
  emptyBattleStats,
  type BattleStats,
} from '@/core/stats/BattleStats';
import {
  createSaveData,
  restoreGameState,
  type RestoredState,
  type SaveData,
} from '@/core/save/SaveData';
import { recordMapClear, readClearProgress } from '@/core/progress/ClearProgress';
import { becameUnlocked } from '@/core/progress/MapUnlock';
import { clearSuspendData, writeSuspendData } from '@/core/save/SaveStorage';
import {
  readEnemyAnimationMode,
  writeEnemyAnimationMode,
} from '@/core/settings/SettingsStorage';
import { enemyAnimationModeLabel, type EnemyAnimationMode } from '@/data/enemyAnimation';
import { TurnManager, type TurnArmy } from '@/core/turn/TurnManager';
import type { Unit } from '@/core/units/Unit';
import { mergedHp } from '@/core/units/merge';
import { UnitManager } from '@/core/units/UnitManager';
import type { UnitType } from '@/core/units/UnitType';
import {
  VictoryConditionChecker,
  type VictoryResult,
} from '@/core/victory/VictoryConditionChecker';
import { computeGameDimensions, INFO_PANEL_WIDTH, TILE_SIZE } from '@/data/gameConfig';
import { DEFAULT_MAP_ENTRY, MAP_LIST, STANDARD_MAP_LIST } from '@/data/maps';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { swapMapSides } from '@/data/maps/sideSwap';
import { getTerrainData } from '@/data/terrainData';
import {
  formatCaptureLog,
  formatFunds,
  formatIncome,
  formatProductionLog,
  formatRepairLog,
  listProductionItems,
} from '@/ui/economyInfo';
import { formatEnemyActionLog, formatEnemyTurnSummary } from '@/ui/aiInfo';
import {
  aiCharacterLabel,
  getAiCharacter,
  DEFAULT_AI_CHARACTER,
  type AiCharacter,
} from '@/data/aiCharacters';
import { buildBattleForecastView, type ForecastAlert } from '@/ui/forecastInfo';
import { buildAttackSequence } from '@/rendering/attackSequence';
import { buildMoveSequence, type MoveSequence } from '@/rendering/moveSequence';
import {
  buildEnemyActionView,
  enemyActionUnit,
  ENEMY_ACTION_GAP_MS,
  ENEMY_CAMERA_PAN_MS,
  ENEMY_RESULT_HOLD_MS,
  ENEMY_SELECT_HOLD_MS,
  ENEMY_TURN_BANNER_MS,
  type EnemyActionView,
} from '@/rendering/enemyActionSequence';
import { BattleEffects, DAMAGE_COLOR } from '@/rendering/battleEffects';
import { formatResultMessage } from '@/ui/resultInfo';
import { formatTerrainInfo } from '@/ui/terrainInfo';
import { armyLabel, formatTurnBanner, type ArmyLabelOptions } from '@/ui/turnInfo';
import { formatUnitInfo } from '@/ui/unitInfo';
import {
  computeRailLinks,
  computeRiverLinks,
  computeRoadLinks,
  type RoadLinks,
} from '@/rendering/roadLinks';
import { ConfirmWindow } from '@/rendering/ConfirmWindow';
import { ProductionWindow } from '@/rendering/ProductionWindow';
import { VolumeWindow } from '@/rendering/VolumeWindow';
import { EnemyAnimationWindow } from '@/rendering/EnemyAnimationWindow';
import { UnitGuideWindow } from '@/rendering/UnitGuideWindow';
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
 * 「敵の行動アニメ」は敵軍ターンの描画モード切替を、「音量」は音量調整ウィンドウを、
 * 「中断」は中断確認ダイアログを開く。それ以外の項目の画面は今後実装する。
 */
const INFO_MENU_ITEMS = [
  'ユニット説明',
  '操作',
  '敵の行動アニメ',
  '音量',
  '中断',
] as const;

/**
 * 移動可能範囲の塗り色と濃さ。
 * 海(0x2f6aa0)や港(0x4a7f9e)といった青系の地形と塗り色が近いと水上の移動範囲が
 * 見分けづらいため、地形より明るい水色寄りの青を使って浮かび上がらせる。
 */
const MOVE_RANGE_FILL_COLOR = 0x6fb7ff;
const MOVE_RANGE_FILL_ALPHA = 0.42;

/**
 * 移動可能範囲の外周を縁取る輪郭線。
 * 塗りだけでは背景の地形色に左右されるため、範囲の外側と接する辺だけを明るい線で描き、
 * どの地形の上でも「どこまで動けるか」の境界がはっきり分かるようにする。
 */
const MOVE_RANGE_OUTLINE_COLOR = 0xe4f3ff;
const MOVE_RANGE_OUTLINE_ALPHA = 0.95;
const MOVE_RANGE_OUTLINE_WIDTH = 3;

/** 合流できる味方ユニットを示す枠の色(攻撃対象の赤枠と区別する緑枠) */
const MERGE_TARGET_COLOR = 0x5ad469;

/** 搭乗できる輸送ユニットを示す枠の色(合流の緑・攻撃の赤と区別する水色) */
const BOARD_TARGET_COLOR = 0x5ad0f0;

/** 輸送ヘリが運んでいるユニットの降車先を示す枠の色(合流と同じ緑系) */
const UNLOAD_TILE_COLOR = 0x5ad469;

/** 夜戦で暗いマスに重ねる暗幕の色と濃さ(地形は透けて見える濃さにする) */
const NIGHT_FOG_COLOR = 0x05050f;
const NIGHT_FOG_ALPHA = 0.62;

/** 攻撃演出(踏み込み・ダメージ数字・爆散)の描画深度(ユニットより手前) */
const BATTLE_EFFECT_DEPTH = 90;

/** ダメージ予測ポップアップの描画深度(攻撃演出より手前) */
const FORECAST_POPUP_DEPTH = 100;

/**
 * ダメージ予測ポップアップの危険度別の配色。
 * 反撃で撃破される予測(danger)は、枠・背景・強調行のすべてを赤に振って
 * 「やられる」ことがひと目で分かるようにする。
 */
const FORECAST_STYLE: Record<
  ForecastAlert,
  { bg: number; border: number; borderWidth: number; alertColor: string }
> = {
  danger: { bg: 0x3a0d14, border: 0xff2d2d, borderWidth: 4, alertColor: '#ff5555' },
  kill: { bg: 0x12121e, border: 0xffd479, borderWidth: 2, alertColor: '#ffd479' },
  none: { bg: 0x12121e, border: 0xff5a5a, borderWidth: 2, alertColor: '#ffffff' },
};

/** ダメージ予測ポップアップの余白 */
const FORECAST_PAD_X = 8;
const FORECAST_PAD_Y = 6;
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
 *   生産: ユニットのいない自軍の生産拠点を選ぶとマスの近くに「生産」コマンドを出し、
 *   押すと生産ウィンドウ(アイコン・名前・料金を行ごとに並べ、超過ぶんは上下スクロール)を開く。
 *   資金の足りない行はグレー表示で選べず、暗幕や × でウィンドウを閉じる。
 * Phase 8: 攻撃・占領のたびに勝敗を判定する。
 *   敵本拠地の占領・敵軍全滅で勝利、自軍本拠地の占領・自軍全滅で敗北とし、
 *   決着したら結果オーバーレイを表示して以降の操作を止める。
 * 修理: ターン開始時、自軍の修理拠点上のダメージユニットを資金を消費して回復する
 *   (収入計上の直後に実行)。地上ユニットは都市・工場・本拠地、飛行ユニットは空港でのみ修理できる。
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
 *   「ユニット説明 / 操作 / 敵の行動アニメ / 音量 / 中断」のメニューを出す。未実装の項目の画面は今後実装する。
 *   タッチ端末では右クリックの代わりに長押し(その場で一定時間押し続ける)で同じメニューを出す。
 * 中断: 情報メニューの「中断」を選ぶと確認ダイアログを出し、「はい」で今の盤面を中断データとして
 *   保存してマップ選択画面へ戻る。中断データはマップ選択画面から再開できる。
 * モード選択: モード選択画面で選んだ内容(担当サイド・操作の設定)に従って開始する。
 *   2P側では盤面の自軍・敵軍を入れ替え、敵軍(元の 1P 側)を先手にして後手番で戦う。
 *   対人戦(プレイヤー vs プレイヤー)では敵軍AIを動かさず、両陣営とも人間が交代で操作する。
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
  /** 夜戦で暗いマスに重ねる暗幕(地形の上・ユニットの下に描く) */
  private fogGraphics!: Phaser.GameObjects.Graphics;
  private unitLayer!: Phaser.GameObjects.Container;
  private rangeGraphics!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private turnText!: Phaser.GameObjects.Text;
  private fundsText!: Phaser.GameObjects.Text;
  private incomeText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  /** ダメージ予測ポップアップ(背景+テキストをまとめたコンテナ。初期は非表示) */
  private forecastPopup!: Phaser.GameObjects.Container;
  private forecastBg!: Phaser.GameObjects.Graphics;
  private forecastText!: Phaser.GameObjects.Text;
  /** 撃破・被撃破を大きく伝える強調行(該当しないときは非表示) */
  private forecastAlertText!: Phaser.GameObjects.Text;
  /** 被撃破予測のときに強調行を点滅させる Tween(点滅していなければ null) */
  private forecastBlink: Phaser.Tweens.Tween | null = null;
  /** 予測ポップアップを現在表示している攻撃対象(重複更新を避ける) */
  private forecastTarget: Unit | null = null;
  /** 攻撃演出(踏み込み・ダメージ数字・爆散)の描画 */
  private effects!: BattleEffects;
  /**
   * 攻撃演出で分身トークンを動かしているユニット。
   * 演出中は盤面側の描画から外し、二重に見えないようにする。
   */
  private animatingUnit: Unit | null = null;
  /** 攻撃演出の再生中か。再生中はマップ操作とターン終了を受け付けない */
  private attackAnimating = false;
  /**
   * 移動演出(ルートに沿って走る動きと、夜戦の遭遇演出)の再生中か。
   * 再生中はマップ操作とターン終了を受け付けない。
   */
  private moveAnimating = false;
  /**
   * 敵軍ターンの行動演出(「敵の行動アニメ」が「簡単」以上のとき)の再生中か。
   * 再生中はマップ操作とターン終了を受け付けない。
   */
  private enemyTurnAnimating = false;
  /**
   * 攻撃で撃破されたが、爆散の演出が終わるまで盤面に残して見せるユニット。
   * ゲームロジック上はすでに盤面から取り除かれている。
   */
  private pendingDefeated: Unit[] = [];
  private selected: GridPosition | null = null;
  /** 移動対象として選択中の自軍ユニット(未選択なら null) */
  private movingUnit: Unit | null = null;
  /** movingUnit の移動可能範囲 */
  private movementRange: MovementRange | null = null;
  /** movingUnit が現在位置から攻撃できる敵ユニット */
  private attackTargets: Unit[] = [];
  /** movingUnit が移動範囲内で合流できる味方の同種ユニット */
  private mergeTargets: Unit[] = [];
  /** movingUnit が移動範囲内で搭乗できる味方の輸送ユニット(輸送ヘリ・輸送艦) */
  private boardTargets: Unit[] = [];
  /** コマンドメニューの「降ろす」を選び、降車先マスのクリック待ちになっているか */
  private awaitingUnloadTarget = false;
  /** 「降ろす」で選んだ搭乗ユニット(輸送艦は 2 体まで運ぶため、どれを降ろすかを保持する) */
  private unloadPassenger: Unit | null = null;
  /** 輸送ユニットが運んでいるユニットを降ろせる隣接マス(降車先の選択待ち中に保持) */
  private unloadPositions: GridPosition[] = [];
  /** 移動後に攻撃/占領/待機の選択待ちになっているユニット(いなければ null) */
  private commandUnit: Unit | null = null;
  /** commandUnit が乗っているマス(占領コマンドの対象。いなければ null) */
  private commandTile: TileData | null = null;
  /** commandUnit の移動前の位置(メニュー外クリックで移動を取り消して戻すのに使う。いなければ null) */
  private commandOrigin: GridPosition | null = null;
  /**
   * 移動後コマンドの最中に、取り消せない行動(降車)を実行済みかどうか。
   * 輸送艦は 2 体を続けて降ろせるようにコマンドメニューへ戻るが、1 体でも降ろした時点で
   * その移動は確定しているため、以降はメニュー外クリックや情報メニューで移動を巻き戻さず、
   * 待機として行動を終える。
   */
  private commandCommitted = false;
  /** 移動後、コマンドメニューの「攻撃」を押すと攻撃対象にできる敵(メニュー表示中に保持) */
  private pendingAttackTargets: Unit[] = [];
  /** コマンドメニューで「攻撃」を選び、攻撃対象のクリック待ちになっているか */
  private awaitingAttackTarget = false;
  /** 何もないマスの右クリックで出す情報メニューを表示中か */
  private infoMenuOpen = false;
  /** 動的に生成する占領・生産コマンドのボタン群 */
  private actionButtons: Phaser.GameObjects.GameObject[] = [];
  /** 生産ウィンドウ(「生産」コマンドで開くユニット選択画面。初回オープン時に生成) */
  private productionWindow: ProductionWindow | null = null;
  /** 音量調整ウィンドウ(情報メニューの「音量」で開く。初回オープン時に生成) */
  private volumeWindow: VolumeWindow | null = null;
  /** ユニット説明ウィンドウ(情報メニューの「ユニット説明」で開く。初回オープン時に生成) */
  private unitGuideWindow: UnitGuideWindow | null = null;
  /** 確認ダイアログ(情報メニューの「中断」で開く。初回オープン時に生成) */
  private confirmWindow: ConfirmWindow | null = null;
  /** 敵の行動アニメ設定ウィンドウ(情報メニューの同名項目で開く。初回オープン時に生成) */
  private enemyAnimationWindow: EnemyAnimationWindow | null = null;
  /**
   * 敵の行動アニメ(敵軍ターンをどこまで描画するか)。
   * 情報メニューの「敵の行動アニメ」で切り替え、localStorage に保存して次回も引き継ぐ。
   */
  private enemyAnimationMode: EnemyAnimationMode = 'simple';
  /** 「生産」コマンドで選んでいる生産拠点のマス(生産ウィンドウ表示中に保持) */
  private productionTile: TileData | null = null;
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
  /** 遊ぶマップの識別子(中断データの保存・照合に使う) */
  private mapId: string = DEFAULT_MAP_ENTRY.id;
  /** 再開する中断データ(マップ選択画面から渡される。新規ゲームなら null) */
  private resumeSave: SaveData | null = null;
  /** 夜戦モードで遊んでいるか(マップ選択画面で選ぶ) */
  private nightBattle = false;
  /** 対戦している敵指揮官(マップ選択画面で選ぶ)。思考パターンはここから決まる */
  private aiCharacter: AiCharacter = DEFAULT_AI_CHARACTER;
  /**
   * 自軍を率いる指揮官(マップ選択画面で選ぶ)。
   * 自軍はプレイヤーが操作するため思考パターンは使わず、攻撃補正だけが効く。
   */
  private playerCharacter: AiCharacter = DEFAULT_AI_CHARACTER;
  /**
   * 両軍の指揮官から決まる、軍ごとの攻撃補正。
   * 戦闘・戦闘予測・敵軍AIの見積もりで同じ数値を使うよう、init() で 1 度だけ組み立てる。
   */
  private commanderBonus: CommanderBonus = NO_COMMANDER_BONUS;
  /** 担当するプレイヤーサイド(モード選択画面で選ぶ)。2P側は盤面を入れ替えて後手番になる */
  private playerSide: PlayerSide = DEFAULT_GAME_MODE.side;
  /** 操作の設定(モード選択画面で選ぶ)。対人戦では敵軍AIを動かさない */
  private versusMode: VersusMode = DEFAULT_GAME_MODE.versus;
  /** このゲームの戦績(撃破数・生産数・占領数など)を数える記録係 */
  private stats = new BattleStatsRecorder();
  /** 中断データから引き継ぐ戦績(新規ゲームなら null) */
  private resumedStats: BattleStats | null = null;
  /**
   * 自軍から見た現在の視界。夜戦では明るいマスと発見済みの敵を保持する。
   * 昼戦ではすべてが見える視界になるため、判定を分岐せずにそのまま使える。
   * 盤面が変わるたびに drawUnits() から計算し直す。
   */
  private visibility: Visibility = Visibility.daylightFor('player');
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

  /**
   * マップ選択画面から遊ぶマップ・戦闘モード・対戦相手・モード選択の内容を受け取る
   * (未指定なら既定値)。2P側のときはここでマップ定義の自軍・敵軍を入れ替える。
   * 中断データから再開する場合は save も渡され、create() で盤面を復元する。
   */
  init(data: {
    map?: MapDefinition;
    mapId?: string;
    nightBattle?: boolean;
    aiCharacterId?: string;
    playerCharacterId?: string;
    playerSide?: PlayerSide;
    versusMode?: VersusMode;
    save?: SaveData;
  }): void {
    this.playerSide = data.playerSide ?? DEFAULT_GAME_MODE.side;
    this.versusMode = data.versusMode ?? DEFAULT_GAME_MODE.versus;
    const definition = data.map ?? DEFAULT_MAP_ENTRY.definition;
    // 2P側では拠点の所有者とユニットの所属を入れ替え、これまで敵軍だった側を担当する
    this.mapDef = swapsSides(this.playerSide) ? swapMapSides(definition) : definition;
    this.mapId = data.mapId ?? DEFAULT_MAP_ENTRY.id;
    this.resumeSave = data.save ?? null;
    this.resumedStats = data.save?.stats ?? null;
    this.nightBattle = data.nightBattle ?? false;
    // 未知の識別子(古い中断データなど)の場合は既定の指揮官にフォールバックする
    this.aiCharacter = getAiCharacter(data.aiCharacterId);
    this.playerCharacter = getAiCharacter(data.playerCharacterId);
    // 対人戦では指揮官を選ばない(どちらの手番も人が操作する)ため、補正もかけない。
    // 対 CPU では自軍・敵軍それぞれの指揮官の攻撃補正がそのまま軍の補正になる
    this.commanderBonus =
      this.versusMode === 'human'
        ? NO_COMMANDER_BONUS
        : {
            player: this.playerCharacter.attackBonus,
            enemy: this.aiCharacter.attackBonus,
          };
    // 敵の行動アニメは中断データではなくゲーム設定として保存しているため、
    // マップ・再開の内容とは関わりなく毎回保存済みの設定を読み直す
    this.enemyAnimationMode = readEnemyAnimationMode();
    // シーンを再入場したときのために状態を初期化しておく
    this.gameOver = false;
    this.audioStarted = false;
  }

  create(): void {
    this.map = MapManager.fromDefinition(this.mapDef);
    // 中断データを渡されていれば、保存時の盤面(ユニット・占領状況・ターン・資金)を復元する
    const restored = this.restoreFromSave();
    this.units =
      restored?.units ?? UnitManager.fromPlacements(this.mapDef.units ?? [], this.map);

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
    this.battle = new BattleManager(this.map, this.units, this.commanderBonus);
    // 2P側は後手番。入れ替え後の敵軍(元の 1P 側)を先手にする
    this.turn =
      restored?.turn ??
      new TurnManager(this.units, undefined, firstArmy(this.playerSide));
    this.economy =
      restored?.economy ?? new EconomyManager({ initialFunds: this.mapDef.initialFunds });
    this.capture = new CaptureSystem();
    this.production = new ProductionManager(this.map, this.units, this.economy);
    this.repair = new RepairManager(this.map, this.units, this.economy);
    this.victory = new VictoryConditionChecker(this.map, this.units);
    // 戦績は中断データにも保存する。再開時は保存されていた数から数え続ける
    // (中断データを復元できなかったときは新規ゲーム扱いなので 0 から数え直す)
    this.stats = new BattleStatsRecorder(
      (restored && this.resumedStats) || emptyBattleStats(),
    );
    this.resumedStats = null;
    this.ai = new EnemyAi({
      map: this.map,
      units: this.units,
      battle: this.battle,
      capture: this.capture,
      production: this.production,
      // 夜戦では敵軍AIも自軍と同じ視界のルールで戦う
      nightBattle: this.nightBattle,
      // 選んだ敵指揮官の思考パターン(生産方針・進軍方針)で戦わせる
      behavior: this.aiCharacter.behavior,
      // 与ダメージ・被反撃の見積もりを実際の戦闘とそろえるため、同じ補正を渡す
      commanderBonus: this.commanderBonus,
    });
    this.audio = new SoundManager();
    // ブラウザが非アクティブ(タブ切替・アプリ切替)の間はゲーム音を止める
    this.audio.bindPageVisibility();
    // シーンを抜けるときに BGM 停止・監視解除・AudioContext の破棄まで行う
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.dispose());

    this.createTerrainLayer();
    this.drawTerrain();
    this.drawGridLines();
    this.createFogLayer();
    this.createRangeOverlay();
    this.createUnitLayer();
    this.drawUnits();
    this.createHighlight();
    this.createInfoPanel();
    this.createMuteButton();
    this.createEndTurnButton();
    this.createForecastPopup();
    // 演出レイヤーはコンテナのため、シーン再入場のたびに作り直す
    this.effects = new BattleEffects(this, TILE_SIZE, BATTLE_EFFECT_DEPTH);
    this.attackAnimating = false;
    this.moveAnimating = false;
    this.enemyTurnAnimating = false;
    this.animatingUnit = null;
    this.pendingDefeated = [];

    // 開始時(自軍第1ターン)の収入計上と拠点上ユニットの修理を行う。
    // 中断データからの再開はターンの途中からなので、開始時の経済処理はやり直さない。
    const repairs = restored ? [] : this.runTurnStartEconomy();
    this.updateTurnText();
    this.updateEconomyText();
    if (repairs.length > 0) {
      this.drawUnits();
      this.infoText.setText(formatRepairLog(repairs));
    }
    this.setupInput();

    // 開始時は自軍の本拠地へカメラを寄せ、どこから始めるか分かりやすくする
    this.focusPlayerHeadquarters();

    if (this.shouldRunAi()) {
      // 2P側(後手番)では敵軍AIの手番から始まる。開始バナーは敵軍ターンの演出側で出す
      this.runEnemyTurn(() => this.startPlayerTurn());
      return;
    }

    // 開始演出として先手の第1ターンのバナーを表示する
    this.showTurnStartBanner();
  }

  /**
   * いま手番を持っているのが敵軍AIかどうか。
   * 対人戦では AI を動かさないため、常に false を返す。
   */
  private shouldRunAi(): boolean {
    return this.versusMode === 'cpu' && this.turn.currentArmy === 'enemy';
  }

  /**
   * 情報パネル・バナーで軍勢をどう呼ぶかの設定。
   * 対人戦では「自軍 / 敵軍」ではなく先手・後手で「1P / 2P」と呼び分ける。
   */
  private armyLabelOptions(): ArmyLabelOptions {
    return { versus: this.versusMode, side: this.playerSide };
  }

  /**
   * 盤面を見ている側の軍勢。夜戦の視界(暗幕)の基準に使う。
   * 対 CPU ではプレイヤーが操作する自軍で固定し、対人戦では手番側から見た視界にする。
   */
  private viewArmy(): TurnArmy {
    return this.versusMode === 'human' ? this.turn.currentArmy : 'player';
  }

  /**
   * マップ選択画面から中断データを渡されていれば、その内容でゲーム状態を復元する。
   * 復元した中断データは(成否にかかわらず)保存先から削除する。再開後は同じデータで
   * 何度も再開できないようにし、壊れたデータが残り続けるのも防ぐ。
   * 復元できなかった場合は null を返し、新規ゲームとして開始する。
   */
  private restoreFromSave(): RestoredState | null {
    const save = this.resumeSave;
    this.resumeSave = null;
    if (!save) {
      return null;
    }
    clearSuspendData();
    try {
      return restoreGameState(save, this.map);
    } catch (error) {
      console.warn('中断データを復元できませんでした', error);
      // 途中まで書き戻したマップを捨て、マップ定義から作り直して新規ゲームとして始める
      this.map = MapManager.fromDefinition(this.mapDef);
      return null;
    }
  }

  /**
   * 自軍の本拠地へカメラの中心を合わせる。
   * マップがビューポートに収まる場合はカメラ境界によりスクロール量が 0 に固定されるため、
   * 従来どおりの表示になる。本拠地が無いマップでは自軍所有の拠点、それも無ければ何もしない。
   */
  private focusPlayerHeadquarters(): void {
    let target: TileData | undefined;
    let fallback: TileData | undefined;
    const army = this.viewArmy();

    this.map.forEachTile((tile) => {
      if (tile.owner !== army) {
        return;
      }
      if (tile.terrainType === 'headquarters' && target === undefined) {
        target = tile;
      } else if (fallback === undefined && getTerrainData(tile.terrainType).canCapture) {
        fallback = tile;
      }
    });

    const focusTile = target ?? fallback;
    if (focusTile === undefined) {
      return;
    }

    const center = gridToWorldCenter(focusTile.position, TILE_SIZE);
    this.cameras.main.centerOn(center.x, center.y);
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

  /**
   * 夜戦の暗幕用グラフィックスを用意する(地形の上・移動範囲やユニットより下に描く)。
   * 暗いマスでも地形は見える必要があるため、暗幕は半透明で重ねる。
   */
  private createFogLayer(): void {
    this.fogGraphics = this.add.graphics();
  }

  /** 移動範囲・攻撃範囲の塗り用グラフィックスを用意する(ユニットより下に描く) */
  private createRangeOverlay(): void {
    this.rangeGraphics = this.add.graphics();
  }

  /**
   * 盤面を見ている側から見た視界を計算し直し、暗幕を描き直す。
   * ユニットの移動・撃破・生産や拠点の占領で明るい範囲が変わるため、
   * 盤面を描き直す drawUnits() の冒頭から必ず呼ぶ。
   * 対人戦では手番が移るたびに、その手番側から見た視界へ切り替わる。
   */
  private refreshVisibility(): void {
    this.visibility = computeVisibility(
      this.map,
      this.units,
      this.viewArmy(),
      this.nightBattle,
    );
    this.drawFog();
  }

  /** 夜戦で暗いマス(自軍の視界の外)へ暗幕を重ねる。昼戦では何も描かない */
  private drawFog(): void {
    this.fogGraphics.clear();
    if (this.visibility.isDaylight) {
      return;
    }
    this.fogGraphics.fillStyle(NIGHT_FOG_COLOR, NIGHT_FOG_ALPHA);
    this.map.forEachTile((tile) => {
      if (this.visibility.isLit(tile.position)) {
        return;
      }
      const { x, y } = gridToWorld(tile.position, TILE_SIZE);
      this.fogGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    });
  }

  /**
   * 指定マスにいる「自軍から見えている」ユニットを返す。
   * 夜戦の暗いマスにいる敵は見えていないため undefined を返し、
   * 選択・情報表示・情報メニューのいずれからも存在が分からないようにする。
   */
  private visibleUnitAt(pos: GridPosition): Unit | undefined {
    const unit = this.units.getUnitAt(pos);
    return unit && this.visibility.isUnitVisible(unit) ? unit : undefined;
  }

  /**
   * 移動範囲・経路の計算に渡すオプション。
   * 夜戦では見えていない敵のマスを通過できる扱いにして移動範囲を求める
   * (実際に踏み込むと 1 つ手前で強制待機になる)。
   */
  private movementOptions(): MovementOptions {
    return { isHiddenEnemy: (unit) => this.visibility.isUnitHidden(unit) };
  }

  /** 攻撃対象の絞り込みに渡すオプション(夜戦では見えている敵しか攻撃できない) */
  private attackOptions(): AttackTargetOptions {
    return { isVisible: (unit) => this.visibility.isUnitVisible(unit) };
  }

  /**
   * ユニット描画用のコンテナを用意する(範囲表示より上・ハイライトより下)。
   * シーンを再入場すると前回のコンテナは破棄済みになるため、他の描画レイヤーと
   * 同様に create() のたびに作り直す。これを怠ると再入場時にユニットアイコンが
   * 描画されない(データはあるがコンテナが表示リストから外れている)状態になる。
   */
  private createUnitLayer(): void {
    this.unitLayer = this.add.container(0, 0);
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

      // 下地の上に地形ごとの模様(草・木・山・道路・線路)や拠点の建物を描き込む
      drawTerrainDecoration(tile.terrainType, {
        graphics: this.terrainGraphics,
        x,
        y,
        size: TILE_SIZE,
        col: tile.position.col,
        row: tile.position.row,
        roadLinks: this.terrainLinksAt(tile),
        ownerColor: data.canCapture ? OWNER_COLOR[tile.owner] : undefined,
      });

      // 拠点は所有者を示す枠で囲む(建物上の旗と合わせて所有が分かるようにする)
      if (data.canCapture) {
        this.terrainGraphics.lineStyle(3, OWNER_COLOR[tile.owner], 1);
        this.terrainGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    });
  }

  /**
   * 帯としてつながって見せる地形(道路・線路・川)の接続方向を返す。
   * 道路は道路と拠点へ、線路は線路と駅へ、川は川と水面(海・海岸・港)へつながる。
   * それ以外の地形では undefined。
   */
  private terrainLinksAt(tile: TileData): RoadLinks | undefined {
    if (tile.terrainType === 'road') {
      return computeRoadLinks(this.map, tile.position);
    }
    if (tile.terrainType === 'railway') {
      return computeRailLinks(this.map, tile.position);
    }
    if (tile.terrainType === 'river') {
      return computeRiverLinks(this.map, tile.position);
    }
    return undefined;
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
   * 夜戦では、自軍から見えていない敵ユニットは描画しない。
   */
  private drawUnits(): void {
    // 盤面が変わるたびに夜戦の視界を求め直し、暗幕も描き直す
    this.refreshVisibility();
    this.unitLayer.removeAll(true);

    const graphics = this.add.graphics();
    this.unitLayer.add(graphics);

    const radius = TILE_SIZE * 0.32;
    // 撃破されたユニットは、爆散の演出が終わるまで盤面に残したまま見せる
    const drawTargets =
      this.pendingDefeated.length > 0
        ? [...this.units.getAllUnits(), ...this.pendingDefeated]
        : this.units.getAllUnits();
    for (const unit of drawTargets) {
      // 夜戦で見つけていない敵ユニットは描かない(暗いマスの敵は存在が分からない)
      if (!this.visibility.isUnitVisible(unit)) {
        continue;
      }
      // 攻撃演出で分身トークンが動いているユニットは、ここでは描かない
      if (unit === this.animatingUnit) {
        continue;
      }
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

      // 輸送ユニットがユニットを運んでいるときは、右上に小さな搭乗マーカーを描く
      if (unit.isCarrying) {
        const markerX = x + radius * 0.7;
        const markerY = y - radius * 0.7;
        graphics.fillStyle(0x12121e, unit.hasActed ? 0.5 : 0.85);
        graphics.fillCircle(markerX, markerY, radius * 0.28);
        graphics.fillStyle(BOARD_TARGET_COLOR, unit.hasActed ? 0.5 : 1);
        graphics.fillCircle(markerX, markerY, radius * 0.18);
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
      .text(this.viewWidth + 12, 10, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#8ad0ff',
        fontStyle: 'bold',
      })
      .setScrollFactor(0);

    // 現在手番の軍勢の資金
    this.fundsText = this.add
      .text(this.viewWidth + 12, 34, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#ffe08a',
      })
      .setScrollFactor(0);

    // 資金の下に、次のターン開始時に得られる収入(所有拠点数ぶん)を示す。
    // 拠点を占領して収入が伸びていく手応えが分かるようにする。
    this.incomeText = this.add
      .text(this.viewWidth + 12, 54, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: '#c8b98a',
      })
      .setScrollFactor(0);

    this.add
      .text(this.viewWidth + 12, 82, 'マス情報', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#ffd479',
      })
      .setScrollFactor(0);

    this.infoText = this.add
      .text(this.viewWidth + 12, 106, 'マスを選択してください', {
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
    const y = 78;

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

  /** ダメージ予測ポップアップ(背景+本文+強調行)を用意する(初期は非表示) */
  private createForecastPopup(): void {
    this.forecastBg = this.add.graphics();
    this.forecastText = this.add.text(FORECAST_PAD_X, FORECAST_PAD_Y, '', {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      lineSpacing: 3,
    });
    // 撃破・被撃破は本文より一回り大きい太字で、本文の下に別行として出す
    this.forecastAlertText = this.add
      .text(FORECAST_PAD_X, FORECAST_PAD_Y, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setVisible(false);
    this.forecastPopup = this.add
      .container(0, 0, [this.forecastBg, this.forecastText, this.forecastAlertText])
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
      this.isInputLocked() ||
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
    const forecast = forecastBattle(attacker, target, this.map, this.commanderBonus);
    const view = buildBattleForecastView(forecast, attacker, target);
    const style = FORECAST_STYLE[view.alert];
    this.forecastText.setText([...view.lines]);

    // 強調行(撃破/被撃破)は本文の下に置き、危険度に応じて色を変える
    const hasAlert = view.alertText !== null;
    this.forecastAlertText
      .setText(view.alertText ?? '')
      .setColor(style.alertColor)
      .setPosition(FORECAST_PAD_X, FORECAST_PAD_Y + this.forecastText.height + 4)
      .setAlpha(1)
      .setVisible(hasAlert);
    // 被撃破の予測だけは強調行を点滅させ、見落とさないようにする
    this.stopForecastBlink();
    if (view.alert === 'danger') {
      this.forecastBlink = this.tweens.add({
        targets: this.forecastAlertText,
        alpha: 0.25,
        duration: 320,
        yoyo: true,
        repeat: -1,
      });
      // 対象を変えた最初の 1 回だけ警告音を鳴らす(表示更新時のみ呼ばれる)
      this.audio.playSfx('warning');
    }

    // テキストサイズに合わせて背景を描き直す
    const padX = FORECAST_PAD_X;
    const padY = FORECAST_PAD_Y;
    const contentWidth = Math.max(
      this.forecastText.width,
      hasAlert ? this.forecastAlertText.width : 0,
    );
    const contentHeight =
      this.forecastText.height + (hasAlert ? this.forecastAlertText.height + 4 : 0);
    const width = contentWidth + padX * 2;
    const height = contentHeight + padY * 2;
    this.forecastBg.clear();
    this.forecastBg.fillStyle(style.bg, 0.92);
    this.forecastBg.fillRect(0, 0, width, height);
    this.forecastBg.lineStyle(style.borderWidth, style.border, 0.95);
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

  /**
   * 操作を受け付けない状態か。
   * 勝敗が決したあとと、攻撃・移動・敵軍ターンの演出の再生中は
   * 盤面の操作・ターン終了を止める。
   */
  private isInputLocked(): boolean {
    return (
      this.gameOver ||
      this.attackAnimating ||
      this.moveAnimating ||
      this.enemyTurnAnimating
    );
  }

  /** ダメージ予測ポップアップを隠す */
  private hideForecastPopup(): void {
    if (this.forecastTarget !== null) {
      this.forecastTarget = null;
      this.stopForecastBlink();
      this.forecastPopup.setVisible(false);
    }
  }

  /** 強調行の点滅を止め、不透明度を元に戻す */
  private stopForecastBlink(): void {
    if (this.forecastBlink) {
      this.forecastBlink.remove();
      this.forecastBlink = null;
    }
    this.forecastAlertText.setAlpha(1);
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
    const label = `${armyLabel(army, this.armyLabelOptions())}ターン`;
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
      .text(
        this.viewWidth / 2,
        centerY + 20,
        this.nightBattle
          ? `第${state.turnNumber}ターン(夜戦)`
          : `第${state.turnNumber}ターン`,
        {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: '#ffffff',
        },
      )
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
    // 戦績のターン数は「決着した時点のターン数」なので、手番が進むたびに控え直す
    this.stats.setTurns(this.turn.turnNumber);
    this.turnText.setText(
      formatTurnBanner(this.turn.state, {
        ...this.armyLabelOptions(),
        nightBattle: this.nightBattle,
      }),
    );
  }

  /**
   * 現在手番の軍勢の資金と収入の表示を更新する。
   * 収入は所有拠点数で決まるため、占領で拠点が増減したときにも呼ぶ。
   */
  private updateEconomyText(): void {
    const army = this.turn.currentArmy;
    this.fundsText.setText(
      formatFunds(army, this.economy.getFunds(army), this.armyLabelOptions()),
    );
    this.incomeText.setText(
      formatIncome(
        this.economy.getIncome(army, this.map),
        this.economy.countBases(army, this.map),
      ),
    );
  }

  /**
   * 現在の手番を終了する。
   * 対 CPU では敵軍へ手番を移して敵軍AIを自動実行し、決着しなければ自軍へ手番を戻す。
   * 対人戦では AI を動かさず、そのまま相手プレイヤーの手番を始める。
   * 手番が移るたびに、その軍の収入計上と拠点上ユニットの修理を行う。
   *
   * 「敵の行動アニメ」が「簡単」以上のときは敵軍の行動を 1 つずつ演出するため、
   * 敵軍ターンの終わりは非同期に訪れる(自軍へ手番を戻す処理は startPlayerTurn が担う)。
   */
  private handleEndTurn(): void {
    // 勝敗が決した後と攻撃演出の再生中はターン終了も受け付けない
    if (this.isInputLocked()) {
      return;
    }
    this.clearSelection();

    // 次の軍勢へ手番を移し、その軍の開始時経済処理(収入・修理)を行う。
    this.turn.endTurn();
    const repairs = this.runTurnStartEconomy();
    // 演出しながら進める場合は、相手の手番であることが見出しと資金表示に出る
    this.updateTurnText();
    this.updateEconomyText();
    this.drawUnits();

    if (!this.shouldRunAi()) {
      // 対人戦では AI を動かさず、そのままもう一方のプレイヤーの手番を始める
      this.drawTerrain();
      if (repairs.length > 0) {
        this.audio.playSfx('repair');
        this.infoText.setText(formatRepairLog(repairs));
      }
      this.showTurnStartBanner();
      return;
    }

    // 敵軍AIを実行する。占領・撃破で勝敗が決したらそこで止める。
    this.runEnemyTurn(() => this.startPlayerTurn());
  }

  /**
   * 敵軍ターンが終わったあと、自軍へ手番を戻して開始時の処理(収入・修理)を行う。
   * 敵軍の行動で勝敗が決していれば何もしない。
   */
  private startPlayerTurn(): void {
    if (this.gameOver) {
      return;
    }
    // 敵軍 → 自軍。自軍の開始時経済処理を行い、表示を更新する。
    this.turn.endTurn();
    const repairs = this.runTurnStartEconomy();
    this.updateTurnText();
    this.updateEconomyText();
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
   * 敵軍AIの手番を実行し、終わったら onComplete を呼ぶ。
   *
   * 「超速」では手番をまとめて実行し、そのまま同期的に終わる(従来の挙動)。
   * 「簡単」以上では 1 行動ずつ実行し、カメラ移動と演出を挟みながら見せる。
   */
  private runEnemyTurn(onComplete: () => void): void {
    if (this.enemyAnimationMode === 'instant') {
      this.finishEnemyTurn(this.ai.run());
      onComplete();
      return;
    }
    this.playEnemyTurn(onComplete);
  }

  /**
   * 敵軍の行動を 1 つずつ実行し、手動で操作しているように画面を動かしながら見せる。
   *
   * 行動を実行する直前の自軍視界を控えておき、夜戦で自軍から見えていない
   * (暗い)範囲だけで起きた行動は演出せず、盤面へ反映するだけにする。
   * 途中で勝敗が決したら、残りの行動は見せずに手番を終える。
   */
  private playEnemyTurn(onComplete: () => void): void {
    this.enemyTurnAnimating = true;
    // 敵軍のターンが始まったことをバナー・ジングル・BGM で知らせる
    this.showTurnStartBanner();

    // 敵の行動を追ってカメラが動くため、自軍が見ていた位置へ戻せるよう控えておく
    const camera = this.cameras.main;
    const returnTo = { x: camera.scrollX, y: camera.scrollY };

    const steps = this.ai.runSteps();
    const actions: AiAction[] = [];
    const finish = (): void => {
      this.enemyTurnAnimating = false;
      this.highlight.setVisible(false);
      // 自軍のターンは、敵軍ターンに入る前に見ていた位置から再開する
      this.panCameraToScroll(returnTo.x, returnTo.y, ENEMY_CAMERA_PAN_MS);
      this.finishEnemyTurn(actions);
      onComplete();
    };

    const runNext = (): void => {
      // 行動で盤面が変わる前の視界を控える(暗い範囲での行動を写さない判定に使う)
      const sight = computeVisibility(this.map, this.units, 'player', this.nightBattle);
      const next = steps.next();
      if (next.done === true) {
        finish();
        return;
      }
      const action = next.value;
      actions.push(action);
      this.showEnemyAction(action, sight, (shown) => {
        // 敵軍の占領・撃破で勝敗が決したら、残りの行動は見せずに手番を終える
        if (this.victory.check().outcome !== 'ongoing') {
          finish();
          return;
        }
        // 見せなかった行動(夜戦の暗い範囲での行動)で間を取ると、
        // 何も起きない待ち時間になるだけなのですぐ次へ進む
        if (!shown) {
          runNext();
          return;
        }
        this.time.delayedCall(ENEMY_ACTION_GAP_MS, runNext);
      });
    };

    // 開始バナーを見せ終えてから最初の行動に移る
    this.time.delayedCall(ENEMY_TURN_BANNER_MS, runNext);
  }

  /**
   * 敵軍の手番を締めくくる。
   * 盤面を最新の状態へ描き直し、行動サマリを表示して勝敗を判定する。
   */
  private finishEnemyTurn(actions: readonly AiAction[]): void {
    // 敵軍AIが実行した行動を戦績へ数える(自軍と同じ項目を敵軍側へ足す)
    this.recordEnemyActions(actions);
    // 占領で所有者が、移動・撃破でユニット配置が変わるため再描画する
    this.drawTerrain();
    this.drawUnits();
    this.updateEconomyText();
    this.infoText.setText(
      formatEnemyTurnSummary(actions, { commander: aiCharacterLabel(this.aiCharacter) }),
    );
    // 敵軍の占領・撃破で勝敗が決していないか判定する
    this.checkGameEnd();
  }

  /** 敵軍AIの行動一覧から、攻撃・占領・生産を戦績へ数える */
  private recordEnemyActions(actions: readonly AiAction[]): void {
    for (const action of actions) {
      switch (action.kind) {
        case 'attack':
          this.stats.recordAttack(action.result);
          break;
        case 'capture':
          this.stats.recordCapture(action.result);
          break;
        case 'produce':
          this.stats.recordProduction(action.result);
          break;
        default:
          // 移動・待機・輸送は戦績に数えない
          break;
      }
    }
  }

  /**
   * 敵軍の行動 1 件を演出する。演出を終えたら done を呼ぶ。
   * 夜戦の暗い範囲だけで起きた行動は写さず、盤面への反映だけを行う。
   *
   * @param sight その行動を実行する前の時点での自軍の視界
   * @param done 演出を終えたときの通知。実際に演出したかどうかを渡す
   */
  private showEnemyAction(
    action: AiAction,
    sight: Visibility,
    done: (shown: boolean) => void,
  ): void {
    const view = buildEnemyActionView(action, { isLit: (pos) => sight.isLit(pos) });
    if (!view.shown || view.focus === null) {
      // 見えない範囲の行動は演出しない。盤面(占領・撃破・生産の結果)だけ更新する
      this.drawTerrain();
      this.drawUnits();
      this.updateEconomyText();
      done(false);
      return;
    }

    this.infoText.setText(
      formatEnemyActionLog(action, { commander: aiCharacterLabel(this.aiCharacter) }),
    );
    // 手動で操作しているように、行動するマスまで画面を動かしてから見せる
    this.panCameraTo(view.focus, ENEMY_CAMERA_PAN_MS, () =>
      this.playEnemyActionBody(action, view, () => done(true)),
    );
  }

  /**
   * カメラを寄せたあとの、敵の行動そのものの演出。
   * ユニットの選択 → 移動 → 行動(攻撃・占領・遭遇)の順に見せる。
   */
  private playEnemyActionBody(
    action: AiAction,
    view: EnemyActionView,
    done: () => void,
  ): void {
    // 生産はユニットを動かさないため、拠点で新しいユニットが現れる演出だけを見せる
    if (action.kind === 'produce') {
      this.playEnemyProduce(action.result, done);
      return;
    }
    const unit = enemyActionUnit(action);
    if (!unit) {
      done();
      return;
    }
    this.showEnemySelection(view, () =>
      this.playEnemyMove(unit, view, () => this.playEnemyOutcome(action, view, done)),
    );
  }

  /**
   * 敵ユニットを選んだことを、自軍の操作と同じ選択枠で見せる。
   * 移動前の位置が暗い(見えていない)ときは、どこから動き出したかを明かさないため見せない。
   */
  private showEnemySelection(view: EnemyActionView, done: () => void): void {
    const start = view.path[0];
    if (!start || view.pathVisibility[0] !== true) {
      done();
      return;
    }
    this.audio.playSfx('select');
    this.drawSelectionHighlight(start);
    this.time.delayedCall(ENEMY_SELECT_HOLD_MS, () => {
      this.highlight.setVisible(false);
      done();
    });
  }

  /**
   * 敵ユニットを移動ルートに沿って走らせ、カメラを移動先へ追従させる。
   * 夜戦で暗いマスを走っているあいだはトークンを隠し、明るいマスに入ったときだけ姿を見せる。
   * 1 マスも動かない行動ではそのまま次へ進む。
   */
  private playEnemyMove(unit: Unit, view: EnemyActionView, done: () => void): void {
    const path = view.path;
    if (path.length <= 1) {
      done();
      return;
    }
    const sequence = buildMoveSequence(path, false);
    // 走っているあいだは操作を受け付けず、ユニット本体は分身トークンで動かす
    this.moveAnimating = true;
    this.animatingUnit = unit;
    this.drawUnits();

    const token = this.effects.createUnitToken(
      unit.unitType,
      path[0],
      UNIT_BODY_COLOR[unit.armyType],
    );
    const visibleAt = (index: number): boolean => view.pathVisibility[index] === true;
    token.setVisible(visibleAt(0));
    if (visibleAt(0)) {
      this.audio.playSfx('move');
    }
    // 走る先へカメラを追従させ、手動で操作しているように画面を動かす
    this.panCameraTo(path[path.length - 1], sequence.travelMs);

    this.effects.moveTokenAlongPath(
      token,
      path,
      () => {
        token.destroy();
        this.animatingUnit = null;
        this.moveAnimating = false;
        this.drawUnits();
        done();
      },
      (fromIndex, toIndex) => {
        // 区間の両端のどちらかが明るければ、その 1 マスぶんは姿が見える
        token.setVisible(visibleAt(fromIndex) || visibleAt(toIndex));
      },
    );
  }

  /** 移動を終えた敵ユニットの行動(攻撃・占領・遭遇)を演出する */
  private playEnemyOutcome(
    action: AiAction,
    view: EnemyActionView,
    done: () => void,
  ): void {
    switch (action.kind) {
      case 'attack': {
        const { attacker, defender } = action.result;
        // 夜戦で攻撃元が暗いマス(間接攻撃など)のときは、攻撃側の姿は見せずに着弾だけ見せる
        const showAttacker = view.pathVisibility[view.pathVisibility.length - 1] === true;
        this.playAttackEffects(
          action.result,
          { ...attacker.position },
          { ...defender.position },
          { showAttacker, onComplete: done },
        );
        return;
      }
      case 'capture':
        this.audio.playSfx('capture');
        // 占領完了で所有者が変わるため、地形の枠と収入表示を描き直す
        this.drawTerrain();
        this.drawUnits();
        this.updateEconomyText();
        this.time.delayedCall(ENEMY_RESULT_HOLD_MS, done);
        return;
      case 'board':
      case 'unload':
        // 搭乗すると歩兵が盤面から消え、降車すると隣のマスに現れる。
        // どちらも移動と同じ効果音で知らせ、結果を見せてから次の行動へ移る
        this.audio.playSfx('move');
        this.drawUnits();
        this.time.delayedCall(ENEMY_RESULT_HOLD_MS, done);
        return;
      case 'halt': {
        // 夜戦で自軍ユニットに出くわして停止した。自軍側からも遭遇として見せる
        const sequence = buildMoveSequence(action.path, true);
        this.audio.playSfx('encounter');
        this.effects.playEncounter(action.to, action.blockedBy.position);
        this.time.delayedCall(sequence.encounterHoldMs, done);
        return;
      }
      default:
        this.drawUnits();
        done();
    }
  }

  /** 敵軍が拠点でユニットを生産したことを見せる(新しいユニットが現れる演出) */
  private playEnemyProduce(result: ProductionResult, done: () => void): void {
    this.audio.playSfx('produce');
    this.drawUnits();
    this.effects.playSpawn(result.unit.position, UNIT_BODY_COLOR[result.unit.armyType]);
    this.updateEconomyText();
    this.time.delayedCall(ENEMY_RESULT_HOLD_MS, done);
  }

  /**
   * カメラを指定マスへ滑らかに寄せる。
   * 敵の行動を「手動で操作しているように」見せるために使う。
   * onDone を渡すと、寄せ終えた時点で呼ぶ。
   */
  private panCameraTo(pos: GridPosition, duration: number, onDone?: () => void): void {
    const { x, y } = gridToWorldCenter(pos, TILE_SIZE);
    this.cameras.main.pan(x, y, duration, 'Quad.easeInOut');
    if (onDone) {
      this.time.delayedCall(duration, onDone);
    }
  }

  /**
   * カメラを指定のスクロール位置へ滑らかに戻す。
   * 敵軍ターンで動かしたカメラを、自軍が見ていた位置へ戻すのに使う。
   */
  private panCameraToScroll(scrollX: number, scrollY: number, duration: number): void {
    const camera = this.cameras.main;
    camera.pan(
      scrollX + camera.width / 2,
      scrollY + camera.height / 2,
      duration,
      'Quad.easeInOut',
    );
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
      // 各種ウィンドウ表示中はウィンドウ側が入力を処理するため、マップ操作は行わない
      if (this.isAnyWindowOpen()) {
        return;
      }
      // 勝敗が決した後と攻撃演出の再生中はマップ操作を受け付けない
      if (this.isInputLocked()) {
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
        // 仮移動(移動後コマンド選択待ち)中に右クリックしたら、まずユニットを移動前の
        // 位置へ戻す。戻さないと仮移動先が確定し、その地点から再度移動できてしまう。
        this.revertPendingMove();
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
      // 各種ウィンドウ表示中はウィンドウ側が入力(スクロール・ドラッグ)を処理する
      if (this.isAnyWindowOpen()) {
        return;
      }
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
      // 各種ウィンドウ表示中はウィンドウ側が処理するため、マップのクリック確定は行わない
      if (this.isAnyWindowOpen()) {
        return;
      }
      const wasActive = this.dragActive;
      const wasPanning = this.isPanning;
      const wasLongPress = this.longPressFired;
      this.dragActive = false;
      this.isPanning = false;
      this.longPressFired = false;
      // 押下中に走らせていた長押しタイマーを止める(まだ発火していなければ取り消し)
      this.cancelLongPressTimer();
      if (this.isInputLocked() || !wasActive) {
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
      // 右クリック同様、仮移動中に情報メニューを開くときはユニットを移動前の位置へ戻す
      this.revertPendingMove();
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
      // 「降ろす」を選んで降車先の選択待ち中の挙動:
      //  - 緑枠の降車先マスをクリック → そのマスへ搭乗ユニットを降ろす
      //  - それ以外のマスをクリック → 降車を取りやめ、コマンドメニューへ戻る
      if (this.awaitingUnloadTarget) {
        const dest = this.unloadPositions.find((p) => equals(p, pos));
        if (dest) {
          this.executeUnload(dest);
          return;
        }
        this.showPostMoveMenu();
        return;
      }
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
        // (夜戦で見えていない敵は「いない」扱いにして、存在を悟らせない)
        const other = this.visibleUnitAt(pos);
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
      // ただし降車を済ませていて移動を取り消せない場合は、待機として行動を終える。
      if (this.commandCommitted) {
        this.commitWait();
        return;
      }
      this.cancelMove();
      return;
    }

    // 行動対象を選択中なら、攻撃・合流・移動を優先して判定する
    if (this.movingUnit) {
      // 攻撃対象の敵をクリックしたら攻撃する
      const target = this.attackTargets.find((t) => equals(t.position, pos));
      if (target) {
        this.attackTarget(target);
        return;
      }
      // 合流できる味方(緑枠)をクリックしたら合流する。
      // 合流先マスは味方が占有していて movementRange には含まれないため、移動判定より先に扱う。
      const mergeTarget = this.mergeTargets.find((t) => equals(t.position, pos));
      if (mergeTarget) {
        this.mergeSelectedUnit(mergeTarget);
        return;
      }
      // 搭乗できる輸送ユニット(水色枠)をクリックしたら搭乗する。
      // 搭乗先マスも味方が占有しており movementRange には含まれないため、移動判定より先に扱う。
      const boardTarget = this.boardTargets.find((t) => equals(t.position, pos));
      if (boardTarget) {
        this.boardSelectedUnit(boardTarget);
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
    // (夜戦で見えていない敵のマスは、プレイヤーには空きマスに見えるので開ける)
    if (this.visibleUnitAt(pos)) {
      return;
    }
    this.audio.playSfx('select');
    this.showInfoMenu(pos);
  }

  /**
   * 右クリックしたマスの近くに情報メニュー(ユニット説明 / 操作 / 敵の行動アニメ)を表示する。
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
   * 「敵の行動アニメ」は敵軍ターンの描画モード切替を、「音量」は音量調整ウィンドウを、
   * 「中断」は中断の確認ダイアログを開く。
   * その他の画面は今後実装するため、現時点ではメニューを閉じ、
   * 選んだ項目名を表示するだけにとどめる。
   */
  private selectInfoMenuItem(label: string): void {
    this.audio.playSfx('button');
    this.closeInfoMenu();
    if (label === 'ユニット説明') {
      this.openUnitGuideWindow();
      return;
    }
    if (label === '敵の行動アニメ') {
      this.openEnemyAnimationWindow();
      return;
    }
    if (label === '音量') {
      this.openVolumeWindow();
      return;
    }
    if (label === '中断') {
      this.openSuspendConfirm();
      return;
    }
    this.infoText.setText([label, '(準備中)']);
  }

  /**
   * 情報メニューの「敵の行動アニメ」で、敵軍ターンの描画モードを選ぶウィンドウを開く。
   * 選んだ設定は localStorage に保存し、次にゲームを始めるときにも引き継ぐ。
   * 「しっかり」は戦闘アニメーションができるまで選べないため、押しても切り替えない。
   */
  private openEnemyAnimationWindow(): void {
    this.enemyAnimationWindow ??= new EnemyAnimationWindow(this);
    this.enemyAnimationWindow.open({
      gameWidth: this.gameWidth,
      gameHeight: this.gameHeight,
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      current: this.enemyAnimationMode,
      onSelect: (mode) => {
        this.audio.playSfx('button');
        this.enemyAnimationMode = mode;
        // 保存できない環境(localStorage が使えない)でも、今回のゲーム中は選んだ設定で動かす
        writeEnemyAnimationMode(mode);
        this.infoText.setText(['敵の行動アニメ', enemyAnimationModeLabel(mode)]);
      },
      onDenied: () => {
        this.audio.playSfx('denied');
        this.infoText.setText(['敵の行動アニメ', '「しっかり」は準備中です']);
      },
      onClose: () => {
        this.audio.playSfx('button');
        this.infoText.setText('マスを選択してください');
      },
    });

    // 他のウィンドウと同様、開いた直後はグローバルの押下ハンドラが「ウィンドウ表示中ガード」で
    // 先に return してしまいフラグが取り残されるため、明示的に下ろしておく。
    this.pointerConsumedByButton = false;
  }

  /**
   * 情報メニューの「中断」で、今のゲームを保存してマップ選択画面へ戻るか確認する。
   * 「はい」なら中断データを保存してマップ選択画面へ戻り、「いいえ」ならゲームへ戻る。
   */
  private openSuspendConfirm(): void {
    this.confirmWindow ??= new ConfirmWindow(this);
    this.confirmWindow.open({
      gameWidth: this.gameWidth,
      gameHeight: this.gameHeight,
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      title: '中断',
      message: '今のゲームを保存してタイトルに戻りますか?',
      onYes: () => this.suspendGame(),
      onNo: () => {
        this.audio.playSfx('button');
        this.infoText.setText('マスを選択してください');
      },
    });

    // 他のウィンドウと同様、開いた直後はグローバルの押下ハンドラが「ウィンドウ表示中ガード」で
    // 先に return してしまいフラグが取り残されるため、明示的に下ろしておく。
    this.pointerConsumedByButton = false;
  }

  /**
   * 今のゲーム状態を中断データとして保存し、マップ選択画面へ戻る。
   * 保存できない環境(localStorage が使えない・容量超過)では遊んでいるゲームを
   * 失わせないよう、画面を移らずにその場でゲームを続けられるようにする。
   */
  private suspendGame(): void {
    const saved = writeSuspendData(
      createSaveData({
        mapId: this.mapId,
        nightBattle: this.nightBattle,
        aiCharacterId: this.aiCharacter.id,
        playerCharacterId: this.playerCharacter.id,
        playerSide: this.playerSide,
        versusMode: this.versusMode,
        stats: this.stats.snapshot(),
        map: this.map,
        units: this.units,
        turn: this.turn,
        economy: this.economy,
      }),
    );
    if (!saved) {
      this.audio.playSfx('denied');
      this.infoText.setText(['中断データを保存できませんでした', 'ゲームを続けます']);
      return;
    }
    this.audio.playSfx('button');
    this.audio.stopBgm();
    this.scene.start('MapSelectScene');
  }

  /**
   * いずれかのモーダルウィンドウ
   * (生産・音量・ユニット説明・敵の行動アニメ・確認ダイアログ)を表示中か
   */
  private isAnyWindowOpen(): boolean {
    return (
      this.productionWindow?.isOpen() === true ||
      this.volumeWindow?.isOpen() === true ||
      this.unitGuideWindow?.isOpen() === true ||
      this.enemyAnimationWindow?.isOpen() === true ||
      this.confirmWindow?.isOpen() === true
    );
  }

  /**
   * ユニット説明ウィンドウ(各ユニットの説明と、全ユニットとの対戦相性を表示)を開く。
   */
  private openUnitGuideWindow(): void {
    this.unitGuideWindow ??= new UnitGuideWindow(this);
    this.unitGuideWindow.open({
      gameWidth: this.gameWidth,
      gameHeight: this.gameHeight,
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      tokenColor: UNIT_BODY_COLOR.player,
      onClose: () => {
        this.infoText.setText('マスを選択してください');
      },
    });

    // 「ユニット説明」ボタンの押下ハンドラは pointerConsumedByButton を true にしてから
    // このメソッドを呼ぶ。音量ウィンドウと同様に、開いた直後はグローバルの押下ハンドラが
    // 「ウィンドウ表示中ガード」で先に return してフラグが取り残されるため、明示的に下ろす。
    this.pointerConsumedByButton = false;
  }

  /**
   * 音量調整ウィンドウ(横スライダーでマスター音量を 0〜100% で調整)を開く。
   * 調整の結果をすぐ音で確認できるよう、開くタイミングで AudioContext と BGM を起動する。
   */
  private openVolumeWindow(): void {
    this.ensureAudioStarted();
    this.volumeWindow ??= new VolumeWindow(this);
    this.volumeWindow.open({
      gameWidth: this.gameWidth,
      gameHeight: this.gameHeight,
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      initialVolume: this.audio.volume,
      onChange: (volume) => this.audio.setVolume(volume),
      onClose: () => {
        this.infoText.setText('マスを選択してください');
      },
    });

    // 「音量」ボタンの押下ハンドラは pointerConsumedByButton を true にしてから
    // このメソッドを呼ぶ。生産ウィンドウと同様に、ウィンドウを開いた直後は
    // グローバルの押下ハンドラが「ウィンドウ表示中ガード」で先に return するため、
    // フラグが true のまま取り残される。そのままだとウィンドウを閉じた後の最初の
    // マップクリックが誤って握りつぶされるため、ここで明示的にフラグを下ろしておく。
    this.pointerConsumedByButton = false;
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

    // 夜戦で見つけていない敵は「いない」ものとして扱う(選択しても情報が出ない)
    const unit = this.visibleUnitAt(pos);
    // 手番の軍勢の未行動ユニットを選択したら移動可能範囲と攻撃対象を表示する
    if (unit && this.turn.isCurrentArmy(unit.armyType) && !unit.hasActed) {
      this.audio.playSfx('select');
      this.movingUnit = unit;
      const moveOptions = this.movementOptions();
      this.movementRange = calculateMovementRange(
        unit,
        this.map,
        this.units,
        moveOptions,
      );
      this.attackTargets = findAttackableTargets(
        unit,
        this.units,
        unit.position,
        this.attackOptions(),
      );
      // 移動範囲内にいる合流可能な味方(同種・双方 HP 減)を移動先候補に加える
      this.mergeTargets = findMergeTargets(unit, this.map, this.units, moveOptions);
      // 移動範囲内にいる搭乗可能な味方の輸送ユニット(輸送ヘリ)を移動先候補に加える
      this.boardTargets = findTransportTargets(unit, this.map, this.units, moveOptions);
      this.drawActionRange(
        this.movementRange,
        this.attackTargets,
        this.mergeTargets,
        this.boardTargets,
      );
      // 占領は移動先(元居たマスを含む)を選んだあとのコマンドメニューから行う。
      // 情報パネルに占領ボタンは出さない。
      return;
    }

    this.movingUnit = null;
    this.movementRange = null;
    this.attackTargets = [];
    this.mergeTargets = [];
    this.boardTargets = [];
    this.rangeGraphics.clear();

    // ユニットのいない自軍の生産拠点を選んだら「生産」コマンドを表示する
    // (canProduceAt は実際の占有を見るため、見えていない敵がいる拠点では生産できない)
    if (!unit && this.production.canProduceAt(this.turn.currentArmy, tile)) {
      this.showProductionCommand(tile);
    }
  }

  /**
   * 選択中ユニットを指定マスへ移動する。
   * ユニットは瞬間移動せず、移動ルートに沿って 1 マスずつ走る演出を挟んでから停止する。
   * 行動済みにせずに移動し、移動後の攻撃/占領/待機を選ばせる状態に入る。
   *
   * 夜戦では移動経路上に「見えていなかった敵」がいることがある。その場合は
   * 1 つ手前のマスで止まり、遭遇演出のあと強制待機(行動済み)となってコマンドは選べない。
   */
  private moveSelectedUnit(pos: GridPosition, tile: TileData): void {
    const unit = this.movingUnit;
    if (!unit) {
      return;
    }

    // メニュー外クリックで移動を取り消せるよう、移動前の位置を控えておく
    const origin = unit.position;
    const resolved = resolveMovePath(
      unit,
      this.map,
      this.units,
      pos,
      this.movementOptions(),
    );
    const sequence = buildMoveSequence(resolved.path, resolved.blockedBy !== null);
    this.audio.playSfx('move');

    // 1 マスも動かない(その場で待機・目の前の敵に阻まれた)ときは走る演出を挟まない
    if (sequence.steps === 0) {
      this.settleMove(unit, resolved, tile, origin, sequence);
      return;
    }

    // 走っている間は移動範囲・選択枠を消し、操作も受け付けない
    this.moveAnimating = true;
    this.rangeGraphics.clear();
    this.highlight.setVisible(false);
    this.hideForecastPopup();
    this.clearActionButtons();

    // ユニット本体は分身トークンで走らせるため、盤面側の描画からは外す
    this.animatingUnit = unit;
    this.drawUnits();
    const token = this.effects.createUnitToken(
      unit.unitType,
      origin,
      UNIT_BODY_COLOR[unit.armyType],
    );
    this.effects.moveTokenAlongPath(token, resolved.path, () => {
      token.destroy();
      this.animatingUnit = null;
      this.settleMove(unit, resolved, tile, origin, sequence);
    });
  }

  /**
   * 走る演出を終えたユニットを盤面へ着地させ、移動の結果へ進む。
   * 移動をここで初めて盤面へ反映するため、夜戦で出くわした敵はこの時点で見えるようになる。
   *
   * 進路を阻まれていなければ移動後のコマンド選択へ入り、
   * 阻まれていれば遭遇演出(「！」「そうぐう！」)を見せてから強制待機を確定する。
   */
  private settleMove(
    unit: Unit,
    resolved: MovePathResult,
    tile: TileData,
    origin: GridPosition,
    sequence: MoveSequence,
  ): void {
    this.units.moveUnit(unit, resolved.destination, { markActed: false });
    this.drawUnits();

    const blocker = resolved.blockedBy;
    if (!blocker) {
      this.moveAnimating = false;
      this.enterPostMoveCommand(
        unit,
        this.map.getTile(resolved.destination) ?? tile,
        origin,
      );
      return;
    }

    // 進路上で敵に出くわしたので、その手前で停止したことを演出で見せる。
    // 演出の間も操作は受け付けず、見せ終えてから強制待機を確定する。
    this.moveAnimating = true;
    this.resetSelection();
    this.audio.playSfx('encounter');
    this.effects.playEncounter(unit.position, blocker.position);
    this.infoText.setText(['そうぐう！', `${blocker.unitName}を発見`]);
    this.time.delayedCall(sequence.encounterHoldMs, () => {
      this.moveAnimating = false;
      this.applyForcedWait(unit, blocker);
    });
  }

  /**
   * 夜戦で見えない敵に出くわしたユニットを強制待機にする。
   * 遭遇演出を見せ終えたあとに呼び、その手番の行動を終わらせる。
   */
  private applyForcedWait(unit: Unit, blocker: Unit): void {
    unit.hasActed = true;
    this.audio.playSfx('denied');
    this.drawUnits();
    this.infoText.setText([
      '強制待機',
      `${blocker.unitName}を発見`,
      '進路上に敵がいたため',
      '手前のマスで停止した',
    ]);
  }

  /**
   * 選択中ユニットを、緑枠で示した合流先の味方(同種)へ合流させる。
   * 2 体の HP を合算(最大 HP で頭打ち)して 1 体にまとめ、合流先を待機(行動済み)にする。
   * 合流は移動後のコマンドメニューを介さず、その場で確定する(結果は情報パネルに表示)。
   */
  private mergeSelectedUnit(target: Unit): void {
    const unit = this.movingUnit;
    if (!unit) {
      return;
    }
    // 表示用に、合流前の HP と合流後の HP を控えておく
    const beforeHp = target.currentHp;
    const resultHp = mergedHp(unit, target);
    this.units.mergeUnit(unit, target);
    // HP を回復して 1 体にまとまるため、修理と同じ効果音で知らせる
    this.audio.playSfx('repair');
    this.resetSelection();
    this.drawUnits();
    this.infoText.setText(['合流', target.unitName, `HP: ${beforeHp} → ${resultHp}`]);
  }

  /**
   * 選択中ユニット(歩兵)を、水色枠で示した味方の輸送ユニット(輸送ヘリ)に搭乗させる。
   * 搭乗した歩兵は盤面から取り除かれて輸送ヘリに保持され、そのターンは行動済みになる。
   * 搭乗はコマンドメニューを介さず、その場で確定する(結果は情報パネルに表示)。
   */
  private boardSelectedUnit(transport: Unit): void {
    const unit = this.movingUnit;
    if (!unit) {
      return;
    }
    this.units.carryUnit(transport, unit);
    // 搭乗も「乗り込む」移動なので、移動と同じ効果音で知らせる
    this.audio.playSfx('move');
    this.resetSelection();
    this.drawUnits();
    this.infoText.setText(['搭乗', `${transport.unitName}に${unit.unitName}を乗せた`]);
  }

  /**
   * コマンドメニューで「降ろす」を選んだときの、降車先マスの選択に移る。
   * 降ろせる隣接マス(空きマス・降ろすユニットが進入できる地形)を緑枠で示してクリック待ちにする。
   * 輸送艦は 2 体まで運べるため、どの搭乗ユニットを降ろすかは passenger で受け取る。
   * 降車先以外(緑枠のないマス)をクリックしたときの挙動は handleClick で扱う。
   */
  private enterUnloadSelection(passenger: Unit): void {
    const unit = this.commandUnit;
    if (!unit || !unit.carried.includes(passenger)) {
      return;
    }
    this.audio.playSfx('select');
    this.awaitingUnloadTarget = true;
    this.unloadPassenger = passenger;
    this.unloadPositions = findUnloadPositions(unit, this.map, this.units, passenger);
    // 降ろすボタンなどのコマンドメニューを閉じ、降車先の選択だけに集中させる
    this.clearActionButtons();
    this.drawSelectionHighlight(unit.position);
    this.drawUnloadPositions(this.unloadPositions);
    this.infoText.setText([
      '降ろす先を選択',
      passenger.unitName,
      '緑枠のマスをクリック',
      '枠外で取り消し',
    ]);
  }

  /**
   * 選択中の降車先マスへ、輸送ユニットが運んでいるユニットを降ろす。
   * 降ろしたユニットとその輸送ユニットはどちらもそのターンは行動済みになる。
   *
   * 輸送艦のように 2 体を乗せている場合は、降ろしたあとに残りの搭乗ユニットを
   * 降ろせる場所が残っていればコマンドメニューへ戻り、続けて降ろせるようにする。
   * 降ろせる場所がもう無ければ(周囲が埋まった・進入できない地形しかない)そこで行動を終える。
   */
  private executeUnload(dest: GridPosition): void {
    const unit = this.commandUnit;
    const passenger = this.unloadPassenger;
    if (!unit || !passenger) {
      return;
    }
    const dropped = this.units.dropUnit(unit, dest, passenger);
    this.audio.playSfx('move');
    this.awaitingUnloadTarget = false;
    this.unloadPassenger = null;
    this.unloadPositions = [];
    // 1 体でも降ろしたらその移動は確定。以降は取り消せない
    this.commandCommitted = true;
    this.drawUnits();

    // まだ降ろせる搭乗ユニットが残っていれば、続けて降ろすためメニューへ戻る
    if (this.hasUnloadablePassenger(unit)) {
      this.showPostMoveMenu([`${dropped.unitName}を配置`]);
      return;
    }
    this.commandUnit = null;
    this.resetSelection();
    this.infoText.setText(['降ろす', `${dropped.unitName}を配置`]);
  }

  /** transport が運んでいるユニットのうち、いま降ろせる場所があるものがいるか */
  private hasUnloadablePassenger(transport: Unit): boolean {
    return transport.carried.some(
      (passenger) =>
        findUnloadPositions(transport, this.map, this.units, passenger).length > 0,
    );
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
    const targets = canAttackHere
      ? findAttackableTargets(unit, this.units, unit.position, this.attackOptions())
      : [];

    // コマンド選択状態へ移行する。移動範囲は消し、攻撃対象はメニューを介して確定させる
    this.movingUnit = null;
    this.movementRange = null;
    this.rangeGraphics.clear();

    this.commandUnit = unit;
    this.commandTile = tile;
    this.commandOrigin = origin;
    this.commandCommitted = false;
    this.pendingAttackTargets = targets;
    this.showPostMoveMenu();
  }

  /**
   * 移動後のコマンドメニュー(攻撃 / 占領 / 待機)を、移動先のマスの近くに縦に並べて表示する。
   * 「攻撃」は射程内に敵がいるときだけ、「占領」は占領できる拠点のときだけ出す。
   * 「待機」は常に出し、攻撃も占領もできない移動先でも待機を選べるようにする。
   * メニュー外のマスを押すと移動が取り消され、ユニットは移動前の位置へ戻る。
   * この段階では攻撃対象のクリックは受け付けず、「攻撃」を押して初めて対象選択に移る。
   *
   * 降車を済ませて続けて降ろす場合(commandCommitted)は、その移動はもう取り消せないため
   * 攻撃・占領は出さず、残りの「降ろす」と「待機」だけを並べる。
   * notice には直前の行動結果など、情報パネルの先頭に添える行を渡す。
   */
  private showPostMoveMenu(notice: readonly string[] = []): void {
    const unit = this.commandUnit;
    const tile = this.commandTile;
    if (!unit || !tile) {
      return;
    }
    // メニュー表示中は攻撃対象・降車先のクリックを受け付けない
    // (攻撃はメニューの「攻撃」、降車はメニューの「降ろす」から始める)
    this.awaitingAttackTarget = false;
    this.awaitingUnloadTarget = false;
    this.unloadPositions = [];
    this.attackTargets = [];
    this.rangeGraphics.clear();
    this.hideForecastPopup();
    this.clearActionButtons();

    this.selected = unit.position;
    this.drawSelectionHighlight(unit.position);

    // 表示するボタンを先に決め、その数からメニューの表示位置(マスの近く)を求める
    const buttons: Array<{ label: string; onClick: () => void }> = [];
    const info: string[] = [...notice, 'コマンド選択', unit.unitName];
    if (!this.commandCommitted && this.pendingAttackTargets.length > 0) {
      info.push('攻撃: 射程内に敵');
      buttons.push({ label: '攻撃', onClick: () => this.enterAttackSelection() });
    }
    if (!this.commandCommitted && this.canOfferCapture(unit, tile)) {
      // 別の軍が占領を進めていた拠点は初期値へ戻してから占領するため、
      // この軍が実際に減らし始める耐久値(実効値)を表示する
      info.push(`占領耐久: ${this.capture.effectiveCaptureHp(unit, tile)}`);
      buttons.push({ label: '占領する', onClick: () => this.executeCapture(unit, tile) });
    }
    // 輸送ユニットがユニットを運んでいて、降ろせる隣接マスがあれば「降ろす」を出す。
    // 輸送艦は 2 体まで運べるため、降ろせる搭乗ユニットごとにボタンを並べる。
    for (const passenger of unit.carried) {
      if (findUnloadPositions(unit, this.map, this.units, passenger).length === 0) {
        continue;
      }
      info.push(`降ろす: ${passenger.unitName}`);
      buttons.push({
        // 1 体しか乗せていないときは単に「降ろす」、複数乗せているときは種別を添える
        label: unit.carried.length === 1 ? '降ろす' : `降ろす:${passenger.unitName}`,
        onClick: () => this.enterUnloadSelection(passenger),
      });
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
   * 仮移動(移動後コマンド選択待ち)の状態なら、ユニットを移動前の位置へ戻し、
   * 選択・コマンドの状態を初期化する。右クリックやタッチ長押しで情報メニューを開く前に呼ぶ。
   * これを行わないと、仮移動先に置き去りのまま状態だけリセットされ、確定していない移動先から
   * もう一度移動できてしまう。仮移動中でなければ何もしない。
   */
  private revertPendingMove(): void {
    const unit = this.commandUnit;
    const origin = this.commandOrigin;
    if (!unit || !origin) {
      return;
    }
    // 降車を済ませていて移動を取り消せない場合は、巻き戻さずそのまま行動を終える
    if (this.commandCommitted) {
      unit.hasActed = true;
      this.clearSelection();
      this.drawUnits();
      return;
    }
    // 「その場で待機」相当(元居たマスを選んだ)で実際には動いていない場合は巻き戻し不要
    if (!equals(unit.position, origin)) {
      this.units.moveUnit(unit, origin, { markActed: false });
      this.drawUnits();
    }
    this.clearSelection();
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
    // 演出は攻撃前の配置で見せるため、位置を先に控えておく
    const attackerPos = { ...attacker.position };
    const targetPos = { ...target.position };
    const result = this.battle.attack(attacker, target);
    this.stats.recordAttack(result);
    this.resetSelection();
    this.infoText.setText(this.buildBattleLog(result));
    // 盤面の反映と勝敗判定は演出の終わりまで待つ
    this.playAttackEffects(result, attackerPos, targetPos);
  }

  /**
   * 攻撃の演出(踏み込み・画面の揺れ・ダメージ数字・撃破の爆散)を再生し、
   * 終わってから盤面を描き直して勝敗を判定する。
   * 演出の間は結果を盤面へ反映せず、撃破されたユニットも爆散まで残して見せる。
   * 再生中はマップ操作とターン終了を受け付けない。
   *
   * options.showAttacker に false を渡すと、攻撃側の踏み込みと反撃の表示を省き、
   * 着弾(防御側で起きること)だけを見せる。夜戦で攻撃元が暗いマスのとき、
   * 敵の位置を明かさずに攻撃されたことだけを伝えるために使う。
   * options.onComplete を渡すと、演出の終わりに勝敗判定の代わりにそれを呼ぶ。
   */
  private playAttackEffects(
    result: AttackResult,
    attackerPos: GridPosition,
    targetPos: GridPosition,
    options: { showAttacker?: boolean; onComplete?: () => void } = {},
  ): void {
    const showAttacker = options.showAttacker ?? true;
    const sequence = buildAttackSequence(result);
    const { attacker, defender } = result;
    const attackerColor = UNIT_BODY_COLOR[attacker.armyType];

    this.attackAnimating = true;
    // 攻撃側は分身トークンで動かすため、盤面側の描画からは外す
    // (姿を見せない場合は動かさないので、盤面側の描画に任せる)
    this.animatingUnit = showAttacker ? attacker : null;
    this.pendingDefeated = [
      ...(result.defenderDefeated ? [defender] : []),
      ...(result.attackerDefeated ? [attacker] : []),
    ];
    this.drawUnits();

    const token = showAttacker
      ? this.effects.createUnitToken(attacker.unitType, attackerPos, attackerColor)
      : null;
    if (token) {
      this.effects.playLunge(token, attackerPos, targetPos);
    }

    // 着弾: 打撃音・画面の揺れ・与ダメージの数字
    this.time.delayedCall(sequence.impactAt, () => {
      this.audio.playSfx('attack');
      this.effects.shake(result.defenderDefeated);
      this.effects.popDamage(targetPos, result.damageDealt, DAMAGE_COLOR.dealt);
    });

    // 防御側の撃破: 爆散と同時に盤面からも消す
    if (sequence.defenderBurstAt !== null) {
      this.time.delayedCall(sequence.defenderBurstAt, () => {
        this.audio.playSfx('defeat');
        this.effects.playDefeatBurst(targetPos, UNIT_BODY_COLOR[defender.armyType]);
        this.pendingDefeated = this.pendingDefeated.filter((unit) => unit !== defender);
        this.drawUnits();
      });
    }

    // 反撃: 被ダメージの数字を攻撃側に出す(姿を見せない攻撃側では出さない)
    if (sequence.counterAt !== null && showAttacker) {
      this.time.delayedCall(sequence.counterAt, () => {
        this.audio.playSfx('attack');
        this.effects.shake(result.attackerDefeated);
        this.effects.popDamage(attackerPos, result.counterDamage, DAMAGE_COLOR.taken);
      });
    }

    // 反撃で攻撃側が撃破された場合は、分身トークンを消して爆散させる
    if (sequence.attackerBurstAt !== null && token) {
      this.time.delayedCall(sequence.attackerBurstAt, () => {
        this.audio.playSfx('defeat');
        token.setVisible(false);
        this.effects.playDefeatBurst(attackerPos, attackerColor);
      });
    }

    // 演出の終わり: 結果を反映した盤面へ描き直し、操作を再開する
    this.time.delayedCall(sequence.endAt, () => {
      token?.destroy();
      this.animatingUnit = null;
      this.pendingDefeated = [];
      this.attackAnimating = false;
      this.drawUnits();
      if (options.onComplete) {
        options.onComplete();
        return;
      }
      // 撃破により全滅が発生していないか判定する
      this.checkGameEnd();
    });
  }

  /** 指定ユニットで拠点を占領し、結果を表示する */
  private executeCapture(unit: Unit, tile: TileData): void {
    const result = this.capture.capture(unit, tile);
    this.stats.recordCapture(result);
    this.audio.playSfx('capture');
    this.commandUnit = null;
    this.resetSelection();
    // 所有者が変わった場合に備えて地形の枠を描き直し、収入表示も更新する
    this.drawTerrain();
    this.drawUnits();
    this.updateEconomyText();
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
    // 勝利したマップはクリア済みとして記録する(記録は次回以降の選択画面と
    // 激ムズマップの解放判定に使う)。記録は担当サイド(1P側 / 2P側)ごとに分けて持つ。
    // 敗北したときは何も記録しない。
    // 対人戦は CPU との対戦ではないため、勝っても記録しない。
    const unlocked =
      result.outcome === 'player_victory' && this.versusMode === 'cpu'
        ? this.recordClear()
        : false;
    // 激ムズマップを対 CPU で勝ち切ったときだけ、結果画面からエンディングへ進める
    const ending =
      result.outcome === 'player_victory' &&
      this.versusMode === 'cpu' &&
      this.isExtraMap();
    // 戦闘 BGM を止め、勝敗に応じたジングルを鳴らす
    this.audio.stopBgm();
    this.audio.playSfx(result.outcome === 'player_victory' ? 'victory' : 'lose');
    this.resetSelection();
    this.showResultOverlay(result, unlocked, ending);
  }

  /** 遊んでいるマップが激ムズマップ(区分 extra)かどうか */
  private isExtraMap(): boolean {
    return MAP_LIST.find((entry) => entry.id === this.mapId)?.category === 'extra';
  }

  /**
   * 勝利したマップのクリアを、担当していたサイドの記録として残す。
   * 今回のクリアで、そのサイドの激ムズマップが解放された場合は true を返す
   * (結果画面でその旨を知らせるために使う)。
   */
  private recordClear(): boolean {
    const before = readClearProgress();
    const after = recordMapClear({
      mapId: this.mapId,
      side: this.playerSide,
      nightBattle: this.nightBattle,
    });
    return becameUnlocked(STANDARD_MAP_LIST, before, after, this.playerSide);
  }

  /**
   * 勝敗結果を画面中央のオーバーレイとして表示する。
   * unlocked が true(今回のクリアで激ムズマップが解放された)なら、その知らせも添える。
   * ending が true(激ムズマップを対 CPU で勝利した)なら、ボタンでエンディングへ進む。
   */
  private showResultOverlay(
    result: VictoryResult,
    unlocked = false,
    ending = false,
  ): void {
    const isVictory = result.outcome === 'player_victory';
    const message = formatResultMessage(result, this.armyLabelOptions());

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

    // 今回のクリアで激ムズマップが解放されたことを知らせる
    if (unlocked) {
      this.add
        .text(centerX, centerY + 54, '激ムズマップが解放されました！', {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#ff9a6a',
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
    }

    // マップ選択画面へ戻るボタン(もう一度別のマップを遊べるようにする)。
    // エンディングへ進む場合は、そちらへ移るボタンにする
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
      .text(
        centerX,
        btnY + btnHeight / 2,
        ending ? 'エンディングへ ▶' : 'マップ選択へ戻る',
        {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: '#ffffff',
        },
      )
      .setOrigin(0.5)
      .setScrollFactor(0);
    button.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.audio.stopBgm();
      if (ending) {
        // 戦績と対戦相手を渡し、音量・ミュートの設定も引き継ぐ
        this.scene.start('EndingScene', {
          stats: this.stats.snapshot(),
          commander: aiCharacterLabel(this.aiCharacter),
          muted: this.audio.isMuted,
          volume: this.audio.volume,
        });
        return;
      }
      this.scene.start('MapSelectScene');
    });
  }

  /**
   * ユニットのいない自軍生産拠点を選んだときに「生産」コマンドを表示する。
   * マスの近くに浮かせて表示し、押すと生産ウィンドウ(ユニット選択画面)を開く。
   */
  private showProductionCommand(tile: TileData): void {
    this.productionTile = tile;
    const anchor = this.commandMenuAnchor(tile.position, 1);
    this.addActionButton(0, '生産', true, () => this.openProductionWindow(tile), anchor);
  }

  /**
   * 生産ウィンドウ(ユニットアイコン・名前・料金を行ごとに並べた選択画面)を開く。
   * 生産可能ユニットが増えて表示範囲を超えた場合は、ウィンドウ側で上下スクロールする。
   */
  private openProductionWindow(tile: TileData): void {
    const army = this.turn.currentArmy;
    if (!this.production.canProduceAt(army, tile)) {
      return;
    }
    this.audio.playSfx('button');
    this.clearActionButtons();
    this.productionTile = tile;

    // 各ユニットの資金充足(生産可否)を判定して行データを作る。
    // 生産できる種別は生産拠点(地形)ごとに異なる(工場・本拠地は地上、空港は飛行、
    // 港は海上、駅は列車砲)。さらに、空港のないマップでは対空自走砲・対空ロケット砲が、
    // すでに 1 台持っているときは列車砲が一覧から外れる。
    const menu = listProductionItems(tile.terrainType, this.production.mapContext(army));
    const items = menu.map((item) => ({
      ...item,
      affordable: this.production.canProduce(army, tile, item.unitType),
    }));

    this.productionWindow ??= new ProductionWindow(this);
    this.productionWindow.open({
      gameWidth: this.gameWidth,
      gameHeight: this.gameHeight,
      viewWidth: this.viewWidth,
      viewHeight: this.viewHeight,
      items,
      fundsLabel: formatFunds(army, this.economy.getFunds(army), this.armyLabelOptions()),
      tokenColor: UNIT_BODY_COLOR[army],
      onSelect: (unitType) => this.handleProductionSelect(unitType),
      onClose: () => this.handleProductionWindowClose(),
    });

    // 「生産」ボタンの押下ハンドラは pointerConsumedByButton を true にしてから
    // このメソッドを呼ぶ。通常はグローバルの押下ハンドラがこのフラグを下ろすが、
    // ウィンドウを開いた直後はグローバル側が「ウィンドウ表示中ガード」で先に
    // return してしまい、フラグが true のまま取り残される。そのままだとウィンドウを
    // 閉じた後の最初のマップクリックが誤って握りつぶされ、「一度クリックしないと
    // 反応しない」状態になるため、ここで明示的にフラグを下ろしておく。
    this.pointerConsumedByButton = false;
  }

  /** 生産ウィンドウで行が選ばれたときの処理(生産可能なら生産して閉じる) */
  private handleProductionSelect(unitType: UnitType): void {
    const tile = this.productionTile;
    if (!tile) {
      return;
    }
    const army = this.turn.currentArmy;
    if (!this.production.canProduce(army, tile, unitType)) {
      this.audio.playSfx('denied');
      return;
    }
    this.productionWindow?.close();
    this.executeProduction(tile, unitType);
  }

  /** 生産ウィンドウが暗幕・× で閉じられたときの処理(選択状態を片付ける) */
  private handleProductionWindowClose(): void {
    this.audio.playSfx('button');
    this.clearSelection();
  }

  /** 選択中の生産拠点で unitType を生産し、資金・表示を更新する */
  private executeProduction(tile: TileData, unitType: UnitType): void {
    const army = this.turn.currentArmy;
    if (!this.production.canProduce(army, tile, unitType)) {
      return;
    }
    const result = this.production.produce(army, tile, unitType);
    this.stats.recordProduction(result);
    this.audio.playSfx('produce');
    this.resetSelection();
    this.updateEconomyText();
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

  /**
   * 移動可能範囲(青)・攻撃可能な敵(赤)・合流できる味方(緑)・
   * 搭乗できる輸送ユニット(水色)を重ねて表示する。
   */
  private drawActionRange(
    range: MovementRange,
    targets: readonly Unit[],
    mergeTargets: readonly Unit[] = [],
    boardTargets: readonly Unit[] = [],
  ): void {
    this.rangeGraphics.clear();

    // 移動可能範囲を半透明の青塗りで表示する(行動対象マス自身は除く)
    this.rangeGraphics.fillStyle(MOVE_RANGE_FILL_COLOR, MOVE_RANGE_FILL_ALPHA);
    for (const { position } of range.tiles) {
      if (this.movingUnit && equals(this.movingUnit.position, position)) {
        continue;
      }
      const { x, y } = gridToWorld(position, TILE_SIZE);
      this.rangeGraphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
    // 範囲の外周を明るい線で縁取り、海の上でも境界を見失わないようにする
    this.strokeMoveRangeOutline(range);

    // 合流できる味方マスを緑枠で強調表示する
    this.strokeMergeTargets(mergeTargets);
    // 搭乗できる輸送ユニットのマスを水色枠で強調表示する
    this.strokeUnitTargets(boardTargets, BOARD_TARGET_COLOR);
    // 攻撃可能な敵マスを赤枠で強調表示する
    this.strokeAttackTargets(targets);
  }

  /**
   * 移動可能範囲の外周だけを明るい線で縁取る(rangeGraphics のクリアは呼び出し側で行う)。
   *
   * 各マスの 4 辺のうち、隣が範囲外になっている辺だけを描くため、
   * 内側に線が入らず範囲全体の輪郭が 1 本の線として浮かび上がる。
   * 移動元のマス(塗りからは除いている)も範囲の一部として扱い、輪郭の内側に含める。
   */
  private strokeMoveRangeOutline(range: MovementRange): void {
    this.rangeGraphics.lineStyle(
      MOVE_RANGE_OUTLINE_WIDTH,
      MOVE_RANGE_OUTLINE_COLOR,
      MOVE_RANGE_OUTLINE_ALPHA,
    );
    for (const { position } of range.tiles) {
      const { x, y } = gridToWorld(position, TILE_SIZE);
      const right = x + TILE_SIZE;
      const bottom = y + TILE_SIZE;
      if (!range.canReach(gridPosition(position.col, position.row - 1))) {
        this.rangeGraphics.lineBetween(x, y, right, y);
      }
      if (!range.canReach(gridPosition(position.col, position.row + 1))) {
        this.rangeGraphics.lineBetween(x, bottom, right, bottom);
      }
      if (!range.canReach(gridPosition(position.col - 1, position.row))) {
        this.rangeGraphics.lineBetween(x, y, x, bottom);
      }
      if (!range.canReach(gridPosition(position.col + 1, position.row))) {
        this.rangeGraphics.lineBetween(right, y, right, bottom);
      }
    }
  }

  /** 輸送ヘリの降車先マスを緑枠で表示する(移動範囲は描かない。降車先の選択用) */
  private drawUnloadPositions(positions: readonly GridPosition[]): void {
    this.rangeGraphics.clear();
    this.rangeGraphics.lineStyle(3, UNLOAD_TILE_COLOR, 0.95);
    for (const pos of positions) {
      const { x, y } = gridToWorld(pos, TILE_SIZE);
      this.rangeGraphics.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
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

  /** 合流できる味方マスに緑枠を描く(rangeGraphics のクリアは呼び出し側で行う) */
  private strokeMergeTargets(targets: readonly Unit[]): void {
    this.strokeUnitTargets(targets, MERGE_TARGET_COLOR);
  }

  /** ユニットのいるマスを指定色の枠で囲む(rangeGraphics のクリアは呼び出し側で行う) */
  private strokeUnitTargets(targets: readonly Unit[], color: number): void {
    this.rangeGraphics.lineStyle(3, color, 0.95);
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
    // 夜戦で見えていない敵はいないものとして扱い、地形情報だけを表示する
    const unit = this.visibleUnitAt(tile.position);
    if (unit) {
      // ユニット情報と併記すると行数が多くなり、占領耐久などが下部のボタンに
      // 隠れてしまうため、地形情報は簡略表示にして重要な行を残す
      return [
        ...formatUnitInfo(unit, {
          ...this.armyLabelOptions(),
          nightBattle: this.nightBattle,
          vision: unitVision(unit, this.map),
        }),
        '',
        ...formatTerrainInfo(tile, { ...this.armyLabelOptions(), compact: true }),
      ];
    }
    return formatTerrainInfo(tile, this.armyLabelOptions());
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
    // 生産・音量・ユニット説明・敵の行動アニメ・確認ダイアログを開いていれば閉じる
    // (この経路では onClose や はい/いいえ の通知は行わない)
    this.productionWindow?.close();
    this.volumeWindow?.close();
    this.unitGuideWindow?.close();
    this.enemyAnimationWindow?.close();
    this.confirmWindow?.close();
    this.productionTile = null;
    this.selected = null;
    this.movingUnit = null;
    this.movementRange = null;
    this.attackTargets = [];
    this.mergeTargets = [];
    this.boardTargets = [];
    this.commandUnit = null;
    this.commandTile = null;
    this.commandOrigin = null;
    this.commandCommitted = false;
    this.pendingAttackTargets = [];
    this.awaitingAttackTarget = false;
    this.awaitingUnloadTarget = false;
    this.unloadPassenger = null;
    this.unloadPositions = [];
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
