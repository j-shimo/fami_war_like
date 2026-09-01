// 敵軍(CPU)の思考ルーチン。Phaser には依存しない純粋なロジックとして実装し、
// 既存のマネージャ(戦闘・占領・生産)を介して盤面を更新する。
// docs/DevelopmentPlan.md Phase 9、docs/GameDesign.md「敵AI」を参照。
//
// 行動優先順位(ユニット 1 体ごと):
//   1. 攻撃可能なら攻撃する(移動して攻撃できる場合も含む)
//   2. 占領可能なら占領する(占領地形へ移動しての占領も含む)
//   3. 攻撃も占領もできなければ目標地点へ近づく
//   4. どこへも進めなければ待機する
// 全ユニットの行動後、資金があれば生産拠点でユニットを生産する。
//
// 生産では、その拠点で作れる種別のうち「いまの相手の編成に 1 体も攻撃できないもの」
// (相手に飛行ユニットがいないときの戦闘機など)を候補から外してから選ぶ。
//
// 「3. どこへ近づくか」と「何を生産するか」は思考パターン(AiBehavior)で切り替わる。
// 思考パターンは対戦キャラクターごとに紐づいており(src/data/aiCharacters.ts)、
// 指定しなければ従来どおりの既定パターン(DEFAULT_AI_BEHAVIOR)で動く。
// 思考パターンによっては、3 の前進に次の味付けが加わる。
//   - indirectStandoff: 間接攻撃ユニットは敵へ近づかず、射程に収めるマスへ構える
//   - regroupRadius: 味方から離れすぎるマスへは進まず、隊列を保って押し上げる
// 生産では nightVisionFloor により、夜戦で視界の狭いユニットを候補から外せる。
//
// 夜戦(nightBattle)では AI も自軍と同じ視界のルールに従う。見えていない敵は攻撃対象に
// 選ばず、移動経路上で見えない敵に出くわしたら 1 つ手前のマスで強制待機になる。
// 敵が 1 体も見えていないときは、自軍所有でない拠点を目標にして前進する(索敵)。

import { DEFAULT_AI_BEHAVIOR, type AiBehavior } from '@/core/ai/AiBehavior';
import { canAttackUnit, isWithinAttackRange } from '@/core/battle/AttackRange';
import { calculateDamage } from '@/core/battle/DamageCalculator';
import type { AttackResult, BattleManager } from '@/core/battle/BattleManager';
import type { CaptureResult, CaptureSystem } from '@/core/economy/CaptureSystem';
import type { EconomyArmy } from '@/core/economy/EconomyManager';
import type {
  ProductionManager,
  ProductionResult,
} from '@/core/economy/ProductionManager';
import {
  equals,
  gridPosition,
  manhattanDistance,
  type GridPosition,
} from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import {
  calculateMovementRange,
  findTransportTargets,
  resolveMovePath,
  type ReachableTile,
} from '@/core/movement/MovementRange';
import {
  distancesFrom,
  distancesTo,
  type PathDistanceField,
} from '@/core/movement/PathDistance';
import { computeVisibility, type Visibility } from '@/core/night/Visibility';
import { canCarry } from '@/core/units/transport';
import type { Unit } from '@/core/units/Unit';
import type { UnitManager } from '@/core/units/UnitManager';
import type { UnitType } from '@/core/units/UnitType';
import { canDamage } from '@/data/damageTable';
import { getTerrainData } from '@/data/terrainData';
import { getUnitData, producibleUnitTypesAt } from '@/data/unitData';

/** AI が 1 手番で実行した行動 1 件を表すログ。呼び出し側の表示に使う */
export type AiAction =
  | {
      readonly kind: 'attack';
      readonly result: AttackResult;
      /** 攻撃前に移動した先。その場から攻撃した場合は null */
      readonly movedTo: GridPosition | null;
      /** 攻撃位置までの移動経路(先頭は移動前の位置。動かなければ 1 マスのみ) */
      readonly path: readonly GridPosition[];
    }
  | {
      readonly kind: 'capture';
      readonly result: CaptureResult;
      /** 占領前に移動した先。その場で占領した場合は null */
      readonly movedTo: GridPosition | null;
      /** 占領マスまでの移動経路(先頭は移動前の位置。動かなければ 1 マスのみ) */
      readonly path: readonly GridPosition[];
    }
  | {
      readonly kind: 'move';
      readonly unit: Unit;
      readonly from: GridPosition;
      readonly to: GridPosition;
      /** 実際にたどった移動経路(先頭は from、末尾は to) */
      readonly path: readonly GridPosition[];
    }
  | {
      /** 夜戦で、移動経路上の見えない敵に出くわして手前のマスで強制待機になった */
      readonly kind: 'halt';
      readonly unit: Unit;
      readonly from: GridPosition;
      readonly to: GridPosition;
      /** 行く手を阻んだ敵ユニット */
      readonly blockedBy: Unit;
      /** 停止マスまでの移動経路(先頭は from、末尾は to) */
      readonly path: readonly GridPosition[];
    }
  | {
      /** 味方の輸送ユニットへ乗り込んだ(乗り込んだユニットは盤面から外れる) */
      readonly kind: 'board';
      /** 乗り込んだユニット(歩兵) */
      readonly unit: Unit;
      /** 乗せた輸送ユニット */
      readonly transport: Unit;
      readonly from: GridPosition;
      /** 乗り込んだ先(輸送ユニットのマス) */
      readonly to: GridPosition;
      /** 輸送ユニットのマスまでの移動経路(先頭は移動前の位置) */
      readonly path: readonly GridPosition[];
    }
  | {
      /** 輸送ユニットが運んでいたユニットを隣接マスへ降ろした */
      readonly kind: 'unload';
      /** 降ろした輸送ユニット */
      readonly unit: Unit;
      /** 降ろされたユニット */
      readonly passenger: Unit;
      readonly from: GridPosition;
      /** 輸送ユニットの移動先(降ろした時点の位置) */
      readonly to: GridPosition;
      /** 降ろした先のマス */
      readonly droppedAt: GridPosition;
      /** 降ろす位置までの移動経路(先頭は移動前の位置) */
      readonly path: readonly GridPosition[];
    }
  | { readonly kind: 'produce'; readonly result: ProductionResult }
  | { readonly kind: 'wait'; readonly unit: Unit };

/** EnemyAi が盤面操作に用いるマネージャ群 */
export interface EnemyAiDeps {
  readonly map: MapManager;
  readonly units: UnitManager;
  readonly battle: BattleManager;
  readonly capture: CaptureSystem;
  /** 生産の可否判定・実行に使う(資金判定は ProductionManager 経由で行う) */
  readonly production: ProductionManager;
  /** 夜戦かどうか(省略時は昼戦)。夜戦では AI も視界のルールに従う */
  readonly nightBattle?: boolean;
  /**
   * 思考パターン(省略時は DEFAULT_AI_BEHAVIOR)。
   * 対戦キャラクターの選択に応じて、生産方針と進軍方針を差し替えるために使う。
   */
  readonly behavior?: AiBehavior;
}

/** 拠点占領の優先度。本拠地を最優先で狙う */
const CAPTURE_PRIORITY: Record<string, number> = {
  headquarters: 3,
  factory: 2,
  port: 2,
  // 研究所は都市と同じ収入源だが、中立のうちに占領すれば歩兵が新型戦車へ進化するため、
  // 工場・港と同じ重さで狙う(進化を逃さないよう都市より先に取りに行く)
  laboratory: 2,
  city: 1,
};

/**
 * 中立の拠点に加える占領優先度。preferNeutralCapture の思考パターンでのみ使う。
 * 中立の都市(1 + 1.5 = 2.5)が敵軍の工場・港(2)を上回り、
 * 勝利に直結する敵本拠地(3)は上回らない値にしてある。
 */
const NEUTRAL_CAPTURE_BONUS = 1.5;

/**
 * 前進先を選ぶときの「目標へ 1 マス近づく」価値。
 * 地形防御の加点(下の重みで最大 1.5)ではこの値に届かないため、
 * 防御地形はあくまで「目標へ同じだけ近づけるマス」の選び分けにだけ効く。
 */
const GOAL_WEIGHT = 10;

/** 前進先を選ぶときの地形防御の重み(防御値は 0〜3) */
const DEFENSE_WEIGHT = 0.5;

