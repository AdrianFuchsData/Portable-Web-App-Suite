/*
 * Playlist files and subtitles of the media player.
 *
 *   MP.parsePlaylist(text, name)  -> [{ location, title, duration }]   (M3U/M3U8, PLS, XSPF)
 *   MP.writeM3U(items)            -> text (#EXTM3U with #EXTINF; local files by name, streams by URL)
 *   MP.srtToVtt(text)             -> WebVTT text
 */
(function (MP) {
  'use strict';

  function parseM3U(text) {
    const items = [];
    let info = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        const m = /^#EXTINF:(-?[\d.]+)[^,]*,(.*)$/.exec(line);
        info = m ? { duration: parseFloat(m[1]) > 0 ? parseFloat(m[1]) : null, title: m[2].trim() || null } : null;
      } else if (!line.startsWith('#')) {
        items.push({ location: line, title: info ? info.title : null, duration: info ? info.duration : null });
        info = null;
      }
    }
    return items;
  }

  function parsePLS(text) {
    const values = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(File|Title|Length)(\d+)\s*=\s*(.*)$/i.exec(line);
      if (m) (values[m[2]] = values[m[2]] || {})[m[1].toLowerCase()] = m[3].trim();
    }
    return Object.keys(values).sort((a, b) => a - b).filter((k) => values[k].file)
      .map((k) => ({ location: values[k].file, title: values[k].title || null, duration: parseFloat(values[k].length) > 0 ? parseFloat(values[k].length) : null }));
  }

  function parseXSPF(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) return [];
    const child = (el, name) => { const c = [...el.children].find((x) => x.localName === name); return c ? c.textContent.trim() : null; };
    return [...doc.getElementsByTagNameNS('*', 'track')].map((track) => {
      let location = child(track, 'location') || '';
      if (location.startsWith('file://')) { try { location = decodeURIComponent(new URL(location).pathname); } catch (e) { /* keep */ } }
      const ms = parseFloat(child(track, 'duration'));
      const creator = child(track, 'creator');
      const title = child(track, 'title');
      return { location, title: title && creator ? `${creator} - ${title}` : title, duration: ms > 0 ? ms / 1000 : null };
    }).filter((t) => t.location);
  }

  function parsePlaylist(text, name = '') {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pls') || /^\s*\[playlist\]/i.test(text)) return parsePLS(text);
    if (lower.endsWith('.xspf') || /^\s*(<\?xml[^>]*>\s*)?<playlist/i.test(text)) return parseXSPF(text);
    return parseM3U(text);
  }

  function writeM3U(items) {
    const lines = ['#EXTM3U'];
    for (const item of items) {
      const title = [item.artist, item.title].filter(Boolean).join(' - ') || item.name;
      lines.push(`#EXTINF:${item.duration ? Math.round(item.duration) : -1},${title}`);
      lines.push(item.url || item.path || item.name);
    }
    return `${lines.join('\n')}\n`;
  }

  function srtToVtt(text) {
    const body = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
      .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') // 00:00:01,000 -> 00:00:01.000
      .replace(/^\d+\n(?=\d{1,2}:\d{2}:\d{2}\.\d{3} -->)/gm, ''); // cue numbers are optional in WebVTT; drop them
    return `WEBVTT\n\n${body.trim()}\n`;
  }

  /** The last path segment of a playlist location (Windows or Unix path, or URL). */
  function baseName(location) {
    let s = location;
    try { if (/^[a-z]+:\/\//i.test(s)) s = decodeURIComponent(new URL(s).pathname); } catch (e) { /* keep */ }
    return s.split(/[\\/]/).pop();
  }

  MP.parsePlaylist = parsePlaylist;
  MP.writeM3U = writeM3U;
  MP.srtToVtt = srtToVtt;
  MP.baseName = baseName;
})(window.MP = window.MP || {});
