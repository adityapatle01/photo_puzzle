# FramePuzzle Studio

FramePuzzle Studio is a browser-based gesture camera experience. It starts with a private mode choice, then uses a webcam and MediaPipe hand tracking to capture a hand-framed photo for either a 3x3 puzzle or a direct Classic Photo Booth save.

This version is a personalized edition with a new product identity, refreshed interface, English copy, responsive gallery layout, and stamped photo-roll exports.

## Features

- Full-field camera preview that avoids CSS zoom/cropping and asks supported cameras for an un-cropped native view
- Permission-safe landing screen that waits for a Puzzle or Photo Booth choice before starting the camera or MediaPipe
- Stable 4:3 hand-framed capture using two-hand pinch detection
- Puzzle Mode with a 3x3 drag-and-snap board and deterministic tile swaps, so pieces cannot overlap or silently mis-complete
- Classic Photo Booth Mode with a fist-to-save review and a one-tap retake action
- Change mode link that cancels only the active capture while preserving the shared session roll
- Adaptive pinch detection, stable hand identity, and a timed fist hold for more reliable gesture control
- Mouse, trackpad, and touch drag fallback for the puzzle board
- Black-and-white photo booth treatment with light film noise
- On-screen gesture guide that highlights the current action
- Session roll for up to 3 completed photos in capture order
- Downloadable PNG roll with a FramePuzzle Studio timestamp stamp
- Optional private Supabase backup of the exact PNG when a user downloads a roll
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
| Closed fist hold | Saves a completed puzzle, resets an unfinished board, or saves a Classic review photo |
| Retake button | Discards a Classic review photo and returns to framing |
| Mouse, trackpad, or touch drag | Backup control for moving a loose tile in Puzzle Mode |

## Supabase Cloud Backup

`download roll` keeps the local browser download and then uploads that exact PNG to a private Supabase Storage bucket. Anonymous Supabase Auth gives each browser a user ID, and the included migration limits Storage and database access to that user.

1. Add the project publishable key to `supabase-config.js`.
2. Follow the commands in `supabase/README.md` to push the migration and enable Anonymous Sign-ins.

Never put a Supabase secret or service-role key in this browser project.

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
