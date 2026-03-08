import { useEffect, useRef, useState, useCallback } from 'react';
import Phaser from 'phaser';
import { createGameConfig } from '../game/config';
import { GameScene } from '../game/scenes/GameScene';
import { HUD } from './HUD';

interface GameState {
  score: number;
  height: number;
  gameOver: boolean;
  gameStarted: boolean;
  health: number;
  energy: number;
  ores: number[];
  equipped: (string | null)[];
  ownedItems: Record<string, number>;
  toggles: Record<string, boolean>;
  slotCooldowns: boolean[];
  shopOpen: boolean;
  nearShop: boolean;
  shopMarkerPos: { x: number; y: number } | null;
  shopScreenPos: { x: number; y: number } | null;
  hubMarkerPos: { x: number; y: number } | null;
  oreCollects: { tier: number; screenX: number; screenY: number }[];
  nearPedestal: { shape: string; color: number; screenX: number; screenY: number; placed: boolean } | null;
}

interface CanvasBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function GameCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [state, setState] = useState<GameState>({
    score: 0,
    height: 0,
    gameOver: false,
    gameStarted: false,
    health: 100,
    energy: 100,
    ores: [0, 0, 0],
    equipped: [null, null, null],
    ownedItems: {},
    toggles: {},
    slotCooldowns: [false, false, false],
    shopOpen: false,
    nearShop: false,
    shopMarkerPos: null,
    shopScreenPos: null,
    hubMarkerPos: null,
    oreCollects: [],
    nearPedestal: null,
  });
  const [canvasBounds, setCanvasBounds] = useState<CanvasBounds | null>(null);

  const updateCanvasBounds = useCallback(() => {
    const wrapper = wrapperRef.current;
    const container = containerRef.current;
    if (!wrapper || !container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    const wrapperRect = wrapper.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    setCanvasBounds({
      left: canvasRect.left - wrapperRect.left,
      top: canvasRect.top - wrapperRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
    });
  }, []);

  const shopActions = useCallback(() => {
    const scene = gameSceneRef.current;
    if (!scene) return { buy: () => false, upgrade: () => false, equip: () => false, unequip: () => false };
    return {
      buy: (itemId: string) => scene.onShopBuy?.(itemId) ?? false,
      upgrade: (itemId: string) => scene.onShopUpgrade?.(itemId) ?? false,
      equip: (itemId: string, slot: number) => scene.onShopEquip?.(itemId, slot) ?? false,
      unequip: (itemId: string) => scene.onShopUnequip?.(itemId) ?? false,
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config = createGameConfig(containerRef.current);
    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.events.on('ready', () => {
      const gameScene = game.scene.getScene('GameScene') as unknown as GameScene;
      if (gameScene) {
        gameScene.onStateChange = setState;
        gameSceneRef.current = gameScene;
      }
      updateCanvasBounds();
    });

    game.events.on('step', () => {
      const gameScene = game.scene.getScene('GameScene') as unknown as GameScene;
      if (gameScene && !gameScene.onStateChange) {
        gameScene.onStateChange = setState;
        gameSceneRef.current = gameScene;
      }
    });

    const ro = new ResizeObserver(updateCanvasBounds);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      game.destroy(true);
      gameRef.current = null;
      gameSceneRef.current = null;
    };
  }, [updateCanvasBounds]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '95%', height: '95%', margin: 'auto', position: 'absolute', inset: 0 }}
      />
      <HUD
        score={state.score}
        gameOver={state.gameOver}
        gameStarted={state.gameStarted}
        health={state.health}
        energy={state.energy}
        ores={state.ores}
        equipped={state.equipped}
        ownedItems={state.ownedItems}
        toggles={state.toggles}
        slotCooldowns={state.slotCooldowns}
        shopOpen={state.shopOpen}
        nearShop={state.nearShop}
        shopMarkerPos={state.shopMarkerPos}
        shopScreenPos={state.shopScreenPos}
        hubMarkerPos={state.hubMarkerPos}
        oreCollects={state.oreCollects}
        nearPedestal={state.nearPedestal}
        canvasBounds={canvasBounds}
        shopActions={shopActions()}
      />
    </div>
  );
}
