"""Media player (apps/mediaplayer); media files from tests/helpers/media_samples.py."""
import re
import time

import pytest
from playwright.sync_api import expect

from helpers.media_samples import HAS_FFMPEG, PNG_1PX, id3v2, make_wav, make_webm

NO_PICKERS = "window.showOpenFilePicker = undefined; window.showSaveFilePicker = undefined;"


def open_files(page, *paths):
    with page.expect_file_chooser() as chooser:
        page.click("[data-testid=open]")
    chooser.value.set_files([str(p) for p in paths])


def titles(page):
    return page.locator("[data-testid=item-title]")


def current(page):
    return page.locator("[data-testid=item].current [data-testid=item-title]")


def media(page, expression):
    return page.evaluate(f"(() => {{ const v = MP.app.video; return {expression}; }})()")


def poll(page, expression, arg=None, timeout=10):
    """Poll a page expression until it is truthy (instead of wait_for_function, see the test practices)."""
    deadline = time.monotonic() + timeout
    while not page.evaluate(expression, arg):
        assert time.monotonic() < deadline, f"timed out waiting for {expression}"
        page.wait_for_timeout(50)


def wait_media(page, expression, timeout=10):
    poll(page, f"() => {{ const v = MP.app.video; return {expression}; }}", timeout=timeout)


@pytest.fixture
def songs(tmp_path):
    return [
        make_wav(tmp_path / "01 morning.wav", 1.5, 440, title="Morning", artist="Anna", album="Days"),
        make_wav(tmp_path / "02 evening.wav", 1.0, 660, id3=id3v2("Evening", "Ben", PNG_1PX)),
    ]


def test_open_tags_durations_and_play(app_page, songs):
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    assert page.title() == "Media player"
    open_files(page, *songs)
    expect(titles(page)).to_have_text(["▶ Anna – Morning", "Ben – Evening"])  # the first file starts playing
    expect(page.locator("[data-testid=item-duration]")).to_have_text(["0:01", "0:01"])
    expect(page.locator("[data-testid=now-title]")).to_have_text("Morning")
    expect(page.locator("[data-testid=now-artist]")).to_have_text("Anna")
    wait_media(page, "v.currentTime > 0.2")
    expect(page.locator("[data-testid=playlist-summary]")).to_contain_text("2 items")
    page.locator("[data-testid=item]").nth(1).dblclick()
    expect(page.locator("[data-testid=now-title]")).to_have_text("Evening")
    expect(page.locator("[data-testid=cover]")).to_be_visible()  # APIC picture from the ID3 tag
    assert page.errors == [] and page.requests == []


def test_auto_advance_and_repeat(app_page, tmp_path):
    files = [make_wav(tmp_path / f"{n}.wav", 1.2, 300 + 100 * i) for i, n in enumerate(("a", "b"))]
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, *files)
    expect(current(page)).to_have_text("▶ a.wav")
    expect(current(page)).to_have_text("▶ b.wav")  # advances at the end
    expect(page.locator("[data-testid=play]")).to_have_text("▶")  # and stops after the last item
    assert media(page, "v.ended")

    page.click("[data-testid=repeat]")  # off -> all
    expect(page.locator("[data-testid=repeat]")).to_have_attribute("data-mode", "all")
    page.click("[data-testid=play]")  # replays b
    expect(current(page)).to_have_text("▶ a.wav", timeout=15000)  # wraps around

    page.click("[data-testid=repeat]")  # all -> one
    expect(page.locator("[data-testid=repeat]")).to_have_attribute("data-mode", "one")
    page.wait_for_timeout(1200)  # several loops of a 0.4 s file
    expect(current(page)).to_have_text("▶ a.wav")


def test_controls_keyboard_and_preferences(app_page, tmp_path):
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, make_wav(tmp_path / "long.wav", 6))  # long enough not to end during the test
    wait_media(page, "!v.paused")
    page.locator("body").press(" ")
    wait_media(page, "v.paused")
    expect(page.locator("[data-testid=play]")).to_have_text("▶")
    page.locator("body").press("]")
    expect(page.locator("[data-testid=rate]")).to_have_value("1.25")
    assert media(page, "v.playbackRate") == 1.25
    page.locator("body").press("ArrowDown")
    page.locator("body").press("ArrowDown")
    assert abs(media(page, "v.volume") - 0.9) < 0.001
    page.locator("body").press("m")
    assert media(page, "v.muted")
    page.fill("[data-testid=seek]", "1")
    assert abs(media(page, "v.currentTime") - 1) < 0.1
    page.click("[data-testid=stop]")
    assert media(page, "v.currentTime") == 0
    page.click("[data-testid=repeat]")
    page.click("[data-testid=shuffle]")

    page.reload()
    page.wait_for_selector("body[data-ready]")
    expect(page.locator("[data-testid=rate]")).to_have_value("1.25")
    expect(page.locator("[data-testid=repeat]")).to_have_attribute("data-mode", "all")
    expect(page.locator("[data-testid=shuffle]")).to_have_attribute("aria-pressed", "true")
    assert media(page, "v.muted") and abs(media(page, "v.volume") - 0.9) < 0.001


