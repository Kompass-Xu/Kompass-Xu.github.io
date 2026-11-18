export function paintCinematicVideo(video, picture, backdrop, { onFrame, onUnavailable }) {
  const foreground = picture.getContext("2d", { alpha: false });
  const background = backdrop?.getContext("2d", { alpha: false });
  if (!foreground || (backdrop && !background)) {
    onUnavailable();
    return;
  }

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  let frameRequest = 0;
  let lastFrameAt = -Infinity;
  let lastBackdropAt = -Infinity;
  let lastVideoTime = -1;
  let rendered = false;
  let failed = false;

  function paint(now, force = false) {
    if (failed || video.readyState < 2 || !video.videoWidth || !picture.clientWidth) return;
    if (!force && (now - lastFrameAt < 31 || video.currentTime === lastVideoTime)) return;

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.min(1280, video.videoWidth, Math.round(picture.clientWidth * scale)));
    const height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth));
    if (picture.width !== width || picture.height !== height) {
      picture.width = width;
      picture.height = height;
    }

    try {
      foreground.drawImage(video, 0, 0, width, height);
      if (background && (!rendered || (!motion.matches && now - lastBackdropAt > 160))) {
        background.drawImage(video, 0, 0, backdrop.width, backdrop.height);
        lastBackdropAt = now;
      }
    } catch {
      failed = true;
      onUnavailable();
      return;
    }

    lastFrameAt = now;
    lastVideoTime = video.currentTime;
    if (!rendered) {
      rendered = true;
      onFrame();
    }
  }

  function requestFrame() {
    if (!failed && !frameRequest && !video.paused && !video.ended && !document.hidden) {
      frameRequest = requestAnimationFrame(render);
    }
  }

  function render(now) {
    frameRequest = 0;
    paint(now);
    requestFrame();
  }

  function refresh() {
    paint(performance.now(), true);
    requestFrame();
  }

  const events = ["loadeddata", "playing", "seeked", "pause", "ended"];
  events.forEach(event => video.addEventListener(event, refresh));
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("resize", refresh);
  refresh();

  return () => {
    cancelAnimationFrame(frameRequest);
    events.forEach(event => video.removeEventListener(event, refresh));
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("resize", refresh);
  };
}