/**
 * 自軍の生産拠点(工場・本拠地・空港・港)で足を止めることの減点。
 * ユニットが居座っているあいだ、その拠点では生産できなくなってしまうため、
 * 同じくらい目標へ近づけるマスが他にあればそちらを選ばせる。
 * 地形防御の加点(最大 1.5)より大きく、1 マスぶんの前進(GOAL_WEIGHT)より小さい。
 */
const OWN_PRODUCTION_SITE_PENALTY = 2;

/**
 * 占領できないユニット(歩兵以外)が、自軍所有でない拠点の上で足を止めることの減点。
 * 1 マスには 1 体しか立てないため、居座られると自軍の歩兵がそのマスへ入れず、
 * その拠点を永久に占領できなくなってしまう(都市は防御 2 で居心地が良いぶん起きやすい)。
 * 「1 マスぶんの前進(GOAL_WEIGHT)+ 地形防御の加点(最大 1.5)」より大きくしてあるので、
 * 目標そのものが拠点のときでも隣のマスへ退いて、歩兵に道を空ける。
 */
const UNCAPTURED_BASE_PENALTY = 12;

/**
 * 間合いを取る間接攻撃ユニットが、最小射程より内側へ入り込むときの 1 マスあたりの重み。
 * 「遠すぎて届かない」より「近すぎて撃てない(しかも反撃を受ける)」ほうが不利なため、
 * 遠いぶんのはみ出し(重み 1)より重く見る。
 */
const TOO_CLOSE_WEIGHT = 2;

/**
 * 生産拠点ごとの「海を渡って歩兵を運べる輸送ユニット」。
 * 工場・本拠地で作れる輸送車は海を渡れないため含めない
 * (歩兵が歩いて行けない陸地は輸送車でも行けないので、陸の輸送は生産の対象にしない)。
 */
const FERRY_BY_TERRAIN: Record<string, UnitType> = {
  port: 'transportShip',
  airport: 'transportHelicopter',
};

/**
 * 移動タイプをおおまかな移動領域(陸・海・空)にまとめる。
 * 隊列を組む相手を「同じ場所を進める味方」に絞るために使う。
 */
function movementDomain(movementType: MovementType): 'land' | 'sea' | 'air' {
  if (movementType === 'sea' || movementType === 'air') {
    return movementType;
  }
  return 'land';
}

/** 隣接 4 方向のオフセット(斜め移動はしない)。降車できるマスを調べるのに使う */
const NEIGHBOR_OFFSETS: readonly { readonly dc: number; readonly dr: number }[] = [
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
];

/**
 * 敵軍(既定)の 1 手番ぶんの思考を行うコントローラ。
 * run() で手番の全ユニットを順に行動させ、最後に生産を行う。
 */
export class EnemyAi {
  private readonly map: MapManager;
  private readonly units: UnitManager;
  private readonly battle: BattleManager;
  private readonly capture: CaptureSystem;
  private readonly production: ProductionManager;
  private readonly nightBattle: boolean;
  private readonly behavior: AiBehavior;
  /**
   * 経路距離(PathDistance)の計算結果のキャッシュ。
   * 同じ目標・同じ移動タイプを何体ものユニットが参照するため、手番ごとにまとめて使い回す。
   */
  private readonly pathFields = new Map<string, PathDistanceField>();

  /**
   * @param deps 盤面操作に使うマネージャ群
   * @param army この AI が操作する軍勢(既定は敵軍)
   */
  constructor(
    deps: EnemyAiDeps,
    private readonly army: EconomyArmy = 'enemy',
  ) {
    this.map = deps.map;
    this.units = deps.units;
    this.battle = deps.battle;
    this.capture = deps.capture;
    this.production = deps.production;
    this.nightBattle = deps.nightBattle ?? false;
    this.behavior = deps.behavior ?? DEFAULT_AI_BEHAVIOR;
  }

  /** この AI の思考パターン */
  get aiBehavior(): AiBehavior {
    return this.behavior;
  }

  /**
   * この AI の手番を実行する。手番開始時点で行動可能なユニットを順に処理し、
   * 最後に生産拠点での生産を行う。実行した行動のログを返す。
   *
   * 手番をまとめて処理するため、演出を挟まない「超速」の描画モードで使う。
   */
  run(): AiAction[] {
    return [...this.runSteps()];
  }

  /**
   * この AI の手番を 1 行動ずつ実行する。
   * next() を呼ぶたびに次の 1 行動だけを実行してそのログを返すため、
   * 呼び出し側は 1 行動ごとに演出を挟みながら手番を進められる
   * (「簡単」以上の描画モードで使う)。
   *
   * 盤面はその行動を返す時点ですでに更新済みで、途中で列挙をやめれば
   * 残りのユニットは行動しないまま(行動可能なまま)手番が終わる。
   */
  *runSteps(): Generator<AiAction, void, undefined> {
    // 経路距離は地形からのみ決まるため手番中は使い回せる。手番をまたぐと目標もユニットの
    // 位置も変わるため、無駄に抱え込まないよう手番の頭で捨てる。
    this.pathFields.clear();

    // 手番開始時のユニットを固定してから処理する(撃破・生産で集合が変わるため)
    const acting = [...this.units.getUnitsByArmy(this.army)];
    for (const unit of acting) {
      // 反撃で撃破された・すでに行動済みのユニットは飛ばす
      if (!unit.isAlive || unit.hasActed) {
        continue;
      }
      yield this.actUnit(unit);
    }

    yield* this.produceAll();
  }

  /** ユニット 1 体の行動を優先順位に従って決定・実行する */
  private actUnit(unit: Unit): AiAction {
    // 行動のたびに盤面が変わるため、そのユニットの手番ごとに視界を計算し直す
    const vision = computeVisibility(this.map, this.units, this.army, this.nightBattle);
    // 荷物を積んでいる輸送ユニットは、戦うより届けることを優先する。
    // 輸送ユニットが被弾すると搭乗ユニットも同じダメージを受けるため、戦闘には近寄らせない
    if (unit.isCarrying) {
      return this.deliver(unit, vision);
    }
    return (
      this.tryAttack(unit, vision) ??
      this.tryCapture(unit, vision) ??
      this.tryBoard(unit, vision) ??
      this.tryRendezvous(unit, vision) ??
      this.moveOrWait(unit, vision)
    );
  }

  /**
   * 夜戦で見えない敵をすり抜けて移動範囲を計算するためのオプションを返す。
   * 昼戦では見えない敵がいないため、従来どおり敵のマスは進入不可として扱われる。
   */
  private movementOptions(vision: Visibility): {
    isHiddenEnemy: (unit: Unit) => boolean;
  } {
    return { isHiddenEnemy: (unit) => vision.isUnitHidden(unit) };
  }

  /**
   * unit を dest へ動かす。夜戦で経路上の見えない敵に阻まれた場合は、
   * 仕様どおり 1 つ手前のマスで止め、阻んだ敵を返す(呼び出し側で強制待機にする)。
   */
  private moveAlong(
    unit: Unit,
    dest: GridPosition,
    vision: Visibility,
  ): {
    readonly destination: GridPosition;
    readonly blockedBy: Unit | null;
    /** たどった経路(先頭は移動前の位置)。描画側が移動演出に使う */
    readonly path: readonly GridPosition[];
  } {
    const resolved = resolveMovePath(
      unit,
      this.map,
      this.units,
      dest,
      this.movementOptions(vision),
    );
    if (!equals(resolved.destination, unit.position)) {
      this.units.moveUnit(unit, resolved.destination, { markActed: false });
    }
    return {
      destination: resolved.destination,
      blockedBy: resolved.blockedBy,
      path: resolved.path,
    };
  }

