"""Audio editor (apps/audioeditor): WAV files are generated and checked with the standard library (wave, struct)."""
import io
import math
import struct
import wave

from playwright.sync_api import expect

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"
FAKE_MIC = """
navigator.mediaDevices.getUserMedia = async () => {
  const ctx = new AudioContext(); await ctx.resume();
  const osc = ctx.createOscillator(); const dest = ctx.createMediaStreamDestination();
  osc.connect(dest); osc.start(); return dest.stream;
};
"""


def make_wav(path, seconds=1.0, rate=8000, channels=2, freq=440, amp=0.5, bits=16):
    n = int(seconds * rate)
    frames = bytearray()
    for i in range(n):
        v = amp * math.sin(2 * math.pi * freq * i / rate)
        for c in range(channels):
            s = v if c == 0 else v * 0.5
            if bits == 16:
                frames += struct.pack("<h", int(round(s * 32767)))
            else:
                x = int(round(s * 8388607))
                frames += struct.pack("<i", x)[:3]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(bits // 8)
        w.setframerate(rate)
        w.writeframes(bytes(frames))
    return path


def read_wav(data):
    with wave.open(io.BytesIO(data)) as w:
        return w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes(), w.readframes(w.getnframes())


def ready(app_page, **kw):
    page = app_page("audioeditor", init_script=NO_PICKERS + kw.pop("init_script", ""), **kw)
    expect(page.locator("[data-testid=empty]")).to_be_visible()
    return page


def open_files(page, *paths, button="open"):
    tracks = page.locator("[data-testid=track]")
    expected = len(paths) + (tracks.count() if button == "import" else 0)
    with page.expect_file_chooser() as chooser:
        page.click(f"[data-testid={button}]")
    chooser.value.set_files([str(p) for p in paths])
    expect(tracks).to_have_count(expected)  # files are decoded asynchronously


def track_lengths(page):
    return page.evaluate("AE.state.tracks.map((t) => AE.clips.trackEnd(t.clips))")


def wait_idle(page):
    page.wait_for_function("() => !AE.state.busy", timeout=60000)


def select(page, start, end):
    page.fill("[data-testid=sel-start]", str(start))
    page.press("[data-testid=sel-start]", "Enter")
    page.fill("[data-testid=sel-end]", str(end))
    page.press("[data-testid=sel-end]", "Enter")
    expect(page.locator("[data-testid=sel-length]")).to_have_text(AE_TIME(end - start))


def AE_TIME(s):
    m = int(s // 60)
    return f"{m}:{s - m * 60:06.3f}"


def save(page):
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    return open(d.value.path(), "rb").read(), d.value.suggested_filename


def test_open_delete_undo_save(app_page, tmp_path):
    src = make_wav(tmp_path / "ton.wav")
    page = ready(app_page)
    assert page.title() == "Audio editor"
    open_files(page, src)
    expect(page.locator("[data-testid=track]")).to_have_count(1)
    expect(page.locator("[data-testid=file-name]")).to_have_text("ton.wav")
    assert page.evaluate("AE.state.rate") == 8000 and track_lengths(page) == [8000]
    # the waveform is drawn
    assert page.evaluate("""() => { const c = document.querySelector('[data-testid=lane]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return set.size; }""") > 2
    select(page, 0.25, 0.5)
    page.click("[data-testid=delete]")
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")
    assert track_lengths(page) == [6000]
    page.click("[data-testid=undo]")
    assert track_lengths(page) == [8000]
    page.click("[data-testid=redo]")
    assert track_lengths(page) == [6000]
    data, name = save(page)
    assert name == "ton.wav"
    ch, width, rate, n, frames = read_wav(data)
    assert (ch, width, rate, n) == (2, 2, 8000, 6000)
    original = read_wav(src.read_bytes())[4]
    assert frames == original[:2000 * 4] + original[4000 * 4:]
    expect(page.locator("[data-testid=file-name]")).not_to_contain_text("•")
    assert page.errors == [] and page.requests == []


def test_mouse_selection_copy_paste_and_tracks(app_page, tmp_path):
    a = make_wav(tmp_path / "a.wav")
    b = make_wav(tmp_path / "b.wav", seconds=0.5, rate=16000, channels=1, freq=1000)
    page = ready(app_page)
    open_files(page, a)
    open_files(page, b, button="import")
    expect(page.locator("[data-testid=track]")).to_have_count(2)
    assert track_lengths(page) == [8000, 4000]  # resampled to the project rate
    lane = page.locator("[data-testid=lane]").first
    box = lane.bounding_box()
    second = page.locator("[data-testid=lane]").nth(1).bounding_box()
    page.mouse.move(box["x"] + 10, box["y"] + 40)  # below the clip title bar (dragging that moves the clip)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.3, second["y"] + 40, steps=6)
    page.mouse.up()
    sel = page.evaluate("[AE.state.sel.start, AE.state.sel.end, AE.state.selTracks.size]")
    assert sel[1] > sel[0] and sel[2] == 2
    page.locator("[data-testid=track-head]").first.click(position={"x": 5, "y": 60})
    select(page, 0, 0.25)
    page.click("[data-testid=copy]")
    select(page, 1, 1)
    page.click("[data-testid=paste]")
    assert track_lengths(page) == [10000, 4000]
    # with both tracks selected: two clipboard parts paste into two tracks
    page.keyboard.press("Control+a")
    page.click("[data-testid=undo]")
    assert track_lengths(page) == [8000, 4000]
    page.click("[data-testid=track-mute]")
    page.locator("[data-testid=track-pan]").nth(1).fill("1")
    page.click("[data-testid=tracks-menu]")
    page.click("[data-testid=menu-mixdown]")
    expect(page.locator("[data-testid=track]")).to_have_count(1)
    mixed = page.evaluate("(() => { const a = AE.trackAudio(AE.state.tracks[0]); return [a.channels.length, AE.dsp.length(a), AE.dsp.peak({rate: 8000, channels: [a.channels[0]]}), AE.dsp.peak({rate: 8000, channels: [a.channels[1]]})]; })()")
    assert mixed[0] == 2 and mixed[1] == 8000
    assert mixed[2] < 0.01 and mixed[3] > 0.6  # first track muted, second panned right (equal-power: 0.5 * sqrt 2)


def test_effects(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "fx.wav", channels=1))
    peak = lambda: page.evaluate("AE.dsp.peak(AE.trackAudio(AE.state.tracks[0]))")

    def fx(name, **params):
        before = page.evaluate("AE.state.history.length")
        page.click("[data-testid=effects]")
        page.click(f"[data-testid=menu-{name}]")
        if params:
            for k, v in params.items():
                page.fill(f"[data-testid=param-{k}]", str(v))
            page.click("[data-testid=param-ok]")
        for _ in range(100):  # effects that render with the Web Audio API finish asynchronously
            if page.evaluate("!AE.state.busy && AE.state.history.length") == before + 1:
                break
            page.wait_for_timeout(50)

    assert abs(peak() - 0.5) < 0.01
    fx("amplify", db=-6.0206)
    assert abs(peak() - 0.25) < 0.005
    fx("normalize", db=0)
    assert abs(peak() - 1) < 0.001
    fx("fadeIn")
    assert page.evaluate("Math.abs(AE.trackAudio(AE.state.tracks[0]).channels[0][2]) < 0.002")  # starts from silence
    fx("reverse")
    fx("invert")
    fx("echo", delay=0.1, decay=0.3)
    select(page, 0, 0.5)
    fx("speed", factor=2)
    assert track_lengths(page) == [6000]
    fx("lowpass", hz=300)
    fx("highpass", hz=100)
    assert track_lengths(page) == [6000]
    page.click("[data-testid=silence]")
    assert page.evaluate("AE.dsp.peak(AE.trackAudio(AE.state.tracks[0]), 0, 2000)") == 0
    for _ in range(10):
        page.click("[data-testid=undo]")
    assert abs(peak() - 0.5) < 0.01
    assert page.errors == []


def test_generate_and_export(app_page, tmp_path):
    page = ready(app_page)
    page.click("[data-testid=generate]")
    page.click("[data-testid=menu-tone]")
    page.select_option("[data-testid=param-wave]", "square")
    page.fill("[data-testid=param-seconds]", "0.5")
    page.fill("[data-testid=param-amplitude]", "0.5")
    page.click("[data-testid=param-ok]")
    expect(page.locator("[data-testid=track]")).to_have_count(1)
    assert page.evaluate("AE.state.rate") == 44100 and track_lengths(page) == [22050]
    select(page, 0.5, 0.5)
    page.click("[data-testid=generate]")
    page.click("[data-testid=menu-silenceGen]")
    page.fill("[data-testid=param-seconds]", "0.25")
    page.click("[data-testid=param-ok]")
    assert track_lengths(page) == [33075]
    select(page, 0, 0.1)
    page.click("[data-testid=export]")
    page.fill("[data-testid=export-name]", "rechteck")
    page.select_option("[data-testid=export-format]", "wav24")
    page.select_option("[data-testid=export-channels]", "stereo")
    page.select_option("[data-testid=export-range]", "selection")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename == "rechteck.wav"
    ch, width, rate, n, frames = read_wav(open(d.value.path(), "rb").read())
    assert (ch, width, rate, n) == (2, 3, 44100, 4410)
    first = int.from_bytes(frames[:3], "little", signed=True)
    assert first == 4194304
    expect(page.locator("[data-testid=file-name]")).to_contain_text("•")  # exporting a selection does not save the project
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "wav32")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    raw = open(d.value.path(), "rb").read()
    assert raw[20:22] == b"\x03\x00" and struct.unpack("<f", raw[44:48])[0] == 0.5  # IEEE float, mono
    expect(page.locator("[data-testid=file-name]")).to_have_text("Audio.wav")


