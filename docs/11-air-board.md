# 11. Air Board

**Air Board** turns the webcam into a drawing instrument. A hand-landmark
model tracks the user's hand in real time; the fingertip becomes a cursor,
gestures become tools, and strokes drawn in mid-air are committed onto the
board as real, editable Excalidraw elements.

It is available in the PWA (Chromium browsers) and in the desktop shell, and
it is entered from the mode strip, `Ctrl+3`, the command palette, or the
desktop **Air Board** menu.

---

## 11.1 Design principles

Mid-air drawing is usually unpleasant for three specific reasons. Air Board
attacks each one directly:

| Problem | What Air Board does |
|---|---|
| **Jitter.** Landmark output wobbles 2-4 px at rest, so lines look palsied. | A **1€ filter** whose cutoff frequency scales with hand velocity: heavy smoothing when still, almost none when sweeping. |
| **Gestures misfire.** A single threshold flickers on/off when a measurement sits on the boundary. | Every binary decision runs through a **Schmitt trigger** with separate on/off thresholds plus a minimum dwell time. Poses additionally need N consecutive agreeing frames. |
| **One-size thresholds.** Hand size and range of motion vary enormously. | A **calibration wizard** records the user's own gestures and derives all thresholds from those samples. |

A fourth problem — that freehand air strokes are simply messy — is handled at
commit time by geometric shape recognition rather than during the stroke.

## 11.2 Pipeline

```
camera frame
   └─ HandLandmarker (MediaPipe, WASM, GPU delegate)   handTracker.ts
        └─ 21 landmarks
             ├─ extractFeatures()                      landmarks.ts
             │    pinch distances, per-finger extension,
             │    palm centre, roll — all normalised by hand scale
             │
             └─ GestureEngine.update()                 gestureEngine.ts
                  ├─ pinch gates    (Schmitt trigger)
                  ├─ pose classify  (nearest calibrated centroid + margin)
                  ├─ action resolve (pinch outranks pose)
                  └─ cursor: active-area remap → sensitivity → 1€ filter
                       │
                       └─ AirSession                   airSession.ts
                            ├─ live ink painted to a 2D canvas
                            └─ on release:
                                 recognizeShape()      strokeShaper.ts
                                   └─ elementForShape() excalidrawFactory.ts
                                        └─ appendElements() sketchBridge.ts
                                             └─ board.sketch (persisted)
```

Nothing in the first five stages touches React. A tracker emits 30-60 frames a
second and each one moves a cursor; routing that through React state would
spend the whole frame budget on reconciliation. React is only notified when
something discrete happens — tool changed, shape recognised, status changed.

## 11.3 Feature normalisation

Raw pixel distances are useless as thresholds because they scale with how
close the hand is to the camera. Every feature is divided by a **hand scale**:
the mean of wrist→middle-MCP and index-MCP→pinky-MCP. Both are rigid palm
spans, so they stay stable while the fingers move.

Finger extension is measured as `‖tip−MCP‖ / ‖PIP−MCP‖`, remapped to 0..1.
This is orientation-independent — unlike the common `tip.y < pip.y` test,
which breaks the moment the hand rotates or points sideways.

## 11.4 Gestures and bindings

Two recognition strategies, because the two kinds of gesture behave differently:

- **Pinch gestures** (thumb ↔ a fingertip) are a single continuous channel.
  They act as pen-down, so they need sub-frame precision and get a Schmitt
  trigger with per-user on/off thresholds.
- **Pose gestures** (point, open palm, fist, two fingers, thumbs-up, L) are
  classified from the 5-element extension vector against the calibrated
  centroid, **normalised per axis by that axis's own measured deviation**.

  This is what makes calibration worth taking. A scalar "spread" only says the
  pose was held loosely; per-axis deviation says *which fingers* were held
  loosely. Someone making a fist may clamp their index rigidly while their
  pinky drifts — so index deviation is strong evidence and pinky deviation
  should be largely ignored. Dividing each axis by its own σ does exactly that,
  and puts the distance in units of standard deviations, so the acceptance gate
  becomes a fixed statistical radius (2.6σ) instead of a hand-tuned number.
  Uncalibrated poses fall back to a single generic σ, which reduces to plain
  weighted Euclidean distance and keeps both paths on the same scale.

  The winner must also beat the runner-up by a *ratio* rather than an absolute
  margin, so the ambiguity test behaves the same whether both candidates fit
  well or both fit badly. If two poses are near-equally plausible the engine
  returns *nothing* rather than guessing.