  /**
   * 攻撃を試みる。移動可能範囲の各マスから攻撃できる敵を探し、
   * 最も有利なマス・対象の組み合わせで(必要なら移動してから)攻撃する。
   * ただし間接攻撃(遠距離)ユニットは移動後は攻撃できないため、
   * その場から攻撃できる場合のみ攻撃する。
   * 有効な攻撃がなければ null を返す。
   */
  private tryAttack(unit: Unit, vision: Visibility): AiAction | null {
    const range = calculateMovementRange(
      unit,
      this.map,
      this.units,
      this.movementOptions(vision),
    );
    // 夜戦では見えていない敵は狙えない(暗いマスの敵は攻撃対象にならない)
    const enemies = this.opposingUnits().filter((enemy) => vision.isUnitVisible(enemy));

    let bestScore = -Infinity;
    let bestTarget: Unit | null = null;
    let bestFrom: GridPosition | null = null;

    for (const target of enemies) {
      // 種別として攻撃できない相手(戦艦 → 潜水艦など)はそもそも狙わない
      if (!canAttackUnit(unit, target)) {
        continue;
      }
      const damage = calculateDamage(unit, target, this.terrainDefense(target.position));
      // ダメージを与えられない相手には攻撃しない(無駄な行動を避ける)
      if (damage <= 0) {
        continue;
      }
      const willKill = target.currentHp <= damage;

      for (const { position: from } of range.tiles) {
        // 間接攻撃ユニットは移動すると攻撃できない。その場からの攻撃のみ許可する
        if (unit.isIndirect && !equals(from, unit.position)) {
          continue;
        }
        if (!isWithinAttackRange(unit, target.position, from)) {
          continue;
        }
        const counter = this.estimateCounter(unit, target, from, damage, willKill);

        // 撃破を最優先し、次に与ダメージ、被反撃は減点、防御地形は微加点する
        let score = damage - counter + this.terrainDefense(from) * 0.5;
        if (willKill) {
          score += 100;
        }
        if (score > bestScore) {
          bestScore = score;
          bestTarget = target;
          bestFrom = from;
        }
      }
    }

    if (!bestTarget || !bestFrom) {
      return null;
    }

    const from = unit.position;
    const moved = this.moveAlong(unit, bestFrom, vision);
    // 夜戦で見えない敵に行く手を阻まれたら、その手前のマスで強制待機になる
    if (moved.blockedBy) {
      unit.hasActed = true;
      return {
        kind: 'halt',
        unit,
        from,
        to: moved.destination,
        blockedBy: moved.blockedBy,
        path: moved.path,
      };
    }
    const movedTo = equals(moved.destination, from) ? null : moved.destination;
    const result = this.battle.attack(unit, bestTarget);
    return { kind: 'attack', result, movedTo, path: moved.path };
  }

  /**
   * from から attacker が target を攻撃したときに想定される反撃ダメージを見積もる。
   * 直接攻撃(隣接)で、防御側が生存し、攻撃側を射程に収める場合のみ反撃が発生する。
   * 反撃は被弾後の HP で行われるため、想定残 HP を反映して計算する。
   */
  private estimateCounter(
    attacker: Unit,
    target: Unit,
    from: GridPosition,
    damage: number,
    willKill: boolean,
  ): number {
    if (willKill || manhattanDistance(from, target.position) !== 1) {
      return 0;
    }
    // 種別として撃ち返せない相手(護衛艦に撃たれた輸送艦など)は反撃してこない
    if (!canAttackUnit(target, attacker) || !isWithinAttackRange(target, from)) {
      return 0;
    }
    // 反撃は被弾後の HP で行われるため、想定残 HP に一時的に置き換えて見積もる
    const savedHp = target.currentHp;
    target.currentHp = Math.max(1, savedHp - damage);
    const counter = calculateDamage(target, attacker, this.terrainDefense(from));
    target.currentHp = savedHp;
    return counter;
  }

  /**
   * 占領を試みる。占領能力を持つユニットが、移動可能範囲内の
   * 自軍所有でない占領地形へ(必要なら移動して)占領を行う。
   * 占領できなければ null を返す。
   */
  private tryCapture(unit: Unit, vision: Visibility): AiAction | null {
    if (!unit.canCapture) {
      return null;
    }
    const range = calculateMovementRange(
      unit,
      this.map,
      this.units,
      this.movementOptions(vision),
    );

    let bestTile: TileData | null = null;
    let bestFrom: GridPosition | null = null;
    let bestKey = -Infinity;

    for (const { position } of range.tiles) {
      const tile = this.map.getTile(position);
      if (!tile) {
        continue;
      }
      if (!getTerrainData(tile.terrainType).canCapture || tile.owner === this.army) {
        continue;
      }
      // すでにその場にいる拠点を最優先(移動せず占領を継続できる)、
      // 次に拠点の戦略価値(本拠地>工場・港・研究所>都市)を優先する。
      // 中立優先の思考パターンでは中立の拠点に加点し、敵軍の都市・工場より先に取りに行く。
      const priority = CAPTURE_PRIORITY[tile.terrainType] ?? 0;
      const neutralBonus =
        this.behavior.preferNeutralCapture && tile.owner === 'neutral'
          ? NEUTRAL_CAPTURE_BONUS
          : 0;
      const key = (equals(position, unit.position) ? 100 : 0) + priority + neutralBonus;
      if (key > bestKey) {
        bestKey = key;
        bestTile = tile;
        bestFrom = position;
      }
    }

    if (!bestTile || !bestFrom) {
      return null;
    }

    const from = unit.position;
    const moved = this.moveAlong(unit, bestFrom, vision);
    // 夜戦で見えない敵に行く手を阻まれたら、占領地点まで届かず手前で強制待機になる
    if (moved.blockedBy) {
      unit.hasActed = true;
      return {
        kind: 'halt',
        unit,
        from,
        to: moved.destination,
        blockedBy: moved.blockedBy,
        path: moved.path,
      };
    }
    const movedTo = equals(moved.destination, from) ? null : moved.destination;
    const result = this.capture.capture(unit, bestTile);
    return { kind: 'capture', result, movedTo, path: moved.path };
  }

  /**
   * 目標地点へ近づく。近づけない(現在地が最善)場合は待機する。
   * どちらの場合も行動済みにする。
   * 夜戦で敵が 1 体も見えていないときは、自軍所有でない拠点を目標にして前進する(索敵)。
   *
   * 間合いを取る思考パターンの間接攻撃ユニットだけは「近づく」のではなく
   * 「見えている敵を射程に収めるマスへ構える」ため、目標との遠近の測り方が変わる。
   */
  private moveOrWait(unit: Unit, vision: Visibility): AiAction {
    const standoff = this.standoffAnchor(unit, vision);
    const targetPos = standoff ?? this.approachTarget(unit, vision);
    if (!targetPos) {
      unit.hasActed = true;
      return { kind: 'wait', unit };
    }

    const range = calculateMovementRange(
      unit,
      this.map,
      this.units,
      this.movementOptions(vision),
    );
    // 目標との「遠さ」の測り方。間合いを取る間接攻撃ユニットは射程に収まっていれば 0 とし、
    // それ以外は思考パターンに従った距離('path' なら実際に通れるマスをたどった長さ)で測る。
    const goalCost = standoff
      ? (pos: GridPosition) => this.standoffCost(unit, pos, standoff)
      : this.approachDistance(unit, targetPos);

    // 集結する思考パターンでは、味方から離れすぎるマスは候補から外す
    return this.stepTowards(
      unit,
      goalCost,
      this.regroupCandidates(unit, range.tiles),
      vision,
    );
  }

  /**
   * candidates のうち goalCost がいちばん小さいマスへ動く。
   * 現在地(＝動かない)を基準にするため、今いるマスより良いマスが無ければ待機になる。
   * どちらの場合も行動済みにする。接近・間合い取り・輸送の移動で共用する。
   */
  private stepTowards(
    unit: Unit,
    goalCost: (pos: GridPosition) => number,
    candidates: readonly ReachableTile[],
    vision: Visibility,
  ): AiAction {
    let bestPos = unit.position;
    let bestScore = this.moveScore(unit, unit.position, goalCost);

    for (const { position } of candidates) {
      const score = this.moveScore(unit, position, goalCost);
      if (score > bestScore) {
        bestScore = score;
        bestPos = position;
      }
    }

    if (equals(bestPos, unit.position)) {
      unit.hasActed = true;
      return { kind: 'wait', unit };
    }

    const from = unit.position;
    const moved = this.moveAlong(unit, bestPos, vision);
    unit.hasActed = true;
    if (moved.blockedBy) {
      return {
        kind: 'halt',
        unit,
        from,
        to: moved.destination,
        blockedBy: moved.blockedBy,
        path: moved.path,
      };
    }
    if (equals(moved.destination, from)) {
      return { kind: 'wait', unit };
    }
    return { kind: 'move', unit, from, to: moved.destination, path: moved.path };
  }

