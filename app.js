import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_TIP: 12,
  RING_TIP: 16,
  PINKY_TIP: 20,
  MIDDLE_MCP: 9,
  RING_MCP: 13,
  PINKY_MCP: 17,
};

const PINCH_CLOSE_RATIO = 0.42;
const PINCH_OPEN_RATIO = 0.6;
const FRAME_PADDING = 28;
const CAPTURE_ASPECT_RATIO = 4 / 3;
const MIN_CAPTURE_WIDTH_RATIO = 0.34;
const MAX_CAPTURE_WIDTH_RATIO = 0.88;
const FRAME_SMOOTHING = 0.24;
const FREEZE_HOLD_MS = 360;
const COUNTDOWN_SECONDS = 3;
const FIST_HOLD_MS = 650;
const SNAP_DISTANCE_RATIO = 0.42;
const GRID = 3;
const LOAD_TIMEOUT_MS = 20000;
const TARGET_DETECTION_FPS = 30;
const DETECTION_INTERVAL_MS = 1000 / TARGET_DETECTION_FPS;
const MEDIAPIPE_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const PHOTOBOOTH_CONTRAST_ALPHA = 1.3;
const PHOTOBOOTH_BRIGHTNESS_BETA = 10;
const PHOTOBOOTH_NOISE_STD = 15;

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const videoEl = document.getElementById("webcam");
const canvas = document.getElementById("sceneCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const loadingOverlay = document.getElementById("loadingOverlay");
const loaderText = document.getElementById("loaderText");
const loaderRetry = document.getElementById("loaderRetry");
const errorBanner = document.getElementById("errorBanner");
const progressBadge = document.getElementById("progressBadge");
const progressText = document.getElementById("progressText");
const gestureHints = {
  capture: document.getElementById("gestureCaptureHint"),
  drag: document.getElementById("gestureDragHint"),
  fist: document.getElementById("gestureFistHint"),
};

const galleryStrip = document.getElementById("galleryStrip");
const galleryEmpty = document.getElementById("galleryEmpty");
const galleryCount = document.getElementById("galleryCount");
const downloadStripBtn = document.getElementById("downloadStripBtn");
const resetAllBtn = document.getElementById("resetAllBtn");
const stripCompleteMsg = document.getElementById("stripCompleteMsg");

let appState = "tracking";
let cameraStream = null;
let renderLoopStarted = false;

const puzzle = {
  boardBox: null,
  pieces: [],
  solved: false,
  tileW: 0,
  tileH: 0,
};

const SHATTER_COLS = 6;
const SHATTER_ROWS = 6;
const SHATTER_DURATION_MS = 850;
const shatter = {
  active: false,
  startedAt: 0,
  fragments: [],
  pendingCanvas: null,
};

const STRIP_MAX_PHOTOS = 3;
const galleryEntries = [];
const APP_SIGNATURE = "FramePuzzle Studio";

function addToGallery(snapshotCanvas) {
  if (galleryEntries.length >= STRIP_MAX_PHOTOS) return;

  galleryEntries.push({ canvas: snapshotCanvas, time: Date.now() });
  renderGalleryThumb(snapshotCanvas, galleryEntries.length);
  galleryCount.textContent = `${galleryEntries.length} / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) galleryEmpty.style.display = "none";

  if (galleryEntries.length >= STRIP_MAX_PHOTOS) {
    showStripComplete();
  }
}

function isStripFull() {
  return galleryEntries.length >= STRIP_MAX_PHOTOS;
}

function showStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.add("visible");
  updateStripDownloadAvailability();
}

function hideStripComplete() {
  if (stripCompleteMsg) stripCompleteMsg.classList.remove("visible");
}

function updateStripDownloadAvailability() {
  if (!downloadStripBtn) return;
  downloadStripBtn.disabled = galleryEntries.length === 0;
}

const STRIP_FILE_BORDER = 24;
const STRIP_FILE_GAP = 16;
const STRIP_FILE_BG = "#ffffff";
const STRIP_FILE_CAPTION_H = 42;

function downloadPhotoStrip() {
  if (galleryEntries.length === 0) return;

  const entries = galleryEntries;
  const targetW = entries[0].canvas.width;
  const scaledHeights = entries.map((entry) =>
    Math.round(entry.canvas.height * (targetW / entry.canvas.width))
  );

  const totalH =
    STRIP_FILE_BORDER * 2 +
    STRIP_FILE_CAPTION_H +
    scaledHeights.reduce((sum, h) => sum + h, 0) +
    STRIP_FILE_GAP * (entries.length - 1);
  const totalW = targetW + STRIP_FILE_BORDER * 2;

  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = totalW;
  stripCanvas.height = totalH;
  const stripCtx = stripCanvas.getContext("2d");

  stripCtx.fillStyle = STRIP_FILE_BG;
  stripCtx.fillRect(0, 0, totalW, totalH);

  let cursorY = STRIP_FILE_BORDER;
  entries.forEach((entry, i) => {
    const h = scaledHeights[i];
    stripCtx.drawImage(entry.canvas, STRIP_FILE_BORDER, cursorY, targetW, h);
    cursorY += h + STRIP_FILE_GAP;
  });

  stripCtx.fillStyle = "#151a20";
  stripCtx.font = "16px 'IBM Plex Mono', monospace";
  stripCtx.textAlign = "left";
  stripCtx.textBaseline = "alphabetic";
  stripCtx.fillText(APP_SIGNATURE.toUpperCase(), STRIP_FILE_BORDER, totalH - STRIP_FILE_BORDER - 14);

  stripCtx.fillStyle = "#64707d";
  stripCtx.font = "12px 'IBM Plex Mono', monospace";
  stripCtx.textAlign = "right";
  stripCtx.fillText(formatDateStamp(new Date()), totalW - STRIP_FILE_BORDER, totalH - STRIP_FILE_BORDER - 14);

  stripCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `framepuzzle_roll_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
}

function resetEverything() {
  galleryEntries.length = 0;
  galleryStrip.innerHTML = "";
  galleryCount.textContent = `0 / ${STRIP_MAX_PHOTOS}`;
  if (galleryEmpty) {
    galleryEmpty.style.display = "block";
    galleryStrip.appendChild(galleryEmpty);
  }
  hideStripComplete();
  updateStripDownloadAvailability();
  resetPuzzleOnly();
  statusText.textContent = "session cleared";
}

function renderGalleryThumb(snapshotCanvas, index) {
  const print = document.createElement("div");
  print.className = "print";

  const thumbCanvas = document.createElement("canvas");
  const THUMB_W = 220;
  const scale = THUMB_W / snapshotCanvas.width;
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = Math.round(snapshotCanvas.height * scale);
  thumbCanvas.getContext("2d").drawImage(snapshotCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const label = document.createElement("div");
  label.className = "print-label";
  label.textContent = `take ${String(index).padStart(2, "0")}`;

  const meta = document.createElement("div");
  meta.className = "print-meta";
  meta.textContent = formatClock(new Date());

  print.appendChild(thumbCanvas);
  print.appendChild(label);
  print.appendChild(meta);
  galleryStrip.insertBefore(print, galleryStrip.firstChild);
}

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateStamp(date) {
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resetPuzzleOnly() {
  puzzle.boardBox = null;
  puzzle.pieces = [];
  puzzle.solved = false;
  puzzle.fullPhotoboothCanvas = null;
  appState = "tracking";
  countdown.active = false;
  drag.activeHand = null;
  drag.piece = null;
  shatter.active = false;
  shatter.fragments = [];
  shatter.pendingCanvas = null;
  freezeGate.holding = false;
  fistHoldStartedAt = 0;
  pinchStates.clear();
  lastSeenFrame.box = null;
  lastSeenFrame.at = 0;
  updateProgressBadge();
}

function fitCanvasToWindow() {
  const stageEl = document.getElementById("stage");
  const vw = stageEl.clientWidth;
  const vh = stageEl.clientHeight;
  if (!vw || !vh || !canvas.width || !canvas.height) return;

  // Keep the complete camera frame visible instead of cropping it to fill the stage.
  const scale = Math.min(vw / canvas.width, vh / canvas.height);
  const cssWidth = Math.max(1, Math.round(canvas.width * scale));
  const cssHeight = Math.max(1, Math.round(canvas.height * scale));

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
}

window.addEventListener("resize", fitCanvasToWindow);

function isMacOS() {
  const platform = navigator.platform || "";
  const ua = navigator.userAgent || "";
  return /Mac/.test(platform) || (/Mac OS X/.test(ua) && !/iPhone|iPad|iPod/.test(ua));
}

function isSafariBrowser() {
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
}

function buildCameraProfile(width, height) {
  const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
  const video = {
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: 30, max: 30 },
    facingMode: { ideal: "user" },
  };

  // Ask the browser to preserve the native camera view when that constraint exists.
  if (supported.resizeMode) video.resizeMode = { ideal: "none" };

  return { video, audio: false };
}

function getCameraProfiles() {
  return [
    buildCameraProfile(1280, 720),
    buildCameraProfile(960, 540),
    { video: true, audio: false },
  ];
}

async function requestCameraStream() {
  let lastError;
  for (const constraints of getCameraProfiles()) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        throw err;
      }
    }
  }
  throw lastError || new Error("Unable to start the camera.");
}

