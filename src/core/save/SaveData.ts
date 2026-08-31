// 中断データ(セーブデータ)の形式と、盤面との相互変換を担う。Phaser には依存しない純粋なロジック。
// ゲーム中に「中断」を選んだ時点の盤面(ユニット・拠点の占領状況・ターン・資金)を
// プレーンなオブジェクトへ書き出し、マップ選択画面からの再開時に元の状態へ復元する。
// 保存先(localStorage)の扱いは SaveStorage が担い、このモジュールは形式と変換のみを扱う。

import { gridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { ArmyType } from '@/core/map/TerrainType';
import { EconomyManager, type EconomyArmy } from '@/core/economy/EconomyManager';
import {
  firstArmy,
  isPlayerSide,
  isVersusMode,
  type PlayerSide,
  type VersusMode,
} from '@/core/mode/GameMode';
import { TurnManager, type TurnArmy } from '@/core/turn/TurnManager';
import { Unit } from '@/core/units/Unit';
import { UnitManager } from '@/core/units/UnitManager';
import { UNIT_TYPES, type UnitType } from '@/core/units/UnitType';
import type { MapDefinition } from '@/data/maps/mapDefinition';
import { getTerrainData } from '@/data/terrainData';

/**
 * 中断データの形式バージョン。
 * 保存内容の構造を変えたら 1 つ増やす。バージョンが違う中断データは
 * 復元できない(壊れたデータと同じ扱いで破棄する)。
 */
export const SAVE_VERSION = 5;

/** 中断データに書き出すユニット 1 体ぶんの状態 */
export interface SavedUnit {
  readonly id: string;
  readonly unitType: UnitType;
  readonly armyType: ArmyType;
  readonly col: number;
  readonly row: number;
  readonly currentHp: number;
  readonly hasActed: boolean;
  /** 輸送中のユニット(輸送ヘリ・輸送艦が運んでいる場合)。運んでいなければ空配列 */
  readonly carried: readonly SavedUnit[];
}

/** 中断データに書き出す拠点マス 1 つぶんの状態 */
export interface SavedTile {
  readonly col: number;
  readonly row: number;
  readonly owner: ArmyType;
  readonly captureHp: number;
  readonly captureArmy: ArmyType | null;
}

/** 中断データ 1 件ぶんの内容 */
export interface SaveData {
  /** 形式バージョン(SAVE_VERSION) */
  readonly version: number;
  /** 遊んでいたマップの識別子(MapEntry.id) */
  readonly mapId: string;
  /** 夜戦モードで遊んでいたか(再開時に同じモードで続けるために保存する) */
  readonly nightBattle: boolean;
  /** 対戦していた敵指揮官の識別子(AiCharacter.id)。再開時に同じ思考パターンで続ける */
  readonly aiCharacterId: string;
  /**
   * 担当していたプレイヤーサイド(1P側 / 2P側)。
   * 2P側は盤面の自軍・敵軍を入れ替えて後手番で始めるため、再開時にも同じ条件で続ける。
   */
  readonly playerSide: PlayerSide;
  /** 操作の設定(対 CPU / 対人戦)。再開時にも同じ操作で続ける */
  readonly versusMode: VersusMode;
  /** 保存時刻(エポックミリ秒。表示用) */
  readonly savedAt: number;
  /** 保存時のマップの横マス数・縦マス数(復元時の整合性チェックに使う) */
  readonly cols: number;
  readonly rows: number;
  /** 保存時のターン数と手番の軍勢 */
  readonly turnNumber: number;
  readonly currentArmy: TurnArmy;
  /** 各軍の資金 */
  readonly funds: Record<EconomyArmy, number>;
  /** 生産ユニットの ID 連番(復元後に ID が衝突しないように引き継ぐ) */
  readonly spawnCounter: number;
  /** 占領可能な拠点マスの状態(所有者・占領耐久) */
  readonly tiles: readonly SavedTile[];
  /** 盤面上の生存ユニット */
  readonly units: readonly SavedUnit[];
}

/** createSaveData に渡す、保存対象のゲーム状態 */
export interface SaveSource {
  readonly mapId: string;
  /** 夜戦モードで遊んでいるか */
  readonly nightBattle: boolean;
  /** 対戦している敵指揮官の識別子(AiCharacter.id) */
  readonly aiCharacterId: string;
  /** 担当しているプレイヤーサイド(1P側 / 2P側) */
  readonly playerSide: PlayerSide;
  /** 操作の設定(対 CPU / 対人戦) */
  readonly versusMode: VersusMode;
  readonly map: MapManager;
  readonly units: UnitManager;
  readonly turn: TurnManager;
  readonly economy: EconomyManager;
  /** 保存時刻(省略時は現在時刻) */
  readonly savedAt?: number;
}

/** 復元したゲーム状態(マップは呼び出し側が渡したものを直接書き換える) */
export interface RestoredState {
  readonly units: UnitManager;
  readonly turn: TurnManager;
  readonly economy: EconomyManager;
}

/** ユニット 1 体を中断データ用の形式へ変換する(輸送中のユニットも再帰的に含める) */
function toSavedUnit(unit: Unit): SavedUnit {
  return {
    id: unit.id,
    unitType: unit.unitType,
    armyType: unit.armyType,
    col: unit.position.col,
    row: unit.position.row,
    currentHp: unit.currentHp,
    hasActed: unit.hasActed,
    carried: unit.carried.map(toSavedUnit),
  };
}

/** 中断データのユニット 1 体ぶんを Unit へ復元する(輸送中のユニットも再帰的に復元する) */
function toUnit(saved: SavedUnit): Unit {
  const unit = new Unit({
    id: saved.id,
    unitType: saved.unitType,
    armyType: saved.armyType,
    position: gridPosition(saved.col, saved.row),
    currentHp: saved.currentHp,
    hasActed: saved.hasActed,
  });
  unit.carried = saved.carried.map(toUnit);
  return unit;
}

/**
 * 現在のゲーム状態から中断データを作る。
 * 拠点マスは占領で状態が変わりうるため、占領可能地形のみをすべて書き出す。
 * 地形そのものはマップ定義から復元できるので保存しない。
 */
export function createSaveData(source: SaveSource): SaveData {
  const tiles: SavedTile[] = [];
  source.map.forEachTile((tile) => {
    if (!getTerrainData(tile.terrainType).canCapture) {
      return;
    }
    tiles.push({
      col: tile.position.col,
      row: tile.position.row,
      owner: tile.owner,
      captureHp: tile.captureHp,
      captureArmy: tile.captureArmy,
    });
  });

  return {
    version: SAVE_VERSION,
    mapId: source.mapId,
    nightBattle: source.nightBattle,
    aiCharacterId: source.aiCharacterId,
    playerSide: source.playerSide,
    versusMode: source.versusMode,
    savedAt: source.savedAt ?? Date.now(),
    cols: source.map.cols,
    rows: source.map.rows,
    turnNumber: source.turn.turnNumber,
    currentArmy: source.turn.currentArmy,
    funds: {
      player: source.economy.getFunds('player'),
      enemy: source.economy.getFunds('enemy'),
    },
    spawnCounter: source.units.spawnCounter,
    tiles,
    units: source.units.getAllUnits().map(toSavedUnit),
  };
}

/**
 * 中断データからゲーム状態を復元する。
 * map には復元先のマップ(マップ定義から生成した直後のもの)を渡す。拠点の所有者・
 * 占領耐久はこのマップへ直接書き戻し、ユニット・ターン・資金は新しいマネージャとして返す。
 * データがマップと矛盾している場合(範囲外の座標など)は例外を投げる。
 */
export function restoreGameState(save: SaveData, map: MapManager): RestoredState {
  if (save.cols !== map.cols || save.rows !== map.rows) {
    throw new Error('中断データのマップサイズが一致しません');
  }

  // 拠点の所有者・占領耐久を書き戻す
  for (const saved of save.tiles) {
    const tile = map.getTile(gridPosition(saved.col, saved.row));
    if (!tile) {
      throw new Error(
        `中断データの拠点座標がマップ範囲外です(col ${saved.col}, row ${saved.row})`,
      );
    }
    tile.owner = saved.owner;
    tile.captureHp = saved.captureHp;
    tile.captureArmy = saved.captureArmy;
  }

  const units = UnitManager.fromUnits(save.units.map(toUnit), {
    spawnCounter: save.spawnCounter,
    map,
  });
  // 復元時は手番開始処理(行動済みのリセット)を行わず、保存時点の行動済み状態を保つ。
  // 先手は担当サイドで決まる(2P側は後手番)ため、保存時のサイドから復元する。
  const turn = new TurnManager(
    units,
    { turnNumber: save.turnNumber, currentArmy: save.currentArmy },
    firstArmy(save.playerSide),
  );
  const economy = new EconomyManager();
  economy.setFunds('player', save.funds.player);
  economy.setFunds('enemy', save.funds.enemy);

  return { units, turn, economy };
}

/**
 * 中断データが指定のマップで再開できるかどうか。
 * 中断データは 1 件だけ保持するため、選んだマップと一致するときにだけ再開を提案する。
 */
export function matchesMap(save: SaveData, mapId: string, def: MapDefinition): boolean {
  const rows = def.terrain.length;
  const cols = def.terrain[0]?.length ?? 0;
  return save.mapId === mapId && save.cols === cols && save.rows === rows;
}

/** 値がオブジェクト(配列・null を除く)かどうか */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 有限の整数かどうか(座標・HP・資金などの検証に使う) */
function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** 拠点所有者として妥当な文字列か */
function isArmyType(value: unknown): value is ArmyType {
  return value === 'player' || value === 'enemy' || value === 'neutral';
}

/** 手番を持つ軍勢として妥当な文字列か */
function isTurnArmy(value: unknown): value is TurnArmy {
  return value === 'player' || value === 'enemy';
}

/** ユニット種別として妥当な文字列か(未知の種別は壊れたデータとして扱う) */
function isUnitType(value: unknown): value is UnitType {
  return typeof value === 'string' && UNIT_TYPES.includes(value as UnitType);
}

/** ユニット 1 体ぶんの保存形式として妥当かどうか(輸送中のユニットも再帰的に検証する) */
function isSavedUnit(value: unknown): value is SavedUnit {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    isUnitType(value.unitType) &&
    isArmyType(value.armyType) &&
    isInteger(value.col) &&
    isInteger(value.row) &&
    isInteger(value.currentHp) &&
    typeof value.hasActed === 'boolean' &&
    Array.isArray(value.carried) &&
    value.carried.every(isSavedUnit)
  );
}