Every gesture is remappable to any action in ⚙ settings, including "nothing"
to disable a gesture the user keeps triggering by accident.

| Action | Default gesture | Effect |
|---|---|---|
| Open + browse tool ring | **Open palm** | Opens the ring; moving the hand browses it |
| Choose | **Fist** | Commits the highlighted option |
| Draw / drag | **Point** (index finger) | Pen down at the fingertip |
| Draw / drag | Pinch (thumb+index) | Same, as a steadier alternative |
| Erase | Middle pinch | Sweeps away elements near the cursor |
| Pan | Two fingers | Scrolls the sketch scene |
| Commit shape | Thumbs up | Forces shape snapping on the current stroke |
| Undo | L shape | Removes the last batch this session committed |

A **dwell click** (cursor held still for a configurable interval) is available
as a fist-free alternative for confirming a tool-ring selection.

### The browse → choose → draw loop

This is the core interaction, and two details make it work rather than
infuriate:

**The latch.** Closing a hand into a fist drags the fingertip several
centimetres — easily a whole wedge of the ring. If the highlight tracked the
cursor right up to the moment the fist registers, users would reliably get the
tool *next to* the one they aimed at. So the highlight follows the cursor only
while the palm is genuinely open (`ringScrubOpenness`, default 0.62); the
instant the hand starts closing (`ringLatchOpenness`, default 0.42) the choice
latches and stops moving. Opening the hand again unlatches it, so a mistake
costs nothing. The ring hub turns accent-coloured and grows a progress arc the
moment the latch engages, so the state is visible without reading anything.

**The cooldown.** Choosing ends on a fist, and the natural next motion is to
relax the hand — which is an open palm, which would instantly re-open the ring.
A 1.2 s hold-off after a selection stops the menu bouncing straight back.