async function configureCameraFraming(stream) {
  const track = stream.getVideoTracks()[0];
  if (!track || typeof track.getCapabilities !== "function" || typeof track.applyConstraints !== "function") {
    return;
  }

  let capabilities;
  try {
    capabilities = track.getCapabilities();
  } catch (err) {
    return;
  }

  const preferred = {};
  if (capabilities.zoom && Number.isFinite(capabilities.zoom.min)) {
    preferred.zoom = capabilities.zoom.min;
  }
  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
    preferred.focusMode = "continuous";
  }

  if (Object.keys(preferred).length === 0) return;

  try {
    await track.applyConstraints({ advanced: [preferred] });
  } catch (err) {
    console.info("[FramePuzzle] Native camera framing controls are unavailable.", err);
  }
}

function stopCameraStream() {
  const stream = cameraStream || videoEl.srcObject;
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => track.stop());
  }
  cameraStream = null;
  videoEl.srcObject = null;
}

async function initWebcam() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support webcam access.");
  }

  cameraStream = await requestCameraStream();
  await configureCameraFraming(cameraStream);
  videoEl.srcObject = cameraStream;

  if (videoEl.readyState < 1) {
    await new Promise((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error("The camera stream could not be read."));
    });
  }

  await videoEl.play();
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  fitCanvasToWindow();
}

