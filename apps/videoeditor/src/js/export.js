/*
 * Export of the timeline with WebCodecs through Mediabunny: every frame is composed on a canvas from the decoded source
 * frames (CanvasSink, one sequential iterator per clip), images and titles; the audio of all audible clips is mixed in an
 * OfflineAudioContext (volume, fades, speed, reverse) and encoded as one track.
 */
import * as mb from 'mediabunny';
import * as tl from 'app/timeline';

export const FORMATS = {
  'webm-vp9': { label: 'WebM (VP9, Opus)', ext: 'webm', mime: 'video/webm', container: 'webm', video: 'vp9', audio: 'opus' },
  'webm-vp8': { label: 'WebM (VP8, Opus)', ext: 'webm', mime: 'video/webm', container: 'webm', video: 'vp8', audio: 'opus' },
  'mp4-avc': { label: 'MP4 (H.264, AAC)', ext: 'mp4', mime: 'video/mp4', container: 'mp4', video: 'avc', audio: 'aac' },
  'mp4-vp9': { label: 'MP4 (VP9, Opus)', ext: 'mp4', mime: 'video/mp4', container: 'mp4', video: 'vp9', audio: 'opus' },
};
export const QUALITIES = { low: mb.QUALITY_LOW, medium: mb.QUALITY_MEDIUM, high: mb.QUALITY_HIGH, best: mb.QUALITY_VERY_HIGH };

export const webCodecs = () => typeof VideoEncoder === 'function' && typeof VideoDecoder === 'function';

/** Formats this browser can encode at the given size. */
export async function availableFormats(width, height) {
  const out = [];
  if (!webCodecs()) return out;
  for (const [key, f] of Object.entries(FORMATS)) {
    try { if (await mb.canEncodeVideo(f.video, { width, height }) && await mb.canEncodeAudio(f.audio)) out.push(key); } catch (e) { /* not available */ }
  }
  return out;
}

const inputs = new Map(); // source id -> Input
export function inputOf(source) {
  if (!inputs.has(source.id) || inputs.get(source.id).file !== source.file) inputs.set(source.id, { file: source.file, input: new mb.Input({ source: new mb.BlobSource(source.file), formats: mb.ALL_FORMATS }) });
  return inputs.get(source.id).input;
}

/** Probe a media file: { duration, width, height, hasVideo, hasAudio, canDecode, thumb (data URL) }. */
export async function probe(source) {
  const input = inputOf(source);
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  const info = { duration: await input.computeDuration(), hasVideo: !!video, hasAudio: !!audio, width: 0, height: 0, canDecode: true, thumb: '' };
  if (video) {
    info.width = video.displayWidth;
    info.height = video.displayHeight;
    info.canDecode = await video.canDecode();
    if (info.canDecode) {
      const frame = await new mb.CanvasSink(video, { width: 160, fit: 'contain', height: 90 }).getCanvas(Math.min(1, info.duration / 3)).catch(() => null);
      if (frame) info.thumb = canvasUrl(frame.canvas);
    }
  }
  if (audio) info.canDecode = info.canDecode && await audio.canDecode();
  return info;
}

function canvasUrl(c) {
  if (c.toDataURL) return c.toDataURL('image/jpeg', 0.7);
  const tmp = document.createElement('canvas');
  tmp.width = c.width; tmp.height = c.height;
  tmp.getContext('2d').drawImage(c, 0, 0);
  return tmp.toDataURL('image/jpeg', 0.7);
}

/** Clips that are heard: audio clips and video clips with audio, on tracks that are not muted. */
function audibleClips(project, sources) {
  return project.clips.filter((c) => {
    const tr = tl.trackOf(project, c.track);
    const s = sources.get(c.source);
    return s && !tr.mute && c.volume > 0 && (c.kind === 'audio' || c.kind === 'video') && s.hasAudio;
  });
}

