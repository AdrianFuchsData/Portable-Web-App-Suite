/*
 * QR codes for the suite: rendering (vendor/qrcode-generator.min.js) and decoding from images and the camera
 * (vendor/jsQR.min.js). Adapted from the Web Authenticator (EUPL-1.2).
 *   Suite.qr.toSvg(text) -> SVG markup; decodeImage(blob) -> text | null; startCamera(video, onResult) -> stop(); cameraAvailable
 */
(function (Suite) {
  'use strict';

  /** Render text as a scalable SVG QR code string. */
  function toSvg(text) {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  }

  function decodeImageData(imageData) {
    const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return result ? result.data : null;
  }

  async function loadImage(blob) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(blob); } catch (e) { /* fall back to <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Decode a QR code from an image file/blob. Returns the text or null. */
  async function decodeImage(blob) {
    const img = await loadImage(blob);
    const width = img.width, height = img.height;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    // try the original size first, then scaled down versions (helps with huge or noisy screenshots)
    for (const scale of [1, 0.5, 0.25]) {
      const w = Math.round(width * scale), h = Math.round(height * scale);
      if (w < 64 || h < 64 || w * h > 16e6) continue;
      canvas.width = w;
      canvas.height = h;
      ctx.fillStyle = '#fff'; // transparent PNGs: QR modules on white
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const text = decodeImageData(ctx.getImageData(0, 0, w, h));
      if (text) return text;
    }
    return null;
  }

  /**
   * Start scanning with the camera into the given <video> element.
   * onResult(text) is called for every decoded QR code. Returns a stop() function.
   */
  async function startCamera(video, onResult) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stopped = false, last = null, timer = null;
    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const text = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (text && text !== last) {
          last = text;
          onResult(text);
        }
      }
      timer = setTimeout(tick, 150);
    };
    tick();
    return function stop() {
      stopped = true;
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }

  const cameraAvailable = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  Suite.qr = { toSvg, decodeImage, startCamera, cameraAvailable };
})(window.Suite = window.Suite || {});