function withTimeout(promise, ms, timeoutMessage) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function initHandLandmarker() {
  let vision;
  try {
    vision = await withTimeout(
      FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL),
      LOAD_TIMEOUT_MS,
      "Timed out loading the MediaPipe WASM runtime. Check your connection or whether cdn.jsdelivr.net is blocked."
    );
  } catch (err) {
    throw err;
  }

  let lastError;
  for (const delegate of getHandDelegateOrder()) {
    try {
      return await withTimeout(
        createHandLandmarker(vision, delegate),
        LOAD_TIMEOUT_MS,
        `Timed out loading the HandLandmarker model with ${delegate}.`
      );
    } catch (err) {
      lastError = err;
      console.warn(`[FramePuzzle] ${delegate} delegate failed, trying the next mode.`, err);
    }
  }

  throw lastError || new Error("Unable to load the HandLandmarker model.");
}

function getHandDelegateOrder() {
  return isSafariBrowser() ? ["CPU", "GPU"] : ["GPU", "CPU"];
}

function createHandLandmarker(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
      delegate,
    },
    runningMode: "video",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
}

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

const pinchStates = new Map();

function getHandScale(landmarks) {
  const palmWidth = dist2D(landmarks[LM.INDEX_MCP], landmarks[LM.PINKY_MCP]);
  const palmLength = dist2D(landmarks[LM.WRIST], landmarks[LM.MIDDLE_MCP]);
  return Math.max(0.04, (palmWidth + palmLength) / 2);
}

function isPinching(landmarks, handId) {
  const pinchRatio = dist2D(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) /
    getHandScale(landmarks);
  const wasPinching = pinchStates.get(handId) || false;
  const threshold = wasPinching ? PINCH_OPEN_RATIO : PINCH_CLOSE_RATIO;
  const pinching = pinchRatio <= threshold;
  pinchStates.set(handId, pinching);
  return pinching;
}

function getHandId(result, index) {
  const category =
    result.handednesses?.[index]?.[0]?.categoryName ||
    result.handedness?.[index]?.[0]?.categoryName;
  return category ? `hand-${category.toLowerCase()}` : `hand-${index}`;
}

function getTrackedHands(result) {
  return (result.landmarks || []).map((landmarks, index) => ({
    landmarks,
    id: getHandId(result, index),
  }));
}

function isFist(landmarks) {
  const wrist = landmarks[LM.WRIST];
  const pairs = [
    [LM.INDEX_TIP, LM.INDEX_MCP],
    [LM.MIDDLE_TIP, LM.MIDDLE_MCP],
    [LM.RING_TIP, LM.RING_MCP],
    [LM.PINKY_TIP, LM.PINKY_MCP],
  ];
  let curled = 0;
  for (const [tipIdx, mcpIdx] of pairs) {
    if (dist2D(landmarks[tipIdx], wrist) < dist2D(landmarks[mcpIdx], wrist)) curled++;
  }
  return curled >= 4;
}

function toPixel(landmarkNorm) {
  return { x: landmarkNorm.x * canvas.width, y: landmarkNorm.y * canvas.height };
}

