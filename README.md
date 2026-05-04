# onwave

**onwave is to onclick what a wave is to a tap.**

Zero-dependency, no-ML wave gesture for the browser. Your hand blocks the camera — that's the click.

<!-- demo GIF goes here -->

## Install

```bash
npm install onwave
```

## Quick start

**Vanilla JS**

```js
import { createWaveDetector } from 'onwave'

const detector = createWaveDetector({
  onWave: () => timer.toggle(),
})

// must be called inside a user gesture (e.g. button click)
await detector.start()
```

**React**

```jsx
import { useOnWave } from 'onwave/react'

function BrewTimer() {
  const { ref, state } = useOnWave(() => timer.toggle())

  return <button ref={ref}>Wave to start — {state}</button>
}
```

## Why not MediaPipe?

| | onwave | MediaPipe Hands |
|---|---|---|
| Bundle size | < 1KB | ~10MB |
| Dependencies | 0 | runtime + model |
| Use case | trigger events | landmark recognition |

onwave does one thing: detect a wave and fire a callback. If you need hand landmarks or complex gesture recognition, use MediaPipe.

## How it works

A hand waving in front of the camera briefly blocks ambient light. onwave samples the average brightness (luma) of the camera feed every 100ms using a 10×10 canvas — no ML, just pixel math. When brightness drops sharply below the calibrated baseline, the wave callback fires.

## API

### `createWaveDetector(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `onWave` | `() => void` | required | Fires once per wave |
| `threshold` | `number` | `40` | Luma drop (0–255) to trigger |
| `cooldown` | `number` | `1000` | ms before next wave accepted |
| `sampleInterval` | `number` | `100` | ms between samples |
| `sampleSize` | `number` | `10` | Canvas size in px |
| `calibrationFrames` | `number` | `10` | Frames to establish baseline |
| `facingMode` | `'user' \| 'environment'` | `'user'` | Camera to use |
| `onError` | `(error: Error) => void` | — | Camera permission denied etc. |
| `onStateChange` | `(state: DetectorState) => void` | — | State change callback |

Returns `{ start, stop, calibrate, state }`.

### `useOnWave(onWave, options?)`

React hook. Starts detector on mount, stops on unmount. Returns `{ ref, state, calibrate }`.

## Browser support

Requires `getUserMedia` (all modern browsers) and HTTPS in production. On iOS, `start()` must be called inside a user gesture handler.

## License

MIT
