# onwave — Design & Implementation Doc

## Overview

**onwave** is a zero-dependency, no-ML browser library that detects a hand wave in front of a device camera and fires a callback — a drop-in alternative to `onclick` for hands-free UIs.

> *You built a timer app. The phone is on a stand. The user's hands are wet. Tapping the screen sucks.*

### The one-liner pitch

```
onwave is to onclick what a wave is to a tap.
```

### How it works (in plain terms)

A hand waving in front of a camera briefly blocks ambient light. The average brightness (luma) of the camera feed drops sharply, then recovers. That drop-and-recover is the gesture. No ML model. No landmark detection. Just pixel math.

---

## Positioning

### Differentiator

Every other gesture solution for the browser uses ML (MediaPipe, TensorFlow.js Handpose). These ship 10–20MB of model weights, require significant CPU/GPU, and are complex to integrate. onwave does the same job — "user waved, fire an event" — with ~30 lines of math.

| | onwave | MediaPipe Hands |
|---|---|---|
| Bundle size | < 1KB | ~10MB |
| Dependencies | 0 | runtime + model |
| Setup | `createWaveDetector()` | model load + pipeline |
| Accuracy | sufficient for tap-replacement | hand landmark precision |
| Use case | trigger events | complex gesture recognition |

### Target audience

Developers building **display/kiosk/stand UIs** where tapping is awkward:
- Phone or tablet on a stand (recipe timers, brew timers, workout timers)
- Kitchen apps — hands wet or greasy
- Fitness apps — mid-workout
- Retail/museum kiosk displays
- Accessibility tools — limited motor control

### What it is NOT

- Not a full gesture recognition system (no swipe, pinch, etc.)
- Not a replacement for MediaPipe when you need landmark precision
- Not a native app solution (browser only, via getUserMedia)

---

## API Design

### Vanilla JS

```ts
import { createWaveDetector } from 'onwave'

const detector = createWaveDetector({
  onWave: () => timer.toggle(),   // required — fires once per wave
  threshold: 40,                  // optional — luma drop to trigger (0–255, default: 40)
  cooldown: 1000,                 // optional — ms before next wave accepted (default: 1000)
  sampleInterval: 100,            // optional — ms between luma samples (default: 100)
  sampleSize: 10,                 // optional — canvas dimension in px (default: 10)
  calibrationFrames: 10,          // optional — frames to establish baseline (default: 10)
  facingMode: 'user',             // optional — camera to use (default: 'user')
})

await detector.start()   // requests camera, begins sampling — returns Promise
detector.stop()          // releases camera, cleans up
detector.calibrate()     // re-samples baseline (call if lighting changes)
```

**Return value of `createWaveDetector`:**

```ts
interface WaveDetector {
  start(): Promise<void>
  stop(): void
  calibrate(): void
  readonly state: 'idle' | 'calibrating' | 'listening' | 'triggered' | 'stopped'
}
```

**Options type:**

```ts
interface WaveDetectorOptions {
  onWave: () => void
  threshold?: number          // default: 40
  cooldown?: number           // default: 1000
  sampleInterval?: number     // default: 100
  sampleSize?: number         // default: 10
  calibrationFrames?: number  // default: 10
  facingMode?: 'user' | 'environment'  // default: 'user'
}
```

### React hook

```ts
import { useOnWave } from 'onwave/react'

function BrewTimer() {
  const { ref, state, calibrate } = useOnWave(handleToggle, {
    threshold: 40,
    cooldown: 1000,
  })

  return (
    <button ref={ref}>
      {state === 'listening' ? 'Wave to toggle' : 'Starting camera...'}
    </button>
  )
}
```

The `ref` is attached to any element — onwave uses it only as a mount/unmount lifecycle anchor. The camera is not tied to the element's position.

**Hook signature:**

```ts
function useOnWave(
  onWave: () => void,
  options?: Omit<WaveDetectorOptions, 'onWave'>
): {
  ref: React.RefObject<HTMLElement>
  state: WaveDetector['state']
  calibrate: () => void
}
```

**Lifecycle:** detector starts on mount, stops on unmount. Camera is released automatically.

