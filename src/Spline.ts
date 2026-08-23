// src/Spline.ts — cubic spline interpolation matching original Delphi WaveEditor
//
// Control points are treated as uniformly spaced (h = 1 between each CP).
// The output evaluates at t = j/SPLINE_FACTOR for j = 1 .. SPLINE_FACTOR,
// skipping t = 0 (the CP values themselves).  For the last interval j goes
// 1 .. SPLINE_FACTOR - 1 only (endpoint excluded), so total output length is
// (N - 1) * SPLINE_FACTOR - 1.
//
// Natural cubic spline (second derivatives = 0 at both endpoints).
// Output values are clamped to [0, MAX_OUTPUT_VALUE].

export const SPLINE_FACTOR = 12;
export const MAX_OUTPUT_VALUE = 250;

export interface SplineEvaluator {
  evaluate(x: number): number;
}

/**
 * Interpolate an array of control-point Y values into a full waveform.
 *
 * @param controlPoints  Y values at evenly spaced positions (may include zeros).
 * @param splineFactor   Sub-steps per interval (default: SPLINE_FACTOR = 12).
 * @returns              Interpolated integer samples, length = (N-1)*factor - 1.
 */
export function cubicSplineInterpolate(controlPoints: number[], splineFactor: number = SPLINE_FACTOR): number[] {
  const n = controlPoints.length;
  if (n === 0) return [];
  if (n === 1) return [Math.min(MAX_OUTPUT_VALUE, controlPoints[0])];

  if (n === 2) {
    const y0 = controlPoints[0];
    const y1 = controlPoints[1];
    const result: number[] = [];
    for (let j = 1; j < splineFactor; j++) {
      const t = j / splineFactor;
      result.push(Math.min(MAX_OUTPUT_VALUE, Math.max(0, Math.round(y0 + (y1 - y0) * t))));
    }
    return result;
  }

  // Solve for natural cubic spline second derivatives (moments).
  // Uniform spacing h = 1: tridiagonal system [1, 4, 1] * m = 6*Δ²y.
  const y = controlPoints.map(v => Number(v));
  const m = new Array<number>(n).fill(0);

  {
    const d = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i++) {
      d[i] = 6 * (y[i + 1] - 2 * y[i] + y[i - 1]);
    }

    const cp = new Array<number>(n).fill(0);
    const dp = new Array<number>(n).fill(0);
    cp[1] = 1 / 4;
    dp[1] = d[1] / 4;
    for (let i = 2; i < n - 1; i++) {
      const denom = 4 - cp[i - 1];
      cp[i] = 1 / denom;
      dp[i] = (d[i] - dp[i - 1]) / denom;
    }

    m[n - 2] = dp[n - 2];
    for (let i = n - 3; i >= 1; i--) {
      m[i] = dp[i] - cp[i] * m[i + 1];
    }
    // m[0] = m[n-1] = 0  (natural boundary, already initialised)
  }

  // Generate output samples.
  const result: number[] = [];
  const nIntervals = n - 1;

  for (let i = 0; i < nIntervals; i++) {
    const mi  = m[i];
    const mi1 = m[i + 1];
    const yi  = y[i];
    const yi1 = y[i + 1];
    const a = yi  - mi  / 6;
    const b = yi1 - mi1 / 6;

    // For every interval except the last: j = 1 .. splineFactor (inclusive).
    // For the last interval:              j = 1 .. splineFactor - 1 (endpoint excluded).
    const endJ = i < nIntervals - 1 ? splineFactor + 1 : splineFactor;

    for (let j = 1; j < endJ; j++) {
      const t  = j / splineFactor;
      const t1 = 1 - t;
      const val =
        mi  * (t1 * t1 * t1) / 6 +
        mi1 * (t  * t  * t)  / 6 +
        a * t1 +
        b * t;
      result.push(Math.round(Math.max(0, Math.min(MAX_OUTPUT_VALUE, val))));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Legacy buildSpline() kept for CanvasEditor (canvas rendering still uses it)
// ---------------------------------------------------------------------------

export interface Knot { x: number; y: number }

/**
 * Build a Catmull-Rom spline evaluator for arbitrary (non-uniform) knots.
 * Used by CanvasEditor for smooth curve rendering.
 *
 * Catmull-Rom is a LOCAL interpolation scheme: each segment only depends on
 * its two endpoints and their immediate neighbors. Moving point C only affects
 * segments B→C and C→D, never A→B or D→E.
 *
 * Returns an evaluator clamped to [0, 250].
 */
export function buildSpline(knots: Knot[]): SplineEvaluator {
  if (knots.length < 2) {
    return { evaluate: () => 0 };
  }

  const n = knots.length;
  const xs = knots.map(k => k.x);
  const ys = knots.map(k => k.y);

  // Compute tangents at each knot using Catmull-Rom formula
  // (adapted for non-uniform spacing)
  const tangents = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      // Forward difference at start
      tangents[i] = (ys[1] - ys[0]) / (xs[1] - xs[0]);
    } else if (i === n - 1) {
      // Backward difference at end
      tangents[i] = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
    } else {
      // Catmull-Rom: average of left and right slopes
      const dLeft  = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
      const dRight = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
      tangents[i] = (dLeft + dRight) / 2;
    }
  }

  return {
    evaluate(t: number): number {
      if (t <= xs[0])     return clamp(ys[0]);
      if (t >= xs[n - 1]) return clamp(ys[n - 1]);

      // Binary search for the segment
      let lo = 0, hi = n - 2;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (xs[mid] <= t) lo = mid; else hi = mid - 1;
      }
      const i = lo;
      const h = xs[i + 1] - xs[i];
      const s = (t - xs[i]) / h;  // normalized parameter [0, 1]

      // Hermite basis functions
      const s2 = s * s;
      const s3 = s2 * s;
      const h00 =  2 * s3 - 3 * s2 + 1;
      const h10 =      s3 - 2 * s2 + s;
      const h01 = -2 * s3 + 3 * s2;
      const h11 =      s3 -     s2;

      const val = h00 * ys[i] + h10 * h * tangents[i]
                + h01 * ys[i + 1] + h11 * h * tangents[i + 1];
      return clamp(val);
    },
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(MAX_OUTPUT_VALUE, v));
}

export function validateSpline(): void {
  const knots: Knot[] = [
    { x: 0.0, y:   0 },
    { x: 0.1, y: 250 },
    { x: 0.2, y:  28 },
    { x: 0.3, y:  31 },
    { x: 3.0, y: 250 },
    { x: 3.1, y:  28 },
  ];
  const spline = buildSpline(knots);
  console.log('[validateSpline] evaluate(0.0):', spline.evaluate(0.0), ' — expect ≈ 0');
  console.log('[validateSpline] evaluate(0.1):', spline.evaluate(0.1), ' — expect ≈ 250');
  console.log('[validateSpline] evaluate(3.0):', spline.evaluate(3.0), ' — expect ≈ 250');
}