Two consequences of "open palm always means menu" are deliberate: opening your
palm mid-stroke **commits** the stroke (it isn't discarded) and then opens the
ring; and there is no way to open the ring while a pinch is held, because a
pinch outranks every pose.

### Fist vs. pinch

A closed fist also brings the thumb and index tips together, so on raw distance
alone it reads as a pinch — which, now that the fist is the *select* gesture,
would fire a draw on every menu confirmation. What separates them is the other
fingers: a pinch leaves them relaxed or extended, a fist curls them into the
palm. The engine therefore requires mean middle/ring/pinky extension above 0.3
before any pinch gate can engage, and force-releases the gates below it.

## 11.5 Calibration

**Nothing in the wizard is clicked.** Capture arms itself: it watches the live
feature stream, waits until the hand has held steady, counts down, then
records (`useAutoCapture.ts`). This is not a nicety. Asking someone to hold a
pose *and* press a button means they either click with their other hand —
putting a second hand in frame for the tracker to latch onto — or they break
the pose to reach the mouse, so the thing being measured is the motion of
giving up on the pose. It was the single biggest reason calibration felt bad.

The wizard reads landmarks from the already-running session — no second camera
stream is opened. It offers a **Quick** path (palm, fist, point, pinch) or
**Everything**, and walks through:

1. **Hand choice.** Left, right, or whichever is tracked most confidently.
   (MediaPipe reports handedness from the camera's point of view; the engine
   flips the label when the preview is mirrored, so "Right" means the user's
   right hand.)
2. **Reach check.** Five targets to steer the cursor into — four corners and
   the centre. This doubles as the reach *calibration*: driving into the
   corners is exactly the movement that teaches the adaptive envelope its
   extremes (§11.5a), and it proves to the user before they draw anything that
   the cursor really does cover the whole board.
3. **Per-gesture capture.**
   - Pinch: samples a *closed* and an *open* hold. The trigger lands a third
     of the way from closed to open and the release two thirds along — a wide,
     deliberate hysteresis band fitted to that user's range of motion.
   - Pose: samples the extension vector for 1.5 s. The centroid becomes the
     template; the *spread* of the samples widens the acceptance radius, so a
     user who holds a pose loosely gets a correspondingly forgiving gate.

Results persist to `localStorage` under `chitra.airboard.profile.v1` and are
merged field-by-field on load, so a profile saved by an older build still
loads instead of silently resetting.

The profile carries its own `version`. The v1→v2 step (which introduced the
palm/fist flow) deliberately **discards the stored bindings** — v1 mapped two
fingers to the menu and the fist to panning, and silently keeping those would
mean an existing user never saw the new interaction. Calibration survives: it
measures the user's hand, which hasn't changed.

A final **Try it** step lights up each of the three core gestures as it's
recognised, so a mis-recorded pose is caught inside the wizard rather than
discovered later on the board. It also runs `checkCalibration()`, which reports
two failure modes the user can act on immediately:

- **Collisions.** Two poses recorded so alike the classifier can't separate
  them — "point" and "L shape" differ only in the thumb, and if the user's
  thumb barely moves between them the centroids land on top of each other. At
  runtime the ambiguity guard then refuses *both*, so the symptom is "the
  gesture doesn't work" with no clue why. Separation is measured in pooled
  standard deviations; under ~1.6σ it's flagged, under 1σ it's an error.
- **Unsteady holds**, which produce wide deviations and therefore forgiving but
  imprecise recognition.

Catching these while the user is still in the wizard and can re-record the
offending pose is worth far more than discovering it later.

The auto-capture stability check watches **all five extension axes**, not a
single scalar. Openness alone is nearly identical for "point" and "L shape"
(both have one finger extended), so a hand drifting between the two would read
as perfectly steady and be recorded as a blurred average of both.

## 11.5a Adaptive reach — why the cursor used to feel stuck

The single worst failure mode in mid-air pointing is a mismatch between the
part of the camera frame the user actually moves through and the part the app
maps onto the board. A fixed rectangle cannot be right: it depends on seating
distance, arm length, camera field of view, and whether the user is at a desk
or standing at a wall display.

Get it wrong and the cursor covers a fraction of the canvas and spends the
rest of its life pinned against a clamp — which users read, correctly, as
*"the cursor doesn't move"*. That is exactly what the original fixed
`activeArea` did.

`adaptiveArea.ts` learns the envelope from the user's own movement instead:

- **Expand fast, contract slowly.** Reaching somewhere new works on the first
  frame; shrinking is the dangerous direction (it silently raises gain) so it
  decays over tens of seconds.
- **Never let the span collapse.** A hand held still would otherwise drive the
  span toward zero and the gain toward infinity, so the cursor would explode
  on the first twitch. A hard floor (16 % of frame) prevents it.
- **Start sane.** Until ~45 samples are in, it blends with the configured area
  so the first second still works and there's no visible jump at handover.

Measured on a real session: a fingertip sweep covering only the middle fifth
of the camera frame now spans ~75 % of the board on both axes. The same sweep
against the old fixed rectangle covered roughly a third of that.

When the cursor *does* hit a board edge, a warm band glows along it
(`drawEdgeHints`). Silently clamping is what makes a cursor feel broken;
saying "you've run out of reach, keep going that way" is both honest and the
gesture that teaches the envelope to grow.

Auto-reach is on by default and can be turned off (or reset) in ⚙ settings,
which then falls back to the hand-tuned `activeArea` box.

## 11.5b The field guide

An in-app tutorial, opened from ⚙ settings, the **?** in the HUD, the command
palette, or the desktop **Air Board** menu. Six sections: how it works, the
cursor, gestures, tools, shape sense, and getting good results.

Its defining property is that **nothing in it is a mock-up**:

- Gesture animations are rendered by `handSynth.ts` from the very `template`
  extension vectors the pose classifier matches against. Retune a template and
  the illustration follows it, so the guide cannot drift into describing a
  gesture that no longer exists.
- Tool previews trace a synthetic hand-drawn stroke and hand it to the real
  `recognizeShape()`. The pen preview genuinely reports what the recogniser
  decided ("Recognised as ellipse — closed and smooth all the way round"), and
  it re-runs live as the user drags the snapping slider — including showing
  raw ink when they turn snapping off.
- Where the camera is running, each gesture card lights up as the user
  performs it, so "here is the gesture" and "here is you doing it" sit side by
  side.

Two details worth knowing if you touch this code. Demo strokes live in 0..1
space, but `recognizeShape` reasons in board pixels and rejects anything under
a few units across — so `recognizeNormalized()` scales up for recognition and
back down for drawing. And every demo canvas is wider than it is tall, so all
rendering goes through a centred square `stage()`; mapping a square stroke
axis-by-axis onto a wide canvas turns every circle into a fat ellipse and every
hand into a splayed one.

## 11.5c Full-window surface, and a canvas-sizing trap

Air Board renders into a **portal on `<body>`** with a `position: fixed` root,
not inside the canvas container. Nested in the React Flow wrapper it could only
ever cover the canvas column — the cursor stopped dead at the sidebar, the
header and the board tabs, so it reached "only a portion of the page". The
portal root is pointer-transparent; the HUD, panels and camera thumbnail opt
back in with `pointer-events-auto`.

**The trap worth knowing about.** `<canvas>` is a *replaced element*. Given
`position: absolute; inset: 0` but no explicit CSS size, it does **not** stretch
to its containing block the way a `<div>` would — `width: auto` resolves to its
*intrinsic* size (the `width`/`height` attributes, default 300×150) and the
insets merely position it. The air canvas was therefore a 300×150 box in the
top-left corner regardless of the window size, and the cursor was trapped
inside it. `h-full w-full` on the canvas is load-bearing; don't remove it.

Two related robustness fixes:

- A **`ResizeObserver`** on the canvas, because a window-resize listener misses
  layout the overlay doesn't control (the sidebar appearing, the initial mount
  landing before layout settles). When the backing store disagrees with the CSS
  box, everything is drawn into the wrong sub-rectangle — which looks exactly
  like a broken cursor.