function mirrorLandmarkX(landmark) {
  return { x: 1 - landmark.x, y: landmark.y };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function stabilizeFrame(nextBox) {
  const isRecent = lastSeenFrame.box &&
    performance.now() - lastSeenFrame.at < FRAME_GRACE_MS;
  if (!isRecent) return nextBox;

  const previous = lastSeenFrame.box;
  return {
    x: previous.x + (nextBox.x - previous.x) * FRAME_SMOOTHING,
    y: previous.y + (nextBox.y - previous.y) * FRAME_SMOOTHING,
    width: previous.width + (nextBox.width - previous.width) * FRAME_SMOOTHING,
    height: previous.height + (nextBox.height - previous.height) * FRAME_SMOOTHING,
  };
}

function computeHandFrame(indexTipA, indexTipB) {
  const a = toPixel(indexTipA);
  const b = toPixel(indexTipB);
  const centerX = (a.x + b.x) / 2;
  const centerY = (a.y + b.y) / 2;
  const span = Math.hypot(a.x - b.x, a.y - b.y);

  const rawWidth = Math.max(
    Math.abs(a.x - b.x) + FRAME_PADDING * 2,
    (Math.abs(a.y - b.y) + FRAME_PADDING * 2) * CAPTURE_ASPECT_RATIO,
    span * 1.12
  );
  const maxWidth = Math.max(
    1,
    Math.min(
      canvas.width * MAX_CAPTURE_WIDTH_RATIO,
      canvas.height * CAPTURE_ASPECT_RATIO * 0.9
    )
  );
  const minWidth = Math.min(maxWidth, canvas.width * MIN_CAPTURE_WIDTH_RATIO);
  const width = clamp(rawWidth, minWidth, maxWidth);
  const height = width / CAPTURE_ASPECT_RATIO;

  return {
    x: clamp(centerX - width / 2, 0, canvas.width - width),
    y: clamp(centerY - height / 2, 0, canvas.height - height),
    width,
    height,
  };
}

const freezeGate = { holding: false, since: 0 };

const FRAME_GRACE_MS = 450;
const lastSeenFrame = { box: null, at: 0 };

const countdown = {
  active: false,
  startedAt: 0,
};

function startCountdown(frameBox) {
  puzzle.boardBox = { ...frameBox };
  appState = "countdown";
  countdown.active = true;
  countdown.startedAt = performance.now();
}

function drawCountdownOverlay(box) {
  const elapsed = (performance.now() - countdown.startedAt) / 1000;
  const remaining = COUNTDOWN_SECONDS - elapsed;

  if (remaining <= 0) {
    finishCountdownAndCapture(box);
    return;
  }

  applyBWInsideBox(box);

  ctx.save();
  ctx.strokeStyle = "#35d0ba";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const n = Math.ceil(remaining);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  ctx.fillStyle = "rgba(5,6,9,0.48)";
  ctx.fillRect(box.x, box.y, box.width, box.height);

  ctx.font = `${Math.max(48, Math.min(box.width, box.height) * 0.4)}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = "#ffca3a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), cx, cy);
  ctx.restore();

  statusText.textContent = `capturing in ${n}...`;
}

function gaussianNoise(std) {
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * std;
}

function applyPhotoboothEffect(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = gray * PHOTOBOOTH_CONTRAST_ALPHA + PHOTOBOOTH_BRIGHTNESS_BETA;
    v += gaussianNoise(PHOTOBOOTH_NOISE_STD);
    v = Math.max(0, Math.min(255, v));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return imageData;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createDerangedSlotOrder(length) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let attempt = 0; attempt < 32; attempt++) {
    const order = shuffle([...indexes]);
    if (order.every((slotIndex, pieceIndex) => slotIndex !== pieceIndex)) {
      return order;
    }
  }

  // A rotation is always a valid fallback for a puzzle with more than one tile.
  return indexes.map((_, index) => (index + 1) % length);
}

function finishCountdownAndCapture(box) {
  countdown.active = false;

  const mirroredFrame = document.createElement("canvas");
  mirroredFrame.width = canvas.width;
  mirroredFrame.height = canvas.height;
  const mirroredCtx = mirroredFrame.getContext("2d");
  mirroredCtx.save();
  mirroredCtx.translate(mirroredFrame.width, 0);
  mirroredCtx.scale(-1, 1);
  mirroredCtx.drawImage(videoEl, 0, 0, mirroredFrame.width, mirroredFrame.height);
  mirroredCtx.restore();

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = Math.max(1, Math.round(box.width));
  cropCanvas.height = Math.max(1, Math.round(box.height));
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.drawImage(
    mirroredFrame,
    box.x, box.y, box.width, box.height,
    0, 0, cropCanvas.width, cropCanvas.height
  );

  const fullImageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
  applyPhotoboothEffect(fullImageData);
  cropCtx.putImageData(fullImageData, 0, 0);

  puzzle.fullPhotoboothCanvas = cropCanvas;

  const tileW = Math.floor(cropCanvas.width / GRID);
  const tileH = Math.floor(cropCanvas.height / GRID);
  const pieces = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const sx = col * tileW;
      const sy = row * tileH;
      const w = col === GRID - 1 ? cropCanvas.width - sx : tileW;
      const h = row === GRID - 1 ? cropCanvas.height - sy : tileH;

      const pieceCanvas = document.createElement("canvas");
      pieceCanvas.width = w;
      pieceCanvas.height = h;
      pieceCanvas.getContext("2d").drawImage(cropCanvas, sx, sy, w, h, 0, 0, w, h);

      pieces.push({
        row, col,
        canvas: pieceCanvas,
        w, h,
        x: 0, y: 0,
        placed: false,
        dragging: false,
      });
    }
  }

  const slots = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      slots.push({ x: box.x + col * tileW, y: box.y + row * tileH });
    }
  }
  const slotOrder = createDerangedSlotOrder(slots.length);

  pieces.forEach((piece, index) => {
    const slot = slots[slotOrder[index]];
    piece.x = slot.x;
    piece.y = slot.y;
    piece.placed = false;
  });

  puzzle.boardBox = box;
  puzzle.pieces = pieces;
  puzzle.tileW = tileW;
  puzzle.tileH = tileH;
  puzzle.solved = false;
  appState = "puzzle";
  fistHoldStartedAt = 0;
  updateProgressBadge();
}

function correctCellPosition(piece, box, tileW, tileH) {
  return {
    x: box.x + piece.col * tileW,
    y: box.y + piece.row * tileH,
  };
}

function isNearOwnCell(piece, box, tileW, tileH) {
  const target = correctCellPosition(piece, box, tileW, tileH);
  const dx = piece.x - target.x;
  const dy = piece.y - target.y;
  const tolerance = Math.min(tileW, tileH) * SNAP_DISTANCE_RATIO;
  return Math.hypot(dx, dy) <= tolerance;
}

function isLockedToOwnCell(piece, box, tileW, tileH) {
  const target = correctCellPosition(piece, box, tileW, tileH);
  return Math.abs(piece.x - target.x) < 1 && Math.abs(piece.y - target.y) < 1;
}

function reconcilePlacedState(box, tileW, tileH) {
  if (!box || !puzzle.pieces.length) return false;
  for (const piece of puzzle.pieces) {
    if (piece.dragging) continue;
    piece.placed = isLockedToOwnCell(piece, box, tileW, tileH);
  }
  return puzzle.pieces.every((piece) => piece.placed);
}

function snapPieceToCell(piece, box, tileW, tileH) {
  const target = correctCellPosition(piece, box, tileW, tileH);
  piece.x = target.x;
  piece.y = target.y;
  piece.placed = true;
}

function findPieceAtCell(row, col, excludedPiece = null) {
  const cellX = puzzle.boardBox.x + col * puzzle.tileW;
  const cellY = puzzle.boardBox.y + row * puzzle.tileH;
  return puzzle.pieces.find((piece) =>
    piece !== excludedPiece &&
    !piece.dragging &&
    Math.abs(piece.x - cellX) < 1 &&
    Math.abs(piece.y - cellY) < 1
  );
}

const drag = {
  activeHand: null,
  piece: null,
  offsetX: 0,
  offsetY: 0,
  originX: 0,
  originY: 0,
};

function findNearestPiece(px, py) {
  return puzzle.pieces.find((piece) =>
    !piece.placed &&
    !piece.dragging &&
    px >= piece.x - 8 &&
    px <= piece.x + piece.w + 8 &&
    py >= piece.y - 8 &&
    py <= piece.y + piece.h + 8
  ) || null;
}

function beginDrag(handLabel, point) {
  if (drag.activeHand !== null) return;

  const candidate = findNearestPiece(point.x, point.y);
  if (!candidate) return;

  drag.activeHand = handLabel;
  drag.piece = candidate;
  drag.offsetX = point.x - candidate.x;
  drag.offsetY = point.y - candidate.y;
  drag.originX = candidate.x;
  drag.originY = candidate.y;
  candidate.dragging = true;
  candidate.placed = false;
}

function moveActivePiece(handLabel, point) {
  if (drag.activeHand !== handLabel || !drag.piece) return;
  drag.piece.x = point.x - drag.offsetX;
  drag.piece.y = point.y - drag.offsetY;
  clampPieceToBoard(drag.piece);
}

function finishActiveDrag(handLabel) {
  if (drag.activeHand !== handLabel || !drag.piece) return;

  const piece = drag.piece;
  piece.dragging = false;

  if (isNearOwnCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH)) {
    const occupant = findPieceAtCell(piece.row, piece.col, piece);
    if (occupant) {
      occupant.x = drag.originX;
      occupant.y = drag.originY;
      occupant.placed = false;
    }
    snapPieceToCell(piece, puzzle.boardBox, puzzle.tileW, puzzle.tileH);
  } else {
    // Keep the board coherent after a missed drop instead of leaving tiles overlapped.
    piece.x = drag.originX;
    piece.y = drag.originY;
    piece.placed = false;
  }

  drag.activeHand = null;
  drag.piece = null;
  puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
  updateProgressBadge();
}

function handleDragForHand(handLabel, pinching, indexPx) {
  if (pinching) {
    if (drag.activeHand === null) {
      beginDrag(handLabel, indexPx);
    } else {
      moveActivePiece(handLabel, indexPx);
    }
  } else {
    finishActiveDrag(handLabel);
  }
}

function clampPieceToBoard(piece) {
  const box = puzzle.boardBox;
  piece.x = clamp(piece.x, box.x, box.x + box.width - piece.w);
  piece.y = clamp(piece.y, box.y, box.y + box.height - piece.h);
}

function pointFromPointerEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function bindPointerControls() {
  canvas.addEventListener("pointerdown", (event) => {
    if (appState !== "puzzle" || drag.activeHand !== null) return;
    beginDrag("pointer", pointFromPointerEvent(event));
    if (drag.activeHand === "pointer") {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (drag.activeHand !== "pointer") return;
    moveActivePiece("pointer", pointFromPointerEvent(event));
    event.preventDefault();
  });

  const endPointerDrag = (event) => {
    if (drag.activeHand !== "pointer") return;
    finishActiveDrag("pointer");
    event.preventDefault();
  };

  canvas.addEventListener("pointerup", endPointerDrag);
  canvas.addEventListener("pointercancel", endPointerDrag);
}

bindPointerControls();

function drawBoardAndPieces() {
  const box = puzzle.boardBox;

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(245,197,24,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(box.x + i * puzzle.tileW, box.y);
    ctx.lineTo(box.x + i * puzzle.tileW, box.y + box.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.x, box.y + i * puzzle.tileH);
    ctx.lineTo(box.x + box.width, box.y + i * puzzle.tileH);
    ctx.stroke();
  }
  ctx.restore();

  const sorted = [...puzzle.pieces].sort((a, b) => (a.dragging ? 1 : 0) - (b.dragging ? 1 : 0));

  for (const piece of sorted) {
    ctx.save();
    if (piece.dragging) {
      ctx.shadowColor = "rgba(53,208,186,0.9)";
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(piece.canvas, piece.x, piece.y, piece.w, piece.h);
    ctx.strokeStyle = piece.placed ? "#7bd88f" : "rgba(244,240,232,0.5)";
    ctx.lineWidth = piece.dragging ? 3 : 1.5;
    ctx.strokeRect(piece.x, piece.y, piece.w, piece.h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = puzzle.solved ? "#7bd88f" : "#35d0ba";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.restore();

  if (puzzle.solved) {
    ctx.save();
    ctx.fillStyle = "rgba(123,216,143,0.15)";
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.font = `${Math.max(20, box.width * 0.07)}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = "#7bd88f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("COMPLETE - hold fist to save", box.x + box.width / 2, box.y + box.height / 2);
    ctx.restore();
  }
}