def test_wav_24_bit_and_decoder(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "hd.wav", rate=48000, bits=24, seconds=0.25))
    assert page.evaluate("[AE.state.rate, AE.state.bits]") == [48000, 24]
    v = page.evaluate("AE.state.tracks[0].clips[0].audio.channels[0][12]")
    assert abs(v - 0.5 * math.sin(2 * math.pi * 440 * 12 / 48000)) < 1e-6
    data, _ = save(page)
    assert read_wav(data)[:4] == (2, 3, 48000, 12000)


def test_playback(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "p.wav", seconds=3))
    page.click("[data-testid=play]")
    expect(page.locator("[data-testid=pause]")).to_be_visible()
    for _ in range(50):
        if page.evaluate("AE.time") > 0.3:
            break
        page.wait_for_timeout(100)
    page.click("[data-testid=pause]")
    t = page.evaluate("AE.state.playhead")
    assert 0.3 < t < 3
    expect(page.locator("[data-testid=clock]")).not_to_have_text("0:00.000")
    select(page, 0.5, 0.7)
    page.click("[data-testid=loop]")
    page.click("[data-testid=play]")
    page.wait_for_timeout(700)
    # still playing after more than the selection's length: it loops inside the selection (the time may just pass the
    # end between two animation frames before the loop restarts)
    assert page.evaluate("AE.state.playing !== null && AE.state.playing.sel && Math.abs(AE.state.playing.from - 0.5) < 1e-6")
    assert page.evaluate("AE.time >= 0.5 && AE.time <= 0.75")
    page.keyboard.press(" ")
    expect(page.locator("[data-testid=play]")).to_be_visible()
    assert page.errors == []


