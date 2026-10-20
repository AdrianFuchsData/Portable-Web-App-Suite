"""Small media files for the media player and video editor tests (standard library; video needs ffmpeg, bundled by imageio-ffmpeg)."""
import math
import shutil
import struct
import subprocess


def _chunk(cid, data):
    return cid + struct.pack("<I", len(data)) + data + (b"\0" if len(data) % 2 else b"")


def make_wav(path, seconds=1.0, freq=440, title=None, artist=None, album=None, rate=8000, id3=None):
    """Mono 16-bit sine WAV; title/artist/album go into a LIST/INFO chunk, id3 (bytes) into an "id3 " chunk."""
    n = int(seconds * rate)
    samples = b"".join(struct.pack("<h", int(8000 * math.sin(2 * math.pi * freq * i / rate))) for i in range(n))
    chunks = _chunk(b"fmt ", struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)) + _chunk(b"data", samples)
    info = b"".join(_chunk(cid, value.encode() + b"\0") for cid, value in ((b"INAM", title), (b"IART", artist), (b"IPRD", album)) if value)
    if info:
        chunks += _chunk(b"LIST", b"INFO" + info)
    if id3:
        chunks += _chunk(b"id3 ", id3)
    path.write_bytes(b"RIFF" + struct.pack("<I", 4 + len(chunks)) + b"WAVE" + chunks)
    return path


def id3v2(title=None, artist=None, cover=None):
    """An ID3v2.3 tag (UTF-16 text frames, optional APIC picture)."""
    def frame(fid, data):
        return fid + struct.pack(">I", len(data)) + b"\0\0" + data
    frames = b""
    for fid, value in ((b"TIT2", title), (b"TPE1", artist)):
        if value:
            frames += frame(fid, b"\x01" + value.encode("utf-16") + b"\0\0")
    if cover:
        frames += frame(b"APIC", b"\x00image/png\x00\x03\x00" + cover)
    size = len(frames)
    synchsafe = bytes([(size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127])
    return b"ID3\x03\x00\x00" + synchsafe + frames


PNG_1PX = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000"
                        "1f15c4890000000d49444154789c6360f8cf000003010100c9fe92ef0000000049454e44ae426082")

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except (ImportError, RuntimeError):
    FFMPEG = shutil.which("ffmpeg")
HAS_FFMPEG = FFMPEG is not None


def make_webm(path, seconds=2):
    """A small VP8 WebM video (320x240 test pattern) with an Opus sine tone."""
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=10:duration={seconds}",
                    "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:v", "libvpx", "-b:v", "200k", "-c:a", "libopus",
                    "-shortest", str(path)], check=True)
    return path


def make_color_webm(path, color="red", seconds=2, freq=440, size="320x240", rate=30, audio=True):
    """A VP8 WebM video of one colour (with an Opus sine tone unless audio=False)."""
    cmd = [FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={color}:size={size}:rate={rate}:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}", "-c:a", "libopus", "-shortest"]
    subprocess.run(cmd + ["-c:v", "libvpx", "-b:v", "300k", str(path)], check=True)
    return path


def pixel(path, at):
    """RGB of the centre pixel of the frame at `at` seconds (video scaled to 1x1 after cropping the centre)."""
    out = subprocess.run([FFMPEG, "-v", "error", "-ss", str(at), "-i", str(path), "-frames:v", "1", "-vf", "crop=iw/4:ih/4,scale=1:1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    return tuple(out[:3])


def streams(path):
    """Duration (s), video size and stream kinds from ffmpeg's report."""
    import re
    err = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", err)
    size = re.search(r"Video: .*?(\d{2,5})x(\d{2,5})", err)
    return {
        "duration": int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None,
        "size": (int(size.group(1)), int(size.group(2))) if size else None,
        "video": re.search(r"Stream .*Video: (\w+)", err).group(1) if "Video:" in err else None,
        "audio": re.search(r"Stream .*Audio: (\w+)", err).group(1) if "Audio:" in err else None,
    }
