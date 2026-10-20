#!/usr/bin/env python3
"""Mirror a release tag of this repository into the public repository (one commit per release, no history, no builds).

The public repository (default: ../portable-web-app-suite-public) is created as a local git repository if it does not
exist yet. For each release, its working tree is replaced by the files of the tag (`git archive`, so only tracked files),
without `dist/` (the built apps can be attached to a GitHub release instead); `dist/` and `build/` are added to its
.gitignore. Before committing, the files are checked for private information: e-mail addresses other than example
domains and the public address, private keys, access tokens and local home paths. The commit and an annotated tag with
the same name are made as "Adrian Fuchs <github@adrianfuchs.at>" (also set as the repository's user).

Only the Python standard library and git are used.

Usage:
    python3 tools/publish_release.py v1.0.0 [public repository directory]
"""
import io
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
NAME, EMAIL = "Adrian Fuchs", "github@adrianfuchs.at"
EXCLUDE = ("dist/",)
ALLOWED_MAIL = re.compile(r"@(example\.(com|org|net)|openssh\.com|widgets\.interact)$|^github@adrianfuchs\.at$|^noreply@anthropic\.com$")
MAIL = re.compile(rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,}")
SECRETS = [
    (re.compile(rb"-----BEGIN (?:RSA |OPENSSH |EC |DSA |ENCRYPTED )?PRIVATE KEY-----\s*\n[A-Za-z0-9+/=]{40,}"), "private key"),
    (re.compile(rb"\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}|\bxox[abp]-[A-Za-z0-9-]{10,}|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9]{32,}|\bAIza[0-9A-Za-z_-]{35}"), "access token"),
    # (built from the current user's name, so that this file itself contains no home path)
    (re.compile(rb"(?:/home/|/Users/|[A-Z]:\\{1,2}Users\\{1,2})" + re.escape(pathlib.Path.home().name.encode()) + rb"\b", re.I), "local home path"),
]


def git(*args, cwd=ROOT, **kw):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, **kw)


def check(files):
    """Private information in the exported files (third-party code under vendor/ keeps its authors' public addresses)."""
    problems = []
    for name, data in files.items():
        for pattern, what in SECRETS:
            if pattern.search(data):
                problems.append(f"{name}: {what}")
        if not name.startswith("vendor/"):
            for m in MAIL.finditer(data):
                address = m.group().decode("ascii", "replace")
                if not ALLOWED_MAIL.search(address):
                    problems.append(f"{name}: e-mail address {address}")
    return problems


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    tag = sys.argv[1]
    target = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else ROOT.parent / "portable-web-app-suite-public"
    git("rev-parse", "--verify", f"refs/tags/{tag}")
    archive = git("archive", "--format=tar", tag).stdout
    files = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar.getmembers():
            if member.isfile() and not member.name.startswith(EXCLUDE):
                files[member.name] = tar.extractfile(member).read()
    problems = check(files)
    if problems:
        raise SystemExit("not published, private information found:\n  " + "\n  ".join(problems))

    if not (target / ".git").exists():
        target.mkdir(parents=True, exist_ok=True)
        git("init", "-b", "main", cwd=target)
    git("config", "user.name", NAME, cwd=target)
    git("config", "user.email", EMAIL, cwd=target)
    if git("tag", "--list", tag, cwd=target).stdout.strip():
        raise SystemExit(f"{target} already has the tag {tag}")
    for entry in target.iterdir():  # the release replaces everything except the repository itself
        if entry.name != ".git":
            shutil.rmtree(entry) if entry.is_dir() and not entry.is_symlink() else entry.unlink()
    for name, data in files.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    ignore = target / ".gitignore"
    text = ignore.read_text(encoding="utf-8") if ignore.exists() else ""
    ignore.write_text(text.rstrip("\n") + "\n\n# Build output (attach the built apps to a GitHub release instead)\ndist/\nbuild/\n", encoding="utf-8")

    message = f"Release {tag}\n\nSource of release {tag} of the Portable Web App Suite (without the built apps).\n"
    git("add", "--all", cwd=target)
    git("commit", "-q", "-m", message, cwd=target)
    git("tag", "-a", tag, "-m", f"Release {tag}", cwd=target)
    size = sum(len(d) for d in files.values())
    print(f"published {tag} into {target}: {len(files)} files, {size / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
