import { describe, it, expect } from 'vitest'
import { STORY_FUNCTIONS, EMOTIONS, normalizeStoryFunction, normalizeEmotions, functionZh, emotionZh } from '../src/story-beat-language.ts'
import { SHOT_SIZES, CAMERA_MOVES, COMPOSITIONS, LIGHTINGS, normalizeShotSize, sizeZh } from '../src/shot-language.ts'

describe('story-beat-language smoke', () => {
  it('exposes non-empty vocabularies with defined entries', () => {
    expect(STORY_FUNCTIONS.length).toBeGreaterThan(0)
    expect(EMOTIONS.length).toBeGreaterThan(0)
    for (const e of STORY_FUNCTIONS) { expect(e.id).toBeTruthy(); expect(e.zh).toBeTruthy(); expect(e.en).toBeTruthy() }
    for (const e of EMOTIONS) { expect(e.id).toBeTruthy(); expect(e.zh).toBeTruthy(); expect(e.en).toBeTruthy() }
  })
  it('normalizes unknown story function to a defined id and zh label', () => {
    const id = normalizeStoryFunction('不存在的功能')
    expect(typeof id).toBe('string')
    expect(functionZh(id).length).toBeGreaterThan(0)
  })
  it('normalizes free-text emotions to valid ids and maps to zh', () => {
    const ids = normalizeEmotions('平静 愤怒 未知情绪')
    expect(Array.isArray(ids)).toBe(true)
    ids.forEach(id => { expect(typeof id).toBe('string'); expect(typeof emotionZh([id])).toBe('string') })
  })
})

describe('shot-language smoke', () => {
  it('exposes non-empty shot vocabularies', () => {
    expect(SHOT_SIZES.length).toBeGreaterThan(0)
    expect(CAMERA_MOVES.length).toBeGreaterThan(0)
    expect(COMPOSITIONS.length).toBeGreaterThan(0)
    expect(LIGHTINGS.length).toBeGreaterThan(0)
  })
  it('normalizes unknown shot size to a defined id and zh label', () => {
    const id = normalizeShotSize('不存在的景别')
    expect(typeof id).toBe('string')
    expect(sizeZh(id).length).toBeGreaterThan(0)
  })
})
