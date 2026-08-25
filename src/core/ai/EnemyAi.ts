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
import { equals, manhattanDistance, type GridPosition } from '@/core/map/GridPosition';
import type { MapManager } from '@/core/map/MapManager';
import type { MovementType } from '@/core/map/TerrainType';
import type { TileData } from '@/core/map/TileData';
import { calculateMovementRange, resolveMovePath } from '@/core/movement/MovementRange';
import {
  distancesFrom,
  distancesTo,
  type PathDistanceField,
} from '@/core/movement/PathDistance';
import { computeVisibility, type Visibility } from '@/core/night/Visibility';
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
  city: 1,
};

/**
 * 中立の拠点に加える占領優先度。preferNeutralCapture の思考パターンでのみ使う。
 * 中立の都市(1 + 1.5 = 2.5)が敵軍の工場・港(2)を上回り、
 * 勝利に直結する敵本拠地(3)は上回らない値にしてある。
 */
const NEUTRAL_CAPTURE_BONUS = 1.5;

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
    return (
      this.tryAttack(unit, vision) ??
      this.tryCapture(unit, vision) ??
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
      // 次に拠点の戦略価値(本拠地>工場>都市)を優先する。
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
   */
  private moveOrWait(unit: Unit, vision: Visibility): AiAction {
    const targetPos = this.approachTarget(unit, vision);
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
    // 目標までの距離の測り方は思考パターンによる('path' なら実際に通れるマスをたどった長さ)
    const distanceTo = this.approachDistance(unit, targetPos);

    let bestPos = unit.position;
    let bestDist = distanceTo(unit.position);
    let bestDefense = this.terrainDefense(unit.position);

    for (const { position } of range.tiles) {
      const dist = distanceTo(position);
      const defense = this.terrainDefense(position);
      // 目標へより近いマスを優先し、同距離なら防御の高い地形を選ぶ
      if (dist < bestDist || (dist === bestDist && defense > bestDefense)) {
        bestDist = dist;
        bestDefense = defense;
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
   * - 'strongest': 買える中でいちばん高価(強力)なユニットを生産する。
   *
   * @param opponents 相手軍の編成(夜戦では見えている敵だけ)
   */
  private chooseProduction(tile: TileData, opponents: readonly Unit[]): UnitType | null {
    const byCostDesc = [...producibleUnitTypesAt(tile.terrainType)].sort(
      (a, b) => getUnitData(b).cost - getUnitData(a).cost,
    );
    const candidates = this.usableAgainst(byCostDesc, opponents);

    // 歩兵がそろうまでは占領役の頭数を優先する(歩兵を作れない拠点は通常どおり)
    if (
      this.behavior.production === 'infantryFirst' &&
      this.countUnits('infantry') < this.behavior.infantryQuota &&
      this.production.canProduce(this.army, tile, 'infantry')
    ) {
      return 'infantry';
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
    return affordable;
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
