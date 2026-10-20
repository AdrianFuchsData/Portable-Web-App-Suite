/*
 * Compressed export formats through Mediabunny: MP3 (LAME) and FLAC (libFLAC) are WebAssembly encoders that run in a
 * worker and work in every browser; Opus (Ogg) and AAC (M4A) use the encoders of the browser (WebCodecs), so they are
 * only offered where the browser has them. Loaded on demand (the first export in one of these formats).
 */

export const FORMATS = {
  mp3: { ext: 'mp3', mime: 'audio/mpeg', codec: 'mp3', output: 'Mp3OutputFormat', bitrates: [128, 192, 256, 320], bitrate: 192, rates: [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] },
  ogg: { ext: 'ogg', mime: 'audio/ogg', codec: 'opus', output: 'OggOutputFormat', bitrates: [64, 96, 128, 160, 192, 256], bitrate: 128, rates: [48000] },
  m4a: { ext: 'm4a', mime: 'audio/mp4', codec: 'aac', output: 'Mp4OutputFormat', bitrates: [96, 128, 192, 256, 320], bitrate: 192, rates: [44100, 48000] },
  flac: { ext: 'flac', mime: 'audio/flac', codec: 'flac', output: 'FlacOutputFormat', lossless: true },
};

let loaded = null;
function load() {
  if (!loaded) {
    loaded = Promise.all([import('mediabunny'), import('@mediabunny/mp3-encoder'), import('@mediabunny/flac-encoder')]).then(async ([mb, mp3, flac]) => {
      // prefer the browser's own encoders; the WebAssembly encoders fill the gaps
      if (!(await mb.canEncodeAudio('mp3').catch(() => false))) mp3.registerMp3Encoder();
      if (!(await mb.canEncodeAudio('flac').catch(() => false))) flac.registerFlacEncoder();
      return mb;
    });
    loaded.catch(() => { loaded = null; });
  }
  return loaded;
}

/** Sample rate the format is encoded at (the next supported one at or above the project rate). */
export function rateFor(format, rate) {
  const f = FORMATS[format];
  if (!f.rates) return rate;
  return f.rates.find((r) => r >= rate) || f.rates[f.rates.length - 1];
}

/** Formats (keys of FORMATS) this browser can encode with the given channel count and rate. */
export async function available(channels = 2, rate = 44100) {
  const mb = await load();
  const out = [];
  for (const [key, f] of Object.entries(FORMATS)) {
    const config = { numberOfChannels: channels, sampleRate: rateFor(key, rate), ...(f.lossless ? {} : { bitrate: f.bitrate * 1000 }) };
    if (await mb.canEncodeAudio(f.codec, config).catch(() => false)) out.push(key);
  }
  return out;
}

/**
 * Encode audio ({ rate, channels }, already at rateFor(format, rate)) into a file; bitrate in kbit/s. onProgress(0…1).
 * Returns the file content (Uint8Array).
 */
export async function encode(audio, format, { bitrate, onProgress = () => {} } = {}) {
  const mb = await load();
  const f = FORMATS[format];
  const output = new mb.Output({ format: new mb[f.output](), target: new mb.BufferTarget() });
  const source = new mb.AudioSampleSource({ codec: f.codec, ...(f.lossless ? {} : { bitrate: (bitrate || f.bitrate) * 1000 }) });
  output.addAudioTrack(source);
  await output.start();
  const n = audio.channels[0].length;
  const chunk = audio.rate * 2;
  for (let from = 0; from < n; from += chunk) {
    const to = Math.min(n, from + chunk);
    const data = new Float32Array((to - from) * audio.channels.length);
    audio.channels.forEach((c, i) => data.set(c.subarray(from, to), i * (to - from)));
    const sample = new mb.AudioSample({ data, format: 'f32-planar', numberOfChannels: audio.channels.length, sampleRate: audio.rate, timestamp: from / audio.rate });
    await source.add(sample);
    sample.close();
    onProgress(to / n);
  }
  source.close();
  await output.finalize();
  return new Uint8Array(output.target.buffer);
}
