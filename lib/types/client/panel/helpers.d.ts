/**
 * Tiny translation helper for the panel: reads the zh dict with the en dict
 * as fallback (the family plugins use a full locale registry; the panel keeps
 * a dependency-free helper so the client bundle stays self-contained).
 */
import { type NovelKey } from '../locales.ts';
/** Translate one key with optional {placeholder} substitution. */
export declare function tt(key: NovelKey, params?: Record<string, string | number>): string;
