import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/data/gameConfig';
import { BootScene } from '@/scenes/BootScene';
import { GuideScene } from '@/scenes/GuideScene';
import { MainScene } from '@/scenes/MainScene';
import { MapSelectScene } from '@/scenes/MapSelectScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  scale: {
    // 画面(親要素)に収まる最大サイズまで拡大する。
    // スマホでは横幅いっぱいまで引き伸ばされる。
    mode: Phaser.Scale.FIT,
    // 横は中央寄せ、縦は上寄せにする。縦持ちのスマホでは画面上部から表示され、
    // 下に余白が寄るぶん指で操作しやすくなる。
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  scene: [BootScene, MapSelectScene, GuideScene, MainScene],
};

new Phaser.Game(config);
