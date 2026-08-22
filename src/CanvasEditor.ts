// src/CanvasEditor.ts — canvas rendering + mouse interaction

import { WaveData } from './WaveData';
import { buildSpline, SplineEvaluator, Knot } from './Spline';

const MARGIN_LEFT   = 44;  // px reserved for Y axis labels
const MARGIN_TOP    = 10;  // px reserved so top Y labels aren't clipped
const MARGIN_BOTTOM = 28;  // px reserved for X axis labels
const CIRCLE_RADIUS = 8;
const Y_MAX         = 256; // top of canvas (display scale)
const Y_DATA_MAX    = 250; // clamp for WaveData values
const X_MAX_TIME    = 10.0; // hard upper bound for time axis (seconds)

export class CanvasEditor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx:    CanvasRenderingContext2D;

  private waveData:  WaveData;
  private spline:    SplineEvaluator;

  // Viewport — startTime is always 0 (full 10s range visible)
  private startTime:       number = 0.0;

  // pixelsPerTenth is computed dynamically in redraw() based on canvas width
  private pixelsPerTenth:  number = 8;

  // Drag state — left-click to move a control point vertically
  private dragging:     boolean = false;
  private dragIndex:    number  = -1;    // WaveData slot index

  // Highlight range (seconds) for selected segment
  private highlightStart: number = -1;
  private highlightStop:  number = -1;

  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, waveData: WaveData) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d')!;
    this.waveData = waveData;
    this.spline   = this.buildSplineFromData(waveData);

    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => {
      this.syncCanvasSize();
      this.redraw();
    });
    this.resizeObserver.observe(canvas);

    this.syncCanvasSize();
    this.redraw();
  }

  // Callback when a control point is modified (drag ends)
  private onChangeCallback: (() => void) | null = null;

  /** Register a callback for when the user finishes editing a control point. */
  onChange(cb: () => void): void {
    this.onChangeCallback = cb;
  }

  setWaveData(waveData: WaveData): void {
    this.waveData = waveData;
    this.spline   = this.buildSplineFromData(waveData);
  }

  /** Highlight a time range (seconds) in the graph. Pass -1, -1 to clear. */
  setHighlight(startTime: number, stopTime: number): void {
    this.highlightStart = startTime;
    this.highlightStop  = stopTime;
    this.redraw();
  }

  redraw(): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const plotW = W - MARGIN_LEFT;
    const plotH = H - MARGIN_BOTTOM - MARGIN_TOP;

    // Dynamically fit 10 seconds (100 tenths) into the available plot width
    this.pixelsPerTenth = plotW / (X_MAX_TIME / 0.1);

    this.drawHighlight(plotW, plotH);
    this.drawGrid(plotW, plotH);
    this.drawYAxis(plotH);
    this.drawXAxis(plotW, plotH);
    this.drawSpline(plotW, plotH);
    this.drawControlPoints(plotW, plotH);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildSplineFromData(wd: WaveData): SplineEvaluator {
    const active = wd.activePoints();
    if (active.length === 0) return { evaluate: () => 0 };

    // Always anchor at t=0 with y=0 (wave starts at rest)
    const knots: Knot[] = [{ x: 0, y: 0 }];
    for (const p of active) {
      if (p.index > 0) knots.push({ x: p.index * 0.1, y: p.y });
    }
    // Anchor one slot past the last active point to bring curve back to zero
    const lastIndex = active[active.length - 1].index;
    knots.push({ x: (lastIndex + 1) * 0.1, y: 0 });

    return buildSpline(knots);
  }

  private syncCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width  = Math.round(rect.width)  || 800;
    this.canvas.height = Math.round(rect.height) || 360;
  }

  // Convert time (seconds) → canvas X pixel
  private timeToX(t: number): number {
    return MARGIN_LEFT + (t - this.startTime) / 0.1 * this.pixelsPerTenth;
  }

  // Convert canvas X pixel → time (seconds)
  private xToTime(x: number): number {
    return this.startTime + (x - MARGIN_LEFT) / this.pixelsPerTenth * 0.1;
  }

  // Convert PWM Y value (0–256) → canvas Y pixel (top=256, bottom=0)
  private yToCanvas(y: number, plotH: number): number {
    return MARGIN_TOP + plotH * (1 - y / Y_MAX);
  }

  // Convert canvas Y pixel → PWM Y value
  private canvasToY(cy: number, plotH: number): number {
    return Y_MAX * (1 - (cy - MARGIN_TOP) / plotH);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private drawHighlight(plotW: number, plotH: number): void {
    if (this.highlightStart < 0 || this.highlightStop < 0) return;

    const { ctx } = this;
    const x1 = Math.max(MARGIN_LEFT, Math.round(this.timeToX(this.highlightStart)));
    const x2 = Math.min(MARGIN_LEFT + plotW, Math.round(this.timeToX(this.highlightStop)));
    if (x2 <= x1) return;

    ctx.fillStyle = 'rgba(180, 220, 255, 0.35)';
    ctx.fillRect(x1, MARGIN_TOP, x2 - x1, plotH);
  }

  private drawGrid(plotW: number, plotH: number): void {
    const { ctx } = this;
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth   = 1;

    // Horizontal lines every 16 PWM units (0, 16, 32, … 256)
    for (let yVal = 0; yVal <= 256; yVal += 16) {
      const cy = Math.round(this.yToCanvas(yVal, plotH)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_LEFT, cy);
      ctx.lineTo(MARGIN_LEFT + plotW, cy);
      ctx.stroke();
    }

    // Vertical dashed lines every 0.1 s
    const tenthsVisible = Math.ceil(plotW / this.pixelsPerTenth) + 1;
    const startTenth    = Math.floor(this.startTime / 0.1);

    ctx.setLineDash([3, 3]);
    for (let i = startTenth; i <= startTenth + tenthsVisible; i++) {
      const t  = i * 0.1;
      const cx = Math.round(this.timeToX(t)) + 0.5;
      if (cx < MARGIN_LEFT || cx > MARGIN_LEFT + plotW) continue;
      ctx.beginPath();
      ctx.moveTo(cx, MARGIN_TOP);
      ctx.lineTo(cx, MARGIN_TOP + plotH);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawYAxis(plotH: number): void {
    const { ctx } = this;
    ctx.fillStyle   = '#333333';
    ctx.font        = '11px system-ui, sans-serif';
    ctx.textAlign   = 'right';
    ctx.textBaseline = 'middle';

    // Label at every 32 units: 0, 32, 64, 96, 128, 160, 192, 224, 256
    for (let yVal = 0; yVal <= 256; yVal += 32) {
      const cy = this.yToCanvas(yVal, plotH);
      ctx.fillText(String(yVal), MARGIN_LEFT - 4, cy);
    }
  }

  private drawXAxis(plotW: number, plotH: number): void {
    const { ctx } = this;
    ctx.fillStyle    = '#333333';
    ctx.font         = '11px system-ui, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    // Determine label interval based on available space per label
    // We want at least ~40px between labels to keep them readable
    const labelInterval = this.pixelsPerTenth * 10 >= 40 ? 10 : 20; // every 1s or 2s (in tenths)

    const tenthsTotal = Math.round(X_MAX_TIME / 0.1); // 100

    for (let i = 0; i <= tenthsTotal; i++) {
      const t  = i * 0.1;
      const cx = Math.round(this.timeToX(t));
      if (cx < MARGIN_LEFT || cx > MARGIN_LEFT + plotW) continue;

      // Tick mark at every 1 second
      if (i % 10 === 0) {
        ctx.strokeStyle = '#333333';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(cx + 0.5, MARGIN_TOP + plotH);
        ctx.lineTo(cx + 0.5, MARGIN_TOP + plotH + 4);
        ctx.stroke();
      }

      // Label at chosen interval
      if (i % labelInterval === 0 && i > 0) {
        const label = (i * 0.1).toFixed(1);
        ctx.fillText(label, cx, MARGIN_TOP + plotH + 6);
      }
    }
  }

  private drawSpline(plotW: number, plotH: number): void {
    const { ctx, spline } = this;
    const active = this.waveData.activePoints();
    if (active.length < 2) return;

    ctx.strokeStyle = '#0000cc';
    ctx.lineWidth   = 2;
    ctx.beginPath();

    let started = false;
    for (let px = 0; px <= plotW; px++) {
      const cx = MARGIN_LEFT + px;
      const t  = this.xToTime(cx);
      if (t > X_MAX_TIME) break;
      const y  = spline.evaluate(t);
      const cy = this.yToCanvas(y, plotH);

      if (!started) {
        ctx.moveTo(cx, cy);
        started = true;
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();
  }

  private drawControlPoints(plotW: number, plotH: number): void {
    const { ctx } = this;
    const maxIndex = Math.min(this.waveData.length, Math.round(X_MAX_TIME / 0.1));

    for (let i = 0; i < maxIndex; i++) {
      const t  = i * 0.1;
      const cx = this.timeToX(t);
      if (cx < MARGIN_LEFT - CIRCLE_RADIUS || cx > MARGIN_LEFT + plotW + CIRCLE_RADIUS) continue;

      const y  = this.waveData.get(i);
      const cy = this.yToCanvas(y, plotH);

      ctx.beginPath();
      ctx.arc(cx, cy, CIRCLE_RADIUS, 0, Math.PI * 2);

      if (y > 0) {
        // Active point — solid yellow
        ctx.fillStyle   = '#ffff99';
        ctx.fill();
        ctx.strokeStyle = '#999900';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      } else {
        // Inactive point — subtle hollow circle
        ctx.fillStyle   = 'rgba(200, 200, 200, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
        ctx.lineWidth   = 1;
        ctx.stroke();
      }
    }
  }

  // ── Mouse events ───────────────────────────────────────────────────────────

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('mousedown',    this.onMouseDown.bind(this));
    c.addEventListener('mousemove',    this.onMouseMove.bind(this));
    c.addEventListener('mouseup',      this.onMouseUp.bind(this));
    c.addEventListener('mouseleave',   this.onMouseUp.bind(this));
    c.addEventListener('contextmenu',  (e) => e.preventDefault());
  }

  private hitTestCircle(mx: number, my: number): number {
    const plotH = this.canvas.height - MARGIN_BOTTOM - MARGIN_TOP;
    const maxIndex = Math.min(this.waveData.length, Math.round(X_MAX_TIME / 0.1));

    for (let i = 0; i < maxIndex; i++) {
      const cx = this.timeToX(i * 0.1);
      const y  = this.waveData.get(i);
      const cy = this.yToCanvas(y, plotH);
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy <= CIRCLE_RADIUS * CIRCLE_RADIUS * 2) {
        return i;
      }
    }
    return -1;
  }

  private onMouseDown(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    if (e.button === 0) {
      const idx = this.hitTestCircle(mx, my);
      if (idx >= 0) {
        this.dragging  = true;
        this.dragIndex = idx;
        e.preventDefault();
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const my   = e.clientY - rect.top;

    if (this.dragging && this.dragIndex >= 0) {
      const plotH = this.canvas.height - MARGIN_BOTTOM - MARGIN_TOP;
      const yVal  = this.canvasToY(my, plotH);
      const clamped = Math.max(1, Math.min(Y_DATA_MAX, Math.round(yVal)));
      this.waveData.set(this.dragIndex, clamped);
      this.spline = this.buildSplineFromData(this.waveData);
      this.redraw();
    }
  }

  private onMouseUp(_e: MouseEvent): void {
    const wasDragging = this.dragging;
    this.dragging  = false;
    this.dragIndex = -1;
    if (wasDragging && this.onChangeCallback) {
      this.onChangeCallback();
    }
  }
}
