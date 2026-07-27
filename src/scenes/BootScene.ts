import Phaser from 'phaser';

/**
 * 起動時に最初に走るシーン。
 * MVP以降でアセットの事前読み込みを担う。今はメインシーンへ遷移するだけ。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    // TODO: Phase 2 以降でタイル・ユニットのスプライトを読み込む
  }

  create(): void {
    this.scene.start('MainScene');
  }
}