def test_record(app_page):
    page = ready(app_page, init_script=FAKE_MIC)
    page.click("[data-testid=record]")
    expect(page.locator("[data-testid=record]")).to_contain_text("s")
    page.wait_for_timeout(1500)
    page.click("[data-testid=record]")
    expect(page.locator("[data-testid=track]")).to_have_count(1)
    length = page.evaluate("AE.dsp.duration(AE.trackAudio(AE.state.tracks[0]))")
    assert 0.5 < length < 3
    assert page.evaluate("AE.dsp.peak(AE.trackAudio(AE.state.tracks[0]))") > 0.1


def test_german_and_mobile(app_page, tmp_path):
    page = app_page("audioeditor", mobile=True, init_script="localStorage.setItem('suite.lang', 'de');" + NO_PICKERS)
    expect(page.locator("[data-testid=app-title]")).to_have_text("Audio-Editor")
    open_files(page, make_wav(tmp_path / "m.wav"))
    expect(page.locator("[data-testid=track]")).to_have_count(1)
    expect(page.locator("[data-testid=track-gain]")).to_be_visible()  # volume, balance and all track buttons fit
    expect(page.locator("[data-testid=track-duplicate]")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    lane = page.locator("[data-testid=lane]").bounding_box()
    page.touchscreen.tap(lane["x"] + lane["width"] / 2, lane["y"] + 30)
    assert page.evaluate("AE.state.sel.start") > 0.2
    assert page.errors == []


def make_clicks(path, bpm=120.0, offset=0.1, seconds=8.0, rate=16000):
    """A mono click track: noise bursts on every beat (accent on every fourth) with a quiet tone in between."""
    import random
    rnd = random.Random(7)
    n = int(seconds * rate)
    data = [0.05 * math.sin(2 * math.pi * 220 * i / rate) for i in range(n)]
    period = 60.0 / bpm * rate
    k, x = 0, offset * rate
    while x < n:
        amp = 0.9 if k % 4 == 0 else 0.6
        for j in range(int(rate * 0.03)):
            if int(x) + j < n:
                data[int(x) + j] += amp * rnd.uniform(-1, 1) * math.exp(-j / (rate * 0.005))
        k, x = k + 1, x + period
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(v * 32767)))) for v in data))
    return path


def lane_x(page, index, seconds):
    box = page.locator("[data-testid=lane]").nth(index).bounding_box()
    view = page.evaluate("[AE.state.view.start, AE.state.view.pps]")
    return box["x"] + (seconds - view[0]) * view[1], box["y"]


def drag_clip(page, index, at_seconds, by_seconds, to_lane=None, steps=8):
    """Drag the clip under at_seconds in lane `index` by its title bar."""
    x, y = lane_x(page, index, at_seconds)
    pps = page.evaluate("AE.state.view.pps")
    page.mouse.move(x, y + 5)
    page.mouse.down()
    ty = page.locator("[data-testid=lane]").nth(to_lane).bounding_box()["y"] + 30 if to_lane is not None else y + 5
    page.mouse.move(x + by_seconds * pps, ty, steps=steps)
    page.mouse.up()


def clip_offsets(page):
    return page.evaluate("AE.state.tracks.map((t) => AE.clips.sorted(t.clips).map((c) => c.offset))")