function updateProgressBadge() {
  if (appState !== "puzzle") {
    progressBadge.classList.remove("visible", "solved");
    return;
  }
  const placedCount = puzzle.pieces.filter((p) => p.placed).length;
  progressText.textContent = `${placedCount} / ${puzzle.pieces.length} pieces placed`;
  progressBadge.classList.add("visible");
  progressBadge.classList.toggle("solved", puzzle.solved);
}

function updateGestureGuide() {
  let activeGesture = "capture";

  if (appState === "puzzle") {
    activeGesture = puzzle.solved ? "fist" : "drag";
  } else if (appState === "shattering" || (appState === "tracking" && isStripFull())) {
    activeGesture = null;
  }

  Object.entries(gestureHints).forEach(([gesture, el]) => {
    if (el) el.classList.toggle("active", gesture === activeGesture);
  });
}

function drawVideoFrame() {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function applyBWInsideBox(box) {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const w = Math.min(canvas.width - x, Math.round(box.width));
  const h = Math.min(canvas.height - y, Math.round(box.height));
  if (w <= 0 || h <= 0) return;

  const region = ctx.getImageData(x, y, w, h);
  applyPhotoboothEffect(region);
  ctx.putImageData(region, x, y);
}

function drawLiveFrameOverlay(box) {
  ctx.save();
  ctx.strokeStyle = "#35d0ba";
  ctx.lineWidth = 3;
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  const cornerLen = 18;
  ctx.lineWidth = 4;
  const corners = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + cornerLen * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + cornerLen * dx, cy);
    ctx.stroke();
  }
  ctx.restore();
}