  // ---- 輸送(積む・運ぶ・降ろす) ----
  //
  // 海で分断されたマップ(分断列島マップなど)では、歩兵は自分の足で相手の島へ渡れない。
  // 輸送ユニットが無ければ敵AIは海岸で足踏みしたまま攻め込めないため、
  // 思考パターンによらず全キャラクター共通の行動として次の 3 つを扱う。
  //
  //   1. 搭乗(tryBoard): 歩いて占領できる拠点がもう無い歩兵が、味方の輸送ユニットへ乗り込む
  //   2. 輸送(deliver): 積んでいる輸送ユニットが、降ろせる岸へ寄せて歩兵を降ろす
  //   3. 待ち合わせ(tryRendezvous): 空の輸送ユニットが、歩兵を乗せられる位置で待つ
  //
  // 運ぶ相手は占領できるユニット(歩兵)だけに絞ってある。戦車を輸送艦で揚陸させる判断までは
  // 行わない(そこまで踏み込むと、揚陸地点の選び方そのものが別の思考になるため)。

  /**
   * 味方の輸送ユニットへ乗り込む。乗り込めない・乗り込む必要がなければ null を返す。
   *
   * 乗り込むのは「自分の足で行ける未所有の拠点の数が、自軍の占領役の数より少ない」ときだけ。
   * つまり陸続きの拠点を取り切る見込みが立ち、占領役が余ってきてから海を渡る。
   * 陸だけのマップでは足で行けない拠点が無く、取り切れば未所有の拠点そのものが無くなるため、
   * 従来どおり誰も船に乗らない。
   *
   * 乗り込んだ歩兵は盤面から外れて占領役の数が減るため、
   * 余っていたぶんだけが順に乗り込み、残りは陸の拠点を取り続ける。
   */
  private tryBoard(unit: Unit, vision: Visibility): AiAction | null {
    if (!unit.canCapture) {
      return null;
    }
    const unowned = this.unownedCaptureTiles();
    if (unowned.length === 0) {
      return null;
    }
    // 自分の足で行ける拠点が占領役より多いうちは、まず陸の拠点を取りに行く
    const onFoot = this.pathField('from', unit.position, unit.movementType);
    const walkable = unowned.filter((pos) => onFoot.get(pos) !== undefined).length;
    if (walkable === unowned.length || walkable >= this.countCapturers()) {
      return null;
    }

    const transports = findTransportTargets(
      unit,
      this.map,
      this.units,
      this.movementOptions(vision),
    )
      // 自分では行けない土地へ運べる輸送ユニットだけを選ぶ。
      // 海を渡れない輸送車に乗り込んで、荷物のまま海岸で止まってしまうのを防ぐ
      .filter((candidate) => this.canFerryBeyondFoot(candidate, unit, onFoot));
    if (transports.length === 0) {
      return null;
    }
    const transport = transports.reduce((nearest, candidate) =>
      manhattanDistance(unit.position, candidate.position) <
      manhattanDistance(unit.position, nearest.position)
        ? candidate
        : nearest,
    );

    const from = unit.position;
    const resolved = resolveMovePath(
      unit,
      this.map,
      this.units,
      transport.position,
      this.movementOptions(vision),
    );
    // 夜戦で経路上の見えない敵に出くわしたら、乗り込めずに手前で強制待機になる
    if (resolved.blockedBy) {
      if (!equals(resolved.destination, from)) {
        this.units.moveUnit(unit, resolved.destination, { markActed: false });
      }
      unit.hasActed = true;
      return {
        kind: 'halt',
        unit,
        from,
        to: resolved.destination,
        blockedBy: resolved.blockedBy,
        path: resolved.path,
      };
    }
    // 搭乗したユニットは盤面から外れるため、輸送ユニットのマスへ動かす必要はない
    this.units.carryUnit(transport, unit);
    return {
      kind: 'board',
      unit,
      transport,
      from,
      to: transport.position,
      path: resolved.path,
    };
  }

  /**
   * transport が passenger を「passenger 自身では歩いて行けない土地」へ運べるかを返す。
   *
   * transport が通れるマスの隣に passenger を降ろせて、その降車先が
   * いま歩いて行ける範囲(onFoot)の外にあるなら運ぶ価値がある。
   * 海を渡れる輸送艦・輸送ヘリだけがこれを満たし、陸の輸送車は満たさない。
   *
   * @param onFoot passenger が現在地から歩いて行ける範囲
   */
  private canFerryBeyondFoot(
    transport: Unit,
    passenger: Unit,
    onFoot: PathDistanceField,
  ): boolean {
    const afloat = this.pathField('from', transport.position, transport.movementType);
    let found = false;
    this.map.forEachTile((tile) => {
      if (found || afloat.get(tile.position) === undefined) {
        return;
      }
      found = this.unloadSpotsAt(transport, tile.position, passenger).some(
        (spot) => onFoot.get(spot) === undefined,
      );
    });
    return found;
  }

  /**
   * 荷物を積んでいる輸送ユニットの行動。降ろした歩兵が目的の拠点へ歩いて行けるマス
   * (揚陸点)へ寄せ、降ろせるようになったらその場で降ろす。
   *
   * 移動先は「降ろした先から目的地までの徒歩距離」がいちばん短いマスを選ぶ。
   * まだどこにも降ろせない(海の上など)あいだは、目的地へ近づくマスを選んで進む。
   */
  private deliver(transport: Unit, vision: Visibility): AiAction {
    const passenger = transport.carried[0];
    if (!passenger) {
      // 呼び出し側で isCarrying を確かめているため、通常はここへ来ない
      transport.hasActed = true;
      return { kind: 'wait', unit: transport };
    }
    const goal = this.landingGoal(transport, passenger);
    if (!goal) {
      // 運ぶ先が無くなった(取り切った・降ろした先から歩いて行ける)。その場で降ろして身軽になる
      return this.unloadHere(transport, passenger, transport.position);
    }
    const footField = this.pathField('to', goal, passenger.movementType);
    const range = calculateMovementRange(
      transport,
      this.map,
      this.units,
      this.movementOptions(vision),
    );

    // 揚陸できるマスを最優先し、まだどこにも降ろせないうちは目的地へ近づく
    let bestPos = transport.position;
    let bestLanding = this.landingCost(
      transport,
      transport.position,
      passenger,
      footField,
    );
    let bestDistance = manhattanDistance(transport.position, goal);
    for (const { position } of range.tiles) {
      const landing = this.landingCost(transport, position, passenger, footField);
      const distance = manhattanDistance(position, goal);
      if (landing < bestLanding || (landing === bestLanding && distance < bestDistance)) {
        bestLanding = landing;
        bestDistance = distance;
        bestPos = position;
      }
    }

    const from = transport.position;
    const moved = this.moveAlong(transport, bestPos, vision);
    if (moved.blockedBy) {
      transport.hasActed = true;
      return {
        kind: 'halt',
        unit: transport,
        from,
        to: moved.destination,
        blockedBy: moved.blockedBy,
        path: moved.path,
      };
    }

    // 寄せた先で降ろせるなら降ろす(降ろしたユニットも輸送ユニットも行動済みになる)
    const spot = this.bestUnloadSpot(transport, transport.position, passenger, footField);
    if (spot) {
      this.units.dropUnit(transport, spot, passenger);
      return {
        kind: 'unload',
        unit: transport,
        passenger,
        from,
        to: transport.position,
        droppedAt: spot,
        path: moved.path,
      };
    }

    transport.hasActed = true;
    if (equals(moved.destination, from)) {
      return { kind: 'wait', unit: transport };
    }
    return {
      kind: 'move',
      unit: transport,
      from,
      to: moved.destination,
      path: moved.path,
    };
  }

  /**
   * 何も積んでいない輸送ユニットが、歩兵を乗せられる位置へ向かう。
   * 輸送ユニット以外では null を返し、通常の行動に任せる。
   *
   * 海上の輸送ユニット(輸送艦)は陸へ上がれないため、歩兵が乗り込める浜辺・自軍の港で待つ。
   * 陸と空の輸送ユニット(輸送車・輸送ヘリ)は、最寄りの味方歩兵のそばへ自分から寄る。
   */
  private tryRendezvous(unit: Unit, vision: Visibility): AiAction | null {
    if (unit.capacity < 1) {
      return null;
    }
    const target =
      unit.movementType === 'sea'
        ? this.boardingBerth(unit)
        : (this.nearestCarriableAlly(unit)?.position ?? null);
    if (!target) {
      // 運ぶ相手も待つ場所も無い。前線へ出しても落とされるだけなのでその場で待つ
      unit.hasActed = true;
      return { kind: 'wait', unit };
    }
    const range = calculateMovementRange(
      unit,
      this.map,
      this.units,
      this.movementOptions(vision),
    );
    return this.stepTowards(unit, this.routeDistance(unit, target), range.tiles, vision);
  }

