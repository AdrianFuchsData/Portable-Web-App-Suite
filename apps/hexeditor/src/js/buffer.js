/*
 * Byte buffer of the hex editor with undo/redo.
 *
 *   const buf = new HE.ByteBuffer(bytes);
 *   buf.replace(offset, data); buf.insert(offset, data); buf.remove(offset, count);
 *   buf.undo(); buf.redo(); buf.dirty; buf.markSaved(); buf.slice(from, to); buf.find(pattern, from, backwards)
 */
(function (HE) {
  'use strict';

  class ByteBuffer {
    constructor(bytes = new Uint8Array(0)) {
      this.data = new Uint8Array(Math.max(16, bytes.length + 1024));
      this.data.set(bytes);
      this.length = bytes.length;
      this.undoStack = [];
      this.redoStack = [];
      this.version = 0;
      this.savedVersion = 0;
      this.nextVersion = 1;
    }

    get dirty() { return this.version !== this.savedVersion; }

    markSaved() { this.savedVersion = this.version; }

    byte(i) { return this.data[i]; }

    slice(from, to) { return this.data.slice(Math.max(0, from), Math.min(this.length, to)); }

    bytes() { return this.data.slice(0, this.length); }

    ensure(size) {
      if (size <= this.data.length) return;
      const bigger = new Uint8Array(Math.max(size, this.data.length * 2));
      bigger.set(this.data.subarray(0, this.length));
      this.data = bigger;
    }

    // low-level operations; each returns its inverse
    apply(op) {
      if (op.type === 'replace') {
        const end = op.offset + op.data.length;
        const appended = Math.max(0, end - this.length);
        const old = this.data.slice(op.offset, Math.min(end, this.length));
        this.ensure(end);
        this.data.set(op.data, op.offset);
        this.length = Math.max(this.length, end);
        // bytes written beyond the end are an insertion: undo removes them again
        return appended ? { type: 'restore', offset: op.offset, data: old, length: this.length - appended } : { type: 'replace', offset: op.offset, data: old };
      }
      if (op.type === 'restore') {
        const inverse = { type: 'replace', offset: op.offset, data: this.data.slice(op.offset, this.length) };
        this.data.set(op.data, op.offset);
        this.length = op.length;
        return inverse;
      }
      if (op.type === 'insert') {
        this.ensure(this.length + op.data.length);
        this.data.copyWithin(op.offset + op.data.length, op.offset, this.length);
        this.data.set(op.data, op.offset);
        this.length += op.data.length;
        return { type: 'remove', offset: op.offset, count: op.data.length };
      }
      if (op.type === 'remove') {
        const removed = this.data.slice(op.offset, op.offset + op.count);
        this.data.copyWithin(op.offset, op.offset + op.count, this.length);
        this.length -= op.count;
        return { type: 'insert', offset: op.offset, data: removed };
      }
      throw new Error(`unknown operation ${op.type}`);
    }

    run(op, merge = false) {
      const inverse = this.apply(op);
      const last = this.undoStack[this.undoStack.length - 1];
      // typing the second nibble of a byte belongs to the same undo step
      if (merge && last) last.inverse.unshift(inverse);
      else this.undoStack.push({ inverse: [inverse], version: this.version });
      this.redoStack = [];
      this.version = this.nextVersion++;
    }

    replace(offset, data, merge = false) { this.run({ type: 'replace', offset, data: new Uint8Array(data) }, merge); }

    insert(offset, data, merge = false) { this.run({ type: 'insert', offset, data: new Uint8Array(data) }, merge); }

    remove(offset, count) { if (count > 0) this.run({ type: 'remove', offset, count: Math.min(count, this.length - offset) }); }

    undo() {
      const step = this.undoStack.pop();
      if (!step) return null;
      const redo = step.inverse.map((op) => this.apply(op)).reverse();
      this.redoStack.push({ inverse: redo, version: this.version });
      this.version = step.version;
      return step.inverse[step.inverse.length - 1];
    }

    redo() {
      const step = this.redoStack.pop();
      if (!step) return null;
      const undo = step.inverse.map((op) => this.apply(op)).reverse();
      this.undoStack.push({ inverse: undo, version: this.version });
      this.version = step.version;
      return step.inverse[step.inverse.length - 1];
    }

    /** Offset of the next (or previous) occurrence of pattern, or -1. */
    find(pattern, from, backwards = false) {
      const n = pattern.length;
      if (!n || n > this.length) return -1;
      const d = this.data;
      const matches = (i) => { for (let j = 0; j < n; j++) if (d[i + j] !== pattern[j]) return false; return true; };
      if (backwards) {
        for (let i = Math.min(from, this.length - n); i >= 0; i--) if (matches(i)) return i;
      } else {
        for (let i = Math.max(0, from); i <= this.length - n; i++) if (d[i] === pattern[0] && matches(i)) return i;
      }
      return -1;
    }
  }

  /** "41 42 0a" or "41420A" -> Uint8Array; null if invalid. */
  function parseHex(text) {
    const clean = text.replace(/0x/gi, '').replace(/[\s,]/g, '');
    if (!clean || clean.length % 2 || /[^0-9a-f]/i.test(clean)) return null;
    return Uint8Array.from(clean.match(/../g), (h) => parseInt(h, 16));
  }

  /** Values of the bytes at an offset for the data inspector. */
  function inspect(bytes, littleEndian) {
    const buf = new Uint8Array(8);
    buf.set(bytes.subarray(0, 8));
    const view = new DataView(buf.buffer);
    const have = bytes.length;
    const out = {};
    if (have >= 1) {
      out.binary = bytes[0].toString(2).padStart(8, '0');
      out.uint8 = view.getUint8(0);
      out.int8 = view.getInt8(0);
    }
    if (have >= 2) { out.uint16 = view.getUint16(0, littleEndian); out.int16 = view.getInt16(0, littleEndian); }
    if (have >= 4) {
      out.uint32 = view.getUint32(0, littleEndian);
      out.int32 = view.getInt32(0, littleEndian);
      out.float32 = view.getFloat32(0, littleEndian);
    }
    if (have >= 8) {
      out.uint64 = view.getBigUint64(0, littleEndian).toString();
      out.int64 = view.getBigInt64(0, littleEndian).toString();
      out.float64 = view.getFloat64(0, littleEndian);
    }
    if (have >= 1) {
      try {
        const len = bytes[0] < 0x80 ? 1 : bytes[0] >= 0xF0 ? 4 : bytes[0] >= 0xE0 ? 3 : 2;
        out.utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, len));
      } catch (e) { out.utf8 = null; }
    }
    return out;
  }

  HE.ByteBuffer = ByteBuffer;
  HE.parseHex = parseHex;
  HE.inspect = inspect;
})(window.HE = window.HE || {});
