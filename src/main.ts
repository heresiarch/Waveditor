// src/main.ts — entry point
// Button handler stubs; logic implemented in subsequent sub-tasks.

import { WaveData, validateWaveData } from './WaveData';
import { CanvasEditor } from './CanvasEditor';
import { compile, CompileResult } from './Compiler';
import { applyTemplate, DEFAULT_TEMPLATE, downloadFile } from './Exporter';

const btnLoad         = document.getElementById('btnLoad')         as HTMLButtonElement;
const btnSave         = document.getElementById('btnSave')         as HTMLButtonElement;
const btnCompile      = document.getElementById('btnCompile')      as HTMLButtonElement;
const btnExport       = document.getElementById('btnExport')       as HTMLButtonElement;
const btnLoadTemplate = document.getElementById('btnLoadTemplate') as HTMLButtonElement;
const infoLabel       = document.getElementById('infoLabel')       as HTMLSpanElement;
const waveCanvas      = document.getElementById('waveCanvas')      as HTMLCanvasElement;
const waveList        = document.getElementById('waveList')        as HTMLDivElement;

let compileResult: CompileResult | null = null;
let templateText: string = DEFAULT_TEMPLATE;

let waveData: WaveData = WaveData.empty();
const editor = new CanvasEditor(waveCanvas, waveData);

btnLoad.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dat';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    waveData = WaveData.fromArrayBuffer(buf);
    validateWaveData(buf);
    console.log(`Loaded ${waveData.length} slots, ${waveData.activePoints().length} active points`);
    editor.setWaveData(waveData);
    editor.redraw();
  };
  input.click();
});

btnSave.addEventListener('click', () => {
  const buf = waveData.toArrayBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wave.dat';
  a.click();
  URL.revokeObjectURL(url);
});

btnCompile.addEventListener('click', () => {
  compileResult = compile(waveData);
  const { samples, segments } = compileResult;

  // Update info label
  infoLabel.textContent = `${segments.length} waves, ${samples.length} samples`;

  // Populate wave list table
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
    <thead><tr><th>Nr.</th><th>Start</th><th>Stop</th><th>Time</th><th>Energy</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  // Row click to highlight
  waveList.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      waveList.querySelectorAll('tbody tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
    });
  });

  console.log(`[Compile] ${segments.length} segments, ${samples.length} samples`);
  console.log('[Compile] first 5 segments:', segments.slice(0, 5));
});

/** Format seconds as '0,00s' (comma decimal separator, 2 decimal places) */
function fmt(seconds: number): string {
  return seconds.toFixed(2).replace('.', ',') + 's';
}

// expose for Sub-Task 6
export { compileResult };

btnExport.addEventListener('click', () => {
  if (!compileResult) {
    alert('Please compile first before exporting.');
    return;
  }
  const { samples, segments } = compileResult;
  const output = applyTemplate(templateText, segments.length, samples.length, samples, segments);
  downloadFile(output, 'wave.h');
});

btnLoadTemplate.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.template';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    templateText = await file.text();
  };
  input.click();
});

window.addEventListener('resize', () => editor.redraw());