def test_playlist_import_export(app_page, songs, tmp_path):
    playlist = tmp_path / "list.m3u"
    playlist.write_text("#EXTM3U\n#EXTINF:5,Someone - Lost song\nC:\\Music\\lost.wav\n"
                        "#EXTINF:-1,Radio\nhttps://radio.example/stream\n#EXTINF:2,Evening\n../music/02 evening.wav\n")
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    page.route("https://radio.example/**", lambda route: route.abort())
    open_files(page, playlist, songs[1], songs[0])
    # playlist order first; files not in the playlist are appended
    expect(page.locator("[data-testid=item]")).to_have_count(4)
    expect(page.locator("[data-testid=item]").nth(0)).to_have_class(re.compile(r"\bmissing\b"))
    expect(titles(page).nth(0)).to_have_text("Someone - Lost song")
    expect(titles(page).nth(1)).to_contain_text("Radio")  # titles come from #EXTINF
    expect(titles(page).nth(2)).to_contain_text("Ben – Evening")
    expect(titles(page).nth(3)).to_contain_text("Anna – Morning")
    expect(current(page)).to_contain_text("Radio")  # the first available item is played (and fails: no network)
    expect(page.locator("[data-testid=toast]").last).to_contain_text("cannot be played")

    # adding the missing file later fills the entry
    open_files(page, make_wav(tmp_path / "lost.wav", 0.5, title="Lost song", artist="Someone"))
    expect(page.locator("[data-testid=item]")).to_have_count(4)
    expect(page.locator("[data-testid=item]").nth(0)).not_to_have_class(re.compile(r"\bmissing\b"))

    with page.expect_download() as download:
        page.click("[data-testid=save-playlist]")
    assert download.value.suggested_filename == "playlist.m3u8"
    text = open(download.value.path(), encoding="utf-8").read()
    assert text.splitlines() == ["#EXTM3U", "#EXTINF:1,Someone - Lost song", "C:\\Music\\lost.wav", "#EXTINF:-1,Radio",
                                 "https://radio.example/stream", "#EXTINF:1,Ben - Evening", "../music/02 evening.wav",
                                 "#EXTINF:2,Anna - Morning", "01 morning.wav"]

    parsed = page.evaluate("""() => [MP.parsePlaylist('[playlist]\\nFile1=a.mp3\\nTitle1=A\\nLength1=61\\nFile2=http://x/y\\nNumberOfEntries=2\\n', 'x.pls'),
      MP.parsePlaylist('<?xml version="1.0"?><playlist version="1" xmlns="http://xspf.org/ns/0/"><trackList><track><location>file:///music/b%20c.ogg</location><title>B</title><creator>C</creator><duration>2000</duration></track></trackList></playlist>', 'x.xspf')]""")
    assert parsed == [[{"location": "a.mp3", "title": "A", "duration": 61}, {"location": "http://x/y", "title": None, "duration": None}],
                      [{"location": "/music/b c.ogg", "title": "C - B", "duration": 2}]]


