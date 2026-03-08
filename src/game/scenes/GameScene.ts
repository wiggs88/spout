// ── Main Game Scene ─────────────────────────────────────────────────
// Orchestrates all systems, owns the frame loop, and bridges to React.
// See ARCHITECTURE.md for the full rendering pipeline and game loop flow.
//
// Rendering order (per frame):
//   1. TerrainSystem.renderToTexture → CPU pixels to CanvasTexture (no fog here)
//   2. Phaser Graphics: bombs, ores, beacons, items, ship, particles
//   3. CRT PostFX shader (GPU): glitch, barrel, chromatic, FOG, scanlines, vignette
//
// Fog is ONLY in the CRT shader. Do not add fog to terrain or graphics rendering.
import Phaser from 'phaser';
import { TerrainSystem } from '../systems/TerrainSystem';
import { ParticleSystem } from '../systems/ParticleSystem';
import { BombSystem } from '../systems/BombSystem';
import { OreSystem } from '../systems/OreSystem';
import { ItemSystem } from '../systems/ItemSystem';
import { ShopSystem } from '../systems/ShopSystem';
import { PhysicsSystem, InputState } from '../systems/PhysicsSystem';
import { CameraSystem } from '../systems/CameraSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { ArtifactSystem } from '../systems/ArtifactSystem';
import { CRTPostFx } from '../effects/CRTPostFx';
import { createShip, getShipPixels } from '../entities/Ship';
import { ShipState, GAME_WIDTH, GAME_HEIGHT, PARTICLE_COUNT, PARTICLE_LIFE, SHIP_MAX_HEALTH, SHIP_REGEN_PER_SEC, MAX_ENERGY, ENERGY_REGEN, FOG_RADIUS_DEFAULT, FOG_SOFTNESS } from '../../types/game';

export class GameScene extends Phaser.Scene {
  private terrain!: TerrainSystem;
  private particles!: ParticleSystem;
  private bombs!: BombSystem;
  private oreSystem!: OreSystem;
  private shopSystem!: ShopSystem;
  private items!: ItemSystem;
  private shipPhysics!: PhysicsSystem;
  private cam!: CameraSystem;
  private enemies!: EnemySystem;
  private artifactSystem!: ArtifactSystem;
  private ship!: ShipState;

  private terrainTexture!: Phaser.Textures.CanvasTexture;
  private terrainImage!: Phaser.GameObjects.Image;
  private graphics!: Phaser.GameObjects.Graphics;