  /**
   * 運んでいる passenger を届ける先(未所有の拠点)を返す。届ける先が無ければ null。
   *
   * 候補は「passenger が乗り込んだ場所から歩いては行けない拠点」だけに絞る。
   * 乗り込んだ場所から歩いて行ける拠点をわざわざ船で運んでも意味がないうえ、
   * 降ろした先でまた乗り込む往復になってしまうため。
   *
   * 基準にするのは輸送ユニットの現在地ではなく passenger の位置(搭乗しているあいだは
   * 乗り込んだマスのまま変わらない)。海の上とに岸に着いたときとで目的地が入れ替わらず、
   * 何ターンかけて運んでも同じ場所を目指し続ける。
   */
  private landingGoal(transport: Unit, passenger: Unit): GridPosition | null {
    const unowned = this.unownedCaptureTiles();
    if (unowned.length === 0) {
      return null;
    }
    const onFoot = this.pathField('from', passenger.position, passenger.movementType);
    const remote = unowned.filter((pos) => onFoot.get(pos) === undefined);
    return remote.length > 0 ? this.nearestByPath(transport, remote) : null;
  }

  /**
   * その場で passenger を降ろす。降ろせる隣接マスが無ければ待機する。
   * 運ぶ必要が無くなった(目的地を取り切った)荷物を抱え込まないために使う。
   */
  private unloadHere(transport: Unit, passenger: Unit, from: GridPosition): AiAction {
    const spot = this.unloadSpotsAt(transport, transport.position, passenger)[0];
    if (!spot) {
      transport.hasActed = true;
      return { kind: 'wait', unit: transport };
    }
    this.units.dropUnit(transport, spot, passenger);
    return {
      kind: 'unload',
      unit: transport,
      passenger,
      from,
      to: transport.position,
      droppedAt: spot,
      path: [from],
    };
  }

  /**
   * transport が pos にいるとき、passenger を降ろせる隣接マスのうち
   * 「降ろした先から目的地までの徒歩距離」がいちばん短いものを返す(降ろせなければ null)。
   */
  private bestUnloadSpot(
    transport: Unit,
    pos: GridPosition,
    passenger: Unit,
    footField: PathDistanceField,
  ): GridPosition | null {
    let best: GridPosition | null = null;
    let bestCost = Infinity;
    for (const spot of this.unloadSpotsAt(transport, pos, passenger)) {
      const cost = footField.get(spot);
      if (cost !== undefined && cost < bestCost) {
        bestCost = cost;
        best = spot;
      }
    }
    return best;
  }

  /**
   * transport が pos にいるときの「揚陸のしやすさ」を、降ろした先から目的地までの
   * 徒歩距離で表す(小さいほど良い)。どこにも降ろせないマスは Infinity。
   */
  private landingCost(
    transport: Unit,
    pos: GridPosition,
    passenger: Unit,
    footField: PathDistanceField,
  ): number {
    const spot = this.bestUnloadSpot(transport, pos, passenger, footField);
    return spot ? (footField.get(spot) ?? Infinity) : Infinity;
  }

  /**
   * transport が pos にいるとき、passenger を降ろせる隣接マスを返す。
   *
   * 条件は findUnloadPositions と同じ(passenger が進入できる地形・他ユニットがいない)。
   * こちらは移動先の候補マスに対して先読みするため、transport 自身は
   * そのマスから居なくなるものとして数える。
   */
  private unloadSpotsAt(
    transport: Unit,
    pos: GridPosition,
    passenger: Unit,
  ): GridPosition[] {
    const spots: GridPosition[] = [];
    for (const { dc, dr } of NEIGHBOR_OFFSETS) {
      const spot = gridPosition(pos.col + dc, pos.row + dr);
      if (this.map.getMoveCost(spot, passenger.movementType) === null) {
        continue;
      }
      const occupant = this.units.getUnitAt(spot);
      if (occupant && occupant !== transport) {
        continue;
      }
      spots.push(spot);
    }
    return spots;
  }

  /**
   * 空の輸送艦が歩兵を待つ場所を返す。歩兵が乗り込めるのは輸送艦が停泊している
   * 浜辺・港のマスだけなので、そこから選ぶ。運ぶ相手がいなければ null。
   *
   * 最寄りの味方歩兵から見て徒歩でいちばん近い場所を選び、同じ近さなら港より浜辺を優先する
   * (自軍の港に居座ると、そのあいだ港での生産が止まってしまうため)。
   */
  private boardingBerth(unit: Unit): GridPosition | null {
    const ally = this.nearestCarriableAlly(unit);
    if (!ally) {
      return null;
    }
    const footField = this.pathField('from', ally.position, ally.movementType);
    let best: GridPosition | null = null;
    let bestKey = Infinity;
    this.map.forEachTile((tile) => {
      const isBerth =
        tile.terrainType === 'beach' ||
        (tile.terrainType === 'port' && tile.owner === this.army);
      if (!isBerth) {
        return;
      }
      if (this.map.getMoveCost(tile.position, unit.movementType) === null) {
        return;
      }
      const cost = footField.get(tile.position);
      if (cost === undefined) {
        return;
      }
      // 徒歩距離を主、港かどうかを従にした順位付け(同じ距離なら浜辺が先)
      const key = cost * 2 + (tile.terrainType === 'port' ? 1 : 0);
      if (key < bestKey) {
        bestKey = key;
        best = tile.position;
      }
    });
    return best;
  }

  /** unit が運べる自軍ユニットのうち、直線距離でいちばん近いものを返す(いなければ null) */
  private nearestCarriableAlly(unit: Unit): Unit | null {
    const allies = this.units
      .getUnitsByArmy(this.army)
      .filter((ally) => canCarry(unit, ally));
    if (allies.length === 0) {
      return null;
    }
    return allies.reduce((nearest, ally) =>
      manhattanDistance(unit.position, ally.position) <
      manhattanDistance(unit.position, nearest.position)
        ? ally
        : nearest,
    );
  }

  /** この AI が持つ、占領できる生存ユニット(歩兵)の数を返す */
  private countCapturers(): number {
    return this.units.getUnitsByArmy(this.army).filter((unit) => unit.canCapture).length;
  }

  /** 自軍が所有していない占領地形の一覧を返す */
  private unownedCaptureTiles(): GridPosition[] {
    const tiles: GridPosition[] = [];
    this.map.forEachTile((tile) => {
      if (getTerrainData(tile.terrainType).canCapture && tile.owner !== this.army) {
        tiles.push(tile.position);
      }
    });
    return tiles;
  }

  /**
   * 目標までの距離を、実際に通れるマスをたどった経路の長さで測る関数を返す。
   * 目標へ通じる経路が現在地から無い場合は直線距離で代用する。
   * 思考パターンによらず経路で測りたい輸送ユニットの移動で使う。
   */
  private routeDistance(unit: Unit, target: GridPosition): (pos: GridPosition) => number {
    const field = this.pathField('to', target, unit.movementType);
    if (field.get(unit.position) === undefined) {
      return (pos) => manhattanDistance(pos, target);
    }
    return (pos) => field.get(pos) ?? Number.MAX_SAFE_INTEGER;
  }

  /**
   * 前進先マスの評価値(大きいほど良い)を返す。
   * 目標への近さ(goalCost)を最優先し、同じだけ近づけるマスが複数あれば
   * 防御の高い地形を選ぶ。拠点を塞いでしまうマスは減点する。
   */
  private moveScore(
    unit: Unit,
    pos: GridPosition,
    goalCost: (pos: GridPosition) => number,
  ): number {
    let score = -goalCost(pos) * GOAL_WEIGHT + this.terrainDefense(pos) * DEFENSE_WEIGHT;
    // 自軍の生産拠点で足を止めると、そのあいだ生産が止まってしまう
    if (this.isOwnProductionSite(pos)) {
      score -= OWN_PRODUCTION_SITE_PENALTY;
    }
    // 占領できないユニットが未占領の拠点に居座ると、自軍の歩兵が入れず占領できなくなる
    if (this.isBlockingCaptureTile(unit, pos)) {
      score -= UNCAPTURED_BASE_PENALTY;
    }
    return score;
  }

