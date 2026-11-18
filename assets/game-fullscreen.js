let entryAttempted = false;
let pendingRequest;

export function isGameFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function fullscreenRequest() {
  const root = document.documentElement;
  if (typeof root.requestFullscreen === "function") {
    return document.fullscreenEnabled ? () => root.requestFullscreen({ navigationUI: "hide" }) : null;
  }
  if (typeof root.webkitRequestFullscreen === "function" && document.webkitFullscreenEnabled !== false) {
    return () => root.webkitRequestFullscreen();
  }
  return null;
}

export function canEnterGameFullscreen() {
  return Boolean(fullscreenRequest());
}

function enterGameFullscreen() {
  if (isGameFullscreen() || pendingRequest) return;
  const request = fullscreenRequest();
  if (!request) return;
  try {
    // The request must start synchronously during the player's input.
    pendingRequest = Promise.resolve(request())
      .catch(() => {})
      .finally(() => { pendingRequest = undefined; });
  } catch {
    // A declined request leaves the game in its current browsing mode.
  }
}

export function enterOnFirstGameAction() {
  if (entryAttempted) return;
  entryAttempted = true;
  enterGameFullscreen();
}

export function toggleGameFullscreen() {
  entryAttempted = true;
  if (!isGameFullscreen()) {
    enterGameFullscreen();
    return;
  }
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    Promise.resolve(exit?.call(document)).catch(() => {});
  } catch {}
}
