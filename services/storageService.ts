import type { SongData } from '../types';
import { parseSongResponse } from '../schemas/songSchema';
import { ok, err, type Result } from '../lib/result';

const STORAGE_KEY = 'doom-daw-song';

/**
 * Load song from localStorage. Returns err if missing or invalid.
 */
export function loadSong(): Result<SongData, Error> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return err(new Error('No saved song'));
    }
    const parsed: unknown = JSON.parse(raw);
    return parseSongResponse(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(new Error(`Load failed: ${message}`));
  }
}

/**
 * Save song to localStorage. Overwrites any existing saved song.
 */
export function saveSong(song: SongData): Result<void, Error> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(new Error(`Save failed: ${message}`));
  }
}

/**
 * Export song as JSON string (for download).
 */
export function exportSongToJson(song: SongData): string {
  return JSON.stringify(song, null, 2);
}

/**
 * Parse imported JSON string into SongData. Use for file import.
 */
export function importSongFromJson(json: string): Result<SongData, Error> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parseSongResponse(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(new Error(`Import failed: ${message}`));
  }
}
