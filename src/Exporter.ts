// src/Exporter.ts — wave.template substitution → wave.h download

import { WaveSegment } from './Compiler';

// ---------------------------------------------------------------------------
// Default template (content of input/wave.template)
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATE = `#ifndef WAVE_H
#define WAVE_H

#include <inttypes.h>
#include <avr/pgmspace.h>

#define WAVE_COUNT  %0:d

/*
 * Wave descriptor stored in PROGMEM.
 * Read as three consecutive uint16_t words by update_fireflies()
 * using pgm_read_word_inc: wave_ptr first, then wave_end, then energy.
 */
typedef struct {
    const uint8_t *wave_ptr;
    const uint8_t *wave_end;
    uint16_t        energy;
} wave_data_t;

const uint8_t wave[%1:d] PROGMEM = {%2:s
};

const wave_data_t wave_data[%3:d] PROGMEM = {%4:s
};

#endif`;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format sample bytes: 16 per line, 0xNN uppercase hex, tab-indented.
 * Each complete line ends with a trailing comma; the last partial line does not.
 * Returns a string that starts with \n (so it slots into {%2:s\n}).
 */
export function formatSamples(samples: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < samples.length; i += 16) {
    const chunk = Array.from(samples.slice(i, i + 16));
    const hex = chunk.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0'));
    const isLast = i + 16 >= samples.length;
    lines.push('\t' + hex.join(',') + (isLast ? '' : ','));
  }
  return '\n' + lines.join('\n');
}

/**
 * Format wave_data entries: one per line, tab-indented.
 * Index fields right-aligned in 4-char width; energy right-aligned in 4-char width.
 * Returns a string that starts with \n.
 */
export function formatSegments(segments: WaveSegment[]): string {
  const lines = segments.map(s => {
    const start  = String(s.startIdx).padStart(4);
    const stop   = String(s.stopIdx).padStart(4);
    const energy = String(s.energy).padStart(4);
    return `\t{&wave[${start}], &wave[${stop}], ${energy}},`;
  });
  return '\n' + lines.join('\n');
}

// ---------------------------------------------------------------------------
// Template substitution
// ---------------------------------------------------------------------------

export function applyTemplate(
  template: string,
  waveCount: number,
  sampleCount: number,
  samples: Uint8Array,
  segments: WaveSegment[]
): string {
  return template
    .replace('%0:d', String(waveCount))
    .replace('%1:d', String(sampleCount))
    .replace('%2:s', formatSamples(samples))
    .replace('%3:d', String(waveCount))
    .replace('%4:s', formatSegments(segments));
}

// ---------------------------------------------------------------------------
// Browser download helper
// ---------------------------------------------------------------------------

export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
