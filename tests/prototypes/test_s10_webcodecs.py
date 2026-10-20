"""S-10: WebCodecs encoding/decoding with Mediabunny from file:// (canvas frames + audio -> WebM/MP4 -> decoded again)."""
import json

from helpers.paths import dist_url


def test_encode_and_decode(page):
    page.goto(dist_url("s10-webcodecs"))
    page.wait_for_selector("body[data-done]", timeout=60000)
    result = json.loads(page.inner_text("#out"))
    print(page.context.browser.browser_type.name, json.dumps(result, indent=1))
    assert result["webcodecs"] is True
    for key in ("webm-vp9-opus", "webm-vp8-opus", "mp4-vp9-opus"):
        assert result[key]["decoded"]["frames"] == 30 and result[key]["decoded"]["audio"] == "opus"
    # H.264/AAC encoders are missing in Playwright's open-source browser builds (available in Chrome/Edge)
    assert "mp4-avc-aac" in result
    assert page.errors == [] and page.requests == []