/** Mix the audio of the timeline (or null without audible clips). */
export async function mixAudio(project, sources, { rate = 48000, from = 0, to = tl.duration(project), signal } = {}) {
  const clips = audibleClips(project, sources).filter((c) => tl.end(c) > from && c.start < to);
  if (!clips.length || to <= from) return null;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil((to - from) * rate)), rate);
  for (const c of clips) {
    const track = await inputOf(sources.get(c.source)).getPrimaryAudioTrack();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const t0 = c.start - from, t1 = tl.end(c) - from;
    const fin = Math.max(c.fadeIn || 0, c.audioFadeIn || 0), fout = Math.max(c.fadeOut || 0, c.audioFadeOut || 0); // (cross-fades fade only the sound)
    gain.gain.setValueAtTime(fin > 0 ? 0 : c.volume, Math.max(0, t0));
    if (fin > 0) gain.gain.linearRampToValueAtTime(c.volume, Math.max(0, t0 + fin));
    if (fout > 0) { gain.gain.setValueAtTime(c.volume, Math.max(0, t1 - fout)); gain.gain.linearRampToValueAtTime(0, Math.max(0, t1)); }
    if (tl.speedOf(c) !== 1 || c.reverse) {
      // the whole source range as one buffer: reversed if needed, played at the clip's speed (the pitch changes with it)
      const whole = await rangeBuffer(ctx, track, c.in, c.out, signal);
      if (!whole) continue;
      if (c.reverse) for (let ch = 0; ch < whole.numberOfChannels; ch++) whole.getChannelData(ch).reverse();
      const node = ctx.createBufferSource();
      node.buffer = whole;
      node.playbackRate.value = tl.speedOf(c);
      node.connect(gain);
      const skip = Math.max(0, from - c.start); // timeline seconds cut off at the start
      node.start(Math.max(0, t0), skip * tl.speedOf(c));
      continue;
    }
    for await (const { buffer, timestamp } of new mb.AudioBufferSink(track).buffers(c.in, c.out)) {
      if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
      // the part of this buffer inside [in, out) of the clip, placed on the timeline (relative to `from`)
      const partStart = Math.max(timestamp, c.in), partEnd = Math.min(timestamp + buffer.duration, c.out);
      if (partEnd <= partStart) continue;
      let offset = partStart - timestamp;
      let when = c.start + (partStart - c.in) - from;
      let len = partEnd - partStart;
      if (when < 0) { offset -= when; len += when; when = 0; }
      if (len <= 0) continue;
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(when, offset, len);
    }
  }
  return ctx.startRendering();
}

/** The decoded audio of [from, to) of a track as one AudioBuffer of the context (or null). */
async function rangeBuffer(ctx, track, from, to, signal) {
  const parts = [];
  for await (const { buffer, timestamp } of new mb.AudioBufferSink(track).buffers(from, to)) {
    if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
    parts.push({ buffer, timestamp });
  }
  if (!parts.length) return null;
  const rate = parts[0].buffer.sampleRate, channels = Math.max(...parts.map((x) => x.buffer.numberOfChannels));
  const n = Math.max(1, Math.round((to - from) * rate));
  const out = ctx.createBuffer(channels, n, rate);
  for (const { buffer, timestamp } of parts) {
    const offset = Math.round((timestamp - from) * rate);
    for (let ch = 0; ch < channels; ch++) {
      const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      const dst = out.getChannelData(ch);
      const a = Math.max(0, -offset), b = Math.min(src.length, n - offset);
      if (b > a) dst.set(src.subarray(a, b), offset + a);
    }
  }
  return out;
}

/**
 * Draw frame after frame of the timeline into the 2D context g (project size): frame k0 + i at every next(). The video clips'
 * frames come from sequential CanvasSink iterators (one per clip), opened when a clip first appears.
 */
