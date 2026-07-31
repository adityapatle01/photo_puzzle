# FramePuzzle Studio

FramePuzzle Studio is a browser-based gesture camera puzzle. It uses a webcam and MediaPipe hand tracking to capture a hand-framed photo, split it into a 3x3 puzzle, and save completed puzzles into a downloadable photo roll.

This version is a personalized edition with a new product identity, refreshed interface, English copy, responsive gallery layout, and stamped photo-roll exports.

## Features

- Full-field camera preview that avoids CSS zoom/cropping and asks supported cameras for an un-cropped native view
- Stable 4:3 hand-framed capture using two-hand pinch detection
- 3x3 drag-and-snap puzzle with deterministic tile swaps, so pieces cannot overlap or silently mis-complete
- Adaptive pinch detection, stable hand identity, and a timed fist hold for more reliable gesture control
- Mouse, trackpad, and touch drag fallback for the puzzle board
- Black-and-white photo booth treatment with light film noise
- On-screen gesture guide that highlights the current action
- Session roll for up to 3 completed puzzle photos
- Downloadable PNG roll with a FramePuzzle Studio timestamp stamp
- Retry and error states for camera/model loading issues

## Run Locally

The app uses ES modules and webcam permissions, so it should be served over local HTTP instead of opened directly as a file.

### macOS / MacBook Air

On macOS, the easiest path is the included launcher:

```bash
./launch-macos.command
```

You can also double-click `launch-macos.command` in Finder. It starts a local server, chooses the next open port if `5500` is already busy, and opens the app in your default browser.

If macOS says the file is not executable, run this once:

```bash
chmod +x launch-macos.command
```

For camera permissions, check **System Settings > Privacy & Security > Camera** and make sure your browser is allowed. Chrome or Edge is recommended on Apple Silicon. Safari is supported with a CPU-first fallback for the hand-tracking model.

### Manual Server

```bash
python3 -m http.server 5500 --bind 127.0.0.1
```

Then open:

```text
http://localhost:5500
```

Allow camera access when the browser asks. The first load also needs internet access so MediaPipe can download its hand model and WASM runtime.

## Gesture Controls

| Gesture | Action |
| --- | --- |
| Two hands pinching | Locks the hand-framed area and starts the countdown |
| One hand pinching over a tile | Drags a puzzle piece |
| Closed fist hold | Saves a completed puzzle or resets the active board |
| Mouse, trackpad, or touch drag | Backup control for moving a loose tile |

## Project Structure

```text
Puzzle/
|-- index.html
|-- app.js
|-- launch-macos.command
|-- css/
|   `-- styles.css
`-- .gitignore
```

## Tech Stack

- MediaPipe Tasks Vision `v0.10.14`
- Canvas 2D API
- JavaScript ES modules
- CSS custom properties and responsive layout
- macOS launcher script using the built-in Python HTTP server

External browser dependencies load from CDN:

- `cdn.jsdelivr.net` for the MediaPipe runtime
- `storage.googleapis.com` for the HandLandmarker model

## Notes

This repository was customized from an existing clone whose remote points to `https://github.com/mishu006/Puzzle.git`. If you publish or submit this project, keep attribution/license requirements intact and describe it as your adapted version rather than as a from-scratch build.
# photo_puzzle