def test_clips_split_drag_snap_and_ripple(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "a.wav", seconds=2))
    open_files(page, make_wav(tmp_path / "b.wav", seconds=1), button="import")
    # split track 1 at 1 s: two clips
    page.locator("[data-testid=track-head]").first.click(position={"x": 5, "y": 60})
    select(page, 1, 1)
    page.click("[data-testid=split]")
    assert clip_offsets(page) == [[0, 8000], [0]]
    # drag the second clip by 0.5 s without snapping
    page.click("[data-testid=snap]")
    expect(page.locator("[data-testid=snap]")).to_have_attribute("aria-pressed", "false")
    drag_clip(page, 0, 1.3, 0.5)
    off = clip_offsets(page)[0][1]
    assert abs(off - 12000) < 8000 / page.evaluate("AE.state.view.pps") * 2  # within 2 pixels
    assert track_lengths(page)[0] == off + 8000
    # the gap is silence, the clip is picked and selected
    assert page.evaluate("AE.state.clip !== null") and abs(page.evaluate("AE.state.sel.start") - off / 8000) < 1e-9
    page.click("[data-testid=undo]")
    assert clip_offsets(page) == [[0, 8000], [0]]
    # with snapping: the clip of track 2 is moved into track 1, its start snaps to the end of track 1 (2 s)
    page.click("[data-testid=snap]")
    page.click("[data-testid=zoom-out]")  # the drop position must be inside the window
    drag_clip(page, 1, 0.2, 2.0 + 5 / page.evaluate("AE.state.view.pps"), to_lane=0)  # 5 pixels too far
    assert clip_offsets(page) == [[0, 8000, 16000], []]
    assert page.locator("[data-testid=track]").count() == 2
    # ripple delete: removing 0.25 s in track 1 moves the later clips to the left
    page.locator("[data-testid=track-head]").first.click(position={"x": 5, "y": 60})
    select(page, 0.25, 0.5)
    page.click("[data-testid=delete]")
    assert clip_offsets(page)[0] == [0, 6000, 14000]
    # clip menu: move by coordinates, duplicate, remove
    drag_clip(page, 0, 2.0, 0)  # a click on the title bar picks the clip
    assert page.evaluate("AE.state.clip && AE.state.tracks[0].clips.find((c) => c.id === AE.state.clip.id).offset") == 14000
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-moveTo]")
    page.fill("[data-testid=param-start]", "3")
    page.click("[data-testid=param-ok]")
    assert clip_offsets(page)[0] == [0, 6000, 24000]
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-duplicateClip]")
    assert clip_offsets(page)[0] == [0, 6000, 24000, 32000]
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-removeClip]")
    assert clip_offsets(page)[0] == [0, 6000, 24000]
    data, _ = save(page)
    assert read_wav(data)[3] == 32000
    assert page.errors == []


def test_beats_cues_alignment_and_tempo(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_clicks(tmp_path / "one.wav", offset=0.1), make_clicks(tmp_path / "two.wav", offset=0.37))
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-detectBeats]")
    wait_idle(page)
    grids = page.evaluate("AE.state.tracks.map((t) => t.clips[0].beats)")
    assert all(abs(g["bpm"] - 120) < 0.2 for g in grids), grids
    assert abs(grids[0]["phase"] / 16000 - 0.1) < 0.01 and abs(grids[1]["phase"] / 16000 - 0.37) < 0.01, grids
    # drag the second clip 4 pixels less than 0.23 s: its beats snap onto the beats of the first one
    while page.evaluate("AE.state.view.pps") < 100:  # on a phone the whole clip is 300 px wide: zoom in first
        page.click("[data-testid=zoom-in]")
    drag_clip(page, 1, 1.0, 0.23 - 4 / page.evaluate("AE.state.view.pps"))
    off = clip_offsets(page)[1][0]
    period = 16000 * 60 / grids[1]["bpm"]
    diff = (off + grids[1]["phase"] - grids[0]["phase"]) % period
    assert min(diff, period - diff) < 16, (off, grids)  # within 1 ms (the detected tempos differ slightly)
    # cues: the first sound and strong onsets
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-detectCues]")
    page.fill("[data-testid=param-minGap]", "1")
    page.click("[data-testid=param-ok]")
    wait_idle(page)
    cues = page.evaluate("AE.state.tracks[1].clips[0].cues")  # the picked clip
    assert len(cues) >= 4 and cues[0] < 10  # the background tone starts right away
    assert all(abs(((c / 16000 - 0.37) + 0.25) % 0.5 - 0.25) < 0.02 for c in cues[1:]), cues  # the others are clicks
    assert page.evaluate("AE.state.tracks[0].clips[0].cues") is None
    # match the tempo (keeps the pitch): 120 -> 100 BPM makes the clip 1.2 times longer
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-matchTempo]")
    page.fill("[data-testid=param-bpm]", "100")
    page.click("[data-testid=param-ok]")
    wait_idle(page)
    clip = page.evaluate("(() => { const c = AE.state.tracks[1].clips[0]; return { n: AE.clips.clipLength(c), beats: c.beats, cue: c.cues[0] }; })()")
    assert abs(clip["n"] - 8 * 16000 * 1.2) < 10 and clip["beats"]["bpm"] == 100
    assert clip["cue"] < 15
    redetected = page.evaluate("AE.beats.detectBeats(AE.dsp.mono(AE.state.tracks[1].clips[0].audio), 16000)")
    assert abs(redetected["bpm"] - 100) < 0.5
    # beat grid by numbers and beat at the cursor
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-beatGrid]")
    page.fill("[data-testid=param-bpm]", "50")
    page.click("[data-testid=param-ok]")
    assert page.evaluate("AE.state.tracks[1].clips[0].beats.bpm") == 50
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-clearMarkers]")
    assert page.evaluate("AE.state.tracks[1].clips[0].beats === undefined && AE.state.tracks[1].clips[0].cues === undefined")
    page.click("[data-testid=undo]")
    assert page.evaluate("AE.state.tracks[1].clips[0].beats.bpm") == 50
    assert page.errors == []


