"""Deterministic mutations of a seed file for fuzzing the file readers.

    mutants(data, name, count, seed) -> [(description, bytes), ...]

Besides byte-level changes (truncation, bit flips, overwritten, inserted, deleted and repeated ranges, extreme values) the
mutations know the containers: for ZIP based formats (Office, OpenDocument, ORA, …) a part inside is changed and the
archive rebuilt with valid checksums – otherwise nearly every mutant would only test the CRC check; text formats get
line and bracket level changes. The same seed gives the same mutants (FUZZ_SEED changes the seed, FUZZ_COUNT the number)."""
import io
import random
import zipfile

EXTREMES = [b"\x00", b"\xff", b"\x7f", b"\x80", b"\xff\xff\xff\xff", b"\x00\x00\x00\x80", b"\xff\xff\xff\x7f", b"\x00" * 8]
TEXT_NOISE = ["", "<", ">", "</", "<!--", "]]>", "&", "&#xFFFF;", "&undefined;", "{", "}", "[", "]", '"', "\\", "\0", "�", "‮",
              "-1", "1e309", "NaN", "99999999999999999999", "null", "%s%n", "\r", "\r\n\r\n", "=", ":", ";", "BEGIN:VEVENT", "END:VCALENDAR",
              "$$", "```", "---"]


def is_zip(data):
    return data[:4] == b"PK\x03\x04"


def is_text(data):
    try:
        data[:4000].decode("utf-8")
    except UnicodeDecodeError:
        return False
    return b"\0" not in data[:4000]


def byte_mutation(rng, data):
    data = bytearray(data)
    n = len(data)
    op = rng.choice(["truncate", "flip", "overwrite", "insert", "delete", "repeat", "extreme", "zero-tail"])
    if n == 0:
        return "insert", bytes(rng.randrange(256) for _ in range(16))
    if op == "truncate":
        cut = rng.randrange(n)
        return f"truncate@{cut}", bytes(data[:cut])
    if op == "flip":
        where = sorted(rng.randrange(n) for _ in range(rng.randint(1, 8)))
        for i in where:
            data[i] ^= 1 << rng.randrange(8)
        return f"flip@{where}", bytes(data)
    if op == "overwrite":
        i = rng.randrange(n)
        k = rng.randint(1, 32)
        data[i:i + k] = bytes(rng.randrange(256) for _ in range(k))
        return f"overwrite@{i}+{k}", bytes(data[:n])
    if op == "insert":
        i = rng.randrange(n)
        k = rng.randint(1, 64)
        data[i:i] = bytes(rng.randrange(256) for _ in range(k))
        return f"insert@{i}+{k}", bytes(data)
    if op == "delete":
        i = rng.randrange(n)
        k = rng.randint(1, max(1, n // 8))
        del data[i:i + k]
        return f"delete@{i}+{k}", bytes(data)
    if op == "repeat":
        i = rng.randrange(n)
        k = rng.randint(1, min(256, n - i))
        data[i:i] = data[i:i + k] * rng.randint(2, 20)
        return f"repeat@{i}+{k}", bytes(data)
    if op == "extreme":
        value = rng.choice(EXTREMES)
        i = rng.randrange(n)
        data[i:i + len(value)] = value
        return f"extreme@{i}={value.hex()}", bytes(data[:max(n, i + len(value))])
    i = rng.randrange(n)
    data[i:] = b"\0" * (n - i)
    return f"zero-tail@{i}", bytes(data)


def text_mutation(rng, data):
    text = data.decode("utf-8", errors="replace")
    lines = text.split("\n")
    op = rng.choice(["noise", "drop-lines", "dup-lines", "shuffle", "unbalance", "huge-line", "deep-nesting", "bytes"])
    if op == "noise":
        for _ in range(rng.randint(1, 6)):
            i = rng.randrange(len(text) + 1)
            text = text[:i] + rng.choice(TEXT_NOISE) + text[i:]
        return "text-noise", text.encode("utf-8", errors="surrogatepass")
    if op == "drop-lines":
        i = rng.randrange(len(lines))
        k = rng.randint(1, max(1, len(lines) // 3))
        return f"drop-lines@{i}+{k}", "\n".join(lines[:i] + lines[i + k:]).encode()
    if op == "dup-lines":
        i = rng.randrange(len(lines))
        return f"dup-lines@{i}", "\n".join(lines[:i] + lines[i:i + 3] * rng.randint(2, 50) + lines[i:]).encode()
    if op == "shuffle":
        rng.shuffle(lines)
        return "shuffle-lines", "\n".join(lines).encode()
    if op == "unbalance":
        opener = rng.choice(["<", "{", "[", "(", '"', "<![CDATA[", "<!--"])
        i = rng.randrange(len(text) + 1)
        return f"unbalance {opener!r}@{i}", (text[:i] + opener * rng.randint(1, 5) + text[i:]).encode()
    if op == "huge-line":
        i = rng.randrange(len(text) + 1)
        return f"huge-line@{i}", (text[:i] + rng.choice("ax<{ ") * 200000 + text[i:]).encode()
    if op == "deep-nesting":
        depth = rng.choice([500, 5000])
        i = rng.randrange(len(text) + 1)
        nest = rng.choice([("[" * depth, "]" * depth), ("<a>" * depth, "</a>" * depth), ("{\"a\":" * depth, "}" * depth)])
        return f"deep-nesting{depth}@{i}", (text[:i] + nest[0] + nest[1] + text[i:]).encode()
    return byte_mutation(rng, data)


def zip_mutation(rng, data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        parts = [(info, z.read(info)) for info in z.infolist()]
    op = rng.choice(["part", "part", "part", "drop-part", "dup-name", "bytes"])
    if op == "bytes" or not parts:
        return byte_mutation(rng, data)
    i = rng.randrange(len(parts))
    name = parts[i][0].filename
    if op == "drop-part":
        desc = f"drop {name}"
        parts = parts[:i] + parts[i + 1:]
    elif op == "dup-name":
        desc = f"duplicate {name}"
        parts.append((parts[i][0], b"<x/>"))
    else:
        content = parts[i][1]
        desc, content = (text_mutation if is_text(content) else byte_mutation)(rng, content)
        desc = f"{name}: {desc}"
        parts[i] = (parts[i][0], content)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for info, content in parts:
            z.writestr(zipfile.ZipInfo(info.filename, date_time=info.date_time), content,
                       compress_type=zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED)
    return desc, out.getvalue()


def mutants(data, name, count, seed=0):
    rng = random.Random(f"{seed}:{name}")
    mutate = zip_mutation if is_zip(data) else text_mutation if is_text(data) else byte_mutation
    out = [("empty", b""), ("half", data[:len(data) // 2])]
    while len(out) < count:
        try:
            out.append(mutate(rng, data))
        except Exception as e:  # (a container that Python cannot read either)
            out.append((f"bytes ({e.__class__.__name__})", byte_mutation(rng, data)[1]))
    return out[:count]