function isPointInBoard(px, py, box) {
  if (!box) return false;
  return (
    px >= box.x &&
    px <= box.x + box.width &&
    py >= box.y &&
    py <= box.y + box.height
  );
}

function drawHandSkeleton(landmarksPx) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255,255,255,0.85)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "white";
  ctx.lineWidth = 3;

  for (const [iA, iB] of HAND_CONNECTIONS) {
    const a = landmarksPx[iA];
    const b = landmarksPx[iB];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.shadowBlur = 6;
  ctx.fillStyle = "white";
  for (const p of landmarksPx) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawHandSkeletonsOverBoard(handsLandmarks, box) {
  if (!box || !handsLandmarks || handsLandmarks.length === 0) return;

  for (const lm of handsLandmarks) {
    const landmarksPx = lm.map((pt) => toPixel(mirrorLandmarkX(pt)));
    const overBoard = landmarksPx.some((p) => isPointInBoard(p.x, p.y, box));
    if (overBoard) {
      drawHandSkeleton(landmarksPx);
    }
  }
}

function startShatter(sourceCanvas, box) {
  const cols = SHATTER_COLS;
  const rows = SHATTER_ROWS;
  const fragW = sourceCanvas.width / cols;
  const fragH = sourceCanvas.height / rows;
  const fragments = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sx = col * fragW;
      const sy = row * fragH;

      const fragCanvas = document.createElement("canvas");
      fragCanvas.width = Math.ceil(fragW);
      fragCanvas.height = Math.ceil(fragH);
      fragCanvas.getContext("2d").drawImage(
        sourceCanvas,
        sx, sy, fragW, fragH,
        0, 0, fragCanvas.width, fragCanvas.height
      );

      const cx = box.x + sx + fragW / 2;
      const cy = box.y + sy + fragH / 2;

      const boardCx = box.x + box.width / 2;
      const boardCy = box.y + box.height / 2;
      const dirX = cx - boardCx;
      const dirY = cy - boardCy;
      const dirLen = Math.max(1, Math.hypot(dirX, dirY));
      const speed = 90 + Math.random() * 160;

      fragments.push({
        canvas: fragCanvas,
        x: cx,
        y: cy,
        w: fragW,
        h: fragH,
        vx: (dirX / dirLen) * speed + (Math.random() - 0.5) * 40,
        vy: (dirY / dirLen) * speed + (Math.random() - 0.5) * 40 - 60,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 6,
        gravity: 220 + Math.random() * 80,
      });
    }
  }

  shatter.fragments = fragments;
  shatter.active = true;
  shatter.startedAt = performance.now();
  appState = "shattering";
}

