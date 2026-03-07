// ── CRT Post-Processing Shader ──────────────────────────────────────
// Applied as a Phaser PostFXPipeline to the main camera.
// Processes the ENTIRE Phaser canvas output (terrain + graphics) as one image.
// React HUD elements are DOM elements on top and are NOT affected.
//
// IMPORTANT: Uniform values are stored as class fields and pushed to GPU
// in onPreRender(). You CANNOT call set1f() from update() or any code
// outside the render phase — the WebGL context is not bound and it will crash.
// See ARCHITECTURE.md for details.
import Phaser from 'phaser';

const FRAGMENT_SHADER = `
  precision mediump float;

  uniform sampler2D uMainSampler;
  uniform float uTime;
  uniform float uGlitch;
  uniform float uShipScreenX;
  uniform float uShipScreenY;
  uniform float uFogRadius;
  uniform float uFogSoftness;

  varying vec2 outTexCoord;

  float rand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = outTexCoord;

    // Glitch / Tearing
    if (uGlitch > 0.0) {
      float sliceY = float(int(uv.y * 10.0));
      float noise = rand(vec2(uTime * 0.01, sliceY));
      if (noise < uGlitch) {
        uv.x += (rand(vec2(uTime, uv.y)) - 0.5) * uGlitch * 0.5;
      }
      uv.x += sin(uv.y * 50.0 + uTime * 0.02) * uGlitch * 0.02;
    }

    // Barrel distortion
    vec2 pos = uv - 0.5;
    float r = dot(pos, pos);
    float distortion = 0.35 + uGlitch * 0.2;
    vec2 curveUV = uv + pos * (r * distortion);

    if (curveUV.x < 0.0 || curveUV.x > 1.0 || curveUV.y < 0.0 || curveUV.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Chromatic aberration
    float aberration = 0.004 + (uGlitch * 0.02);
    vec2 offset = pos * aberration;

    vec4 texR = texture2D(uMainSampler, curveUV - offset);
    vec4 texG = texture2D(uMainSampler, curveUV);
    vec4 texB = texture2D(uMainSampler, curveUV + offset);

    vec4 color = vec4(texR.r, texG.g, texB.b, 1.0);

    // Fog — radial visibility around ship (uFogRadius=0 means no fog)
    if (uFogRadius > 0.0) {
      vec2 shipUV = vec2(uShipScreenX, uShipScreenY);
      float dist = distance(curveUV, shipUV);
      float fog = smoothstep(uFogRadius, uFogRadius - uFogSoftness, dist);
      color.rgb *= fog;
    }

    // Scanlines
    float scanline = sin(curveUV.y * 800.0) * 0.07;
    color.rgb -= scanline;

    // Vignette — subtle rounded screen feel
    float vig = 16.0 * curveUV.x * curveUV.y * (1.0 - curveUV.x) * (1.0 - curveUV.y);
    color.rgb *= pow(vig, 0.55);

    // Noise on glitch
    if (uGlitch > 0.1) {
      float n = rand(curveUV * uTime);
      color.rgb += n * uGlitch * 0.2;
    }

    gl_FragColor = color;
  }
`;

export class CRTPostFx extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  // Uniform values stored here, pushed to GPU in onPreRender().
  // Do NOT call this.set1f() anywhere except onPreRender() — it will crash.
  private _time: number = 0;
  private _glitch: number = 0;
  private _shipX: number = 0.5;
  private _shipY: number = 0.5;
  private _fogRadius: number = 0;   // 0 = no fog (full visibility)
  private _fogSoftness: number = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      renderTarget: true,
      fragShader: FRAGMENT_SHADER,
      name: 'CRTPostFx',
    });
  }

  onPreRender(): void {
    this.set1f('uTime', this._time);
    this.set1f('uGlitch', this._glitch);
    this.set1f('uShipScreenX', this._shipX);
    this.set1f('uShipScreenY', this._shipY);
    this.set1f('uFogRadius', this._fogRadius);
    this.set1f('uFogSoftness', this._fogSoftness);
  }

  updateTime(time: number): void {
    this._time = time * 0.001;
  }

  setGlitch(amount: number): void {
    this._glitch = amount;
  }

  getGlitch(): number {
    return this._glitch;
  }

  setFogParams(shipX: number, shipY: number, radius: number, softness: number): void {
    this._shipX = shipX;
    this._shipY = shipY;
    this._fogRadius = radius;
    this._fogSoftness = softness;
  }
}
