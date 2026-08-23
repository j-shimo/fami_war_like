// 盤面の「手応え」を作る演出(移動のルート追従・踏み込み・画面の揺れ・ダメージ数字・
// 撃破の爆散・夜戦の遭遇)を描く。
// 外部画像は持たず、Phaser の図形プリミティブとコード描画のシルエットだけで組み立てる。
// タイムライン(どれを何ミリ秒後に出すか)は attackSequence / moveSequence が持ち、
// このクラスは「1 つの演出を再生する」ことだけを担う。

import Phaser from 'phaser';

import { gridToWorldCenter } from '@/core/map/coordinates';
import type { GridPosition } from '@/core/map/GridPosition';
import type { UnitType } from '@/core/units/UnitType';
import { drawUnitIcon } from '@/rendering/unitIcon';
import { HIT_STOP_MS, LUNGE_BACK_MS, LUNGE_OUT_MS } from '@/rendering/attackSequence';
import { ENCOUNTER_MARK_DELAY_MS, MOVE_STEP_MS } from '@/rendering/moveSequence';

/** 踏み込みで対象へ近づくピクセル数 */
const LUNGE_DISTANCE = 14;

/** 撃破時に飛び散る破片の数 */
const DEBRIS_COUNT = 12;

/** 夜戦の遭遇演出で使う色(注意を引く黄色と、敵の位置を示す赤) */
const ENCOUNTER_MARK_COLOR = '#ffe066';
const ENCOUNTER_ENEMY_COLOR = 0xff5a5a;

/** ダメージ数字の色(与ダメージは白、被ダメージは赤系) */
export const DAMAGE_COLOR = {
  dealt: '#ffffff',
  taken: '#ff8a8a',
} as const;