def test_subtitles(app_page, tmp_path):
    clip = make_wav(tmp_path / "talk.wav", 2)
    srt = tmp_path / "talk.srt"
    srt.write_text("1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:01,000 --> 00:00:02,000\nWorld\n", encoding="utf-8")
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, clip, srt)
    expect(page.locator("[data-testid=subtitle]")).to_have_value("0")
    wait_media(page, "v.textTracks.length === 1 && v.textTracks[0].mode === 'showing' && v.textTracks[0].cues && v.textTracks[0].cues.length === 2")
    assert media(page, "v.textTracks[0].cues[1].text") == "World"
    page.select_option("[data-testid=subtitle]", "-1")
    wait_media(page, "v.textTracks[0].mode === 'disabled'")
    assert page.evaluate("MP.srtToVtt('1\\r\\n00:00:01,500 --> 00:00:02,000\\r\\nA\\r\\n')") == "WEBVTT\n\n00:00:01.500 --> 00:00:02.000\nA\n"


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed to create the video")
def test_video(app_page, tmp_path):
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, make_webm(tmp_path / "clip.webm"))
    wait_media(page, "v.videoWidth === 320 && v.currentTime > 0.2")
    expect(page.locator("[data-testid=now-playing]")).to_have_count(0)  # the video replaces the info panel
    expect(page.locator("[data-testid=duration]")).to_have_text("0:02")
    if page.evaluate("document.pictureInPictureEnabled"):
        expect(page.locator("[data-testid=pip]")).to_be_enabled()


def test_unplayable_file_is_skipped(app_page, tmp_path):
    bad = tmp_path / "1 broken.mp4"
    bad.write_bytes(b"this is not a video" * 100)
    good = make_wav(tmp_path / "2 good.wav", 1)
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, bad, good)
    expect(page.locator("[data-testid=toast]").first).to_contain_text("cannot be played")
    expect(page.locator("[data-testid=item]").nth(0)).to_have_class(re.compile(r"\berror\b"))
    page.click("[data-testid=next]")
    expect(current(page)).to_have_text("▶ 2 good.wav")


def test_shuffle_plays_every_item_once(app_page, tmp_path):
    files = [make_wav(tmp_path / f"{i}.wav", 3) for i in range(5)]
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    page.evaluate("localStorage.setItem('suite.mediaplayer', JSON.stringify({ shuffle: true }))")
    page.reload()
    page.wait_for_selector("body[data-ready]")
    open_files(page, *files)
    expect(current(page)).to_have_count(1)
    seen = [page.evaluate("MP.app.state.current")]
    for _ in range(4):
        page.click("[data-testid=next]")
        poll(page, "prev => MP.app.state.current !== prev", seen[-1])
        seen.append(page.evaluate("MP.app.state.current"))
    assert sorted(seen) == [0, 1, 2, 3, 4]


def test_reorder_remove_filter_and_url(app_page, tmp_path):
    files = [make_wav(tmp_path / f"{n}.wav", 2) for n in ("a", "b", "c")]
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    page.route("https://media.example/**", lambda route: route.abort())
    open_files(page, *files)
    page.locator("[data-testid=item]").nth(2).hover()
    page.locator("[data-testid=item-up]").nth(2).click()
    expect(titles(page)).to_have_text(["▶ a.wav", "c.wav", "b.wav"])
    page.locator("[data-testid=item]").nth(0).hover()
    page.locator("[data-testid=item-remove]").nth(0).click()
    expect(titles(page)).to_have_text(["c.wav", "b.wav"])
    page.fill("[data-testid=filter]", "b.")
    expect(titles(page)).to_have_text(["b.wav"])
    page.fill("[data-testid=filter]", "")

    page.click("[data-testid=open-url]")
    page.fill("[data-testid=url]", "https://media.example/live.ogg")
    page.click("[data-testid=url-add]")
    expect(titles(page).last).to_contain_text("live.ogg")
    expect(page.locator("[data-testid=toast]").last).to_contain_text("cannot be played")

    page.click("[data-testid=clear]")
    page.click("[data-testid=confirm-ok]")
    expect(page.locator("[data-testid=item]")).to_have_count(0)


def test_german_interface(app_page):
    page = app_page("mediaplayer", init_script="localStorage.setItem('suite.lang', 'de');")
    expect(page.locator("[data-testid=open]")).to_have_text("Dateien öffnen")
    expect(page.locator("[data-testid=now-playing]")).to_contain_text("Öffnen Sie Audio- oder Videodateien")


def test_mobile_layout(app_page, songs):
    page = app_page("mediaplayer", mobile=True, init_script=NO_PICKERS)
    open_files(page, *songs)
    expect(page.locator("[data-testid=controls]")).to_be_visible()
    page.locator("[data-testid=item-play]").nth(1).tap()  # a tap plays on touch screens
    expect(current(page)).to_contain_text("Evening")
    page.locator("[data-testid=item-remove]").nth(0).tap()  # actions are visible without hover
    expect(page.locator("[data-testid=item]")).to_have_count(1)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.errors == []


