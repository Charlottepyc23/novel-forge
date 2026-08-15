/**
 * Tiny translation helper for the panel: reads the zh dict with the en dict
 * as fallback (the family plugins use a full locale registry; the panel keeps
 * a dependency-free helper so the client bundle stays self-contained).
 */
import { zh, en, type NovelKey } from '../locales.ts'

/** Translate one key with optional {placeholder} substitution. */
export function tt(key: NovelKey, params?: Record<string, string | number>): string {
  let text: string = zh[key] ?? en[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