def test_compressed_export(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "ton.wav", seconds=1, rate=44100))
    page.click("[data-testid=export]")
    page.wait_for_selector("[data-testid=export-format] option[value=mp3]:not([disabled])", state="attached", timeout=30000)
    page.select_option("[data-testid=export-format]", "mp3")
    page.select_option("[data-testid=export-bitrate]", "128")
    with page.expect_download(timeout=60000) as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename == "ton.mp3"
    mp3 = open(d.value.path(), "rb").read()
    assert mp3[:3] == b"ID3" or (mp3[0] == 0xFF and mp3[1] & 0xE0 == 0xE0)
    assert 10000 < len(mp3) < 40000  # about 16 kB for one second at 128 kbit/s
    page.click("[data-testid=export]")
    page.wait_for_selector("[data-testid=export-format] option[value=flac]:not([disabled])", state="attached", timeout=30000)
    page.select_option("[data-testid=export-format]", "flac")
    with page.expect_download(timeout=60000) as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename == "ton.flac" and open(d.value.path(), "rb").read()[:4] == b"fLaC"
    if page.evaluate("!document.querySelector('[data-testid=export-format] option[value=ogg]')?.disabled"):
        page.click("[data-testid=export]")
        page.select_option("[data-testid=export-format]", "ogg")
        with page.expect_download(timeout=60000) as d:
            page.click("[data-testid=export-ok]")
        assert open(d.value.path(), "rb").read()[:4] == b"OggS"
    expect(page.locator("[data-testid=file-name]")).to_have_text("ton.wav")  # exports do not change the project file
    assert page.errors == []


def test_project_file_keeps_tracks_clips_and_beats(app_page, tmp_path):
    import json
    import zipfile
    page = ready(app_page)
    open_files(page, make_clicks(tmp_path / "beat.wav", offset=0.1, seconds=6))
    open_files(page, make_wav(tmp_path / "tone.wav", seconds=1, rate=16000, channels=2), button="import")
    # arrangement: split track 1 at 2 s and move the second part to 3 s; settings of track 2; a beat grid
    page.locator("[data-testid=track-head]").first.click(position={"x": 5, "y": 60})
    select(page, 2, 2)
    page.click("[data-testid=split]")
    drag_clip(page, 0, 2.5, 0)  # pick the second clip
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-moveTo]")
    page.fill("[data-testid=param-start]", "3")
    page.click("[data-testid=param-ok]")
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-detectBeats]")
    wait_idle(page)
    page.locator("[data-testid=track-mute]").nth(1).click()
    page.locator("[data-testid=track-pan]").nth(1).fill("-0.5")
    page.locator("[data-testid=track-name]").nth(1).fill("Ton")
    page.locator("[data-testid=track-name]").nth(1).press("Enter")
    before = page.evaluate("""AE.state.tracks.map((t) => ({ name: t.name, gain: t.gain, pan: t.pan, mute: t.mute,
      clips: AE.clips.sorted(t.clips).map((c) => [c.offset, AE.clips.clipLength(c), c.beats ? c.beats.bpm : null]) }))""")
    assert before[0]["clips"][1][0] == 3 * 16000 and before[0]["clips"][1][2] is not None

    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "project")
    expect(page.locator("[data-testid=export-channels]")).to_have_count(0)
    page.fill("[data-testid=export-name]", "song")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    assert d.value.suggested_filename == "song.audioproj"
    path = tmp_path / "song.audioproj"
    d.value.save_as(path)
    with zipfile.ZipFile(path) as z:
        meta = json.loads(z.read("project.json"))
        assert meta["format"] == "suite-audio-project" and meta["rate"] == 16000
        assert [len(t["clips"]) for t in meta["tracks"]] == [2, 1]
        assert meta["tracks"][1]["mute"] is True and meta["tracks"][1]["pan"] == -0.5 and meta["tracks"][1]["name"] == "Ton"
        assert sorted(n for n in z.namelist() if n.startswith("audio/")) == ["audio/1.wav", "audio/2.wav", "audio/3.wav"]
    expect(page.locator("[data-testid=file-name]")).to_have_text("song.audioproj")
    # "Save" keeps writing the project
    with page.expect_download() as d:
        page.click("[data-testid=save]")
    assert d.value.suggested_filename == "song.audioproj"

    # reopen
    page2 = ready(app_page)
    with page2.expect_file_chooser() as chooser:
        page2.click("[data-testid=open]")
    chooser.value.set_files(str(path))
    expect(page2.locator("[data-testid=track]")).to_have_count(2)
    after = page2.evaluate("""AE.state.tracks.map((t) => ({ name: t.name, gain: t.gain, pan: t.pan, mute: t.mute,
      clips: AE.clips.sorted(t.clips).map((c) => [c.offset, AE.clips.clipLength(c), c.beats ? c.beats.bpm : null]) }))""")
    assert after == before
    assert page2.evaluate("AE.state.rate") == 16000
    assert page.errors == [] and page2.errors == []


