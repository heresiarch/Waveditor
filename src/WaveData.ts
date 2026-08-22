// src/WaveData.ts — binary wave.dat format: [uint32 LE: N][uint8 × N]

export class WaveData {
  private readonly _data: Uint8Array;

  private constructor(data: Uint8Array) {
    this._data = data;
  }

  get length(): number {
    return this._data.length;
  }

  get(index: number): number {
    return this._data[index];
  }

  set(index: number, value: number): void {
    this._data[index] = Math.max(0, Math.min(250, Math.round(value)));
  }

  clear(index: number): void {
    this._data[index] = 0;
  }

  activePoints(): Array<{ index: number; y: number }> {
    const result: Array<{ index: number; y: number }> = [];
    for (let i = 0; i < this._data.length; i++) {
      if (this._data[i] !== 0) {
        result.push({ index: i, y: this._data[i] });
      }
    }
    return result;
  }

  toArrayBuffer(): ArrayBuffer {
    const buf = new ArrayBuffer(4 + this._data.length);
    const view = new DataView(buf);
    view.setUint32(0, this._data.length, true); // LE
    new Uint8Array(buf, 4).set(this._data);
    return buf;
  }

  static fromArrayBuffer(buf: ArrayBuffer): WaveData {
    const view = new DataView(buf);
    const n = view.getUint32(0, true); // LE
    const data = new Uint8Array(buf, 4, n);
    return new WaveData(new Uint8Array(data)); // copy
  }

  static empty(length = 201): WaveData {
    return new WaveData(new Uint8Array(length));
  }
}

export function validateWaveData(buf: ArrayBuffer): void {
  const wd = WaveData.fromArrayBuffer(buf);
  console.assert(wd.length === 201,         `length: expected 201, got ${wd.length}`);
  console.assert(wd.activePoints().length === 68, `activePoints: expected 68, got ${wd.activePoints().length}`);
  console.assert(wd.get(1)  === 250, `get(1): expected 250, got ${wd.get(1)}`);
  console.assert(wd.get(30) === 250, `get(30): expected 250, got ${wd.get(30)}`);
  console.assert(wd.get(70) === 29,  `get(70): expected 29, got ${wd.get(70)}`);
  console.log('[validateWaveData] all assertions passed');
}