/** 拠点マス 1 つぶんの保存形式として妥当かどうか */
function isSavedTile(value: unknown): value is SavedTile {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isInteger(value.col) &&
    isInteger(value.row) &&
    isArmyType(value.owner) &&
    isInteger(value.captureHp) &&
    (value.captureArmy === null || isArmyType(value.captureArmy))
  );
}

/**
 * 任意の値が現在のバージョンの中断データとして妥当かどうかを判定する。
 * localStorage の内容は書き換えられている可能性があるため、復元前に必ずこれで検証する。
 */
export function isSaveData(value: unknown): value is SaveData {
  if (!isRecord(value)) {
    return false;
  }
  if (value.version !== SAVE_VERSION) {
    return false;
  }
  if (typeof value.mapId !== 'string' || !isInteger(value.savedAt)) {
    return false;
  }
  if (typeof value.nightBattle !== 'boolean') {
    return false;
  }
  if (typeof value.aiCharacterId !== 'string') {
    return false;
  }
  if (!isPlayerSide(value.playerSide) || !isVersusMode(value.versusMode)) {
    return false;
  }
  if (!isInteger(value.cols) || !isInteger(value.rows)) {
    return false;
  }
  if (!isInteger(value.turnNumber) || value.turnNumber < 1) {
    return false;
  }
  if (!isTurnArmy(value.currentArmy) || !isInteger(value.spawnCounter)) {
    return false;
  }
  if (
    !isRecord(value.funds) ||
    !isInteger(value.funds.player) ||
    !isInteger(value.funds.enemy)
  ) {
    return false;
  }
  if (!Array.isArray(value.tiles) || !value.tiles.every(isSavedTile)) {
    return false;
  }
  return Array.isArray(value.units) && value.units.every(isSavedUnit);
}