  /**
   * unit が pos で足を止めると、自軍の占領を塞いでしまうかどうかを返す。
   * 塞ぐのは「占領できないユニット」が「自軍所有でない占領可能地形」に立つ場合。
   * 占領役(歩兵)自身は、そこに立つこと自体が占領なので対象にしない。
   */
  private isBlockingCaptureTile(unit: Unit, pos: GridPosition): boolean {
    if (unit.canCapture) {
      return false;
    }
    const tile = this.map.getTile(pos);
    return (
      tile !== undefined &&
      tile.owner !== this.army &&
      getTerrainData(tile.terrainType).canCapture
    );
  }

  /** pos が自軍の生産拠点(工場・本拠地・空港・港)かどうか */
  private isOwnProductionSite(pos: GridPosition): boolean {
    const tile = this.map.getTile(pos);
    return (
      tile !== undefined &&
      tile.owner === this.army &&
      getTerrainData(tile.terrainType).canProduce
    );
  }

  /**
   * 前進先の候補マスを返す。集結する思考パターン(regroupRadius が 1 以上)では、
   * その距離以内に味方がいるマスだけを候補にして、足の速いユニットが 1 体だけ
   * 突出して各個撃破されるのを防ぐ。
   *
   * 隊列を組むのは戦闘ユニットだけで、占領役(歩兵)は数えも縛りもしない。
   * 拠点は散らばっているため、歩兵まで固めると占領が進まなくなるため。
   * 味方として数えるのは同じ移動領域(陸・海・空)のユニットに限る。
   * 陸の味方に合わせようとして艦隊が港から出られない、といった詰まり方を防ぐ。
   *
   * 条件を満たすマスが 1 つも無い(味方がいない・孤立している)場合は絞り込まない。
   * 現在地はこの絞り込みに関わらず常に選べるため、行き場を失うことはない。
   */
  private regroupCandidates(
    unit: Unit,
    tiles: readonly ReachableTile[],
  ): readonly ReachableTile[] {
    const radius = this.behavior.regroupRadius;
    if (radius <= 0 || unit.canCapture) {
      return tiles;
    }
    const domain = movementDomain(unit.movementType);
    const allies = this.units
      .getUnitsByArmy(this.army)
      .filter(
        (ally) =>
          ally !== unit &&
          ally.isAlive &&
          !ally.canCapture &&
          movementDomain(ally.movementType) === domain,
      );
    if (allies.length === 0) {
      return tiles;
    }
    const nearAllies = tiles.filter(({ position }) =>
      allies.some((ally) => manhattanDistance(position, ally.position) <= radius),
    );
    return nearAllies.length > 0 ? nearAllies : tiles;
  }

  /**
   * 間合いを取る間接攻撃ユニットが基準にする敵の位置を返す。
   *
   * 間合いを取らない思考パターン・直接攻撃ユニット・敵が 1 体も見えていないときは null。
   * その場合は従来どおり approachTarget の目標へ近づく。
   */
  private standoffAnchor(unit: Unit, vision: Visibility): GridPosition | null {
    if (!this.behavior.indirectStandoff || !unit.isIndirect) {
      return null;
    }
    const enemies = this.opposingUnits().filter((enemy) => vision.isUnitVisible(enemy));
    if (enemies.length === 0) {
      return null;
    }
    return this.nearestEnemyPosition(unit, enemies);
  }

  /**
   * pos から anchor にいる敵を狙える度合いを「遠さ」(小さいほど良い)として返す。
   *
   * 射程(最小〜最大)に収まっていれば 0。遠すぎれば足りないマス数、
   * 近すぎれば撃てないうえ反撃も受けるため、そのマス数を重く見た値を返す。
   */
  private standoffCost(unit: Unit, pos: GridPosition, anchor: GridPosition): number {
    const distance = manhattanDistance(pos, anchor);
    if (distance < unit.minAttackRange) {
      return (unit.minAttackRange - distance) * TOO_CLOSE_WEIGHT;
    }
    return Math.max(0, distance - unit.maxAttackRange);
  }

  /**
   * 接近の目標地点を返す。
   *
   * - 'captureAndCharge' の思考パターンでは、敵が見えているかによらず
   *   占領できるユニットは未所有の拠点(中立優先)、それ以外は相手の本拠地を目標にする。
   * - 既定('nearestEnemy')では、見えている敵がいればその最寄りの敵、
   *   いなければ(夜戦の索敵中など)自軍所有でない最寄りの拠点を目標にする。
   *
   * どれも見つからなければ null(その場で待機)。
   */
  private approachTarget(unit: Unit, vision: Visibility): GridPosition | null {
    if (this.behavior.advance === 'captureAndCharge') {
      const charge = this.chargeTarget(unit);
      if (charge) {
        return charge;
      }
    }
    const enemies = this.opposingUnits().filter((enemy) => vision.isUnitVisible(enemy));
    if (enemies.length > 0) {
      return this.nearestEnemyPosition(unit, enemies);
    }
    return this.nearestUnownedBase(unit);
  }

  /**
   * 突撃型('captureAndCharge')の目標地点を返す。
   * 占領できるユニット(歩兵)は未所有の拠点を制圧しに向かい、
   * それ以外の戦闘ユニットは敵が 1 体も見えていなくても相手の本拠地へ向かって進み続ける。
   * 目標が見つからなければ null を返し、既定の「最寄りの敵へ近づく」に任せる。
   */
  private chargeTarget(unit: Unit): GridPosition | null {
    if (unit.canCapture) {
      return this.nearestCaptureTarget(unit);
    }
    return this.nearestOpposingHeadquarters(unit);
  }

  /**
   * unit から経路がいちばん短い占領目標を返す。中立の拠点が残っていればその中から選び、
   * 残っていなければ相手軍が所有する拠点から選ぶ(中立都市の制圧を先に済ませる)。
   */
  private nearestCaptureTarget(unit: Unit): GridPosition | null {
    const unowned: TileData[] = [];
    this.map.forEachTile((tile) => {
      if (!getTerrainData(tile.terrainType).canCapture || tile.owner === this.army) {
        return;
      }
      unowned.push(tile);
    });
    const neutrals = unowned.filter((tile) => tile.owner === 'neutral');
    const candidates = neutrals.length > 0 ? neutrals : unowned;
    return this.nearestByPath(
      unit,
      candidates.map((tile) => tile.position),
    );
  }

  /** unit から経路がいちばん短い、相手軍側の本拠地の位置を返す(無ければ null) */
  private nearestOpposingHeadquarters(unit: Unit): GridPosition | null {
    const headquarters: GridPosition[] = [];
    this.map.forEachTile((tile) => {
      if (tile.terrainType === 'headquarters' && tile.owner !== this.army) {
        headquarters.push(tile.position);
      }
    });
    return this.nearestByPath(unit, headquarters);
  }

  /**
   * 候補マスのうち、unit が実際にたどれる経路のいちばん短いものを返す。
   * 経路のつながっている候補が 1 つも無い場合(海を挟んだ相手など)は、
   * 直線距離が最も近い候補を返してとにかくその方向へ進ませる。
   */
  private nearestByPath(
    unit: Unit,
    candidates: readonly GridPosition[],
  ): GridPosition | null {
    if (candidates.length === 0) {
      return null;
    }
    const field = this.pathField('from', unit.position, unit.movementType);
    let best: GridPosition | null = null;
    let bestCost = Infinity;
    for (const pos of candidates) {
      const cost = field.get(pos);
      if (cost !== undefined && cost < bestCost) {
        bestCost = cost;
        best = pos;
      }
    }
    if (best) {
      return best;
    }
    return candidates.reduce((nearest, pos) =>
      manhattanDistance(unit.position, pos) < manhattanDistance(unit.position, nearest)
        ? pos
        : nearest,
    );
  }