def test_labels(app_page, tmp_path):
    import json
    import zipfile
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "talk.wav", seconds=4, rate=8000))
    # a region label from the selection (Ctrl+B) and a point label by double-clicking the label strip
    select(page, 1, 2)
    page.evaluate("document.activeElement.blur()")  # keys go to the editor, not the time field
    page.keyboard.press("Control+b")
    page.fill("[data-testid=param-text]", "Intro")
    page.click("[data-testid=param-ok]")
    expect(page.locator("[data-testid=param-dialog]")).to_have_count(0)
    strip = page.locator("[data-testid=labels]")
    box = strip.bounding_box()
    pps = page.evaluate("AE.state.view.pps")
    start = page.evaluate("AE.state.view.start")
    page.mouse.dblclick(box["x"] + (3 - start) * pps, box["y"] + 8)
    page.fill("[data-testid=param-text]", "Chorus")
    page.click("[data-testid=param-ok]")
    expect(page.locator("[data-testid=param-dialog]")).to_have_count(0)
    labels = page.evaluate("AE.state.labels.map((l) => [l.start, l.end, l.text])")
    assert labels[0] == [1, 2, "Intro"] and labels[1][2] == "Chorus" and abs(labels[1][0] - 3) < 0.05 and labels[1][0] == labels[1][1]
    # clicking a label selects its region
    page.evaluate("AE.state.sel = { start: 0, end: 0 }")
    page.mouse.click(box["x"] + (1 - start) * pps + 10, box["y"] + 8)
    assert page.evaluate("[AE.state.sel.start, AE.state.sel.end]") == [1, 2]
    # undo, redo
    page.keyboard.press("Control+z")
    assert page.evaluate("AE.state.labels.length") == 1
    page.keyboard.press("Control+y")
    assert page.evaluate("AE.state.labels.length") == 2
    # Audacity label export and import
    page.click("[data-testid=tracks-menu]")
    with page.expect_download() as d:
        page.click("[data-testid=menu-exportLabels]")
    lines = open(d.value.path(), encoding="utf-8").read().splitlines()
    assert lines[0] == "1.000000\t2.000000\tIntro" and lines[1].endswith("\tChorus")
    other = tmp_path / "labels.txt"
    other.write_text("0,5\t0,75\tA\n\\\t100\t200\n3.5\tB only start\n", encoding="utf-8")
    page.click("[data-testid=tracks-menu]")
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=menu-importLabels]")
    chooser.value.set_files(str(other))
    expect(page.locator("[data-testid=toast]").last).to_contain_text("2 label(s) imported")
    assert page.evaluate("AE.state.labels.map((l) => [l.start, l.end, l.text])")[0] == [0.5, 0.75, "A"]
    # renaming to empty removes a label
    page.evaluate("AE.state.view.start = 0")
    page.mouse.dblclick(box["x"] + 0.5 * pps + 6, box["y"] + 8)
    expect(page.locator("[data-testid=param-text]")).to_have_value("A")
    page.fill("[data-testid=param-text]", "")
    page.click("[data-testid=param-ok]")
    assert page.evaluate("AE.state.labels.map((l) => l.text)") == ["Intro", "Chorus", "B only start"]
    # labels are part of the project file
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "project")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    with zipfile.ZipFile(d.value.path()) as z:
        meta = json.loads(z.read("project.json"))
    assert [l["text"] for l in meta["labels"]] == ["Intro", "Chorus", "B only start"]
    assert page.errors == []


def test_spectrogram(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "tone.wav", seconds=2, rate=8000, channels=1, freq=1000, amp=0.5))
    # the analysis: the strongest bin is at 1000 Hz, about -12 dB (amplitude 0.5, Hann window)
    peak = page.evaluate("""() => { const s = AE.beats.spectrogram(AE.state.tracks[0].clips[0].audio.channels[0]);
      const f = Math.floor(s.frames / 2); let best = 0; for (let b = 1; b < s.bins; b++) if (s.data[f * s.bins + b] > s.data[f * s.bins + best]) best = b;
      return { bin: best, level: s.data[f * s.bins + best], bins: s.bins, quiet: s.data[f * s.bins + 400] }; }""")
    assert peak["bin"] == 128 and peak["level"] > 200 and peak["quiet"] < 60
    # the view: the brightest row of the lane is where 1000 Hz lies on the logarithmic scale
    page.click("[data-testid=track-view]")
    expect(page.locator("[data-testid=track-view]")).to_have_attribute("aria-pressed", "true")
    page.wait_for_timeout(300)
    row = page.evaluate("""() => {
      const lane = document.querySelector('[data-testid=lane]'); const g = lane.getContext('2d');
      const dpr = window.devicePixelRatio || 1; const head = (matchMedia('(max-width: 760px)').matches ? 20 : 16) * dpr;
      const x = Math.floor(lane.width / 4); const d = g.getImageData(x, 0, 1, lane.height).data;
      let best = 0, bestY = 0; for (let y = Math.ceil(head); y < lane.height; y++) { const v = d[y * 4] + d[y * 4 + 1] + d[y * 4 + 2]; if (v > best) { best = v; bestY = y; } }
      const h = lane.height - Math.ceil(head); const lo = Math.log(30), hi = Math.log(4000);
      const expected = Math.ceil(head) + (hi - Math.log(1000)) / (hi - lo) * (h - 1);
      return { bestY, expected, best }; }""")
    assert abs(row["bestY"] - row["expected"]) <= 4 and row["best"] > 450
    page.click("[data-testid=track-view]")
    expect(page.locator("[data-testid=track-view]")).to_have_attribute("aria-pressed", "false")
    assert page.errors == []


