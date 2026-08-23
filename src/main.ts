// src/main.ts — entry point

import { WaveData } from './WaveData';
import { CanvasEditor } from './CanvasEditor';
import { compile, CompileResult } from './Compiler';
import { applyTemplate, DEFAULT_TEMPLATE } from './Exporter';
import { WavePlayer } from './WavePlayer';

const btnLoad         = document.getElementById('btnLoad')         as HTMLButtonElement;
const btnSave         = document.getElementById('btnSave')         as HTMLButtonElement;
const btnImport       = document.getElementById('btnImport')       as HTMLButtonElement;
const btnExport       = document.getElementById('btnExport')       as HTMLButtonElement;
const btnExportH      = document.getElementById('btnExportH')      as HTMLButtonElement;
const chkLongWave     = document.getElementById('chkLongWave')     as HTMLInputElement;
const infoLabel       = document.getElementById('infoLabel')       as HTMLSpanElement;
const waveCanvas      = document.getElementById('waveCanvas')      as HTMLCanvasElement;
const waveList        = document.getElementById('waveList')        as HTMLDivElement;

let compileResult: CompileResult | null = null;

let waveData: WaveData = WaveData.empty();
const editor = new CanvasEditor(waveCanvas, waveData);

const detailCanvas = document.getElementById('detailCanvas') as HTMLCanvasElement;
const player = new WavePlayer(detailCanvas);

const templateEditor = document.getElementById('templateEditor') as HTMLTextAreaElement;
templateEditor.value = DEFAULT_TEMPLATE;

// Auto-compile when a control point is changed
editor.onChange(() => doCompile());

// Re-compile when long-wave checkbox changes
chkLongWave.addEventListener('change', () => doCompile());

function getSplineFactor(): number {
  return chkLongWave.checked ? 24 : 12;
}

// ── Load (JSON project) ──────────────────────────────────────────────────────

btnLoad.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const project = JSON.parse(text);
    waveData = WaveData.empty();
    if (Array.isArray(project.points)) {
      for (const p of project.points) {
        waveData.set(p.index, p.value);
      }
    }
    editor.setWaveData(waveData);
    editor.redraw();
    doCompile();
  };
  input.click();
});

// ── Save (JSON project) ──────────────────────────────────────────────────────

btnSave.addEventListener('click', () => {
  const points: Array<{ index: number; value: number }> = [];
  for (let i = 0; i < waveData.length; i++) {
    const v = waveData.get(i);
    if (v > 0) points.push({ index: i, value: v });
  }
  const project = { version: 1, points };
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  saveFile(blob, 'wave.json');
});

// ── Import (.dat firmware format) ────────────────────────────────────────────

btnImport.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dat';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    waveData = WaveData.fromArrayBuffer(buf);
    console.log(`Imported ${waveData.length} slots, ${waveData.activePoints().length} active points`);
    editor.setWaveData(waveData);
    editor.redraw();
    doCompile();
  };
  input.click();
});

// ── Export (.dat firmware format) ────────────────────────────────────────────

btnExport.addEventListener('click', () => {
  const buf = waveData.toArrayBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  saveFile(blob, 'wave.dat');
});

// ── Create Wave C Header (.h) ────────────────────────────────────────────────

btnExportH.addEventListener('click', () => {
  if (!compileResult) {
    alert('No compiled data available. Please edit some wave points first.');
    return;
  }

  const template = templateEditor.value;
  const { samples, segments } = compileResult;
  const output = applyTemplate(template, segments.length, samples.length, samples, segments);
  const blob = new Blob([output], { type: 'text/plain' });
  saveFile(blob, 'wave.h');
});

// ── Compile ──────────────────────────────────────────────────────────────────

function doCompile(): void {
  compileResult = compile(waveData, getSplineFactor());
  const { samples, segments } = compileResult;

  infoLabel.textContent = `${segments.length} waves, ${samples.length} samples`;

  const rows = segments.map((s, idx) => {
    const cls = idx === 0 ? ' class="selected"' : '';
    return `<tr${cls}>
      <td>${s.nr}</td>
      <td>${fmt(s.startTime)}</td>
      <td>${fmt(s.stopTime)}</td>
      <td>${fmt(s.time)}</td>
      <td>${s.energy}</td>
    </tr>`;
  }).join('');

  waveList.innerHTML = `<table>
    <colgroup>
      <col style="width: 15%">
      <col style="width: 20%">
      <col style="width: 20%">
      <col style="width: 20%">
      <col style="width: 25%">
    </colgroup>
    <thead><tr><th>Nr.</th><th>Start</th><th>Stop</th><th>Time</th><th>Energy</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  waveList.querySelectorAll('tbody tr').forEach((tr, idx) => {
    tr.addEventListener('click', () => {
      waveList.querySelectorAll('tbody tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');

      const seg = segments[idx];
      editor.setHighlight(seg.startTime, seg.stopTime);

      const segSamples = samples.slice(seg.startIdx, seg.stopIdx);
      player.play(segSamples);
    });
  });
}

/** Format seconds as '0,00s' (comma decimal separator, 2 decimal places) */
function fmt(seconds: number): string {
  return seconds.toFixed(2).replace('.', ',') + 's';
}

/** Trigger a file download (Firefox shows save dialog if configured to "always ask"). */
function saveFile(blob: Blob, defaultName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// expose for potential external use
export { compileResult };

window.addEventListener('resize', () => editor.redraw());