---

## Core Algorithm

### Step 1 — Camera access

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: 320, height: 240 },
  audio: false,
})
const video = document.createElement('video')
video.srcObject = stream
await video.play()
```

Low resolution (320×240) is intentional — we don't need image quality, just brightness signal. Smaller frame = faster to draw and sample.

### Step 2 — Luma sampling

Every `sampleInterval` ms, draw the current video frame to a tiny offscreen canvas, read all pixel values, and compute average luma:

```ts
const canvas = new OffscreenCanvas(sampleSize, sampleSize)  // e.g. 10×10
const ctx = canvas.getContext('2d')

function sampleLuma(): number {
  ctx.drawImage(video, 0, 0, sampleSize, sampleSize)
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    // ITU-R BT.601 luma coefficients
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return total / (sampleSize * sampleSize)  // 0–255
}
```

100 pixels (10×10) is sufficient for a stable average. CPU cost is negligible.

### Step 3 — Baseline calibration

On start, sample `calibrationFrames` frames and average them to establish the scene's ambient brightness:

```ts
async function calibrate(): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < calibrationFrames; i++) {
    samples.push(sampleLuma())
    await sleep(sampleInterval)
  }
  return samples.reduce((a, b) => a + b) / samples.length
}
```

This makes the threshold relative to the environment. Works in a bright kitchen or a dim café.

### Step 4 — Wave detection state machine

```
CALIBRATING → LISTENING → TRIGGERED → LISTENING (after cooldown)
                              ↑
                         luma < baseline - threshold
```

```ts
let baseline: number
let inWave = false
let lastTriggered = 0