function updateAndDrawShatter() {
  const elapsedMs = performance.now() - shatter.startedAt;
  const t = Math.min(1, elapsedMs / SHATTER_DURATION_MS);

  if (t >= 1) {
    finishShatter();
    return;
  }

  const dt = 1 / 60;
  const fadeStart = 0.45;

  ctx.save();
  for (const frag of shatter.fragments) {
    frag.x += frag.vx * dt;
    frag.y += frag.vy * dt;
    frag.vy += frag.gravity * dt;
    frag.rotation += frag.rotationSpeed * dt;

    const alpha = t < fadeStart ? 1 : Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart));
    const scale = 1 - t * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(frag.x, frag.y);
    ctx.rotate(frag.rotation);
    ctx.scale(scale, scale);
    ctx.drawImage(frag.canvas, -frag.w / 2, -frag.h / 2, frag.w, frag.h);
    ctx.restore();
  }
  ctx.restore();
}

function finishShatter() {
  shatter.active = false;
  shatter.fragments = [];
  if (shatter.pendingCanvas) {
    addToGallery(shatter.pendingCanvas);
    statusText.textContent = "saved to the roll";
    shatter.pendingCanvas = null;
  }
  resetPuzzleOnly();
}

function handleFistReset() {
  if (appState !== "puzzle") {
    statusText.textContent = "board reset by fist hold";
    resetPuzzleOnly();
    return;
  }

  const reallySolved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
  puzzle.solved = reallySolved;

  if (reallySolved && puzzle.fullPhotoboothCanvas) {
    shatter.pendingCanvas = puzzle.fullPhotoboothCanvas;
    startShatter(puzzle.fullPhotoboothCanvas, puzzle.boardBox);
  } else {
    statusText.textContent = "board reset by fist hold";
    resetPuzzleOnly();
  }
}

let handLandmarker = null;
let fistHoldStartedAt = 0;

function getFistHoldProgress() {
  if (!fistHoldStartedAt) return 0;
  return Math.min(1, (performance.now() - fistHoldStartedAt) / FIST_HOLD_MS);
}

function processResults(result) {
  if (appState === "shattering") {
    updateAndDrawShatter();
    statusText.textContent = "saving...";
    return;
  }

  const hands = getTrackedHands(result);
  const noHands = hands.length === 0;

  if (noHands) {
    statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot";
    fistHoldStartedAt = 0;
    freezeGate.holding = false;
    pinchStates.clear();

    if (drag.activeHand && drag.activeHand !== "pointer" && drag.piece) {
      finishActiveDrag(drag.activeHand);
    }

    if (appState === "tracking") {
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyBWInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = isStripFull()
        ? "roll complete - download or clear"
        : "looking for hands...";
      return;
    }

    if (appState === "countdown") {
      drawCountdownOverlay(puzzle.boardBox);
      return;
    }

    if (appState === "puzzle") {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
      drawBoardAndPieces();
      statusText.textContent = puzzle.solved
        ? "puzzle complete - hold fist to save"
        : "assemble the puzzle with pinch";
    }
    return;
  }

  statusDot.className = puzzle.solved ? "status-dot solved" : "status-dot live";

  const anyFist = hands.some(({ landmarks }) => isFist(landmarks));
  const draggingNow = drag.activeHand !== null && drag.piece !== null;

  // Once the countdown begins, preserve it regardless of the pose the user makes.
  if (appState === "puzzle" && anyFist && !draggingNow) {
    if (!fistHoldStartedAt) fistHoldStartedAt = performance.now();
    if (performance.now() - fistHoldStartedAt >= FIST_HOLD_MS) {
      fistHoldStartedAt = 0;
      handleFistReset();
      return;
    }
  } else {
    fistHoldStartedAt = 0;
  }

  if (appState === "tracking") {
    if (isStripFull()) {
      statusText.textContent = "roll complete - download or clear";
      return;
    }

    if (hands.length === 2) {
      const [handA, handB] = hands;
      const indexA = mirrorLandmarkX(handA.landmarks[LM.INDEX_TIP]);
      const indexB = mirrorLandmarkX(handB.landmarks[LM.INDEX_TIP]);
      const frameBox = stabilizeFrame(computeHandFrame(indexA, indexB));

      applyBWInsideBox(frameBox);
      drawLiveFrameOverlay(frameBox);
      lastSeenFrame.box = frameBox;
      lastSeenFrame.at = performance.now();

      const bothPinching = isPinching(handA.landmarks, handA.id) &&
        isPinching(handB.landmarks, handB.id);
      if (bothPinching) {
        if (!freezeGate.holding) {
          freezeGate.holding = true;
          freezeGate.since = performance.now();
        }
        statusDot.className = "status-dot armed";
        statusText.textContent = "hold the pinch...";

        if (performance.now() - freezeGate.since >= FREEZE_HOLD_MS) {
          freezeGate.holding = false;
          startCountdown(frameBox);
        }
      } else {
        freezeGate.holding = false;
        statusText.textContent = "hands tracked - set your frame";
      }
    } else {
      freezeGate.holding = false;
      const sinceLastSeen = performance.now() - lastSeenFrame.at;
      if (lastSeenFrame.box && sinceLastSeen < FRAME_GRACE_MS) {
        applyBWInsideBox(lastSeenFrame.box);
        drawLiveFrameOverlay(lastSeenFrame.box);
      }
      statusText.textContent = "use two hands to set the frame";
    }
    return;
  }

  if (appState === "countdown") {
    drawCountdownOverlay(puzzle.boardBox);
    return;
  }

  if (appState === "puzzle") {
    const activeHandIds = new Set();
    hands.forEach(({ landmarks, id }) => {
      activeHandIds.add(id);
      const pinching = isPinching(landmarks, id);
      const indexPx = toPixel(mirrorLandmarkX(landmarks[LM.INDEX_TIP]));
      handleDragForHand(id, pinching, indexPx);
    });

    if (
      drag.activeHand &&
      drag.activeHand !== "pointer" &&
      !activeHandIds.has(drag.activeHand) &&
      drag.piece
    ) {
      finishActiveDrag(drag.activeHand);
    }

    if (!drag.piece) {
      puzzle.solved = reconcilePlacedState(puzzle.boardBox, puzzle.tileW, puzzle.tileH);
      updateProgressBadge();
    }

    drawBoardAndPieces();
    drawHandSkeletonsOverBoard(hands.map(({ landmarks }) => landmarks), puzzle.boardBox);

    const fistProgress = getFistHoldProgress();
    statusText.textContent = puzzle.solved
      ? (fistProgress > 0
          ? `saving... hold fist ${Math.round(fistProgress * 100)}%`
          : "puzzle complete - hold fist to save")
      : "assemble the puzzle with pinch";
  }
}