/** 移動・攻撃・遭遇の演出描画を担うクラス。演出用オブジェクトは専用レイヤーにまとめる */
export class BattleEffects {
  private readonly layer: Phaser.GameObjects.Container;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tileSize: number,
    depth: number,
  ) {
    this.layer = scene.add.container(0, 0).setDepth(depth);
  }

  /**
   * 攻撃側ユニットの分身(トークン)を作る。
   * 盤面のユニットは 1 枚の Graphics にまとめて描いているため、
   * 1 体だけ動かす演出では本体を描画から外し、この分身を代わりに動かす。
   */
  createUnitToken(
    unitType: UnitType,
    pos: GridPosition,
    bodyColor: number,
  ): Phaser.GameObjects.Container {
    const graphics = this.scene.add.graphics();
    const radius = this.tileSize * 0.32;
    graphics.fillStyle(bodyColor, 1);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(2, 0xffffff, 0.9);
    graphics.strokeCircle(0, 0, radius);
    drawUnitIcon(unitType, { graphics, cx: 0, cy: 0, radius, color: 0xffffff, alpha: 1 });

    const { x, y } = gridToWorldCenter(pos, this.tileSize);
    const token = this.scene.add.container(x, y, [graphics]);
    this.layer.add(token);
    return token;
  }

  /**
   * トークンを移動ルートに沿って 1 マスずつ走らせる(瞬間移動させない)。
   * 経路の先頭は開始マスなので、2 マス目から順に MOVE_STEP_MS ずつかけて進める。
   * 走り終えたら onComplete を呼ぶ(呼び出し側で盤面へ移動を反映する)。
   */
  moveTokenAlongPath(
    token: Phaser.GameObjects.Container,
    path: readonly GridPosition[],
    onComplete: () => void,
  ): void {
    const steps = path.slice(1);
    const runStep = (index: number): void => {
      if (index >= steps.length) {
        onComplete();
        return;
      }
      const { x, y } = gridToWorldCenter(steps[index], this.tileSize);
      this.scene.tweens.add({
        targets: token,
        x,
        y,
        duration: MOVE_STEP_MS,
        // 一定の速さで走らせたいので、マスごとの加減速はつけない
        ease: 'Linear',
        onComplete: () => runStep(index + 1),
      });
    };
    runStep(0);
  }

  /**
   * 夜戦で見えていなかった敵に出くわしたことを見せる演出。
   * 止まったユニットの上に「！」を弾ませ、少し遅れて敵のマスに「そうぐう！」と
   * 赤いリングを出して、どこで誰に阻まれたのかを伝える。
   */
  playEncounter(unitPos: GridPosition, enemyPos: GridPosition): void {
    const unitAt = gridToWorldCenter(unitPos, this.tileSize);
    const mark = this.scene.add
      .text(unitAt.x, unitAt.y - this.tileSize * 0.34, '！', {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        fontStyle: 'bold',
        color: ENCOUNTER_MARK_COLOR,
        stroke: '#12121e',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScale(0.4);
    this.layer.add(mark);
    // 勢いよく飛び出してから、遭遇の表示に合わせて消す
    this.scene.tweens.add({
      targets: mark,
      scale: 1.2,
      duration: 180,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: mark,
      alpha: 0,
      delay: 420,
      duration: 220,
      onComplete: () => mark.destroy(),
    });

    const enemyAt = gridToWorldCenter(enemyPos, this.tileSize);
    // 出くわした敵のマスを赤いリングで指し示す
    const ring = this.scene.add.circle(enemyAt.x, enemyAt.y, this.tileSize * 0.3);
    ring.setStrokeStyle(3, ENCOUNTER_ENEMY_COLOR, 1);
    ring.setScale(0.6).setAlpha(0);
    this.layer.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.25,
      alpha: 1,
      delay: ENCOUNTER_MARK_DELAY_MS,
      duration: 220,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: ring,
      alpha: 0,
      delay: ENCOUNTER_MARK_DELAY_MS + 340,
      duration: 200,
      onComplete: () => ring.destroy(),
    });

    const label = this.scene.add
      .text(enemyAt.x, enemyAt.y - this.tileSize * 0.55, 'そうぐう！', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: ENCOUNTER_MARK_COLOR,
        stroke: '#12121e',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScale(0.5);
    this.layer.add(label);
    this.scene.tweens.add({
      targets: label,
      scale: 1,
      delay: ENCOUNTER_MARK_DELAY_MS,
      duration: 200,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: label,
      y: enemyAt.y - this.tileSize * 0.75,
      delay: ENCOUNTER_MARK_DELAY_MS,
      duration: 380,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      delay: ENCOUNTER_MARK_DELAY_MS + 380,
      duration: 190,
      onComplete: () => label.destroy(),
    });
  }

  /**
   * 攻撃側トークンを対象へ踏み込ませ、着弾で少し溜めてから元の位置へ戻す。
   * 「殴った」手応えを出すための動きで、溜め(ヒットストップ)が効き目の中心。
   */
  playLunge(
    token: Phaser.GameObjects.Container,
    from: GridPosition,
    to: GridPosition,
  ): void {
    const origin = gridToWorldCenter(from, this.tileSize);
    const target = gridToWorldCenter(to, this.tileSize);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const stepX = origin.x + (dx / length) * LUNGE_DISTANCE;
    const stepY = origin.y + (dy / length) * LUNGE_DISTANCE;

    this.scene.tweens.add({
      targets: token,
      x: stepX,
      y: stepY,
      duration: LUNGE_OUT_MS,
      ease: 'Quad.easeOut',
      // 着弾でいったん止め(ヒットストップ)、そのあと元の位置へ戻す
      completeDelay: HIT_STOP_MS,
      onComplete: () => {
        this.scene.tweens.add({
          targets: token,
          x: origin.x,
          y: origin.y,
          duration: LUNGE_BACK_MS,
          ease: 'Quad.easeIn',
        });
      },
    });
  }

  /** 着弾の手応えとして画面を短く揺らす。撃破時は強めに揺らす */
  shake(strong: boolean): void {
    this.scene.cameras.main.shake(strong ? 180 : 120, strong ? 0.006 : 0.0035);
  }

  /** ダメージ量の数字をマスから飛び出させ、浮かび上がりながら消す */
  popDamage(pos: GridPosition, damage: number, color: string): void {
    const { x, y } = gridToWorldCenter(pos, this.tileSize);
    const label = this.scene.add
      .text(x, y - 6, String(damage), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color,
        stroke: '#12121e',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScale(1.6);
    this.layer.add(label);

    // 出現時に大きさが縮んで弾む(勢いを出す)
    this.scene.tweens.add({
      targets: label,
      scale: 1,
      duration: 170,
      ease: 'Back.easeOut',
    });
    // 上へ浮かびながら遅れて消える
    this.scene.tweens.add({
      targets: label,
      y: y - 36,
      duration: 500,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      delay: 280,
      duration: 260,
      onComplete: () => label.destroy(),
    });
  }

  /** 撃破の爆散。白い閃光を広げつつ、軍色の破片を四方へ飛ばす */
  playDefeatBurst(pos: GridPosition, bodyColor: number): void {
    const { x, y } = gridToWorldCenter(pos, this.tileSize);

    const flash = this.scene.add.circle(x, y, this.tileSize * 0.34, 0xffffff, 0.9);
    this.layer.add(flash);
    this.scene.tweens.add({
      targets: flash,
      scale: 2.2,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    for (let i = 0; i < DEBRIS_COUNT; i++) {
      // 円周上に均等に散らし、少しだけばらつかせる
      const angle =
        (Math.PI * 2 * i) / DEBRIS_COUNT + Phaser.Math.FloatBetween(-0.25, 0.25);
      const distance = Phaser.Math.Between(18, 34);
      const piece = this.scene.add.rectangle(x, y, 5, 5, bodyColor);
      this.layer.add(piece);
      this.scene.tweens.add({
        targets: piece,
        x: x + Math.cos(angle) * distance,
        // 弧を描いて落ちるよう、下方向へ少し余分に流す
        y: y + Math.sin(angle) * distance + 8,
        angle: Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => piece.destroy(),
      });
    }
  }

  /** 再生中の演出をすべて片付ける(シーン終了・再入場に備える) */
  clear(): void {
    this.scene.tweens.killTweensOf(this.layer.list);
    this.layer.removeAll(true);
  }
}