function onSample(luma: number) {
  const now = Date.now()

  if (luma < baseline - threshold) {
    if (!inWave) {
      inWave = true
      if (now - lastTriggered > cooldown) {
        lastTriggered = now
        onWave()          // fire the callback once
      }
    }
  } else {
    inWave = false        // brightness recovered — ready for next wave
  }
}
```

**Why `inWave` flag?** A wave lasts 300–500ms — many sample ticks. Without it, `onWave` fires on every tick during the dip. The flag ensures exactly one fire per wave.

**Why `cooldown`?** Prevents double-triggering from a slow or lingering hand. Default 1000ms gives enough time for the user to move their hand away before the next wave is accepted.

### Step 5 — Cleanup

```ts
function stop() {
  clearInterval(samplingInterval)
  stream.getTracks().forEach(track => track.stop())  // releases camera
  video.srcObject = null
}
```

Releasing tracks is critical — this turns off the camera indicator light on the device.

---

## Implementation

### File: `src/detector.ts`

The entire core. No imports. Exports `createWaveDetector`.

Responsibilities:
- Camera access via `getUserMedia`
- Offscreen canvas luma sampling
- Calibration
- State machine (calibrating → listening → triggered)
- Cooldown enforcement
- Cleanup on `stop()`

### File: `src/react.ts`

Thin wrapper. Imports only `react` (peer dep) and `./detector`.

Responsibilities:
- Create detector on mount, stop on unmount (`useEffect`)
- Re-create detector if `onWave` callback identity changes (`useCallback` pattern — caller's responsibility, documented)
- Expose `state` as React state for UI feedback
- Return stable `ref` and `calibrate` function

### File: `src/index.ts`

```ts
export { createWaveDetector } from './detector'
export type { WaveDetector, WaveDetectorOptions } from './detector'
```

React hook is intentionally NOT re-exported here — it lives at `onwave/react` subpath only, so non-React users don't pull in React types.

---

## Repo Structure

```
onwave/
├── src/
│   ├── detector.ts          # core — no deps
│   ├── react.ts             # React hook — peer dep only
│   └── index.ts             # barrel
├── demo/
│   ├── index.html           # standalone demo (no framework)
│   ├── react-demo/          # Vite React demo app
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── vite.config.ts
├── tests/
│   ├── detector.test.ts     # unit tests with mocked getUserMedia
│   └── luma.test.ts         # luma math tests (pure, no mocks needed)
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .github/
│   └── workflows/
│       ├── ci.yml           # test on PR
│       └── publish.yml      # publish to npm on release tag
├── LICENSE                  # MIT
└── README.md
```

---

## Package Configuration

### `package.json`

```json
{
  "name": "onwave",
  "version": "0.1.0",
  "description": "Zero-dependency wave gesture for the browser. onwave is to onclick what a wave is to a tap.",
  "keywords": ["gesture", "wave", "camera", "hands-free", "getUserMedia", "luma", "motion"],
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./react": {
      "import": "./dist/react.js",
      "require": "./dist/react.cjs",
      "types": "./dist/react.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "dev": "vite demo/"
  },
  "peerDependencies": {
    "react": ">=17"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  },
  "devDependencies": {
    "tsup": "...",
    "typescript": "...",
    "vitest": "...",
    "vite": "...",
    "react": "...",
    "@types/react": "..."
  }
}
```

### `tsup.config.ts`

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
})
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

---

## Testing

### Luma math (pure, no mocks)

Test the luma formula directly with known pixel values:
- All white pixels (255, 255, 255) → luma ≈ 255
- All black pixels (0, 0, 0) → luma = 0
- Red-only pixel → luma ≈ 76 (0.299 × 255)

### Detector logic (mocked getUserMedia)

Mock `navigator.mediaDevices.getUserMedia` to return a fake stream with controllable luma values. Test:
- `onWave` fires when luma drops below `baseline - threshold`
- `onWave` does NOT fire again during same dip (`inWave` flag)
- `onWave` does NOT fire within `cooldown` ms of previous trigger
- `stop()` clears the sampling interval
- `calibrate()` resets the baseline

### What NOT to test

- Actual camera hardware behavior (integration, not unit)
- React hook internals beyond lifecycle (mount/unmount start/stop)

---

## Demo App

The demo should convey the concept in 5 seconds to a developer landing on the repo.

**Vanilla demo (`demo/index.html`):**
- A large counter on screen
- Wave in front of camera → counter increments
- Shows current luma value and baseline in real time (debug overlay)
- Shows detector state badge: Calibrating / Listening / Triggered

**React demo (`demo/react-demo/`):**
- Same concept but using `useOnWave`
- A button that says "Wave to start" — visually shows state changes

**Demo GIF for README:**
- Record the vanilla demo in a browser, phone on stand, hand waving
- Show the counter incrementing as the wave is detected
- This is the single most important marketing asset for the package

---

## README Structure

```
1. Tagline              "onwave is to onclick what a wave is to a tap."
2. Demo GIF             (the most important section — put it near the top)
3. Install              npm install onwave
4. Quick start          createWaveDetector / useOnWave with minimal example
5. Why not MediaPipe?   The size/complexity comparison table
6. How it works         Luma detection explained in plain terms (3–4 sentences)
7. API reference        Full options, return types
8. Browser support      getUserMedia compatibility note
9. License              MIT
```

Keep it short. The GIF and quick start do 80% of the selling.

---

## Browser & Device Compatibility

`getUserMedia` is supported in all modern browsers (Chrome, Firefox, Safari 11+, Edge). Requires HTTPS in production (localhost is exempt).

**Mobile notes:**
- iOS Safari requires a user gesture before `getUserMedia` resolves — `detector.start()` must be called inside a tap handler, not on page load
- `facingMode: 'user'` (front camera) works on iOS and Android
- `OffscreenCanvas` is supported in all modern browsers; fallback to regular canvas if needed

---

## Open Questions

- **Name final check**: verify `onwave` is free on npm before creating the repo
- **OffscreenCanvas fallback**: add a regular canvas fallback for older browsers, or set a minimum support baseline and document it
- **Error handling**: what should happen if camera permission is denied? Currently `start()` rejects the Promise — caller handles it. Consider an `onError` option.
- **Multiple instances**: if two `useOnWave` hooks mount simultaneously, each opens its own camera stream. May want a shared stream singleton — defer until there's a real use case.
- **TypeScript strict mode**: `OffscreenCanvas` types require `"lib": ["DOM"]` — confirm this doesn't conflict with non-DOM environments
