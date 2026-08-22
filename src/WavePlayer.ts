// src/WavePlayer.ts — animates a fixed-size circle on a canvas like an LED,
// varying brightness according to wave sample values.

const MAX_SAMPLE_VALUE = 250;
const PLAYBACK_RATE    = 120;  // samples per second (matches Compiler SAMPLE_RATE)

export class WavePlayer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx:    CanvasRenderingContext2D;

  private samples:   Uint8Array = new Uint8Array(0);
  private startTime: number = 0;
  private animationId: number | null = null;

  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d')!;

    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
      if (this.animationId === null) this.drawLED(0);
    });
    this.resizeObserver.observe(canvas);

    this.syncCanvasSize();
    this.drawLED(0);
  }

  /** Play the segment samples in a loop, lighting the LED by brightness. */
  play(samples: Uint8Array): void {
    this.stop();
    this.samples = samples;
    this.startTime = performance.now();
    this.loop();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.drawLED(0);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private syncCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.round(rect.width)  || 400;
    this.canvas.height = Math.round(rect.height) || 300;
  }

  private loop = (): void => {
    if (this.samples.length === 0) {
      this.drawLED(0);
      return;
    }

    const elapsedSec  = (performance.now() - this.startTime) / 1000;
    const sampleIndex = Math.floor(elapsedSec * PLAYBACK_RATE);

    // Stop after playing through once
    if (sampleIndex >= this.samples.length) {
      this.animationId = null;
      this.drawLED(0);
      return;
    }

    const value      = this.samples[sampleIndex];
    const brightness = value / MAX_SAMPLE_VALUE;

    this.drawLED(brightness);
    this.animationId = requestAnimationFrame(this.loop);
  };

  /**
   * Draw the LED circle at given brightness (0 = off/dark, 1 = fully lit).
   * Yellowish-green monochrome LED, like a firefly.
   */
  private drawLED(brightness: number): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    // Dark background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.25;

    // Outer glow when bright
    if (brightness > 0.05) {
      const glowRadius = radius * (1.5 + brightness * 0.5);
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, glowRadius);
      const alpha = brightness * 0.4;
      glow.addColorStop(0, `rgba(180, 255, 20, ${alpha})`);
      glow.addColorStop(1, 'rgba(180, 255, 20, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // LED body — dark olive (off) to bright yellowish-green (on)
    const r = Math.round(20 + 160 * brightness);
    const g = Math.round(30 + 225 * brightness);
    const b = Math.round(5 + 15 * brightness);
    const ledColor = `rgb(${r}, ${g}, ${b})`;

    // Radial gradient for 3D look
    const grad = ctx.createRadialGradient(
      cx - radius * 0.3, cy - radius * 0.3, radius * 0.1,
      cx, cy, radius
    );
    const highlight = brightness > 0.5
      ? `rgba(220, 255, ${Math.round(80 + 175 * brightness)}, 0.8)`
      : `rgba(${r + 30}, ${g + 20}, ${b + 10}, 0.6)`;
    grad.addColorStop(0, highlight);
    grad.addColorStop(0.7, ledColor);
    grad.addColorStop(1, `rgb(${Math.round(r * 0.4)}, ${Math.round(g * 0.4)}, 0)`);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
