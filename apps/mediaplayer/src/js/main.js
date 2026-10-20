/*
 * Media player: plays local audio and video files and stream URLs with the codecs of the browser, playlists (M3U/M3U8,
 * PLS, XSPF import, M3U8 export), shuffle and repeat, speed, subtitles (SRT/VTT), fullscreen, picture-in-picture,
 * Media Session (hardware keys, Android notification), keyboard shortcuts, tags and cover art (tags.js), equaliser and
 * loudness normalisation (Web Audio; local files only, a second media element), A–B repeat, frame steps, snapshots,
 * resume positions and an album view.
 */
(function () {
  'use strict';

  const { html } = Suite.shell;
  const t = Suite.t;
  const APP = 'mediaplayer';
  const PREFS_KEY = 'suite.mediaplayer';
  const MEDIA_EXT = ['mp3', 'm4a', 'm4b', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'weba', 'webm', 'mp4', 'm4v', 'mov', 'mkv', 'ogv', '3gp', 'avi', 'wmv', 'wma', 'ts', 'mpg', 'mpeg', 'aif', 'aiff', 'caf', 'amr'];
  const PLAYLIST_EXT = ['m3u', 'm3u8', 'pls', 'xspf'];
  const SUBTITLE_EXT = ['srt', 'vtt'];
  const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];

  Suite.i18n.register({
    en: {
      'app.title': 'Media player',
      'mp.open': 'Open files', 'mp.openFolder': 'Open folder', 'mp.openUrl': 'Open URL', 'mp.savePlaylist': 'Save playlist', 'mp.subtitles': 'Subtitles',
      'mp.play': 'Play', 'mp.pause': 'Pause', 'mp.stop': 'Stop', 'mp.previous': 'Previous', 'mp.next': 'Next', 'mp.mute': 'Mute', 'mp.unmute': 'Unmute',
      'mp.volume': 'Volume', 'mp.speed': 'Speed', 'mp.shuffle': 'Shuffle', 'mp.repeat': 'Repeat', 'mp.repeatOff': 'Repeat: off', 'mp.repeatAll': 'Repeat: all', 'mp.repeatOne': 'Repeat: one',
      'mp.fullscreen': 'Fullscreen', 'mp.pip': 'Picture-in-picture', 'mp.playlist': 'Playlist', 'mp.filter': 'Filter', 'mp.clear': 'Clear', 'mp.remove': 'Remove',
      'mp.moveUp': 'Move up', 'mp.moveDown': 'Move down', 'mp.empty': 'Open audio or video files, a folder, a playlist or a stream URL – or drop files here.',
      'mp.missing': '“{0}” is in the playlist but was not added. Add the file to play it.', 'mp.cannotPlay': '“{0}” cannot be played in this browser (unsupported format or codec).',
      'mp.url': 'Stream or file URL', 'mp.add': 'Add', 'mp.cancel': 'Cancel', 'mp.subtitlesOff': 'Subtitles off', 'mp.subtitleLoaded': 'Subtitles “{0}” loaded.',
      'mp.noMedia': 'No playable files found.', 'mp.items': '{0} items', 'mp.total': 'total {0}', 'mp.clearConfirm': 'Remove all items from the playlist?',
      'mp.nothing': 'Nothing is playing',
      'mp.eq': 'Equaliser', 'mp.eqOn': 'Equaliser on', 'mp.normalize': 'Normalise loudness', 'mp.preset': 'Preset', 'mp.reset': 'Reset',
      'mp.p.flat': 'Flat', 'mp.p.bass': 'Bass boost', 'mp.p.treble': 'Treble boost', 'mp.p.vocal': 'Voice', 'mp.p.loud': 'Loudness', 'mp.p.custom': 'Custom',
      'mp.eqLocal': 'The equaliser works for local files; streams play unchanged.', 'mp.ab': 'A–B repeat', 'mp.abA': 'A set at {0} – click again for B',
      'mp.abOn': 'Repeating {0} – {1}', 'mp.frameBack': 'One frame back', 'mp.frameForward': 'One frame forward', 'mp.snapshot': 'Save the picture as PNG',
      'mp.resumed': 'Continued at {0} (where you stopped last time).', 'mp.fromStart': 'From the start', 'mp.listView': 'List', 'mp.albumView': 'Albums',
      'mp.unknownAlbum': 'Other titles', 'mp.tracks': '{0} titles',
    },
    de: {
      'app.title': 'Medienplayer',
      'mp.open': 'Dateien öffnen', 'mp.openFolder': 'Ordner öffnen', 'mp.openUrl': 'URL öffnen', 'mp.savePlaylist': 'Wiedergabeliste speichern', 'mp.subtitles': 'Untertitel',
      'mp.play': 'Wiedergabe', 'mp.pause': 'Pause', 'mp.stop': 'Stopp', 'mp.previous': 'Zurück', 'mp.next': 'Weiter', 'mp.mute': 'Stumm', 'mp.unmute': 'Ton an',
      'mp.volume': 'Lautstärke', 'mp.speed': 'Geschwindigkeit', 'mp.shuffle': 'Zufällig', 'mp.repeat': 'Wiederholen', 'mp.repeatOff': 'Wiederholen: aus', 'mp.repeatAll': 'Wiederholen: alle', 'mp.repeatOne': 'Wiederholen: einen',
      'mp.fullscreen': 'Vollbild', 'mp.pip': 'Bild-in-Bild', 'mp.playlist': 'Wiedergabeliste', 'mp.filter': 'Filtern', 'mp.clear': 'Leeren', 'mp.remove': 'Entfernen',
      'mp.moveUp': 'Nach oben', 'mp.moveDown': 'Nach unten', 'mp.empty': 'Öffnen Sie Audio- oder Videodateien, einen Ordner, eine Wiedergabeliste oder eine Stream-URL – oder ziehen Sie Dateien hierher.',
      'mp.missing': '„{0}“ steht in der Wiedergabeliste, wurde aber nicht hinzugefügt. Fügen Sie die Datei hinzu, um sie abzuspielen.', 'mp.cannotPlay': '„{0}“ kann in diesem Browser nicht abgespielt werden (Format oder Codec nicht unterstützt).',
      'mp.url': 'Stream- oder Datei-URL', 'mp.add': 'Hinzufügen', 'mp.cancel': 'Abbrechen', 'mp.subtitlesOff': 'Untertitel aus', 'mp.subtitleLoaded': 'Untertitel „{0}“ geladen.',
      'mp.noMedia': 'Keine abspielbaren Dateien gefunden.', 'mp.items': '{0} Titel', 'mp.total': 'gesamt {0}', 'mp.clearConfirm': 'Alle Titel aus der Wiedergabeliste entfernen?',
      'mp.nothing': 'Keine Wiedergabe',
      'mp.eq': 'Equalizer', 'mp.eqOn': 'Equalizer an', 'mp.normalize': 'Lautstärke angleichen', 'mp.preset': 'Voreinstellung', 'mp.reset': 'Zurücksetzen',
      'mp.p.flat': 'Neutral', 'mp.p.bass': 'Bässe betonen', 'mp.p.treble': 'Höhen betonen', 'mp.p.vocal': 'Sprache', 'mp.p.loud': 'Loudness', 'mp.p.custom': 'Eigene',
      'mp.eqLocal': 'Der Equalizer wirkt bei lokalen Dateien; Streams werden unverändert abgespielt.', 'mp.ab': 'A–B-Wiederholung', 'mp.abA': 'A bei {0} gesetzt – erneut klicken für B',
      'mp.abOn': 'Wiederhole {0} – {1}', 'mp.frameBack': 'Ein Bild zurück', 'mp.frameForward': 'Ein Bild vor', 'mp.snapshot': 'Bild als PNG speichern',
      'mp.resumed': 'Bei {0} fortgesetzt (wo Sie zuletzt aufgehört haben).', 'mp.fromStart': 'Von vorne', 'mp.listView': 'Liste', 'mp.albumView': 'Alben',
      'mp.unknownAlbum': 'Weitere Titel', 'mp.tracks': '{0} Titel',
    },
  });

  // ---- state and preferences ----------------------------------------------------------------------

  const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; } })();
  const state = {
    items: [], current: -1, order: [], playing: false, filter: '', urlDialog: false, dragging: null,
    volume: prefs.volume ?? 1, muted: !!prefs.muted, rate: prefs.rate || 1, repeat: prefs.repeat || 'off', shuffle: !!prefs.shuffle,
    showPlaylist: prefs.showPlaylist ?? true, subtitle: -1,
    eq: { on: !!(prefs.eq && prefs.eq.on), gains: (prefs.eq && prefs.eq.gains) || Array(10).fill(0), normalize: !!(prefs.eq && prefs.eq.normalize), open: false },
    ab: null, view: prefs.view || 'list',
  };
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ volume: state.volume, muted: state.muted, rate: state.rate, repeat: state.repeat, shuffle: state.shuffle, showPlaylist: state.showPlaylist, eq: { on: state.eq.on, gains: state.eq.gains, normalize: state.eq.normalize }, view: state.view })); } catch (e) { /* private mode */ }
  }

  let renderQueued = false;
  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; Suite.shell.refresh(); });
  }

  let nextId = 1;
  const ext = (name) => (name.split('.').pop() || '').toLowerCase();
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '--:--';
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
  }
  const label = (item) => item.title ? (item.artist ? `${item.artist} – ${item.title}` : item.title) : item.name;

  // ---- the media element (created once, outside Preact) -------------------------------------------

  let objectUrl = null;

  /** A media element with the player's event handlers (one plain element, one routed through the equaliser). */
  function makeElement() {
    const video = document.createElement('video');
    video.playsInline = true;
    video.preload = 'metadata';
    video.dataset.testid = 'media';
    video.volume = state.volume;
    video.muted = state.muted;

    for (const ev of ['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'volumechange', 'ratechange', 'resize', 'emptied']) {
      video.addEventListener(ev, render);
    }
    video.addEventListener('play', () => { state.playing = true; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
    video.addEventListener('pause', () => { state.playing = false; if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
    video.addEventListener('loadedmetadata', () => {
      const item = state.items[state.current];
      if (item && isFinite(video.duration)) item.duration = video.duration;
      video.playbackRate = state.rate;
      updateSubtitleMode();
    });
    video.addEventListener('ended', () => {
      if (state.repeat === 'one') { video.currentTime = 0; video.play().catch(() => {}); return; }
      next(true);
    });
    video.addEventListener('error', () => {
      const item = state.items[state.current];
      if (!item || !video.getAttribute('src')) return;
      item.error = true;
      Suite.shell.toast(t('mp.cannotPlay', label(item)), 'error');
      if (state.autoAdvance && state.items.some((i) => !i.error && !i.missing)) next(true);
      else { state.playing = false; render(); }
    });
    return video;
  }
  let video = makeElement();
  const plainVideo = video;

  // ---- equaliser (Web Audio): a second element routed through filters; streams keep the plain element ----------

  const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const PRESETS = {
    flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bass: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0], treble: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6],
    vocal: [-3, -2, -1, 1, 3, 4, 3, 1, 0, -1], loud: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5],
  };
  let graph = null;

  function eqElement() {
    if (graph) return graph.el;
    const el = makeElement();
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el);
    const filters = BANDS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.4;
      return b;
    });
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24; compressor.knee.value = 24; compressor.ratio.value = 4; compressor.attack.value = 0.01; compressor.release.value = 0.25;
    const makeup = ctx.createGain();
    let node = source;
    for (const f of filters) { node.connect(f); node = f; }
    graph = { el, ctx, filters, compressor, makeup, last: node };
    applyEq();
    return el;
  }

  function applyEq() {
    if (!graph) return;
    const { filters, compressor, makeup, last, ctx } = graph;
    filters.forEach((f, i) => { f.gain.value = state.eq.on ? state.eq.gains[i] : 0; });
    last.disconnect(); compressor.disconnect(); makeup.disconnect();
    if (state.eq.on && state.eq.normalize) { makeup.gain.value = 1.6; last.connect(compressor); compressor.connect(makeup); makeup.connect(ctx.destination); } else last.connect(ctx.destination);
  }

  /** Show and use another media element (keeps volume, speed and the position). */
  function useElement(el) {
    if (el === video) return;
    const old = video;
    el.volume = old.volume; el.muted = old.muted; el.playbackRate = old.playbackRate;
    old.pause();
    for (const track of [...old.querySelectorAll('track')]) track.remove();
    old.removeAttribute('src');
    old.load();
    if (old.parentNode) old.parentNode.replaceChild(el, old);
    video = el;
  }

  const wantsEq = (item) => state.eq.on && item && item.file;

  function setEq(changes) {
    const before = state.eq.on;
    Object.assign(state.eq, changes);
    savePrefs();
    if (state.eq.on && !graph && state.items[state.current] && state.items[state.current].file) eqElement();
    if (graph) { applyEq(); if (graph.ctx.state === 'suspended') graph.ctx.resume(); }
    // switching the equaliser on or off during playback moves the item to the other element
    const item = state.items[state.current];
    if (before !== state.eq.on && item && item.file && video.getAttribute('src')) {
      const time = video.currentTime, playing = !video.paused;
      play(state.current, { at: time, paused: !playing });
    }
    render();
  }

  // ---- resume positions (per file: name and size), A–B repeat, frames, snapshots ------------------------------

  const RESUME_KEY = 'suite.mediaplayer.resume';
  const resumeKey = (item) => item && item.file ? `${item.name}|${item.file.size}` : item && item.url ? item.url : null;
  function resumeList() { try { return JSON.parse(localStorage.getItem(RESUME_KEY)) || {}; } catch (e) { return {}; } }
  let resumeSaved = 0;
  function rememberPosition(force = false) {
    const item = state.items[state.current];
    const key = resumeKey(item);
    if (!key || !isFinite(video.duration) || video.duration < 120 || (!force && Date.now() - resumeSaved < 5000)) return;
    resumeSaved = Date.now();
    const list = resumeList();
    const t0 = video.currentTime;
    if (t0 > 30 && t0 < video.duration - 30) list[key] = { t: Math.floor(t0), at: Date.now() }; else delete list[key];
    const keys = Object.keys(list).sort((a, b) => list[b].at - list[a].at).slice(0, 200);
    try { localStorage.setItem(RESUME_KEY, JSON.stringify(Object.fromEntries(keys.map((k) => [k, list[k]])))); } catch (e) { /* storage blocked */ }
  }
  setInterval(() => { if (state.playing) rememberPosition(); }, 5000);
  window.addEventListener('pagehide', () => rememberPosition(true));

  function cycleAb() {
    if (!video.getAttribute('src')) return;
    if (!state.ab) state.ab = { a: video.currentTime, b: null };
    else if (state.ab.b == null && video.currentTime > state.ab.a + 0.2) { state.ab.b = video.currentTime; watchAb(); } else state.ab = null;
    render();
  }

  /** Jump back to A when B is reached (checked every frame for precision). */
  function watchAb() {
    const ab = state.ab;
    if (!ab || ab.b == null) return;
    if (video.currentTime >= ab.b || video.currentTime < ab.a - 0.5) video.currentTime = ab.a;
    requestAnimationFrame(watchAb);
  }

  function stepFrame(dir) {
    if (!video.getAttribute('src')) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + dir / 30));
  }

  function snapshot() {
    if (!video.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const item = state.items[state.current];
    const stem = ((item && item.name) || 'video').replace(/\.[^.]+$/, '');
    const time = fmtTime(video.currentTime).replace(/:/g, '-');
    c.toBlob(async (blob) => Suite.files.download(new Uint8Array(await blob.arrayBuffer()), `${stem} ${time}.png`, 'image/png'), 'image/png');
  }

  // ---- playing ------------------------------------------------------------------------------------

  function reshuffle() {
    const order = state.items.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // the current item comes first, so that the whole list is played once from here
    const at = order.indexOf(state.current);
    if (at > 0) { order.splice(at, 1); order.unshift(state.current); }
    state.order = order;
  }

  function sequence() {
    if (!state.shuffle) return state.items.map((_, i) => i);
    if (state.order.length !== state.items.length) reshuffle();
    return state.order;
  }

  function coverUrl(item) {
    if (!item.cover) return null;
    if (!item.coverUrl) item.coverUrl = URL.createObjectURL(item.cover);
    return item.coverUrl;
  }

  function play(index, { auto = false, at = null, paused = false } = {}) {
    const item = state.items[index];
    if (!item) return;
    if (state.current !== index) rememberPosition(true);
    state.ab = null;
    state.current = index;
    state.autoAdvance = auto;
    if (item.missing) {
      Suite.shell.toast(t('mp.missing', item.name), 'warning');
      if (auto) next(true); else render();
      return;
    }
    useElement(wantsEq(item) ? eqElement() : plainVideo);
    if (graph && video === graph.el && graph.ctx.state === 'suspended') graph.ctx.resume();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = item.file ? URL.createObjectURL(item.file) : null;
    for (const track of [...video.querySelectorAll('track')]) track.remove();
    item.error = false;
    video.src = objectUrl || item.url;
    (item.subtitles || []).forEach((s, i) => addTrack(s, i === (item.subtitles.length - 1)));
    state.subtitle = item.subtitles && item.subtitles.length ? item.subtitles.length - 1 : -1;
    const saved = at == null ? resumeList()[resumeKey(item)] : null;
    const start = at != null ? at : saved ? saved.t : 0;
    if (start) video.addEventListener('loadedmetadata', () => { video.currentTime = start; }, { once: true });
    if (saved && !auto) Suite.shell.toast(t('mp.resumed', fmtTime(saved.t)));
    if (!paused) video.play().catch((e) => { if (e && e.name === 'NotAllowedError') { state.playing = false; render(); } });
    if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
      const cover = coverUrl(item);
      navigator.mediaSession.metadata = new MediaMetadata({ title: item.title || item.name, artist: item.artist || '', album: item.album || '', artwork: cover ? [{ src: cover }] : [] });
    }
    document.title = `${label(item)} – ${t('app.title')}`;
    render();
    scrollToCurrent();
  }

  function next(auto = false) {
    const seq = sequence();
    if (!seq.length) return;
    const at = seq.indexOf(state.current);
    if (at + 1 < seq.length) { play(seq[at + 1], { auto }); return; }
    if (state.repeat === 'all' || !auto) {
      if (state.shuffle && auto) reshuffle();
      play(sequence()[0], { auto });
      return;
    }
    state.playing = false; // end of the playlist
    render();
  }

  function previous() {
    if (video.currentTime > 3) { video.currentTime = 0; return; }
    const seq = sequence();
    const at = seq.indexOf(state.current);
    play(seq[at > 0 ? at - 1 : seq.length - 1]);
  }

  function togglePlay() {
    if (state.current < 0 || !video.getAttribute('src')) {
      const first = sequence()[0];
      if (first !== undefined) play(first);
      return;
    }
    if (video.paused) video.play().catch(() => {}); else video.pause();
  }

  function stop() {
    video.pause();
    if (video.getAttribute('src')) video.currentTime = 0;
    render();
  }

  function seekBy(seconds) {
    if (!isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }

  function setVolume(v) {
    state.volume = Math.max(0, Math.min(1, v));
    video.volume = state.volume;
    if (state.volume > 0 && state.muted) { state.muted = false; video.muted = false; }
    savePrefs();
    render();
  }

  function toggleMute() { state.muted = !state.muted; video.muted = state.muted; savePrefs(); render(); }

  function setRate(rate) {
    state.rate = Math.max(0.25, Math.min(4, rate));
    video.playbackRate = state.rate;
    savePrefs();
    render();
  }

  function cycleRepeat() {
    state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
    savePrefs();
    render();
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    if (state.shuffle) reshuffle();
    savePrefs();
    render();
  }

  async function toggleFullscreen() {
    const el = document.querySelector('.mp-player');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (el && el.requestFullscreen) await el.requestFullscreen();
    } catch (e) { /* not allowed (e.g. iframe) */ }
  }

  async function togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  if ('mediaSession' in navigator) {
    const handlers = {
      play: () => video.play(), pause: () => video.pause(), stop, previoustrack: previous, nexttrack: () => next(),
      seekbackward: () => seekBy(-10), seekforward: () => seekBy(10), seekto: (d) => { video.currentTime = d.seekTime; },
    };
    for (const [action, fn] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) { /* unsupported action */ } }
  }

  // ---- subtitles ----------------------------------------------------------------------------------

  function addTrack(sub, show) {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = sub.label;
    track.src = sub.url;
    if (show) track.default = true;
    video.appendChild(track);
  }

  function updateSubtitleMode() {
    [...video.textTracks].forEach((track, i) => { track.mode = i === state.subtitle ? 'showing' : 'disabled'; });
  }

  async function loadSubtitle(file, item) {
    let text = await file.text();
    if (ext(file.name) === 'srt') text = MP.srtToVtt(text);
    const sub = { label: file.name.replace(/\.(srt|vtt)$/i, ''), url: URL.createObjectURL(new Blob([text], { type: 'text/vtt' })) };
    item.subtitles = [...(item.subtitles || []), sub];
    if (item === state.items[state.current]) {
      addTrack(sub, true);
      state.subtitle = item.subtitles.length - 1;
      setTimeout(updateSubtitleMode, 0);
    }
    Suite.shell.toast(t('mp.subtitleLoaded', sub.label));
    render();
  }

  // ---- adding files -------------------------------------------------------------------------------

  const stem = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();

  function newItem(props) {
    return { id: nextId++, name: props.name, duration: null, ...props };
  }

  /** Add media, playlist and subtitle files (and URLs); playlist entries are matched with the added files by name. */
  async function addFiles(files, { playFirst = false } = {}) {
    const playlists = files.filter((f) => PLAYLIST_EXT.includes(ext(f.name)));
    const subtitles = files.filter((f) => SUBTITLE_EXT.includes(ext(f.name)));
    // .m3u has the MIME type audio/x-mpegurl, so playlists and subtitles are excluded explicitly
    const media = files.filter((f) => !playlists.includes(f) && !subtitles.includes(f) && (MEDIA_EXT.includes(ext(f.name)) || /^(audio|video)\//.test(f.type)));
    const byName = new Map(media.map((f) => [f.name.toLowerCase(), f]));
    const used = new Set();
    const added = [];

    for (const pl of playlists) {
      for (const entry of MP.parsePlaylist(await pl.text(), pl.name)) {
        if (/^(https?|rtsp|blob|data):/i.test(entry.location)) {
          added.push(newItem({ name: MP.baseName(entry.location) || entry.location, url: entry.location, title: entry.title, duration: entry.duration }));
          continue;
        }
        const name = MP.baseName(entry.location);
        const file = byName.get(name.toLowerCase());
        if (file) used.add(file);
        // the real duration of a file is probed; the playlist value is only shown while the file is missing
        added.push(newItem({ name, path: entry.location, file: file || null, missing: !file, playlistTitle: entry.title, duration: file ? null : entry.duration }));
      }
    }
    for (const file of media) {
      if (used.has(file)) continue;
      // fill an item of an earlier playlist that waits for this file
      const waiting = state.items.find((i) => i.missing && i.name.toLowerCase() === file.name.toLowerCase());
      if (waiting) { Object.assign(waiting, { file, missing: false, duration: null, probed: false }); readTags(waiting); continue; }
      added.push(newItem({ name: file.name, file }));
    }
    if (!playlists.length) added.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    const firstNew = state.items.length;
    state.items.push(...added);
    if (state.shuffle) reshuffle();
    for (const item of added) {
      if (item.missing && item.playlistTitle) item.title = item.playlistTitle;
      if (item.file) readTags(item);
    }
    probeDurations();

    for (const sub of subtitles) {
      // movie.srt belongs to movie.mp4; otherwise to the current (or first new) item
      const target = state.items.find((i) => i.file && stem(i.name) === stem(sub.name)) || state.items[state.current] || state.items[firstNew];
      if (target) await loadSubtitle(sub, target);
    }
    if (!added.length && !subtitles.length && !media.length) Suite.shell.toast(t('mp.noMedia'), 'warning');
    if ((playFirst || state.current < 0) && added.length) {
      const first = added.find((i) => !i.missing);
      if (first) play(state.items.indexOf(first));
    }
    render();
  }

  async function readTags(item) {
    const tags = await MP.readTags(item.file);
    Object.assign(item, tags);
    if (!item.title && item.playlistTitle) item.title = item.playlistTitle;
    render();
  }

  // durations: one hidden element probes the items one after another
  const probe = document.createElement('audio');
  probe.preload = 'metadata';
  let probing = false;
  async function probeDurations() {
    if (probing) return;
    probing = true;
    try {
      for (;;) {
        const item = state.items.find((i) => i.file && i.duration == null && !i.probed);
        if (!item) break;
        item.probed = true;
        const url = URL.createObjectURL(item.file);
        item.duration = await new Promise((resolve) => {
          const done = () => { probe.onloadedmetadata = probe.onerror = null; resolve(isFinite(probe.duration) ? probe.duration : null); };
          probe.onloadedmetadata = done;
          probe.onerror = done;
          setTimeout(done, 5000);
          probe.src = url;
        });
        probe.removeAttribute('src');
        URL.revokeObjectURL(url);
        render();
      }
    } finally { probing = false; }
  }

  function pickFiles(folder) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (folder) input.webkitdirectory = true;
    else input.accept = [...MEDIA_EXT, ...PLAYLIST_EXT, ...SUBTITLE_EXT].map((e) => `.${e}`).join(',') + ',audio/*,video/*';
    input.style.display = 'none';
    input.addEventListener('change', () => { const files = [...input.files]; input.remove(); if (files.length) addFiles(files); });
    input.addEventListener('cancel', () => input.remove());
    document.body.appendChild(input);
    input.click();
  }

  function addUrl(url) {
    url = url.trim();
    if (!url) return;
    if (!/^[a-z]+:/i.test(url)) url = `https://${url}`;
    const item = newItem({ name: MP.baseName(url) || url, url });
    state.items.push(item);
    if (state.shuffle) reshuffle();
    play(state.items.length - 1);
  }

  function removeItem(index) {
    const [item] = state.items.splice(index, 1);
    if (item.coverUrl) URL.revokeObjectURL(item.coverUrl);
    if (index === state.current) { video.pause(); video.removeAttribute('src'); video.load(); state.current = -1; document.title = t('app.title'); } else if (index < state.current) state.current--;
    if (state.shuffle) reshuffle();
    render();
  }

  async function clearPlaylist() {
    if (!state.items.length || !(await Suite.shell.confirm(t('mp.clearConfirm')))) return;
    for (const item of state.items) if (item.coverUrl) URL.revokeObjectURL(item.coverUrl);
    state.items = [];
    state.current = -1;
    state.order = [];
    video.pause();
    video.removeAttribute('src');
    video.load();
    document.title = t('app.title');
    render();
  }

  function move(from, to) {
    if (to < 0 || to >= state.items.length || from === to) return;
    const current = state.items[state.current];
    const [item] = state.items.splice(from, 1);
    state.items.splice(to, 0, item);
    state.current = current ? state.items.indexOf(current) : -1;
    if (state.shuffle) reshuffle();
    render();
  }

  async function savePlaylist() {
    const text = MP.writeM3U(state.items);
    try {
      const result = await Suite.files.saveAs(new TextEncoder().encode(text), { suggestedName: 'playlist.m3u8', type: 'audio/x-mpegurl', types: [{ description: 'M3U8', accept: { 'audio/x-mpegurl': ['.m3u8'] } }] });
      if (result) Suite.shell.toast(result.message);
    } catch (e) { Suite.shell.toast(Suite.i18n.describe(e), 'error'); }
  }

  function scrollToCurrent() {
    requestAnimationFrame(() => { const el = document.querySelector('.mp-list li.current'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); });
  }

  // drag & drop of files and folders
  async function readDropped(dataTransfer) {
    const entries = [...dataTransfer.items].map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));
    if (!entries.some(Boolean)) return [...dataTransfer.files];
    const files = [];
    const walk = async (entry) => {
      if (!entry) return;
      if (entry.isFile) files.push(await new Promise((res, rej) => entry.file(res, rej)));
      else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (;;) {
          const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          if (!batch.length) break;
          for (const child of batch) await walk(child);
        }
      }
    };
    for (const entry of entries) await walk(entry);
    return files;
  }
  document.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  document.addEventListener('drop', async (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length) return;
    e.preventDefault();
    addFiles(await readDropped(e.dataTransfer));
  });

  // ---- UI -----------------------------------------------------------------------------------------

  function Toolbar() {
    return html`<nav class="mp-toolbar" role="toolbar">
      <button class="secondary" data-testid="open" onClick=${() => pickFiles(false)}>${t('mp.open')}</button>
      <button class="secondary outline" data-testid="open-folder" onClick=${() => pickFiles(true)}>${t('mp.openFolder')}</button>
      <button class="secondary outline" data-testid="open-url" onClick=${() => { state.urlDialog = true; render(); }}>${t('mp.openUrl')}</button>
      <button class="secondary outline" data-testid="save-playlist" disabled=${!state.items.length} onClick=${savePlaylist}>${t('mp.savePlaylist')}</button>
      <button class=${`secondary ${state.showPlaylist ? '' : 'outline'}`} data-testid="toggle-playlist" aria-pressed=${state.showPlaylist}
        onClick=${() => { state.showPlaylist = !state.showPlaylist; savePrefs(); render(); }}>☰ ${t('mp.playlist')}</button>
    </nav>`;
  }

  function Stage() {
    const item = state.items[state.current];
    const isVideo = video.videoWidth > 0;
    const cover = item && !isVideo ? coverUrl(item) : null;
    return html`<div class="mp-stage" onClick=${(e) => { if (e.target === video || e.target.closest('.mp-info')) togglePlay(); }} onDblClick=${toggleFullscreen}>
      <div class="mp-video" ref=${(el) => { if (el && video.parentNode !== el) el.appendChild(video); }}></div>
      ${!isVideo ? html`<div class="mp-info" data-testid="now-playing">
        ${cover ? html`<img src=${cover} alt="" data-testid="cover" />` : html`<div class="mp-note">${item ? '♪' : '▶'}</div>`}
        ${item ? html`<strong data-testid="now-title">${item.title || item.name}</strong>${item.artist ? html`<span data-testid="now-artist">${item.artist}</span>` : null}${item.album ? html`<small>${item.album}</small>` : null}`
          : html`<p>${state.items.length ? t('mp.nothing') : t('mp.empty')}</p>`}
      </div>` : null}
    </div>`;
  }

  function Controls() {
    const duration = isFinite(video.duration) ? video.duration : 0;
    const subs = (state.items[state.current] || {}).subtitles || [];
    return html`<div class="mp-controls" data-testid="controls">
      <div class="mp-seek">
        <span data-testid="time">${fmtTime(video.currentTime)}</span>
        <input type="range" min="0" max=${duration || 0} step="0.1" value=${video.currentTime} disabled=${!duration} data-testid="seek" aria-label="seek"
          onInput=${(e) => { video.currentTime = +e.target.value; }} />
        <span data-testid="duration">${fmtTime(duration || NaN)}</span>
      </div>
      <div class="mp-buttons">
        <button class="secondary outline" title=${t('mp.previous')} data-testid="previous" onClick=${previous}>⏮</button>
        <button class="mp-play" title=${state.playing ? t('mp.pause') : t('mp.play')} data-testid="play" onClick=${togglePlay}>${state.playing ? '⏸' : '▶'}</button>
        <button class="secondary outline" title=${t('mp.stop')} data-testid="stop" onClick=${stop}>⏹</button>
        <button class="secondary outline" title=${t('mp.next')} data-testid="next" onClick=${() => next()}>⏭</button>
        <button class=${`secondary ${state.ab ? '' : 'outline'}`} title=${state.ab ? (state.ab.b == null ? t('mp.abA', fmtTime(state.ab.a)) : t('mp.abOn', fmtTime(state.ab.a), fmtTime(state.ab.b))) : t('mp.ab')}
          data-testid="ab" data-state=${state.ab ? (state.ab.b == null ? 'a' : 'ab') : 'off'} disabled=${!duration} onClick=${cycleAb}>${state.ab ? (state.ab.b == null ? 'A–' : 'A–B ✓') : 'A–B'}</button>
        ${video.videoWidth ? html`<button class="secondary outline" title=${t('mp.frameBack')} data-testid="frame-back" onClick=${() => stepFrame(-1)}>⏴</button>
          <button class="secondary outline" title=${t('mp.frameForward')} data-testid="frame-forward" onClick=${() => stepFrame(1)}>⏵</button>
          <button class="secondary outline" title=${t('mp.snapshot')} data-testid="snapshot" onClick=${snapshot}>📷</button>` : null}
        <span class="mp-gap"></span>
        <button class=${`secondary ${state.shuffle ? '' : 'outline'}`} title=${t('mp.shuffle')} aria-pressed=${state.shuffle} data-testid="shuffle" onClick=${toggleShuffle}>🔀</button>
        <button class=${`secondary ${state.repeat === 'off' ? 'outline' : ''}`} title=${t(`mp.repeat${state.repeat[0].toUpperCase()}${state.repeat.slice(1)}`)} data-testid="repeat" data-mode=${state.repeat} onClick=${cycleRepeat}>${state.repeat === 'one' ? '🔂' : '🔁'}</button>
        <select class="mp-rate" title=${t('mp.speed')} data-testid="rate" onChange=${(e) => setRate(+e.target.value)}>
          ${RATES.map((r) => html`<option value=${r} selected=${state.rate === r}>${r}×</option>`)}
        </select>
        ${subs.length ? html`<select class="mp-subs" title=${t('mp.subtitles')} data-testid="subtitle" onChange=${(e) => { state.subtitle = +e.target.value; updateSubtitleMode(); render(); }}>
          <option value="-1" selected=${state.subtitle < 0}>${t('mp.subtitlesOff')}</option>
          ${subs.map((s, i) => html`<option value=${i} selected=${state.subtitle === i}>${s.label}</option>`)}</select>` : null}
        <span class="mp-gap"></span>
        <button class=${`secondary ${state.eq.on ? '' : 'outline'}`} title=${t('mp.eq')} data-testid="eq" aria-pressed=${state.eq.open} onClick=${() => { state.eq.open = !state.eq.open; render(); }}>🎚</button>
        <button class="secondary outline" title=${state.muted ? t('mp.unmute') : t('mp.mute')} data-testid="mute" onClick=${toggleMute}>${state.muted || state.volume === 0 ? '🔇' : '🔊'}</button>
        <input type="range" class="mp-volume" min="0" max="1" step="0.01" value=${state.muted ? 0 : state.volume} aria-label=${t('mp.volume')} data-testid="volume"
          onInput=${(e) => setVolume(+e.target.value)} />
        ${document.pictureInPictureEnabled ? html`<button class="secondary outline" title=${t('mp.pip')} data-testid="pip" disabled=${!video.videoWidth} onClick=${togglePip}>⧉</button>` : null}
        <button class="secondary outline" title=${t('mp.fullscreen')} data-testid="fullscreen" onClick=${toggleFullscreen}>⛶</button>
      </div>
    </div>`;
  }

  function EqPanel() {
    if (!state.eq.open) return null;
    const preset = Object.keys(PRESETS).find((k) => PRESETS[k].every((v, i) => v === state.eq.gains[i])) || 'custom';
    return html`<div class="mp-eq" data-testid="eq-panel">
      <div class="mp-eq-head">
        <label class="mp-eq-check"><input type="checkbox" data-testid="eq-on" checked=${state.eq.on} onChange=${(e) => setEq({ on: e.target.checked })} /> ${t('mp.eqOn')}</label>
        <select data-testid="eq-preset" aria-label=${t('mp.preset')} onChange=${(e) => { if (PRESETS[e.target.value]) setEq({ gains: [...PRESETS[e.target.value]], on: true }); }}>
          ${[...Object.keys(PRESETS), 'custom'].map((k) => html`<option value=${k} selected=${preset === k} disabled=${k === 'custom'}>${t(`mp.p.${k}`)}</option>`)}</select>
        <label class="mp-eq-check"><input type="checkbox" data-testid="eq-normalize" checked=${state.eq.normalize} onChange=${(e) => setEq({ normalize: e.target.checked, on: e.target.checked || state.eq.on })} /> ${t('mp.normalize')}</label>
      </div>
      <div class="mp-eq-bands">${BANDS.map((f, i) => html`<label class="mp-eq-band" title=${`${state.eq.gains[i] > 0 ? '+' : ''}${state.eq.gains[i]} dB`}>
        <input type="range" min="-12" max="12" step="1" orient="vertical" data-testid=${`eq-band-${i}`} value=${state.eq.gains[i]}
          onInput=${(e) => { const gains = [...state.eq.gains]; gains[i] = +e.target.value; setEq({ gains, on: true }); }} />
        <small>${f >= 1000 ? `${f / 1000}k` : f}</small></label>`)}</div>
      <small class="mp-eq-hint">${t('mp.eqLocal')}</small>
    </div>`;
  }

  /** Albums of the playlist (artist – album, with cover) for the album view. */
  function albums() {
    const map = new Map();
    state.items.forEach((item, index) => {
      const key = item.album ? `${item.albumArtist || item.artist || ''}\u0000${item.album}` : '';
      if (!map.has(key)) map.set(key, { key, album: item.album || '', artist: item.albumArtist || item.artist || '', items: [], cover: null });
      const a = map.get(key);
      a.items.push(index);
      if (!a.cover) a.cover = coverUrl(item);
    });
    return [...map.values()].sort((a, b) => (a.key === '') - (b.key === '') || a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album));
  }

  function AlbumView() {
    return html`<div class="mp-albums" data-testid="albums">${albums().map((a) => html`<button class="mp-album" data-testid="album" onClick=${() => play(a.items[0])}>
      ${a.cover ? html`<img src=${a.cover} alt="" />` : html`<span class="mp-album-note">♪</span>`}
      <strong>${a.album || t('mp.unknownAlbum')}</strong><small>${a.artist}${a.artist ? ' · ' : ''}${t('mp.tracks', a.items.length)}</small></button>`)}</div>`;
  }

  function Playlist() {
    if (!state.showPlaylist) return null;
    const q = state.filter.trim().toLowerCase();
    const total = state.items.reduce((n, i) => n + (i.duration || 0), 0);
    return html`<aside class="mp-playlist" data-testid="playlist">
      <div class="mp-pl-head">
        <input type="search" placeholder=${t('mp.filter')} value=${state.filter} data-testid="filter" onInput=${(e) => { state.filter = e.target.value; render(); }} />
        <button class="secondary outline" data-testid="clear" disabled=${!state.items.length} onClick=${clearPlaylist}>${t('mp.clear')}</button>
        <button class="secondary outline" data-testid="view" title=${state.view === 'list' ? t('mp.albumView') : t('mp.listView')}
          onClick=${() => { state.view = state.view === 'list' ? 'albums' : 'list'; savePrefs(); render(); }}>${state.view === 'list' ? '▦' : '☰'}</button>
      </div>
      ${state.view === 'albums' ? html`<${AlbumView} />` : null}
      <ol class="mp-list" hidden=${state.view === 'albums'}>${state.items.map((item, index) => {
        if (q && !`${label(item)} ${item.album || ''}`.toLowerCase().includes(q)) return null;
        const cls = [index === state.current ? 'current' : '', item.missing ? 'missing' : '', item.error ? 'error' : '', state.dragging === index ? 'dragging' : ''].join(' ');
        return html`<li key=${item.id} class=${cls} data-testid="item" draggable="true"
            onDblClick=${() => play(index)}
            onDragStart=${(e) => { state.dragging = index; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)); }}
            onDragOver=${(e) => { if (state.dragging != null) { e.preventDefault(); e.stopPropagation(); } }}
            onDrop=${(e) => { if (state.dragging != null) { e.preventDefault(); e.stopPropagation(); move(state.dragging, index); state.dragging = null; } }}
            onDragEnd=${() => { state.dragging = null; render(); }}>
          <button class="mp-item" data-testid="item-play" onClick=${(e) => { if (e.detail === 0 || coarse.matches) play(index); }}>
            <span class="mp-item-title" data-testid="item-title">${index === state.current ? (state.playing ? '▶ ' : '❚❚ ') : ''}${label(item)}</span>
            <span class="mp-item-time" data-testid="item-duration">${item.duration ? fmtTime(item.duration) : ''}</span>
          </button>
          <span class="mp-item-actions">
            <button class="secondary outline" title=${t('mp.moveUp')} data-testid="item-up" onClick=${() => move(index, index - 1)}>↑</button>
            <button class="secondary outline" title=${t('mp.moveDown')} data-testid="item-down" onClick=${() => move(index, index + 1)}>↓</button>
            <button class="secondary outline" title=${t('mp.remove')} data-testid="item-remove" onClick=${() => removeItem(index)}>×</button>
          </span>
        </li>`;
      })}</ol>
      <p class="mp-pl-foot" data-testid="playlist-summary">${t('mp.items', state.items.length)}${total ? ` · ${t('mp.total', fmtTime(total))}` : ''}</p>
    </aside>`;
  }

  function UrlDialog() {
    if (!state.urlDialog) return null;
    return html`<dialog open data-testid="url-dialog"><article>
      <form onSubmit=${(e) => { e.preventDefault(); state.urlDialog = false; addUrl(e.target.elements.url.value); }}>
        <label>${t('mp.url')}<input name="url" type="url" inputmode="url" data-testid="url" placeholder="https://…" autofocus /></label>
        <footer>
          <button type="button" class="secondary" onClick=${() => { state.urlDialog = false; render(); }}>${t('mp.cancel')}</button>
          <button type="submit" data-testid="url-add">${t('mp.add')}</button>
        </footer>
      </form>
    </article></dialog>`;
  }

  function Main() {
    return html`<div class=${`mp-layout ${state.showPlaylist ? 'with-playlist' : ''}`}>
      <section class="mp-player"><${Stage} /><${Controls} /><${EqPanel} /></section>
      <${Playlist} />
      <${UrlDialog} />
    </div>`;
  }

  const coarse = window.matchMedia('(pointer: coarse)');

  Suite.shell.mount({ id: APP, title: 'app.title', version: '%%BUILD_VERSION%%', toolbar: () => html`<${Toolbar} />`, main: () => html`<${Main} />` });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' && !['range', 'checkbox', 'button'].includes(document.activeElement.type) || tag === 'TEXTAREA' || tag === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(false); return; }
    if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); state.urlDialog = true; render(); return; }
    if (typing || mod || e.altKey || state.urlDialog || document.querySelector('[data-testid=confirm]')) return;
    const keys = {
      ' ': togglePlay, k: togglePlay, ArrowLeft: () => seekBy(e.shiftKey ? -60 : -5), ArrowRight: () => seekBy(e.shiftKey ? 60 : 5),
      ArrowUp: () => setVolume(state.volume + 0.05), ArrowDown: () => setVolume(state.volume - 0.05), m: toggleMute, f: toggleFullscreen,
      n: () => next(), p: previous, s: stop, '[': () => setRate(state.rate - 0.25), ']': () => setRate(state.rate + 0.25), '=': () => setRate(1),
      ',': () => stepFrame(-1), '.': () => stepFrame(1), l: cycleAb,
      v: () => { const n = (state.items[state.current] || {}).subtitles?.length || 0; if (n) { state.subtitle = state.subtitle + 1 >= n ? -1 : state.subtitle + 1; updateSubtitleMode(); render(); } },
    };
    const fn = keys[e.key] || keys[e.key.toLowerCase()];
    if (fn) { e.preventDefault(); fn(); }
  });

  Suite.bridge.receive((picked) => addFiles([picked.file], { playFirst: true }), { app: 'mediaplayer' }); // files opened from other apps ("Open with…")

  // for tests
  MP.app = { state, get video() { return video; }, addFiles, play, next, previous, setEq, get graph() { return graph; } };
  document.body.dataset.ready = 'true';
})();
