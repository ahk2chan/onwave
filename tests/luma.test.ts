import { describe, it, expect } from 'vitest'

// extracted for unit testing — matches the formula in detector.ts
function computeLuma(data: Uint8ClampedArray, pixelCount: number): number {
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return total / pixelCount
}

function makePixels(r: number, g: number, b: number, count = 1): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let i = 0; i < count; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return data
}

describe('computeLuma', () => {
  it('returns 255 for white', () => {
    const data = makePixels(255, 255, 255)
    expect(computeLuma(data, 1)).toBeCloseTo(255, 0)
  })

  it('returns 0 for black', () => {
    const data = makePixels(0, 0, 0)
    expect(computeLuma(data, 1)).toBe(0)
  })

  it('weights green highest', () => {
    const r = computeLuma(makePixels(255, 0, 0), 1)
    const g = computeLuma(makePixels(0, 255, 0), 1)
    const b = computeLuma(makePixels(0, 0, 255), 1)
    expect(g).toBeGreaterThan(r)
    expect(r).toBeGreaterThan(b)
  })

  it('averages across multiple pixels', () => {
    const data = new Uint8ClampedArray(8) // 2 pixels
    // pixel 1: white (255,255,255) → luma ≈ 255
    data[0] = 255; data[1] = 255; data[2] = 255; data[3] = 255
    // pixel 2: black (0,0,0) → luma = 0
    data[4] = 0;   data[5] = 0;   data[6] = 0;   data[7] = 255
    expect(computeLuma(data, 2)).toBeCloseTo(127.5, 0)
  })
})