  private inputState: InputState = { left: false, right: false, thrust: false, reverse: false };
  private keys!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    shift: Phaser.Input.Keyboard.Key;
    r: Phaser.Input.Keyboard.Key;
    one: Phaser.Input.Keyboard.Key;
    two: Phaser.Input.Keyboard.Key;
    three: Phaser.Input.Keyboard.Key;
    tab: Phaser.Input.Keyboard.Key;
    esc: Phaser.Input.Keyboard.Key;
    p: Phaser.Input.Keyboard.Key;
    l: Phaser.Input.Keyboard.Key;
    k: Phaser.Input.Keyboard.Key;
  };

  private score: number = 0;
  private maxHeight: number = 0;
  private startY: number = 0;
  private gameOver: boolean = false;
  private gameStarted: boolean = false;
  private energy: { current: number } = { current: MAX_ENERGY };
  private shopOpen: boolean = false;
  private nearShop: boolean = false;
  private debugGodMode: boolean = false;

  // World pickups
  private flashlightPickedUp: boolean = false;
  private static readonly FLASHLIGHT_POS = { x: 1024, y: 1750 };
  private static readonly PICKUP_RADIUS = 12;

  // Intro sequence state
  private introStartTime: number = 0;
  private introPhase: number = 0; // 0=blackout, 1=ship assembly, 2=env reveal, 3=ready
  private introShakeStarted: boolean = false;

  // Callback to update React HUD
  public onStateChange?: (state: {
    score: number; height: number; gameOver: boolean; gameStarted: boolean;
    health: number; energy: number; ores: number[];
    equipped: (string | null)[]; ownedItems: Record<string, number>;
    toggles: Record<string, boolean>; slotCooldowns: boolean[];
    shopOpen: boolean; nearShop: boolean;
    shopMarkerPos: { x: number; y: number } | null;
    shopScreenPos: { x: number; y: number } | null;
    hubMarkerPos: { x: number; y: number } | null;
    oreCollects: { tier: number; screenX: number; screenY: number }[];
    nearPedestal: { shape: string; color: number; screenX: number; screenY: number; placed: boolean } | null;
  }) => void;

  // Callbacks for shop actions from React
  public onShopBuy?: (itemId: string) => boolean;
  public onShopUpgrade?: (itemId: string) => boolean;
  public onShopEquip?: (itemId: string, slot: number) => boolean;
  public onShopUnequip?: (itemId: string) => boolean;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    // Create systems
    this.terrain = new TerrainSystem();
    this.particles = new ParticleSystem();
    this.bombs = new BombSystem();
    this.bombs.scatter(this.terrain);
    this.oreSystem = new OreSystem();
    this.oreSystem.scatter(this.terrain);
    this.shopSystem = new ShopSystem();
    this.items = new ItemSystem(this.shopSystem);
    this.shipPhysics = new PhysicsSystem();
    this.cam = new CameraSystem();
    this.enemies = new EnemySystem();
    this.enemies.scatter(this.terrain);
    this.artifactSystem = new ArtifactSystem();

    // Create ship
    this.ship = createShip();
    this.startY = this.ship.y;

    // Create terrain texture
    this.terrainTexture = this.textures.createCanvas('terrain', GAME_WIDTH, GAME_HEIGHT)!;
    this.terrainImage = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'terrain');
    this.terrainImage.setOrigin(0.5, 0.5);

    // Graphics for ship and particles
    this.graphics = this.add.graphics();

    // Input
    this.keys = {
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      space: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      s: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      shift: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      r: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      one: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      two: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      three: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      tab: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB),
      esc: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      p: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P),
      l: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      k: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.K),
    };

    // Prevent keys from reaching browser
    this.input.keyboard!.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.TAB,
      Phaser.Input.Keyboard.KeyCodes.ESC,
    ]);

    // Initial camera position
    this.cam.x = this.ship.x - GAME_WIDTH / 2;
    this.cam.y = this.ship.y - GAME_HEIGHT / 2;

    // Register CRT post-processing pipeline (WebGL only).
    // This shader handles ALL visual effects: barrel distortion, chromatic aberration,
    // scanlines, vignette, glitch, and FOG. Fog is a GPU effect applied to the entire
    // camera output — do not duplicate fog logic in terrain rendering or graphics code.
    // Falls back gracefully to no effects on Canvas renderer.
    try {
      const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      if (renderer && renderer.gl) {
        renderer.pipelines.addPostPipeline('CRTPostFx', CRTPostFx);
        this.cameras.main.setPostPipeline('CRTPostFx');
      }
    } catch (_) { /* no WebGL or pipeline failed — game continues without CRT */ }

    // Wire up shop action callbacks
    this.onShopBuy = (itemId) => {
      const ores = this.oreSystem.collected.slice(1);
      const ok = this.shopSystem.buy(itemId, ores);
      if (ok) { for (let i = 1; i <= 3; i++) this.oreSystem.collected[i] = ores[i - 1]; }
      this.notifyState();
      return ok;
    };
    this.onShopUpgrade = (itemId) => {
      const ores = this.oreSystem.collected.slice(1);
      const ok = this.shopSystem.upgrade(itemId, ores);
      if (ok) { for (let i = 1; i <= 3; i++) this.oreSystem.collected[i] = ores[i - 1]; }
      this.notifyState();
      return ok;
    };
    this.onShopEquip = (itemId, slot) => {
      const ok = this.shopSystem.equip(itemId, slot);
      this.notifyState();
      return ok;
    };
    this.onShopUnequip = (itemId) => {
      const ok = this.shopSystem.unequip(itemId);
      this.notifyState();
      return ok;
    };

    // Initial render
    this.terrain.renderToTexture(this.terrainTexture, this.cam.x, this.cam.y);

    this.gameStarted = false;
    this.notifyState();
  }

  update(time: number): void {
    // ── Intro sequence (before game starts) ──────────────────────
    if (!this.gameStarted) {
      this.updateIntro(time);

      // Read input — only start game once intro is in phase 3 (ready)
      this.inputState.left = this.keys.left.isDown || this.keys.a.isDown;
      this.inputState.right = this.keys.right.isDown || this.keys.d.isDown;
      this.inputState.thrust = this.keys.space.isDown || this.keys.w.isDown || this.keys.shift.isDown;
      this.inputState.reverse = this.keys.s.isDown || this.keys.down.isDown;

      if (this.introPhase >= 3 && (this.inputState.left || this.inputState.right || this.inputState.thrust || this.inputState.reverse)) {
        this.gameStarted = true;
        this.artifactSystem.introOverride = null;
      } else {
        this.renderFrame();
        this.notifyState();
        return;
      }
    }

    // Set CRT shader uniforms for this frame.
    // These are stored on the CRTPostFx instance and applied in onPreRender().
    // Fog radius comes from flashlight item if equipped, otherwise FOG_RADIUS_DEFAULT.
    // Ship position is converted to UV space (0-1) for the shader.
    try {
      const crt = this.cameras.main.getPostPipeline('CRTPostFx') as CRTPostFx | undefined;
      if (crt) {
        crt.updateTime(time);
        const flashlight = this.items.getFlashlightStats();
        const fogRadius = flashlight?.fogRadius ?? FOG_RADIUS_DEFAULT;
        crt.setFogParams(
          (this.ship.x - this.cam.x) / GAME_WIDTH,
          (this.ship.y - this.cam.y) / GAME_HEIGHT,
          fogRadius,
          FOG_SOFTNESS,
        );
        crt.setGlitch(0);
      }
    } catch (_) { /* no-op */ }

    // Read input
    this.inputState.left = this.keys.left.isDown || this.keys.a.isDown;
    this.inputState.right = this.keys.right.isDown || this.keys.d.isDown;
    this.inputState.thrust = this.keys.space.isDown || this.keys.w.isDown || this.keys.shift.isDown;
    this.inputState.reverse = this.keys.s.isDown || this.keys.down.isDown;

    // Restart on R when game over
    if (this.gameOver && this.keys.r.isDown) {
      this.restart();
      return;
    }

    // Shop toggle
    if (Phaser.Input.Keyboard.JustDown(this.keys.tab) && !this.gameOver) {
      if (this.shopOpen) {
        this.shopOpen = false;
      } else if (this.nearShop) {
        this.shopOpen = true;
      }
      this.notifyState();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.esc) && !this.gameOver && this.shopOpen) {
      this.shopOpen = false;
      this.notifyState();
    }

    // Debug: P gives 10 of each ore
    if (Phaser.Input.Keyboard.JustDown(this.keys.p)) {
      for (let i = 1; i <= 3; i++) this.oreSystem.collected[i] += 10;
      this.notifyState();
    }

    // Debug: L gives lvl 3 flashlight
    if (Phaser.Input.Keyboard.JustDown(this.keys.l)) {
      this.shopSystem.inventory.owned.set('flashlight', 3);
      if (!this.shopSystem.isEquipped('flashlight')) this.shopSystem.equip('flashlight', 0);
      this.notifyState();
    }

    // Debug: K toggles god mode (invincible + super carve)
    if (Phaser.Input.Keyboard.JustDown(this.keys.k)) {
      this.debugGodMode = !this.debugGodMode;
      if (this.debugGodMode) {
        this.shopSystem.inventory.owned.set('carve', 3);
        if (!this.shopSystem.isEquipped('carve')) this.shopSystem.equip('carve', 0);
      }
      this.notifyState();
    }

    // Pause game loop while shop is open
    if (this.shopOpen) {
      this.renderFrame();
      this.notifyState();
      return;
    }

    if (!this.gameOver) {
      // Update physics
      this.shipPhysics.update(this.ship, this.inputState, this.terrain);

      // Check death
      if (!this.ship.alive) {
        this.gameOver = true;
        this.notifyState();
      }

      // Debug god mode: invincible + unlimited energy + auto-carve
      if (this.debugGodMode) {
        this.ship.health = SHIP_MAX_HEALTH;
        this.ship.invincibleFrames = 10;
        this.energy.current = MAX_ENERGY;
        // Continuous super carve (bigger radius than lvl 3)
        if (this.ship.alive) {
          const seed = this.ship.x * 9.1 + this.ship.y * 13.3;
          this.terrain.explodeAt(this.ship.x, this.ship.y, 40, seed);
        }
      }

      // Health regen
      if (this.ship.alive && this.ship.health < SHIP_MAX_HEALTH) {
        this.ship.health = Math.min(SHIP_MAX_HEALTH, this.ship.health + SHIP_REGEN_PER_SEC / 60);
      }

      // Energy regen (base + dynamo bonus)
      if (this.ship.alive && this.energy.current < MAX_ENERGY) {
        const dynamoStats = this.items.getDynamoStats();
        const regenRate = ENERGY_REGEN + (dynamoStats?.regenBonus ?? 0);
        this.energy.current = Math.min(MAX_ENERGY, this.energy.current + regenRate / 60);
      }

      // Spawn particles on thrust
      if (this.inputState.thrust && this.ship.alive) {
        this.particles.spawnThrust(this.ship);
      }

      // Bomb collection
      const bombIdx = this.bombs.checkCollection(this.ship);
      if (bombIdx !== -1) {
        this.bombs.explode(bombIdx);
      }

      // Ore collection (touch-based)
      this.oreSystem.checkCollection(this.ship);

      // Flashlight pickup
      if (!this.flashlightPickedUp) {
        const fp = GameScene.FLASHLIGHT_POS;
        const dx = this.ship.x - fp.x;
        const dy = this.ship.y - fp.y;
        if (dx * dx + dy * dy < GameScene.PICKUP_RADIUS * GameScene.PICKUP_RADIUS) {
          this.flashlightPickedUp = true;
          this.shopSystem.inventory.owned.set('flashlight', 1);
          // Auto-equip to first empty passive slot (or slot 0 if all full)
          const emptySlot = this.shopSystem.inventory.equipped.indexOf(null);
          this.shopSystem.equip('flashlight', emptySlot !== -1 ? emptySlot : 0);
        }
      }

      // Artifact collection / rope physics / placement
      this.artifactSystem.update(this.ship);

      // Check if near a rest area
      this.nearShop = this.terrain.isNearRestArea(this.ship.x, this.ship.y);

      // Item input (3 slots)
      const key1 = Phaser.Input.Keyboard.JustDown(this.keys.one);
      const key2 = Phaser.Input.Keyboard.JustDown(this.keys.two);
      const key3 = Phaser.Input.Keyboard.JustDown(this.keys.three);
      this.items.handleInput(key1, key2, key3, this.ship, time, this.energy);

      // Item system update
      this.items.update(this.ship, this.terrain, this.oreSystem, this.particles, time, this.energy);

      // Enemy AI + combat
      this.enemies.update(this.ship, this.terrain, time);

      // Rocket vs enemies
      const rkt = this.items.getRocketState();
      if (rkt.active) {
        const blastRadius = this.items.getRocketBlastRadius();
        if (this.enemies.checkRocketHit(rkt.x, rkt.y, blastRadius)) {
          this.particles.spawnSmallExplosion(rkt.x, rkt.y);
        }
      }

      // Aura vs enemies
      if (this.items.isAuraActive()) {
        this.enemies.applyAuraDamage(this.ship.x, this.ship.y, this.items.getAuraRadius());
      }

      // Thruster vs enemies
      if (this.inputState.thrust && this.ship.alive) {
        this.enemies.applyThrusterDamage(this.ship.x, this.ship.y, this.ship.angle);
      }

      // Spawn death particles for killed enemies
      for (const death of this.enemies.drainDeathEvents()) {
        this.particles.spawnSmallExplosion(death.x, death.y);
      }

      // Spawn red erosion particles at magma blob impacts
      for (const impact of this.enemies.drainBlobImpacts()) {
        this.particles.spawnBlobSplat(impact.x, impact.y);
      }

      // Spawn small red splats where enemy projectiles hit walls
      for (const hit of this.enemies.drainProjectileWallHits()) {
        this.particles.spawnSmallSplat(hit.x, hit.y);
      }

      // Update score (height gained)
      const currentHeight = Math.max(0, Math.floor(this.startY - this.ship.y));
      if (currentHeight > this.maxHeight) {
        this.maxHeight = currentHeight;
        this.score = this.maxHeight;
      }
    }

    // Advance bomb explosions
    this.bombs.update(this.terrain, this.particles, time);

    // Update particles
    this.particles.update(this.terrain);

    // Update camera
    this.cam.update(this.ship);

    // Render
    this.renderFrame();
    this.notifyState();
  }

  // Intro sequence: 4-phase cinematic boot-up controlled via CRT shader uniforms.
  // This method ONLY sets CRT params (fog, glitch). It does NOT call renderToTexture —
  // that happens in renderFrame() which is called after this returns.
  private updateIntro(time: number): void {
    if (this.introStartTime === 0) this.introStartTime = time;
    const elapsed = time - this.introStartTime;

    const shipUVx = (this.ship.x - this.cam.x) / GAME_WIDTH;
    const shipUVy = (this.ship.y - this.cam.y) / GAME_HEIGHT;

    let crt: CRTPostFx | undefined;
    try {
      crt = this.cameras.main.getPostPipeline('CRTPostFx') as CRTPostFx | undefined;
    } catch (_) { /* no-op */ }

    if (elapsed < 500) {
      // Phase 0: Blackout
      this.introPhase = 0;
      if (crt) {
        crt.updateTime(time);
        crt.setFogParams(shipUVx, shipUVy, 0.001, 0.001);
        crt.setGlitch(0);
      }
    } else if (elapsed < 3000) {
      // Phase 1: Ship assembly — small fog so ship glow is visible, env stays dark
      this.introPhase = 1;
      const progress = (elapsed - 500) / 2500;
      if (crt) {
        crt.updateTime(time);
        const shipGlow = 0.04 + progress * 0.04;
        crt.setFogParams(shipUVx, shipUVy, shipGlow, 0.04);
        crt.setGlitch(0.6 * (1 - progress));
      }
    } else if (elapsed < 7000) {
      // Phase 2: Environment reveal — fog opens up
      this.introPhase = 2;
      const progress = Math.min(1, (elapsed - 3000) / 2000);
      const eased = 1 - Math.pow(1 - progress, 3);
      const fogRadius = 0.08 + eased * (FOG_RADIUS_DEFAULT - 0.08);
      if (crt) {
        crt.updateTime(time);
        crt.setFogParams(shipUVx, shipUVy, fogRadius, FOG_SOFTNESS);
        const pulse = Math.sin(elapsed * 0.008) * 0.15 * (1 - progress);
        crt.setGlitch(Math.max(0, pulse));
      }
    } else {
      // Phase 3: Ready — waiting for input
      this.introPhase = 3;
      if (crt) {
        crt.updateTime(time);
        crt.setFogParams(shipUVx, shipUVy, FOG_RADIUS_DEFAULT, FOG_SOFTNESS);
        crt.setGlitch(0);
      }
    }

    // ── Artifact hub power-up sequence ─────────────────────────
    // Overlays on phase 2: ring → lines → towers → glow+shake → snap off
    if (elapsed < 5000) {
      // Before artifact intro: hide all hub elements
      this.artifactSystem.introOverride = { ring: 0, lines: 0, towers: 0, glow: 0 };
    } else if (elapsed < 7000) {
      const t = elapsed - 5000;
      let ring = 0, lines = 0, towers = 0, glow = 1;

      // Ring flickers on (0–400ms)
      if (t < 400) {
        const p = t / 400;
        ring = Math.random() < p * 1.5 ? (0.4 + p * 0.6) : 0;
      } else {
        ring = 1;
      }

      // Lines flicker on (400–800ms)
      if (t >= 400 && t < 800) {
        const p = (t - 400) / 400;
        lines = Math.random() < p * 1.5 ? (0.4 + p * 0.6) : 0;
      } else if (t >= 800) {
        lines = 1;
      }

      // Towers flicker on (800–1200ms)
      if (t >= 800 && t < 1200) {
        const p = (t - 800) / 400;
        towers = Math.random() < p * 1.5 ? (0.4 + p * 0.6) : 0;
      } else if (t >= 1200) {
        towers = 1;
      }

      // All glow intensifies + screenshake (1200–1700ms)
      if (t >= 1200 && t < 1700) {
        glow = 1 + ((t - 1200) / 500) * 3;
        if (!this.introShakeStarted) {
          this.introShakeStarted = true;
          this.cameras.main.shake(500, 0.006);
        }
      }

      // Flash fades off (1700–1900ms)
      if (t >= 1700 && t < 1900) {
        const fade = 1 - (t - 1700) / 200;
        ring *= fade;
        lines *= fade;
        towers *= fade;
        glow = 4 * fade;
      }

      // Fully off (1900ms+)
      if (t >= 1900) {
        ring = 0; lines = 0; towers = 0; glow = 0;
      }

      this.artifactSystem.introOverride = { ring, lines, towers, glow };
    } else {
      // Phase 3+: normal rendering
      this.artifactSystem.introOverride = null;
    }
  }

  // Render one frame: terrain pixels (CPU) → game objects (Phaser Graphics).
  // The CRT shader runs automatically after this as a PostFX pipeline on the camera.
  // Do NOT add fog, vignette, or post-processing here — it belongs in CRTPostFx.
  private renderFrame(): void {
    this.terrain.renderToTexture(this.terrainTexture, this.cam.x, this.cam.y);
    this.graphics.clear();

    const camX = Math.floor(this.cam.x);
    const camY = Math.floor(this.cam.y);

    // Draw bombs
    this.bombs.render(this.graphics, camX, camY, this.time.now);

    // Draw ores
    this.oreSystem.render(this.graphics, camX, camY, this.time.now);

    // Draw enemies
    this.enemies.render(this.graphics, camX, camY, this.time.now);

    // Draw rest area beacons
    this.terrain.renderRestAreaBeacons(this.graphics, camX, camY, this.time.now);

    // Draw artifacts (pedestals, connection lines, center circle, artifacts + ropes)
    this.artifactSystem.render(this.graphics, camX, camY, this.time.now);

    // Draw world pickups
    this.renderPickups(camX, camY, this.time.now);

    // Draw item effects
    this.items.render(this.graphics, camX, camY, this.time.now, this.ship);

    // Draw ship
    if (this.ship.alive) {
      if (!this.gameStarted && this.introPhase <= 1) {
        // ── Intro ship assembly: flickering pixels ──────────────
        if (this.introPhase === 1) {
          const elapsed = this.time.now - this.introStartTime;
          const progress = Math.max(0, Math.min(1, (elapsed - 500) / 2500));
          const shipPixels = getShipPixels(this.ship);
          for (const p of shipPixels) {
            if (Math.random() > progress) continue;
            const jitter = (1 - progress) * 2;
            const jx = p.x + (Math.random() - 0.5) * jitter;
            const jy = p.y + (Math.random() - 0.5) * jitter;
            const shade = Math.random() > 0.3 ? 0xffffff : 0x888888;
            this.graphics.fillStyle(shade, 0.7 + progress * 0.3);
            this.graphics.fillRect(Math.floor(jx) - camX, Math.floor(jy) - camY, 1, 1);
          }
          // Center dot appears late
          if (progress > 0.8) {
            this.graphics.fillStyle(0xaaaaaa, progress);
            this.graphics.fillRect(Math.floor(this.ship.x) - camX, Math.floor(this.ship.y) - camY, 2, 2);
          }
        }
        // Phase 0: don't draw ship at all
      } else {
        // ── Normal ship rendering ───────────────────────────────
        const flash = this.ship.invincibleFrames > 70;
        const skipFrame = flash && this.ship.invincibleFrames % 4 < 2;

        if (!skipFrame) {
          const shipPixels = getShipPixels(this.ship);
          this.graphics.fillStyle(flash ? 0xff3333 : 0xffffff, 1);
          for (const p of shipPixels) {
            const screenX = p.x - camX;
            const screenY = p.y - camY;
            if (screenX >= 0 && screenX < GAME_WIDTH && screenY >= 0 && screenY < GAME_HEIGHT) {
              this.graphics.fillRect(screenX, screenY, 1, 1);
            }
          }

          this.graphics.fillStyle(flash ? 0xcc2222 : 0xaaaaaa, 1);
          this.graphics.fillRect(Math.floor(this.ship.x) - camX, Math.floor(this.ship.y) - camY, 2, 2);
        }
      }
    }

    // Draw particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const grain = this.particles.particles[i];
      if (!grain.active) continue;

      const screenX = Math.floor(grain.x) - camX;
      const screenY = Math.floor(grain.y) - camY;
      if (screenX < 0 || screenX >= GAME_WIDTH || screenY < 0 || screenY >= GAME_HEIGHT) continue;

      const lifeRatio = Math.min(1, grain.life / PARTICLE_LIFE);
      const shade = Math.floor(60 + 195 * lifeRatio);
      const color = grain.red
        ? (shade << 16) | (Math.floor(shade * 0.15) << 8) | Math.floor(shade * 0.1)
        : (shade << 16) | (shade << 8) | shade;
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(screenX, screenY, 1, 1);
    }
  }

  private renderPickups(camX: number, camY: number, time: number): void {
    const pulse = Math.sin(time * 0.004) * 0.3 + 0.7;
    const glow = Math.sin(time * 0.003) * 0.15 + 0.85;

    // Flashlight pickup (yellow/white glow)
    if (!this.flashlightPickedUp) {
      const fp = GameScene.FLASHLIGHT_POS;
      const sx = fp.x - camX;
      const sy = fp.y - camY;
      if (sx > -20 && sx < GAME_WIDTH + 20 && sy > -20 && sy < GAME_HEIGHT + 20) {
        // Soft glow halo
        this.graphics.fillStyle(0xffeeaa, glow * 0.12);
        this.graphics.fillCircle(sx, sy, 10);
        // Circle body (flashlight lens)
        this.graphics.fillStyle(0xffeeaa, pulse);
        this.graphics.fillCircle(sx, sy, 3);
        // 4 rays
        this.graphics.lineStyle(1, 0xffeeaa, pulse * 0.7);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + time * 0.001;
          this.graphics.beginPath();
          this.graphics.moveTo(sx + Math.cos(a) * 4, sy + Math.sin(a) * 4);
          this.graphics.lineTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7);
          this.graphics.strokePath();
        }
        // Center bright dot
        this.graphics.fillStyle(0xffffff, pulse);
        this.graphics.fillRect(sx, sy, 1, 1);
      }
    }

  }

  private restart(): void {
    this.ship = createShip();
    this.startY = this.ship.y;
    this.score = 0;
    this.maxHeight = 0;
    this.gameOver = false;
    this.gameStarted = false;
    this.energy = { current: MAX_ENERGY };
    this.shopOpen = false;
    this.nearShop = false;
    this.debugGodMode = false;
    this.flashlightPickedUp = false;
    this.introStartTime = 0;
    this.introPhase = 0;
    this.introShakeStarted = false;

    // Rebuild terrain and pickups
    this.terrain = new TerrainSystem();
    this.particles = new ParticleSystem();
    this.bombs = new BombSystem();
    this.bombs.scatter(this.terrain);
    this.oreSystem = new OreSystem();
    this.oreSystem.scatter(this.terrain);
    this.shopSystem = new ShopSystem();
    this.items = new ItemSystem(this.shopSystem);
    this.enemies = new EnemySystem();
    this.enemies.scatter(this.terrain);
    this.artifactSystem = new ArtifactSystem();

    this.cam.x = this.ship.x - GAME_WIDTH / 2;
    this.cam.y = this.ship.y - GAME_HEIGHT / 2;

    this.notifyState();
  }

  private notifyState(): void {
    const shopState = this.shopSystem.getState();
    const camX = Math.floor(this.cam.x);
    const camY = Math.floor(this.cam.y);

    // Drain ore collection events and convert to screen-ratio coords
    const oreCollects = this.oreSystem.collectEvents.map(e => ({
      tier: e.tier,
      screenX: (e.x - camX) / GAME_WIDTH,
      screenY: (e.y - camY) / GAME_HEIGHT,
    }));
    this.oreSystem.collectEvents.length = 0;

    this.onStateChange?.({
      score: this.score,
      height: this.maxHeight,
      gameOver: this.gameOver,
      gameStarted: this.gameStarted,
      health: this.ship.health,
      energy: this.energy.current,
      ores: this.oreSystem.collected.slice(1),
      equipped: shopState.equipped,
      ownedItems: shopState.owned,
      toggles: this.items.getSlotToggles(),
      slotCooldowns: this.items.getSlotCooldowns(this.time?.now ?? 0),
      shopOpen: this.shopOpen,
      nearShop: this.nearShop,
      shopMarkerPos: this.terrain.getShopMarkerScreenPos(this.cam.x, this.cam.y, this.ship.x, this.ship.y),
      shopScreenPos: this.terrain.getNearestRestAreaScreenPos(this.cam.x, this.cam.y, this.ship.x, this.ship.y),
      hubMarkerPos: this.artifactSystem.getHubMarkerScreenPos(camX, camY),
      oreCollects,
      nearPedestal: this.artifactSystem.getNearPedestal(this.ship.x, this.ship.y, camX, camY),
    });
  }
}
