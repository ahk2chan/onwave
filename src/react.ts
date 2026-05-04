import { useEffect, useRef, useCallback, useState } from 'react'
import { createWaveDetector, DetectorState, WaveDetectorOptions } from './detector'

type UseOnWaveOptions = Omit<WaveDetectorOptions, 'onWave' | 'onStateChange'>

interface UseOnWaveResult {
  ref: React.RefObject<HTMLElement | null>
  state: DetectorState
  calibrate: () => void
  setThreshold: (value: number) => void
}

export function useOnWave(
  onWave: () => void,
  options: UseOnWaveOptions = {}
): UseOnWaveResult {
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<DetectorState>('idle')
  const detectorRef = useRef<ReturnType<typeof createWaveDetector> | null>(null)

  // stable ref so detector doesn't restart when onWave identity changes
  const onWaveRef = useRef(onWave)
  useEffect(() => { onWaveRef.current = onWave }, [onWave])

  const optionsRef = useRef(options)
  useEffect(() => { optionsRef.current = options }, [options])

  useEffect(() => {
    const detector = createWaveDetector({
      ...optionsRef.current,
      onWave: () => onWaveRef.current(),
      onStateChange: setState,
    })
    detectorRef.current = detector
    detector.start()

    return () => { detector.stop() }
  }, []) // intentionally empty — start once on mount, stop on unmount

  const calibrate = useCallback(() => {
    detectorRef.current?.calibrate()
  }, [])

  const setThreshold = useCallback((value: number) => {
    detectorRef.current?.setThreshold(value)
  }, [])

  return { ref, state, calibrate, setThreshold }
}
