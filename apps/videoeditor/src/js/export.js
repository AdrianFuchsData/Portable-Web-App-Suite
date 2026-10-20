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
    gain.gain.setValueAtTime(c.fadeIn > 0 ? 0 : c.volume, Math.max(0, t0));
    if (c.fadeIn > 0) gain.gain.linearRampToValueAtTime(c.volume, Math.max(0, t0 + c.fadeIn));
    if (c.fadeOut > 0) { gain.gain.setValueAtTime(c.volume, Math.max(0, t1 - c.fadeOut)); gain.gain.linearRampToValueAtTime(0, Math.max(0, t1)); }
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
 * Render the project to a file. options: { format (key of FORMATS), quality, onProgress(fraction), signal, sources (Map),
 * images (Map source id -> ImageBitmap) }. Returns the file bytes.
 */
export async function render(project, { format = 'webm-vp9', quality = 'high', onProgress = () => {}, signal, sources, images }) {
  const f = FORMATS[format];
  const output = new mb.Output({ format: f.container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const { width, height, fps } = project;
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext('2d');
  const video = new mb.CanvasSource(canvas, { codec: f.video, bitrate: QUALITIES[quality] || mb.QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: fps });
  const total = tl.duration(project);
  const audioBuffer = await mixAudio(project, sources, { signal });
  let audio = null;
  if (audioBuffer) { audio = new mb.AudioBufferSource({ codec: f.audio, bitrate: mb.QUALITY_HIGH }); output.addAudioTrack(audio); }
  await output.start();
  const abort = async () => { await output.cancel(); throw new DOMException('cancelled', 'AbortError'); };
  try {
    if (audio) await audio.add(audioBuffer);
    const frames = Math.max(1, Math.round(total * fps));
    const iterators = new Map(); // clip id -> { iterator, size }
    const videoTracks = project.tracks.filter((tr) => tr.kind === 'video' && !tr.hidden).reverse(); // bottom first
    for (let i = 0; i < frames; i++) {
      if (signal && signal.aborted) await abort();
      const t = i / fps;
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
          const first = Math.ceil(c.start * fps - 1e-6), last = Math.ceil(tl.end(c) * fps - 1e-6);
          const stamps = [];
          for (let k = first; k < last; k++) stamps.push(Math.max(c.in, Math.min(c.out - 1e-4, tl.sourceTime(c, k / fps))));
          it = { iterator: new mb.CanvasSink(vt, { poolSize: 2 }).canvasesAtTimestamps(stamps)[Symbol.asyncIterator](), last: null };
          iterators.set(c.id, it);
        }
        const next = await it.iterator.next();
        if (!next.done && next.value) it.last = next.value.canvas;
        if (it.last) tl.drawClip(g, c, it.last, it.last.width, it.last.height, project, t);
      }
      await video.add(t, 1 / fps);
      if (i % 5 === 0) onProgress(i / frames);
    }
    for (const it of iterators.values()) if (it.iterator.return) await it.iterator.return();
    await output.finalize();
    onProgress(1);
    return new Uint8Array(output.target.buffer);
  } catch (e) {
    if (output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    throw e;
  }
}