async function* composeFrames(project, g, { k0, frames, sources, images, signal }) {
  const { width, height, fps } = project;
  const iterators = new Map(); // clip id -> { iterator, last }
  const videoTracks = project.tracks.filter((tr) => tr.kind === 'video' && !tr.hidden).reverse(); // bottom first
  try {
    for (let i = 0; i < frames; i++) {
      if (signal && signal.aborted) throw new DOMException('cancelled', 'AbortError');
      const t = (k0 + i) / fps;
      g.globalAlpha = 1;
      g.fillStyle = project.background || '#000';
      g.fillRect(0, 0, width, height);
      for (const tr of videoTracks) {
        const c = tl.clipAt(project, tr.id, t);
        if (!c) continue;
        if (c.kind === 'text') { tl.drawClip(g, c, null, 0, 0, project, t); continue; }
        if (c.kind === 'image') { const bmp = images.get(c.source); if (bmp) tl.drawClip(g, c, bmp, bmp.width, bmp.height, project, t); continue; }
        if (c.kind !== 'video') continue;
        let it = iterators.get(c.id);
        if (!it) {
          const vt = await inputOf(sources.get(c.source)).getPrimaryVideoTrack();
          const first = Math.max(k0 + i, Math.ceil(c.start * fps - 1e-6)), last = Math.min(k0 + frames, Math.ceil(tl.end(c) * fps - 1e-6));
          const stamps = [];
          for (let k = first; k < last; k++) stamps.push(Math.max(c.in, Math.min(c.out - 1e-4, tl.sourceTime(c, k / fps))));
          it = { iterator: new mb.CanvasSink(vt, { poolSize: 2 }).canvasesAtTimestamps(stamps)[Symbol.asyncIterator](), last: null };
          iterators.set(c.id, it);
        }
        const next = await it.iterator.next();
        if (!next.done && next.value) it.last = next.value.canvas;
        if (it.last) tl.drawClip(g, c, it.last, it.last.width, it.last.height, project, t);
      }
      yield i;
    }
  } finally {
    for (const it of iterators.values()) if (it.iterator.return) await it.iterator.return();
  }
}

/**
 * The timeline (or [from, to)) as an animated GIF of `width` pixels (height in proportion) at `fps` frames per second (at most
 * 600 frames); the palette comes from up to eight frames spread over the range.
 */
export async function renderGif(project, { width = 480, fps = 10, from = 0, to = null, dither = false, sources, images, signal, onProgress = () => {} }) {
  const total = tl.duration(project);
  const end = Math.min(total, to == null ? total : to), start = Math.max(0, Math.min(from, end));
  const w = Math.max(16, Math.min(project.width, Math.round(width))), h = Math.max(16, Math.round((project.height * w) / project.width));
  const step = project.fps / fps; // timeline frames per GIF frame
  const k0 = Math.round(start * project.fps), all = Math.max(1, Math.round(end * project.fps) - k0);
  const count = Math.min(600, Math.max(1, Math.floor(all / step)));
  const full = new OffscreenCanvas(project.width, project.height);
  const g = full.getContext('2d');
  const small = new OffscreenCanvas(w, h);
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high';
  const frames = [];
  const source = composeFrames(project, g, { k0, frames: all, sources, images, signal });
  let next = 0;
  for (let i = 0; i < all && frames.length < count; i++) {
    await source.next();
    if (i < Math.round(next)) continue;
    next += step;
    sg.drawImage(full, 0, 0, w, h);
    frames.push(sg.getImageData(0, 0, w, h).data);
    onProgress((0.7 * frames.length) / count);
  }
  await source.return();
  const { GifAnimation } = await import('app/gif');
  const samples = [];
  for (let k = 0; k < Math.min(8, frames.length); k++) samples.push(frames[Math.floor((k * frames.length) / Math.min(8, frames.length))]);
  const gif = new GifAnimation(w, h, samples, { dither });
  // delays in hundredths of a second, rounded so that the total stays right
  let shown = 0;
  frames.forEach((f, k) => {
    const due = Math.round(((k + 1) * 100) / fps);
    gif.add(f, Math.max(2, due - shown));
    shown = due;
    onProgress(0.7 + (0.3 * (k + 1)) / frames.length);
  });
  return gif.finish();
}

/**
 * Render the project to a file. options: { format (key of FORMATS), quality, onProgress(fraction), signal, sources (Map),
 * images (Map source id -> ImageBitmap) }. Returns the file bytes.
 */