  /**
   * 目標までの距離を測る関数を、思考パターンに応じて返す。
   * 'path' では実際に通れるマスをたどった経路の長さで測るため、
   * 山や海に阻まれていても目標へ通じるルートを回り込んで進める。
   * 目標へ通じる経路が現在地から無い場合は直線距離で代用する。
   */
  private approachDistance(
    unit: Unit,
    target: GridPosition,
  ): (pos: GridPosition) => number {
    if (this.behavior.routing !== 'path') {
      return (pos) => manhattanDistance(pos, target);
    }
    const field = this.pathField('to', target, unit.movementType);
    if (field.get(unit.position) === undefined) {
      return (pos) => manhattanDistance(pos, target);
    }
    return (pos) => field.get(pos) ?? Number.MAX_SAFE_INTEGER;
  }

  /**
   * 経路距離を求める(同じ組み合わせは手番中キャッシュする)。
   * kind が 'from' なら pos から各マスへ、'to' なら各マスから pos への経路コストを返す。
   */
  private pathField(
    kind: 'from' | 'to',
    pos: GridPosition,
    movementType: MovementType,
  ): PathDistanceField {
    const key = `${kind}:${movementType}:${pos.col},${pos.row}`;
    const cached = this.pathFields.get(key);
    if (cached) {
      return cached;
    }
    const field =
      kind === 'from'
        ? distancesFrom(this.map, pos, movementType)
        : distancesTo(this.map, pos, movementType);
    this.pathFields.set(key, field);
    return field;
  }

  /** unit から最も近い、自軍所有でない拠点マスの位置を返す(無ければ null) */
  private nearestUnownedBase(unit: Unit): GridPosition | null {
    let nearest: GridPosition | null = null;
    let nearestDist = Infinity;
    this.map.forEachTile((tile) => {
      if (!getTerrainData(tile.terrainType).canCapture || tile.owner === this.army) {
        return;
      }
      const dist = manhattanDistance(unit.position, tile.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = tile.position;
      }
    });
    return nearest;
  }

  /**
   * 生産拠点でユニットを生産する。自軍所有かつ空の生産拠点ごとに、
   * 思考パターンに従って生産する種別を決める。買わない(買えない)拠点は飛ばす。
   *
   * 拠点 1 つぶんの生産を実行するたびに結果を返すため(遅延実行)、
   * 呼び出し側は生産を 1 件ずつ演出しながら進められる。
   */
  private *produceAll(): Generator<AiAction, void, undefined> {
    const producibleTiles: TileData[] = [];
    this.map.forEachTile((tile) => {
      if (this.production.canProduceAt(this.army, tile)) {
        producibleTiles.push(tile);
      }
    });

    // 「その編成に対して 1 体も攻撃できない種別は買わない」判定に使う相手の編成。
    // 夜戦では自軍と同じ視界のルールに従い、見えている敵だけを数える。
    const vision = computeVisibility(this.map, this.units, this.army, this.nightBattle);
    const knownOpponents = this.opposingUnits().filter((unit) =>
      vision.isUnitVisible(unit),
    );

    for (const tile of producibleTiles) {
      const unitType = this.chooseProduction(tile, knownOpponents);
      if (!unitType) {
        continue;
      }
      const result = this.production.produce(this.army, tile, unitType);
      yield { kind: 'produce', result };
    }
  }

  /**
   * tile で生産する種別を思考パターンに従って選ぶ。生産を見送る場合は null を返す。
   *
   * 生産拠点(工場・本拠地・空港)ごとに生産できる種別が異なるため、
   * まずそのマスで生産できる種別を高価な(強力な)順に並べ、そこから
   * 「いまの相手の編成に対して 1 体も攻撃できない種別」を除いてから選ぶ
   * (usableAgainst)。相手に飛行ユニットが 1 体もいないのに戦闘機を買う、
   * といった無駄づかいを防ぐための絞り込み。
   *
   * - 'infantryFirst': 生存する歩兵が infantryQuota に届くまでは歩兵を生産する。
   *   そろったあとは、その拠点で作れる最強ユニットのコストに対して powerCostRatio 以上の
   *   ユニットだけを買い、それ未満しか買えないターンは見送って資金を貯める。
   * - 'roster': 編成表(roster)で決めた最低限の頭数を先に補充する。
   *   そろったあとは 'infantryFirst' と同じ判断に進む。
   * - 'strongest': 買える中でいちばん高価(強力)なユニットを生産する。
   *
   * さらに saveForUpgrade の思考パターンでは、いま買える最強の種別をすでに持っていて
   * 「より高価でまだ 1 体も持っていない種別」が残っていれば、そのターンは見送って資金を貯める。
   * ただし戦力で相手に負けている(劣勢の)あいだは貯めず、いま買えるものを買って頭数を戻す。
   * 夜戦では nightVisionFloor により、視界の狭い種別を候補から外す(withNightVision)。
   *
   * @param opponents 相手軍の編成(夜戦では見えている敵だけ)
   */
  private chooseProduction(tile: TileData, opponents: readonly Unit[]): UnitType | null {
    const byCostDesc = [
      ...producibleUnitTypesAt(tile.terrainType, this.production.mapContext()),
    ].sort((a, b) => getUnitData(b).cost - getUnitData(a).cost);
    // 輸送ユニットは戦力にならないため、通常の生産候補からは外す。
    // 必要になったぶんだけ neededFerry が名指しで生産する
    const combatTypes = byCostDesc.filter(
      (type) => getUnitData(type).capacity < 1 && this.canReachAnyTarget(tile, type),
    );
    const candidates = this.withNightVision(this.usableAgainst(combatTypes, opponents));

    // 海を挟んだ拠点へ兵を送る足が無ければ、何より先に輸送ユニットを 1 体そろえる。
    // まだ資金が足りないうちは、他の拠点での生産を見送って足のために貯める
    const ferry = this.neededFerry(tile);
    if (ferry) {
      return ferry;
    }
    if (this.savingForFerry()) {
      return null;
    }

    // 歩兵がそろうまでは占領役の頭数を優先する(歩兵を作れない拠点は通常どおり)
    if (
      this.behavior.production === 'infantryFirst' &&
      this.countUnits('infantry') < this.behavior.infantryQuota &&
      this.production.canProduce(this.army, tile, 'infantry')
    ) {
      return 'infantry';
    }

    // 編成表に足りない種別があれば、強力なユニットより先に補充する。
    // 占領役の歩兵や夜戦の目になる偵察車を切らさないための最低限の頭数。
    if (this.behavior.production === 'roster') {
      const shortage = this.rosterShortage(tile);
      if (shortage) {
        return shortage;
      }
    }

    const affordable = candidates.find((type) =>
      this.production.canProduce(this.army, tile, type),
    );
    if (!affordable) {
      return null;
    }
    // 資金を貯めて強力なユニットを狙う思考パターンでは、安いユニットの購入を見送る
    const strongest = candidates[0];
    if (
      strongest !== undefined &&
      getUnitData(affordable).cost <
        getUnitData(strongest).cost * this.behavior.powerCostRatio
    ) {
      return null;
    }
    // 同じ種別を並べるより一段上を狙う思考パターンでは、すでに持っている種別しか
    // 買えないターンを見送って資金を貯める。次の段のユニットが買えるまで貯め続ける。
    // ただし戦力で負けているあいだは貯めない(資金を抱えたまま押し切られてしまうため)
    if (
      this.behavior.saveForUpgrade &&
      !this.isOutmatched(opponents) &&
      this.hasUpgradeToSaveFor(affordable, candidates)
    ) {
      return null;
    }
    return affordable;
  }

  /**
   * 自軍の戦力が相手を下回っている(劣勢)かどうかを返す。
   *
   * 戦力は「生産コストを残 HP の割合で割り引いた合計」で測る。頭数ではなく値段で見るため、
   * 歩兵を並べただけの軍と重戦車をそろえた軍を取り違えない。
   *
   * 劣勢のあいだは一段上のユニットを待たず、いま買えるものを買って頭数を戻す。
   * 資金を抱えたまま押し切られるのがいちばん悪い負け方のため。
   *
   * @param opponents 相手軍の編成(夜戦では見えている敵だけ)。
   *   夜戦で相手が見えていなければ劣勢と判断できないため、そのまま貯め続けることになる。
   */
  private isOutmatched(opponents: readonly Unit[]): boolean {
    const own = this.armyValue(this.units.getUnitsByArmy(this.army));
    return own < this.armyValue(opponents);
  }

