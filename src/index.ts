export { createWaveDetector } from './detector'
export type { WaveDetector, WaveDetectorOptions, DetectorState } from './detector'

/**
 * Default values for all detector options.
 *
 * ## Tuning sensitivity (threshold)
 *
 * `threshold` is the luma drop (0–255) required to trigger a wave.
 * Luma is the average brightness of the camera frame — when your hand
 * blocks the camera, luma drops. A larger drop means the hand has to
 * block more light before a wave is detected.
 *
 * - **Lower threshold** → more sensitive. Triggers on a subtle shadow.
 *   Risk: false triggers from passing movement or lighting changes.
 *   Try: 15–25 for dim environments or small hand movements.
 *
 * - **Higher threshold** → less sensitive. Requires a deliberate block.
 *   Risk: misses quick or partial waves.
 *   Try: 50–80 for bright environments or if false triggers are a problem.
 *
 * - **Default (40)** → works well in typical indoor lighting with a
 *   clear wave gesture from ~30cm in front of the camera.
 *
 * Rule of thumb: if waves aren't detected, lower the threshold.
 * If it triggers too easily, raise it.
 *
 * @example
 * // More sensitive
 * createWaveDetector({ onWave: fn, threshold: WAVE_DEFAULTS.threshold - 15 })
 *
 * // Less sensitive
 * createWaveDetector({ onWave: fn, threshold: WAVE_DEFAULTS.threshold + 20 })
 */
export const WAVE_DEFAULTS = {
  /** Luma drop (0–255) required to trigger. Lower = more sensitive. */
  threshold: 40,
  /** Milliseconds before the next wave is accepted after a trigger. */
  cooldown: 1000,
  /** Milliseconds between luma samples. */
  sampleInterval: 100,
  /** Offscreen canvas size in px (width and height). Larger = more stable but slower. */
  sampleSize: 10,
  /** Number of frames sampled to establish the baseline brightness. */
  calibrationFrames: 10,
} as const