export async function render(project, { format = 'webm-vp9', quality = 'high', onProgress = () => {}, signal, sources, images, from = 0, to = null }) {
  const f = FORMATS[format];
  const output = new mb.Output({ format: f.container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const { width, height, fps } = project;
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext('2d');
  const video = new mb.CanvasSource(canvas, { codec: f.video, bitrate: QUALITIES[quality] || mb.QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  const total = tl.duration(project);
  const end = Math.min(total, to == null ? total : to), start = Math.max(0, Math.min(from, end));
  const audioBuffer = await mixAudio(project, sources, { signal, from: start, to: end });
  let audio = null;
  if (audioBuffer) { audio = new mb.AudioBufferSource({ codec: f.audio, bitrate: mb.QUALITY_HIGH }); output.addAudioTrack(audio); }
  await output.start();
  const abort = async () => { await output.cancel(); throw new DOMException('cancelled', 'AbortError'); };
  try {
    if (audio) await audio.add(audioBuffer);
    const k0 = Math.round(start * fps), frames = Math.max(1, Math.round(end * fps) - k0); // (a range: frames k0 … k0 + frames − 1)
    const frameSource = composeFrames(project, g, { k0, frames, sources, images, signal });
    for (let i = 0; i < frames; i++) {
      if (signal && signal.aborted) await abort();
      await frameSource.next();
      await video.add(i / fps, 1 / fps);
      if (i % 5 === 0) onProgress(i / frames);
    }
    await frameSource.return();
    await output.finalize();
    onProgress(1);
    return new Uint8Array(output.target.buffer);
  } catch (e) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    throw e;
  }
}

// ---- audio only, single frames ------------------------------------------------------------------------------------------

export const AUDIO_FORMATS = {
  wav: { label: 'WAV (16 bit)', ext: 'wav', mime: 'audio/wav' },
  'webm-opus': { label: 'WebM (Opus)', ext: 'webm', mime: 'audio/webm', container: 'webm', codec: 'opus' },
  'm4a-aac': { label: 'M4A (AAC)', ext: 'm4a', mime: 'audio/mp4', container: 'mp4', codec: 'aac' },
};

/** Audio formats this browser can write (WAV always). */
export async function availableAudioFormats() {
  const out = ['wav'];
  for (const [key, f] of Object.entries(AUDIO_FORMATS)) {
    if (!f.codec) continue;
    try { if (await mb.canEncodeAudio(f.codec)) out.push(key); } catch (e) { /* not available */ }
  }
  return out;
}

function wavBytes(buffer) {
  const ch = buffer.numberOfChannels, n = buffer.length, size = n * ch * 2;
  const out = new Uint8Array(44 + size);
  const v = new DataView(out.buffer);
  const str = (o, x) => { for (let i = 0; i < 4; i++) out[o + i] = x.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + size, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, size, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let p = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { v.setInt16(p, Math.round(Math.max(-1, Math.min(1, data[c][i])) * 32767), true); p += 2; }
  return out;
}

/** Only the sound of the timeline (or of [from, to)) as WAV, Opus or AAC; null when nothing is audible. */
export async function renderAudio(project, { format = 'wav', sources, signal, from = 0, to = null } = {}) {
  const total = tl.duration(project);
  const buffer = await mixAudio(project, sources, { signal, from, to: to == null ? total : Math.min(total, to) });
  if (!buffer) return null;
  const f = AUDIO_FORMATS[format];
  if (!f.codec) return wavBytes(buffer);
  const output = new mb.Output({ format: f.container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const audio = new mb.AudioBufferSource({ codec: f.codec, bitrate: mb.QUALITY_HIGH });
  output.addAudioTrack(audio);
  await output.start();
  await audio.add(buffer);
  await output.finalize();
  return new Uint8Array(output.target.buffer);
}

/** The frame of a video source at a source time, as a canvas of the video's size (for freeze frames). */
export async function frameAt(source, time) {
  const vt = await inputOf(source).getPrimaryVideoTrack();
  const r = await new mb.CanvasSink(vt).getCanvas(time);
  if (!r) return null;
  const c = document.createElement('canvas');
  c.width = r.canvas.width; c.height = r.canvas.height;
  c.getContext('2d').drawImage(r.canvas, 0, 0);
  return c;
}

/** The peak level (0–1) of the sound of a clip's source range (for normalising). */
export async function peakOf(source, from, to) {
  const track = await inputOf(source).getPrimaryAudioTrack();
  if (!track) return 0;
  let peak = 0;
  for await (const { buffer } of new mb.AudioBufferSink(track).buffers(from, to)) {
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) { const d = buffer.getChannelData(ch); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } }
  }
  return peak;
}

/** The sound of [from, to) of a source as a 16-bit WAV file (for editing it in the audio editor), or null without sound. */
export async function sourceWav(source, from, to) {
  const track = await inputOf(source).getPrimaryAudioTrack();
  if (!track) return null;
  const rate = track.sampleRate || 48000;
  const ctx = new OfflineAudioContext(Math.max(1, track.numberOfChannels || 2), 1, rate);
  const buffer = await rangeBuffer(ctx, track, from, to);
  return buffer ? wavBytes(buffer) : null;
}
