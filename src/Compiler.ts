// src/Compiler.ts — compile WaveData into sample array and wave segment table
//
// Algorithm matches the original Delphi WaveEditor:
//   1. Extract active control-point slice (trim trailing zero padding, keep 1 trailing zero).
//   2. Interpolate at 12 sub-steps per CP interval via natural cubic spline.
//   3. Detect segment boundaries from low-value runs (≤ 2) and relative valleys.
//   4. Generate all (start, stop) pairs ≤ 3 s with RMS energy.

import { WaveData } from './WaveData';
import { cubicSplineInterpolate } from './Spline';

export interface WaveSegment {
  nr: number;
  startIdx: number;   // sample index (inclusive start)
  stopIdx: number;    // sample index (exclusive end)
  startTime: number;  // seconds
  stopTime: number;   // seconds
  time: number;       // duration seconds
  energy: number;     // round(sqrt(sum(x²))) for samples[startIdx..stopIdx)
}

export interface CompileResult {
  samples: Uint8Array;
  segments: WaveSegment[];
}

const MAX_SECONDS    = 3.0;   // maximum wave segment duration

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compile(waveData: WaveData, splineFactor: number = 12): CompileResult {
  const controlPoints = activeControlPoints(waveData);

  // Always detect boundaries at the base resolution (factor 12) for consistency,
  // then scale indices to the actual resolution.
  const baseSamples   = cubicSplineInterpolate(controlPoints, 12);
  const baseBounds    = detectBoundaries(Uint8Array.from(baseSamples), 12);
  const scaleFactor   = splineFactor / 12;

  const interpolated  = splineFactor === 12
    ? baseSamples
    : cubicSplineInterpolate(controlPoints, splineFactor);
  const samples       = Uint8Array.from(interpolated);
  const sampleRate    = splineFactor * 10;

  // Scale boundary indices to actual resolution
  const boundaries = baseBounds.map(b => Math.round(b * scaleFactor));
  // Clamp last boundary to actual sample length
  if (boundaries.length > 0 && boundaries[boundaries.length - 1] > samples.length) {
    boundaries[boundaries.length - 1] = samples.length;
  }

  // Energy is always computed from base-resolution samples (resolution-independent)
  const segments = generateSegments(samples, boundaries, sampleRate, Uint8Array.from(baseSamples), baseBounds);
  return { samples, segments };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the active control-point slice from WaveData.
 *
 * Trims trailing zero padding but keeps one trailing zero so the spline
 * interpolates smoothly down to zero at the end of the waveform.
 */
function activeControlPoints(waveData: WaveData): number[] {
  const len = waveData.length;

  // Walk backward to find last non-zero slot.
  let lastNonzero = len - 1;
  while (lastNonzero > 0 && waveData.get(lastNonzero) === 0) lastNonzero--;

  // Include the last non-zero value plus one trailing zero so the spline
  // interpolates smoothly down to zero at the end of the waveform.
  // This matches the Python reference: active_end = lastNonzero + 1,
  // then +1 more if that slot is zero.
  let activeEnd = lastNonzero + 1;
  if (activeEnd < len && waveData.get(activeEnd) === 0) activeEnd += 1;

  const result: number[] = [];
  for (let i = 0; i < activeEnd; i++) result.push(waveData.get(i));
  return result;
}

/**
 * Detect segment boundaries from the interpolated sample array.
 *
 * Two mechanisms (matching original Delphi WaveEditor behaviour):
 *
 *  1. Low-value runs (value ≤ 2): boundary = last index of each run,
 *     provided the run does not extend to end-of-data.
 *
 *  2. Relative valley: a local minimum above the low threshold whose value
 *     is < 5 % of the smaller surrounding peak (within 200 samples),
 *     when that peak is ≥ 50.  Handles boundaries like wave.h index 461
 *     where the dip value is 7 between large peaks.
 *
 * Always includes index 0 and end-of-data as boundaries.
 * Trailing zero padding (> 50 samples beyond last significant content) is
 * excluded from detection.
 */
function detectBoundaries(samples: Uint8Array, splineFactor: number = 12): number[] {
  const BOUNDARY_THRESHOLD  = 2;
  const RELATIVE_THRESHOLD  = 0.05;
  const MIN_PEAK_HEIGHT     = 50;
  // Scale scan windows proportionally to the spline factor
  const PEAK_WINDOW         = Math.round(200 * splineFactor / 12);
  const TRAILING_THRESHOLD  = Math.round(50 * splineFactor / 12);

  const n = samples.length;
  if (n === 0) return [];

  // Determine end of meaningful data (skip long trailing silence).
  let endOfData = n;
  {
    let i = n - 1;
    while (i > 0 && samples[i] <= 1) i--;
    const lastNonzero   = i;
    const trailingZeros = n - 1 - lastNonzero;
    if (trailingZeros > TRAILING_THRESHOLD) endOfData = lastNonzero + 1;
  }

  const bounds = new Set<number>();
  bounds.add(0);

  // --- Pass 1: low-value runs ---
  let i = 1;
  while (i < endOfData) {
    if (samples[i] <= BOUNDARY_THRESHOLD) {
      while (i < endOfData && samples[i] <= BOUNDARY_THRESHOLD) i++;
      const runEnd = i; // exclusive
      // Skip if this run merges into end-of-data (natural descend to zero).
      if (runEnd >= endOfData) break;
      const boundaryIdx = runEnd - 1; // last index of the low run
      if (boundaryIdx > 0) bounds.add(boundaryIdx);
    } else {
      i++;
    }
  }

  // --- Pass 2: relative valley detection ---
  for (let i = 1; i < endOfData - 1; i++) {
    const vi = samples[i];
    if (vi <= BOUNDARY_THRESHOLD) continue;          // handled in pass 1
    if (vi > samples[i - 1] || vi > samples[i + 1]) continue; // not a local min

    // Find left and right peak within scaled window.
    let leftPeak = vi;
    for (let k = i - 1; k >= Math.max(0, i - PEAK_WINDOW); k--) {
      if (samples[k] > leftPeak) leftPeak = samples[k];
      if (samples[k] <= BOUNDARY_THRESHOLD) break;
    }
    let rightPeak = vi;
    for (let k = i + 1; k < Math.min(endOfData, i + PEAK_WINDOW); k++) {
      if (samples[k] > rightPeak) rightPeak = samples[k];
      if (samples[k] <= BOUNDARY_THRESHOLD) break;
    }

    const minPeak = Math.min(leftPeak, rightPeak);
    if (minPeak >= MIN_PEAK_HEIGHT && vi / minPeak <= RELATIVE_THRESHOLD) {
      // Extend to end of plateau.
      let plateauEnd = i;
      while (plateauEnd + 1 < endOfData && samples[plateauEnd + 1] === vi) plateauEnd++;
      bounds.add(plateauEnd);
    }
  }

  // Final boundary.
  bounds.add(endOfData);

  return Array.from(bounds).sort((a, b) => a - b);
}

/**
 * Generate all (start, stop) wave segment pairs with duration ≤ 3.0 s.
 * Energy = round(sqrt(sum(x²))) for samples[startIdx..stopIdx).
 */
function generateSegments(
  _samples: Uint8Array,
  boundaries: number[],
  sampleRate: number,
  baseSamples: Uint8Array,
  baseBoundaries: number[],
): WaveSegment[] {
  const maxDuration = Math.round(MAX_SECONDS * sampleRate);
  const segments: WaveSegment[] = [];
  let nr = 1;

  for (let i = 0; i < boundaries.length - 1; i++) {
    for (let j = i + 1; j < boundaries.length; j++) {
      const startIdx = boundaries[i];
      const stopIdx  = boundaries[j];
      if (stopIdx - startIdx > maxDuration) break;

      // Energy computed from base-resolution samples for consistency
      const energy = computeEnergy(baseSamples, baseBoundaries[i], baseBoundaries[j]);
      const startTime = startIdx / sampleRate;
      const stopTime  = stopIdx  / sampleRate;

      segments.push({
        nr: nr++,
        startIdx,
        stopIdx,
        startTime,
        stopTime,
        time: stopTime - startTime,
        energy,
      });
    }
  }

  segments.sort((a, b) => a.startIdx - b.startIdx || a.stopIdx - b.stopIdx);
  segments.forEach((s, idx) => { s.nr = idx + 1; });
  return segments;
}

/** Energy = round(sqrt(sum(x²))) over [start, stop). */
function computeEnergy(samples: Uint8Array, start: number, stop: number): number {
  let sumSq = 0;
  for (let k = start; k < stop; k++) sumSq += samples[k] * samples[k];
  return Math.round(Math.sqrt(sumSq));
}
