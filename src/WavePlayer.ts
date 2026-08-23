// src/WavePlayer.ts — animates a firefly shape on a canvas,
// varying brightness/glow according to wave sample values.

const MAX_SAMPLE_VALUE = 250;

export class WavePlayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx:    CanvasRenderingContext2D;

  private samples:   Uint8Array = new Uint8Array(0);
  private startTime: number = 0;
  private animationId: number | null = null;
  private playbackRate: number = 120;

  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d')!;

    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
      if (this.animationId === null) this.drawFirefly(0);
    });
    this.resizeObserver.observe(canvas);

    this.syncCanvasSize();
    this.drawFirefly(0);
  }

  /** Play the segment samples, lighting the firefly by brightness. */
  play(samples: Uint8Array, longWave: boolean = false): void {
    this.stop();
    this.samples = samples;
    this.playbackRate = longWave ? 60 : 120;
    this.startTime = performance.now();
    this.loop();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.drawFirefly(0);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private syncCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.round(rect.width)  || 200;
    this.canvas.height = Math.round(rect.height) || 300;
  }

  private loop = (): void => {
    if (this.samples.length === 0) {
      this.drawFirefly(0);
      return;
    }

    const elapsedSec  = (performance.now() - this.startTime) / 1000;
    const sampleIndex = Math.floor(elapsedSec * this.playbackRate);

    if (sampleIndex >= this.samples.length) {
      this.animationId = null;
      this.drawFirefly(0);
      return;
    }

    const value      = this.samples[sampleIndex];
    const brightness = value / MAX_SAMPLE_VALUE;

    this.drawFirefly(brightness);
    this.animationId = requestAnimationFrame(this.loop);
  };

  /**
   * Draw a stylized firefly (body + wings + glowing abdomen).
   * Brightness 0 = dim/dark, 1 = fully lit with glow.
   */
  private drawFirefly(brightness: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const scale = Math.min(W, H) * 0.012;

    ctx.save();
    ctx.translate(cx, cy);

    // ── Glow from abdomen ──
    if (brightness > 0.03) {
      const glowR = 30 * scale * (0.8 + brightness * 0.6);
      const glow = ctx.createRadialGradient(0, 14 * scale, 2 * scale, 0, 14 * scale, glowR);
      const alpha = brightness * 0.5;
      glow.addColorStop(0, `rgba(180, 255, 30, ${alpha})`);
      glow.addColorStop(0.4, `rgba(140, 230, 10, ${alpha * 0.5})`);
      glow.addColorStop(1, 'rgba(100, 200, 0, 0)');
      ctx.beginPath();
      ctx.arc(0, 14 * scale, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // ── Wings (translucent, slightly spread) ──
    ctx.globalAlpha = 0.4 + brightness * 0.15;
    ctx.fillStyle = `rgba(180, 200, 220, ${0.5 + brightness * 0.15})`;
    ctx.strokeStyle = 'rgba(150, 170, 190, 0.6)';
    ctx.lineWidth = 0.5 * scale;

    // Left wing
    ctx.beginPath();
    ctx.ellipse(-10 * scale, -5 * scale, 12 * scale, 6 * scale, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.ellipse(10 * scale, -5 * scale, 12 * scale, 6 * scale, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 1;

    // ── Head ──
    ctx.beginPath();
    ctx.ellipse(0, -18 * scale, 4 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4a4a4a';
    ctx.fill();

    // Antennae
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 0.8 * scale;
    ctx.lineCap = 'round';
    // Left antenna
    ctx.beginPath();
    ctx.moveTo(-2 * scale, -21 * scale);
    ctx.quadraticCurveTo(-6 * scale, -28 * scale, -8 * scale, -30 * scale);
    ctx.stroke();
    // Right antenna
    ctx.beginPath();
    ctx.moveTo(2 * scale, -21 * scale);
    ctx.quadraticCurveTo(6 * scale, -28 * scale, 8 * scale, -30 * scale);
    ctx.stroke();

    // ── Thorax (dark body segment) ──
    ctx.beginPath();
    ctx.ellipse(0, -10 * scale, 5.5 * scale, 7 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3a3a3a';
    ctx.fill();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5 * scale;
    ctx.stroke();

    // ── Abdomen (the glowing part) ──
    const abdY = 6 * scale;
    const abdRx = 7 * scale;
    const abdRy = 14 * scale;

    // Base abdomen shape
    ctx.beginPath();
    ctx.ellipse(0, abdY + 4 * scale, abdRx, abdRy, 0, 0, Math.PI * 2);

    // Color: dark olive when off, bright yellow-green when lit
    const r = Math.round(15 + 165 * brightness);
    const g = Math.round(20 + 235 * brightness);
    const b = Math.round(0 + 20 * brightness);

    const abdGrad = ctx.createRadialGradient(
      -2 * scale, abdY, 1 * scale,
      0, abdY + 4 * scale, abdRy
    );
    const highlight = brightness > 0.3
      ? `rgba(220, 255, 60, ${0.6 + brightness * 0.4})`
      : `rgba(${r + 20}, ${g + 15}, ${b + 5}, 0.5)`;
    abdGrad.addColorStop(0, highlight);
    abdGrad.addColorStop(0.5, `rgb(${r}, ${g}, ${b})`);
    abdGrad.addColorStop(1, `rgb(${Math.round(r * 0.3)}, ${Math.round(g * 0.3)}, 0)`);

    ctx.fillStyle = abdGrad;
    ctx.fill();
    ctx.strokeStyle = `rgba(60, 80, 0, 0.6)`;
    ctx.lineWidth = 0.7 * scale;
    ctx.stroke();

    // Abdomen segments (subtle lines)
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.15 + brightness * 0.05})`;
    ctx.lineWidth = 0.4 * scale;
    for (let i = 1; i <= 3; i++) {
      const segY = abdY + i * 5 * scale - 4 * scale;
      const segW = abdRx * (1 - Math.abs(i - 2) * 0.15);
      ctx.beginPath();
      ctx.moveTo(-segW, segY);
      ctx.quadraticCurveTo(0, segY + 1.5 * scale, segW, segY);
      ctx.stroke();
    }

    // ── Legs (3 pairs, thin) ──
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 0.7 * scale;
    ctx.lineCap = 'round';
    const legPairs = [
      { y: -6, spread: 10, length: 14 },
      { y: 0, spread: 12, length: 16 },
      { y: 6, spread: 11, length: 14 },
    ];
    for (const leg of legPairs) {
      // Left leg
      ctx.beginPath();
      ctx.moveTo(-5 * scale, leg.y * scale);
      ctx.quadraticCurveTo(
        -(leg.spread + 2) * scale, (leg.y + 4) * scale,
        -leg.spread * scale, (leg.y + leg.length) * scale
      );
      ctx.stroke();
      // Right leg
      ctx.beginPath();
      ctx.moveTo(5 * scale, leg.y * scale);
      ctx.quadraticCurveTo(
        (leg.spread + 2) * scale, (leg.y + 4) * scale,
        leg.spread * scale, (leg.y + leg.length) * scale
      );
      ctx.stroke();
    }

    ctx.restore();
  }
}