- `resize()` **early-returns when the size is unchanged**, since assigning
  `canvas.width` clears the canvas even when the value is identical.

### Clean board

`cleanBoard` (on by default, toggled from the HUD) hides the cards, edges,
inbox and board tabs while drawing. Air ink is low-contrast and hard to place
over a busy board, and the point of the mode is a blank wall.

The React Flow subtree is hidden with **`opacity: 0`, not `visibility:
hidden`** — visibility is inherited, and any descendant setting `visibility:
visible` (React Flow does, inside the node renderer) pops back into view.
Opacity composites the whole subtree and cannot be undone from inside it, while
still preserving layout so React Flow keeps measuring its viewport correctly
when the mode is left.

### Frame-loop cost

| Was | Now |
|---|---|
| `getBoundingClientRect()` 3-4× per frame at up to 144fps — each forces a layout flush | Box cached, invalidated by the ResizeObserver |
| Camera thumbnail repainted a full video frame every rAF | Capped at ~20fps; the cursor still runs at full rate |
| Cursor painted at the detection position, so it visibly stepped at ~30fps | Interpolated between detections; display-rate motion at no inference cost |
| Trail drawn as one styled `stroke()` per segment — up to 160 path + state changes per frame, ~23k/sec | Segments bucketed into 6 age bands, one path per band |
| Clearing a 1783×1047 buffer every frame even with nothing on it | Idle frames skip the clear entirely (the common case when the hand is out of frame) |
| Ring state polled at 15Hz always, re-rendering the whole overlay | Polled only while the ring is open |
| Live stroke re-pathed in full every frame, unbounded | Older half decimated past 1200 points |
| Camera opened at 720p | 640×480 — the landmark model works on a ~224px crop, so source resolution mainly affects the palm *detector*, which is fine at VGA for a hand at desk distance |
| Inference ran at full rate even with no hand in frame | After ~0.5s with no hand, detection drops to every 3rd frame (~10fps) and snaps back to full rate on the first detection |

**Measured steady state** (desktop, hand in frame, 1426×838 window): detector
28-30 fps, inference 19-24 ms/frame, render loop matched to the detector at
~30 fps, 1-2 long tasks per 10 s and those only marginally over the 50 ms
threshold. Model initialisation costs one ~1.6 s task at startup, which is
unavoidable for a 7.8 MB graph.

