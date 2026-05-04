export type DetectorState = 'idle' | 'calibrating' | 'listening' | 'triggered' | 'stopped'

export interface WaveDetectorOptions {
  onWave: () => void
  threshold?: number
  cooldown?: number
  sampleInterval?: number
  sampleSize?: number
  calibrationFrames?: number
  facingMode?: 'user' | 'environment'
  onError?: (error: Error) => void
  onStateChange?: (state: DetectorState) => void
}

export interface WaveDetector {
  start(): Promise<void>
  stop(): void
  calibrate(): Promise<void>
  setThreshold(value: number): void
  readonly state: DetectorState
}

function computeLuma(data: Uint8ClampedArray, pixelCount: number): number {
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return total / pixelCount
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createWaveDetector(options: WaveDetectorOptions): WaveDetector {
  const {
    onWave,
    threshold: initialThreshold = 40,
    cooldown = 1000,
    sampleInterval = 100,
    sampleSize = 10,
    calibrationFrames = 10,
    facingMode = 'user',
    onError,
    onStateChange,
  } = options

  let threshold = initialThreshold
  let _state: DetectorState = 'idle'
  let stream: MediaStream | null = null
  let video: HTMLVideoElement | null = null
  let intervalId: ReturnType<typeof setInterval> | null = null
  let baseline = 0
  let inWave = false
  let lastTriggered = 0

  const pixelCount = sampleSize * sampleSize
  const canvas = new OffscreenCanvas(sampleSize, sampleSize)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D

  function setState(next: DetectorState) {
    _state = next
    onStateChange?.(next)
  }

  function sampleLuma(): number {
    if (!video) return 0
    ctx.drawImage(video, 0, 0, sampleSize, sampleSize)
    const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)
    return computeLuma(data, pixelCount)
  }

  async function calibrate(): Promise<void> {
    if (_state === 'calibrating') return
    setState('calibrating')
    const samples: number[] = []
    for (let i = 0; i < calibrationFrames; i++) {
      if (_state === 'stopped') return
      samples.push(sampleLuma())
      await sleep(sampleInterval)
    }
    if (_state === 'stopped') return
    baseline = samples.reduce((a, b) => a + b, 0) / samples.length
    inWave = false
    lastTriggered = 0
    setState('listening')
  }

  function onSample() {
    if (_state !== 'listening' && _state !== 'triggered') return
    const luma = sampleLuma()
    const now = Date.now()

    if (luma < baseline - threshold) {
      if (!inWave) {
        inWave = true
        setState('triggered')
        if (now - lastTriggered > cooldown) {
          lastTriggered = now
          onWave()
        }
      }
    } else {
      if (inWave) {
        inWave = false
        setState('listening')
      }
    }
  }

  async function start(): Promise<void> {
    if (_state !== 'idle' && _state !== 'stopped') return

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: 320, height: 240 },
        audio: false,
      })

      video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()

      await calibrate()

      intervalId = setInterval(onSample, sampleInterval)
    } catch (err) {
      stop()
      onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  function stop(): void {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      stream = null
    }
    if (video) {
      video.srcObject = null
      video = null
    }
    setState('stopped')
  }

  return {
    start,
    stop,
    calibrate,
    setThreshold(value: number) { threshold = Math.max(0, Math.min(255, value)) },
    get state() { return _state },
  }
}