  /** ユニット群の戦力を、生産コストを残 HP の割合で割り引いて合計した値で返す */
  private armyValue(units: readonly Unit[]): number {
    return units.reduce(
      (total, unit) =>
        total + getUnitData(unit.unitType).cost * (unit.currentHp / unit.maxHp),
      0,
    );
  }

  /**
   * tile で unitType を生産したとき、そのユニットに行き先(相手ユニット・未所有の拠点)が
   * あるかを返す。海で分断されたマップで、渡る手段の無い戦車や自走砲を作り続けて
   * 自陣に詰まらせてしまう(そのうち生産拠点まで塞いでしまう)のを防ぐ。
   *
   * 占領できるユニット(歩兵)は輸送ユニットで運べるため、陸続きでなくても常に役に立つ。
   */
  private canReachAnyTarget(tile: TileData, unitType: UnitType): boolean {
    const data = getUnitData(unitType);
    if (data.canCapture) {
      return true;
    }
    const field = this.pathField('from', tile.position, data.movementType);
    const targets = [
      ...this.unownedCaptureTiles(),
      ...this.opposingUnits().map((unit) => unit.position),
    ];
    return targets.some((pos) => field.get(pos) !== undefined);
  }

  /**
   * 渡る足(輸送ユニット)のために資金を貯めている最中かどうかを返す。
   *
   * 海を挟んだ拠点しか残っていないのに輸送ユニットが 1 体も無いと、いくら戦力を並べても
   * 攻め込めない。そこで「いま空いている自軍の港・空港で輸送ユニットを作れる状況なのに、
   * まだ資金が足りない」あいだは、他の拠点での生産を見送って足の代金を残す。
   *
   * 資金が足りていれば neededFerry がその場で買うため、ここが true になるのは
   * 買えるようになるまでの数ターンだけ。港・空港がふさがっているあいだは
   * 貯めても買えないため、生産を止めないよう false を返す。
   */
  private savingForFerry(): boolean {
    const own = this.units.getUnitsByArmy(this.army);
    if (own.some((unit) => unit.capacity >= 1)) {
      return false;
    }
    const passenger = own.find((unit) => unit.canCapture);
    if (!passenger) {
      return false;
    }
    let saving = false;
    this.map.forEachTile((tile) => {
      if (saving || !FERRY_BY_TERRAIN[tile.terrainType]) {
        return;
      }
      if (!this.production.canProduceAt(this.army, tile)) {
        return;
      }
      const onFoot = this.pathField('from', tile.position, passenger.movementType);
      saving = this.unownedCaptureTiles().some((pos) => onFoot.get(pos) === undefined);
    });
    return saving;
  }

  /**
   * この拠点で生産すべき輸送ユニットを返す(必要なければ null)。
   *
   * 海を挟んだ拠点には歩兵が自分の足で行けないため、輸送ユニットが 1 体も無いと
   * 敵AIは海岸で足踏みしたまま攻め込めない。そこで次のすべてを満たすときに限り、
   * 思考パターンによらず輸送ユニットを 1 体だけ買う。
   *
   * - この拠点から歩いて行けない未所有の拠点が残っている
   * - 運ぶ相手(占領できる自軍ユニット)がいる
   * - 自軍に輸送ユニットが 1 体もいない(渡る足は 1 本あれば足りる)
   * - この拠点が海を渡れる輸送ユニットを作れる(港なら輸送艦・空港なら輸送ヘリ)
   */
  private neededFerry(tile: TileData): UnitType | null {
    const ferry = FERRY_BY_TERRAIN[tile.terrainType];
    if (!ferry || !this.production.canProduce(this.army, tile, ferry)) {
      return null;
    }
    const own = this.units.getUnitsByArmy(this.army);
    // すでに足がある(輸送ユニットを持っている)なら買い足さない
    if (own.some((unit) => unit.capacity >= 1)) {
      return null;
    }
    const passenger = own.find((unit) => unit.canCapture);
    if (!passenger) {
      return null;
    }
    const onFoot = this.pathField('from', tile.position, passenger.movementType);
    return this.unownedCaptureTiles().some((pos) => onFoot.get(pos) === undefined)
      ? ferry
      : null;
  }

  /**
   * 編成表(roster)で頭数が足りず、いま tile で生産できる種別を返す(足りていれば null)。
   * 一覧の先頭にあるものほど優先し、この拠点で作れない・資金が足りない種別は次へ送る。
   */
  private rosterShortage(tile: TileData): UnitType | null {
    for (const entry of this.behavior.roster) {
      if (this.countUnits(entry.unitType) >= entry.count) {
        continue;
      }
      if (this.production.canProduce(this.army, tile, entry.unitType)) {
        return entry.unitType;
      }
    }
    return null;
  }

  /**
   * affordable(いま買える中で最強の種別)をすでに持っていて、その拠点に
   * 「より高価でまだ 1 体も持っていない種別」が残っているかを返す。
   * true なら、そのターンの生産を見送って資金を貯める価値がある。
   *
   * @param candidates 生産候補(高価な順)
   */
  private hasUpgradeToSaveFor(
    affordable: UnitType,
    candidates: readonly UnitType[],
  ): boolean {
    if (this.countUnits(affordable) === 0) {
      return false;
    }
    const affordableCost = getUnitData(affordable).cost;
    return candidates.some(
      (type) => getUnitData(type).cost > affordableCost && this.countUnits(type) === 0,
    );
  }

  /**
   * 生産候補から「いまの相手の編成に 1 体も攻撃できない種別」を取り除く。
   *
   * 相手に飛行ユニットがいないときの戦闘機・対空自走砲・対空ロケット砲や、
   * そもそも攻撃できない輸送ユニットがこれにあたる。
   * 攻撃できる種別が 1 つも残らない場合(相手が全滅している・見えている敵がいないなど)は、
   * 生産そのものが止まらないように元の一覧をそのまま返す。
   *
   * @param types 生産候補(高価な順に並んでいること。並び順は保たれる)
   * @param opponents 相手軍の編成(夜戦では見えている敵だけ)
   */
  private usableAgainst(
    types: readonly UnitType[],
    opponents: readonly Unit[],
  ): readonly UnitType[] {
    if (opponents.length === 0) {
      return types;
    }
    const usable = types.filter((type) =>
      opponents.some((opponent) => canDamage(type, opponent.unitType)),
    );
    return usable.length > 0 ? usable : types;
  }

  /**
   * 夜戦で、生産候補から「視界が nightVisionFloor に満たない種別」を取り除く。
   *
   * 夜戦では視界の狭いユニットは自力で敵を見つけられないため、高価でも持て余す
   * (重戦車・自走砲・ロケット砲・輸送車などの視界は 1)。昼戦では絞り込まない。
   * 残る候補が 1 つも無い場合は、生産そのものが止まらないよう元の一覧をそのまま返す。
   *
   * @param types 生産候補(高価な順に並んでいること。並び順は保たれる)
   */
  private withNightVision(types: readonly UnitType[]): readonly UnitType[] {
    const floor = this.behavior.nightVisionFloor;
    if (!this.nightBattle || floor <= 0) {
      return types;
    }
    const sighted = types.filter((type) => getUnitData(type).vision >= floor);
    return sighted.length > 0 ? sighted : types;
  }

  /** この AI が持つ、指定種別の生存ユニット数を返す */
  private countUnits(unitType: UnitType): number {
    return this.units.getUnitsByArmy(this.army).filter((u) => u.unitType === unitType)
      .length;
  }

  /** この AI の相手軍勢の生存ユニット一覧を返す */
  private opposingUnits(): readonly Unit[] {
    return this.units.getAllUnits().filter((unit) => unit.armyType !== this.army);
  }

  /** unit の現在地から最も近い敵ユニットの位置を返す(enemies は 1 体以上) */
  private nearestEnemyPosition(unit: Unit, enemies: readonly Unit[]): GridPosition {
    let nearest = enemies[0];
    let nearestDist = manhattanDistance(unit.position, nearest.position);
    for (const enemy of enemies) {
      const dist = manhattanDistance(unit.position, enemy.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    return nearest.position;
  }

  /** 指定マスの地形防御値を返す(範囲外は 0) */
  private terrainDefense(pos: GridPosition): number {
    return this.map.getTerrainData(pos)?.defense ?? 0;
  }
}