def test_clip_gain_fades_and_crossfade(app_page, tmp_path):
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "tone.wav", seconds=2, rate=8000, channels=1, freq=200, amp=0.5))
    peak = """([a, b]) => { const m = AE.trackAudio(AE.state.tracks[0], Math.round(a * 8000), Math.round(b * 8000)).channels[0]; let p = 0; for (const v of m) p = Math.max(p, Math.abs(v)); return p; }"""
    # drag the fade-in handle (top left corner of the clip body) to 0.5 s
    lane = page.locator("[data-testid=lane]").first
    box = lane.bounding_box()
    pps, start = page.evaluate("[AE.state.view.pps, AE.state.view.start]")
    head = page.evaluate("matchMedia('(max-width: 760px)').matches ? 20 : 16")
    x0 = box["x"] + (0 - start) * pps + 1
    page.mouse.move(x0, box["y"] + head + 5)
    page.mouse.down()
    page.mouse.move(box["x"] + (0.5 - start) * pps, box["y"] + head + 5, steps=6)
    page.mouse.up()
    fade_in = page.evaluate("AE.state.tracks[0].clips[0].fadeIn")
    assert abs(fade_in - 4000) < 150
    assert page.evaluate(peak, [0, 0.02]) < 0.05 and page.evaluate(peak, [1, 1.5]) > 0.45  # silent start, full level later
    page.keyboard.press("Control+z")
    assert not page.evaluate("AE.state.tracks[0].clips[0].fadeIn")
    page.keyboard.press("Control+y")
    # clip volume -6 dB
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-clipGain]")
    page.fill("[data-testid=param-db]", "-6")
    page.click("[data-testid=param-ok]")
    assert abs(page.evaluate(peak, [1, 1.5]) - 0.25) < 0.02
    # a second, overlapping clip; cross-fade the overlap
    page.evaluate("""() => { const tr = AE.state.tracks[0]; const c = tr.clips[0];
      tr.clips = [{ ...c, gain: 0, fadeIn: 0, fadeOut: 0 }, { ...c, id: AE.clips.newId(), offset: 12000, gain: 0, fadeIn: 0, fadeOut: 0 }]; tr.version++; tr.cache = null; }""")
    page.click("[data-testid=clip-menu]")
    page.click("[data-testid=menu-crossfade]")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("1 cross-fade")
    c = page.evaluate("AE.clips.sorted(AE.state.tracks[0].clips).map((x) => [x.offset, x.fadeIn, x.fadeOut])")
    assert c == [[0, 0, 4000], [12000, 4000, 0]]
    page.evaluate("AE.play(0)")  # the fades are played as gain curves
    page.wait_for_timeout(400)
    page.evaluate("AE.stop()")
    # the project file keeps volume and fades
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "project")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    import json, zipfile
    with zipfile.ZipFile(d.value.path()) as z:
        meta = json.loads(z.read("project.json"))
    assert [(x.get("fadeIn", 0), x.get("fadeOut", 0)) for x in meta["tracks"][0]["clips"]] == [(0, 4000), (4000, 0)]
    assert page.errors == []


EFFECTS_JS = """async () => {
  const rate = 16000, n = rate;
  const sine = (f, amp = 1, len = n) => Float32Array.from({ length: len }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / rate));
  const peak = (c, a = 0, b = c.length) => { let p = 0; for (let i = a; i < b; i++) p = Math.max(p, Math.abs(c[i])); return p; };
  const rms = (c, a = 0, b = c.length) => { let s = 0; for (let i = a; i < b; i++) s += c[i] * c[i]; return Math.sqrt(s / Math.max(1, b - a)); };
  const crossings = (c) => { let k = 0; for (let i = 1; i < c.length; i++) if (c[i - 1] < 0 && c[i] >= 0) k++; return k; };
  const r = {};
  // compressor: a loud first half (0 dBFS) and a quiet second half (-20 dBFS)
  const dyn = new Float32Array(2 * n); dyn.set(sine(440, 1), 0); dyn.set(sine(440, 0.1), n);
  const c = AE.fx.compress({ rate, channels: [dyn] }, 0, 2 * n, { threshold: -20, ratio: 10, attack: 1, release: 50 }).channels[0];
  r.compLoud = peak(c, n / 2, n); r.compQuiet = peak(c, n + n / 2, 2 * n);
  r.limit = peak(AE.fx.compress({ rate, channels: [sine(440, 1)] }, 0, n, { threshold: -6, ratio: 50, attack: 0.5, release: 60 }).channels[0], n / 4, n);
  // equaliser: bass cut
  const low = (await AE.fx.equalize({ rate, channels: [sine(60, 0.5)] }, 0, n, { bass: -12 })).channels[0];
  const high = (await AE.fx.equalize({ rate, channels: [sine(3000, 0.5)] }, 0, n, { bass: -12 })).channels[0];
  r.eqLow = peak(low, n / 2, n); r.eqHigh = peak(high, n / 2, n);
  // reverb: a click followed by silence gets a tail
  const click = new Float32Array(n); click[100] = 1;
  const rev = (await AE.fx.reverb({ rate, channels: [click] }, 0, n, { size: 0.5, wet: 0.5 })).channels;
  r.tail = rms(rev[0], 2000, 6000);
  // pitch up an octave: twice the zero crossings, same length
  const up = (await AE.fx.pitchShift({ rate, channels: [sine(300, 0.5)] }, 12)).channels[0];
  r.pitchRatio = crossings(up.subarray(2000, n - 2000)) / crossings(sine(300).subarray(2000, n - 2000)); r.pitchLength = up.length;
  // noise reduction: noise everywhere, a tone in the middle
  let seed = 1; const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.1; };
  const sig = Float32Array.from({ length: 3 * n }, (_, i) => noise() + (i >= n && i < 2 * n ? 0.5 * Math.sin(2 * Math.PI * 500 * i / rate) : 0));
  const clean = AE.fx.reduceNoise({ rate, channels: [sig] }, 0, 3 * n, { reduction: 20, sensitivity: 1.5 }).channels[0];
  r.noiseBefore = rms(sig, 1000, n - 1000); r.noiseAfter = rms(clean, 1000, n - 1000);
  r.toneBefore = rms(sig, n + 2000, 2 * n - 2000); r.toneAfter = rms(clean, n + 2000, 2 * n - 2000);
  return r;
}"""


