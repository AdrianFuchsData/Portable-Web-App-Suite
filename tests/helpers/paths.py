import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DIST = pathlib.Path(os.environ.get("SUITE_DIST", ROOT / "dist")).resolve()


def dist_url(name):
    path = DIST / f"{name}.html"
    assert path.exists(), f"{path} missing, run: python3 build.py"
    return path.as_uri()