**Inference is now the bottleneck**, not the rendering. At ~20 ms per frame it
is roughly half the main thread whenever a hand is visible. The next real step
is moving MediaPipe into a worker with `OffscreenCanvas`; that is a substantial
change (per-frame `ImageBitmap` transfer, GPU delegate behaviour in workers)
and has not been attempted. The `numHands: 1` setting and the adaptive cadence
above are what keep the current cost tolerable.

## 11.6 Shape recognition

Recognition is **geometric**, not template-based ($1/$P). Template matchers
classify well but only return a label; we need the actual parameters — centre,
radii, corners — to emit a clean Excalidraw element, and geometric fitting
returns both at once while being rotation-tolerant for free.

On release the stroke is deduplicated, resampled to 64 evenly-spaced points,
and scored:

- **Closed?** End within 22 % of path length of the start — scale-free, so it
  works for a 40 px and a 900 px shape.
- **Open strokes** → straightness test → `line`, or `arrow` if the last ~28 %
  of the path doubles back sharply (an arrowhead). Lines snap to 0/45/90° when
  within a few degrees.
- **Closed strokes** → scored against rectangle / ellipse / diamond / triangle
  using bounding-box fill ratio (1.0 · 0.785 · 0.5 · 0.5), circularity
  (4πA/P²) and corner count from local turn-angle analysis with
  non-maximum suppression.

A shape is only accepted if it clears an absolute fit threshold **and** beats
the runner-up by a margin; an ambiguous blob stays as ink rather than snapping
to the wrong primitive. Near-square boxes are squared up, because people aim
for regular shapes far more often than they aim for a 103×97 rectangle.

The snapping slider runs from "keep my ink" (recognition off entirely) to
"always snap", and widens or narrows every gate uniformly.

## 11.7 Tools

Selected from the HUD or the radial ring (menu gesture, or `R`).

| Tool | Behaviour |
|---|---|
| Pen | Freehand ink, passed through shape recognition |
| Marker | Thick translucent highlighter, no snapping |
| Box / Circle / Diamond / Arrow / Line | Rubber-band a primitive between pinch-down and release |
| Card | Drag a box, then type a title — spawns a real Chitra **card + node** on the board, positioned where it was drawn |
| Eraser | Sweep to delete elements near the cursor |
| Laser | Pointer only, leaves a fading trail — for presenting |

The **Card** tool is what makes Air Board an ideation surface rather than a
drawing toy: air-drawn boxes become typed cards that participate in the
structure canvas, edges, exports and the decision log like any other card.

## 11.8 Where the ink goes

Air strokes are committed into the board's existing **Excalidraw sketch
layer** (`board.sketch`), not a private canvas. Consequences:

- Everything drawn in the air is afterwards selectable, editable and erasable
  with the mouse in Sketch mode.
- It saves inside the `.chitra` archive automatically.
- It exports through every existing path (PNG, SVG, PDF, HTML, DOCX).

Every element carries `customData.chitraSource = "airboard"`, preserving
provenance in the saved file.

The overlay reads live scroll/zoom from the Excalidraw imperative API via
`sketchBridge.ts`, so ink lands exactly under the visible cursor regardless of
how the sketch layer is panned.

## 11.9 Assets and privacy

The MediaPipe WASM runtime (~11 MB, plus an ~11 MB non-SIMD fallback) and the
float16 hand model (~7.8 MB) are served from `apps/web/public/mediapipe/`, not
from the jsDelivr CDN the MediaPipe docs use. Chitra is local-first and
offline-capable, and the desktop shell ships a CSP with no third-party
`script-src`.

That folder is **generated rather than committed** — 30 MB is four times the
size of the entire git history. [`tools/fetch-airboard-assets.mjs`](../tools/fetch-airboard-assets.mjs)
copies the WASM out of `node_modules` (where it lives as a pinned dependency,
so no network is involved) and downloads the model once, writing through a
`.partial` file so an interrupted download can't leave a plausible-looking
stub. It runs automatically before `dev` and `build` on both targets, is a
no-op once satisfied, and degrades to a warning rather than failing the build
if the network is unavailable — only Air Board is affected.