def test_equaliser(app_page, tmp_path):
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, make_wav(tmp_path / "eq.wav", 8))
    wait_media(page, "v.currentTime > 0.3")
    page.click("[data-testid=eq]")
    page.select_option("[data-testid=eq-preset]", "bass")
    expect(page.locator("[data-testid=eq-on]")).to_be_checked()
    # the playing file moved to the element routed through the filters and goes on from its position
    poll(page, "() => MP.app.graph && MP.app.video === MP.app.graph.el && MP.app.video.currentTime > 0.3 && !MP.app.video.paused")
    assert page.evaluate("MP.app.graph.filters.map((f) => f.gain.value)") == [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]
    page.locator("[data-testid=eq-band-9]").fill("3")
    expect(page.locator("[data-testid=eq-preset]")).to_have_value("custom")
    assert page.evaluate("MP.app.graph.filters[9].gain.value") == 3
    page.check("[data-testid=eq-normalize]")
    page.uncheck("[data-testid=eq-on]")
    poll(page, "() => MP.app.video !== MP.app.graph.el && !MP.app.video.paused")  # back to the plain element
    stored = page.evaluate("JSON.parse(localStorage.getItem('suite.mediaplayer')).eq")
    assert stored["on"] is False and stored["normalize"] is True and stored["gains"][9] == 3
    assert page.errors == []


def test_ab_repeat_and_resume(app_page, tmp_path):
    long = make_wav(tmp_path / "talk.wav", 130, rate=4000)  # resume positions are kept for files of two minutes or more
    other = make_wav(tmp_path / "other.wav", 3)
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, long, other)
    wait_media(page, "v.duration > 100 && v.currentTime > 0.1")
    page.evaluate("MP.app.video.currentTime = 40")
    wait_media(page, "v.currentTime > 40.2")
    page.click("[data-testid=ab]")
    expect(page.locator("[data-testid=ab]")).to_have_attribute("data-state", "a")
    wait_media(page, "v.currentTime > 41")
    page.click("[data-testid=ab]")
    expect(page.locator("[data-testid=ab]")).to_have_attribute("data-state", "ab")
    page.wait_for_timeout(1500)
    assert media(page, "v.currentTime >= 39.9 && v.currentTime <= 41.4"), media(page, "v.currentTime")  # loops between A and B
    page.click("[data-testid=ab]")
    expect(page.locator("[data-testid=ab]")).to_have_attribute("data-state", "off")
    # switching to another item remembers the position; playing the long one again continues there
    page.locator("[data-testid=item]", has_text="other.wav").dblclick()
    expect(page.locator("[data-testid=now-title]")).to_have_text("other.wav")
    page.locator("[data-testid=item]", has_text="talk.wav").dblclick()
    expect(page.locator("[data-testid=toast]").last).to_contain_text("Continued at 0:4")
    wait_media(page, "v.currentTime > 39")
    assert page.errors == []


def test_album_view(app_page, songs):
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, *songs)
    page.click("[data-testid=view]")
    albums = page.locator("[data-testid=album]")
    expect(albums).to_have_count(2)
    expect(albums.first).to_contain_text("Days")
    expect(albums.last).to_contain_text("Other titles")
    albums.last.click()
    expect(page.locator("[data-testid=now-title]")).to_have_text("Evening")
    assert page.errors == []


@pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg is needed to create the test video")
def test_frames_and_snapshot(app_page, tmp_path):
    import io
    from PIL import Image
    page = app_page("mediaplayer", init_script=NO_PICKERS)
    open_files(page, make_webm(tmp_path / "clip.webm", seconds=3))
    wait_media(page, "v.videoWidth > 0 && v.currentTime > 0.2")
    page.locator("body").click(position={"x": 2, "y": 2})
    page.keyboard.press(".")
    wait_media(page, "v.paused")
    before = media(page, "v.currentTime")
    page.click("[data-testid=frame-forward]")
    poll(page, "(b) => Math.abs(MP.app.video.currentTime - b - 1 / 30) < 0.01", before)
    page.keyboard.press(",")
    poll(page, "(b) => Math.abs(MP.app.video.currentTime - b) < 0.01", before)
    with page.expect_download() as d:
        page.click("[data-testid=snapshot]")
    assert d.value.suggested_filename.startswith("clip ") and d.value.suggested_filename.endswith(".png")
    img = Image.open(io.BytesIO(open(d.value.path(), "rb").read()))
    assert img.size == (media(page, "v.videoWidth"), media(page, "v.videoHeight"))
    assert page.errors == []