let lastDetectionAt = 0;

function renderLoop() {
  if (document.hidden || videoEl.readyState < 2 || !handLandmarker) {
    requestAnimationFrame(renderLoop);
    return;
  }

  const nowMs = performance.now();
  const shouldRender =
    appState === "shattering" ||
    nowMs - lastDetectionAt >= DETECTION_INTERVAL_MS;

  if (shouldRender) {
    drawVideoFrame();

    if (appState === "shattering") {
      processResults({ landmarks: [] });
    } else {
      lastDetectionAt = nowMs;
      const result = handLandmarker.detectForVideo(videoEl, nowMs);
      processResults(result);
    }

    updateGestureGuide();
  }

  requestAnimationFrame(renderLoop);
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.style.display = "block";
}

function showLoaderError(message) {
  loaderText.textContent = message;
  loaderText.style.color = "#ff5a5f";
  loaderRetry.classList.remove("hidden");
}

function resetLoaderUI() {
  loadingOverlay.classList.remove("hidden");
  loaderText.style.color = "";
  loaderText.textContent = "loading hand model...";
  loaderRetry.classList.add("hidden");
  errorBanner.style.display = "none";
}

async function boot() {
  resetLoaderUI();

  let settled = false;
  const watchdogMs = (LOAD_TIMEOUT_MS * 2) + 5000;
  const watchdog = setTimeout(() => {
    if (!settled) {
      showLoaderError("Loading is taking too long. Try again or check your connection.");
    }
  }, watchdogMs);

  try {
    if (!videoEl.srcObject) {
      await initWebcam();
    }

    handLandmarker = await initHandLandmarker();

    settled = true;
    clearTimeout(watchdog);
    loadingOverlay.classList.add("hidden");
    statusText.textContent = "ready";
    if (!renderLoopStarted) {
      renderLoopStarted = true;
      requestAnimationFrame(renderLoop);
    }
  } catch (err) {
    settled = true;
    clearTimeout(watchdog);
    if (err && err.name === "NotAllowedError") {
      showLoaderError("Camera permission was denied. Enable it in your browser settings and try again.");
    } else if (err && err.name === "NotFoundError") {
      showLoaderError("No webcam was found.");
    } else {
      showLoaderError((err && err.message) || "Error starting the app.");
    }
  }
}

loaderRetry.addEventListener("click", () => {
  boot();
});

if (downloadStripBtn) {
  downloadStripBtn.addEventListener("click", downloadPhotoStrip);
  updateStripDownloadAvailability();
}

if (resetAllBtn) {
  resetAllBtn.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Clear the whole photo roll and start over?"
    );
    if (confirmed) resetEverything();
  });
}

window.addEventListener("pagehide", stopCameraStream, { once: true });

boot();