They are excluded from the service-worker precache and runtime-cached
`CacheFirst` instead, so a user who never opens Air Board never downloads
them. The `AirBoardOverlay` chunk itself is lazy — ~61 KB gzipped ~20 KB.

**No video leaves the machine.** Frames are analysed in memory and discarded;
nothing is recorded, stored or transmitted. The camera runs only while Air
Board mode is open and stops the moment the mode is left.

## 11.10 Desktop specifics

The desktop shell needs three things the browser gives for free:

1. **A real origin.** `file://` is a null origin where `fetch()` is blocked,
   which breaks MediaPipe outright (both the WASM runtime and the model are
   fetched). The renderer is therefore served over a privileged custom
   `app://` scheme (`src/main/appProtocol.ts`) with path-traversal guarding.
2. **A CSP that permits WASM *and* `eval`.** `script-src` includes
   `'wasm-unsafe-eval'` — without it the hand-landmark graph cannot be
   instantiated — and `'unsafe-eval'`, which Excalidraw's lazy chunk requires
   because it compiles at runtime via `new Function`. Omitting the latter kills
   the sketch layer with *"Refused to evaluate a string as JavaScript"*, and
   because Air Board commits its ink into that scene, every air stroke silently
   vanishes with it. The usual objection to `unsafe-eval` is much weaker here:
   the renderer loads no remote code, runs sandboxed with context isolation and
   no node integration, and cannot navigate off-origin. `blob:` covers
   MediaPipe's runtime-spawned workers and `media-src` the camera stream. All
   injected at build time by a Vite plugin so `apps/web/index.html` stays free
   of Electron-specific policy.
3. **Permission policy.** Electron grants most web permissions without asking.
   `src/main/permissions.ts` replaces that with deny-by-default: only `media`,
   only from our own origin, with display capture refused outright. On macOS
   the TCC camera prompt must be raised from the main process, so
   `airboard:ensureCamera` does that over IPC before `getUserMedia` runs, and
   `NSCameraUsageDescription` is set in `electron-builder.yml`.

The MediaPipe assets are `asarUnpack`ed — inside the asar archive they would
be unreachable to the renderer's fetch.

## 11.11 Files

```
apps/web/src/airboard/
  oneEuro.ts             1€ filter + Schmitt trigger
  adaptiveArea.ts        self-learning reach envelope (§11.5a)
  landmarks.ts           landmark indices, hand scale, feature extraction
  gestureProfile.ts      vocabulary, bindings, calibration, persistence
  gestureEngine.ts       cursor + action resolution (no DOM, no React)
  handTracker.ts         camera + MediaPipe lifecycle
  strokeShaper.ts        resample, simplify, smooth, recognise
  excalidrawFactory.ts   element construction
  sketchBridge.ts        Excalidraw scene read/write + coordinate transforms
  flowBridge.ts          React Flow coordinate transform (card placement)
  airSession.ts          the runtime: binds all of the above, paints the canvas
  airBoardStore.ts       session state (zustand)
  AirBoardOverlay.tsx    HUD, tool ring, camera PIP, card prompt
  useAutoCapture.ts      hands-free capture state machine for the wizard
  calibrationQuality.ts  pose-separation + steadiness checks
  handSynth.ts           renders a hand from an extension vector (tutorial)
  tutorialDemos.ts       synthetic strokes + demo rendering (tutorial)
  AirTutorial.tsx        the illustrated field guide
  AirCalibration.tsx     calibration wizard
  AirSettings.tsx        bindings, feel sliders, reach area, camera picker
  LazyAirBoard.tsx       dynamic-import boundary
```

## 11.12 Known limits (first iteration)

- **One hand.** The tracker is configured for a single hand; two-handed
  gestures (pinch-to-zoom, ruler) are the obvious next step.
- **No air text entry.** The Card tool falls back to the keyboard for titles,
  which is right at a desk but not at a whiteboard.
- **Recognition is single-stroke.** Multi-stroke figures (a plus sign, a
  crossed-out box) are committed as separate elements.
- **No gesture macros.** Bindings are one gesture → one action; sequences
  ("point then pinch") aren't expressible yet.
- **Lighting matters.** Detection confidence drops in strong backlight; the
  HUD reports FPS and tracking state so the cause is at least visible.