def test_more_effects(app_page, tmp_path):
    import math
    page = ready(app_page)
    r = page.evaluate(EFFECTS_JS)
    assert 0.08 < r["compLoud"] < 0.2 and abs(r["compQuiet"] - 0.1) < 0.02  # 20 dB over the threshold -> 2 dB over
    assert r["limit"] < 0.55  # about -6 dBFS
    assert r["eqLow"] < 0.2 and r["eqHigh"] > 0.45
    assert r["tail"] > 0.0002  # silence before the effect: any energy here is the tail
    assert abs(r["pitchRatio"] - 2) < 0.05 and r["pitchLength"] == 16000
    assert 20 * math.log10(r["noiseBefore"] / r["noiseAfter"]) > 10
    assert abs(20 * math.log10(r["toneAfter"] / r["toneBefore"])) < 1.5
    # through the menu
    open_files(page, make_wav(tmp_path / "t.wav", seconds=1, rate=8000, channels=1, freq=100, amp=0.5))
    page.click("[data-testid=effects]")
    page.click("[data-testid=menu-equalizer]")
    page.fill("[data-testid=param-bass]", "-12")
    page.click("[data-testid=param-ok]")
    wait_idle(page)
    assert page.evaluate("(() => { const c = AE.state.tracks[0].clips[0].audio.channels[0]; let p = 0; for (let i = 4000; i < 8000; i++) p = Math.max(p, Math.abs(c[i])); return p; })()") < 0.3
    page.keyboard.press("Control+z")
    page.click("[data-testid=effects]")
    page.click("[data-testid=menu-pitch]")
    page.click("[data-testid=param-ok]")
    wait_idle(page)
    assert page.evaluate("AE.clips.clipLength(AE.state.tracks[0].clips[0])") == 8000
    assert page.errors == []


def test_volume_automation(app_page, tmp_path):
    import json, zipfile
    page = ready(app_page)
    open_files(page, make_wav(tmp_path / "tone.wav", seconds=2, rate=8000, channels=1, freq=200, amp=0.5))
    page.click("[data-testid=track-envelope]")
    lane = page.locator("[data-testid=lane]").first

    # re-read the layout every time: the download banner moves the lanes
    def y(db):
        box = lane.bounding_box()
        return box["y"] + (6 - db) / 46 * box["height"]

    def x(sec):
        box = lane.bounding_box()
        pps, start = page.evaluate("[AE.state.view.pps, AE.state.view.start]")
        return box["x"] + (sec - start) * pps
    # two points: 0 dB at 0.5 s, -30 dB at 1.5 s
    page.mouse.click(x(0.5), y(0))
    page.wait_for_timeout(600)  # not a double-click
    page.mouse.click(x(1.5), y(-30))
    page.wait_for_timeout(600)
    env = page.evaluate("AE.state.tracks[0].envelope")
    assert len(env) == 2 and abs(env[0]["t"] - 0.5) < 0.05 and abs(env[0]["db"]) <= 1 and abs(env[1]["db"] + 30) <= 1.5
    # the export applies the automation: full level at the start, silence at the end
    page.click("[data-testid=export]")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    import struct, wave, io
    with wave.open(io.BytesIO(open(d.value.path(), "rb").read())) as w:
        raw = w.readframes(w.getnframes()); width = w.getsampwidth(); rate = w.getframerate(); nch = w.getnchannels()
    samples = struct.unpack(f"<{len(raw) // width}h", raw)[::nch]
    pk = lambda a, b: max(abs(v) for v in samples[int(a * rate):int(b * rate)]) / 32768
    assert pk(0.1, 0.4) > 0.45 and pk(1.6, 1.9) < 0.025 and 0.03 < pk(1.0, 1.05) < 0.4
    # drag the second point up, then undo; double-click removes a point
    lane.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    x1, y1, y2 = x(1.5), y(-30), y(-10)
    page.mouse.move(x1, y1)
    page.mouse.down()
    page.mouse.move(x1, y2, steps=5)
    page.mouse.up()
    assert abs(page.evaluate("AE.state.tracks[0].envelope[1].db") + 10) <= 1.5
    page.keyboard.press("Control+z")
    assert abs(page.evaluate("AE.state.tracks[0].envelope[1].db") + 30) <= 1.5
    page.wait_for_timeout(600)
    page.mouse.dblclick(x(0.5), y(0))
    assert page.evaluate("AE.state.tracks[0].envelope.length") == 1
    page.evaluate("AE.play(0)")
    page.wait_for_timeout(300)
    page.evaluate("AE.stop()")
    # kept in the project file
    page.click("[data-testid=export]")
    page.select_option("[data-testid=export-format]", "project")
    with page.expect_download() as d:
        page.click("[data-testid=export-ok]")
    with zipfile.ZipFile(d.value.path()) as z:
        assert len(json.loads(z.read("project.json"))["tracks"][0]["envelope"]) == 1
    assert page.errors == []
