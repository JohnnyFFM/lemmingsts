/** Progress and settings are local to this browser/device. */
export interface LevelLocation {
    gameType: number;
    groupIndex: number;
    levelIndex: number;
}

export interface LevelCompletion extends LevelLocation {
    bestSavedPercent: number;
}

export interface GameSettings {
    speed: number;
    musicEnabled: boolean;
    soundEnabled: boolean;
}

export type ProgressEdition = 'dos' | 'windows';

export interface ProgressBackup {
    format: 'lemmings-progress';
    version: 1;
    progress: LevelCompletion[];
    settings: GameSettings;
    lastLevel: LevelLocation | null;
}

interface ProgressBackupV2 extends Omit<ProgressBackup, 'version'> {
    version: 2;
    windowsProgress: LevelCompletion[];
    windowsLastLevel: LevelLocation | null;
}
type RestoredBackup = ProgressBackup | ProgressBackupV2;

const PROGRESS_KEY = 'lemmings.progress.v1';
const WINDOWS_PROGRESS_KEY = 'lemmings.windows-progress.v1';
const WINDOWS_LAST_LEVEL_KEY = 'lemmings.windows-last-level.v1';
const SETTINGS_KEY = 'lemmings.settings.v1';
const LAST_LEVEL_KEY = 'lemmings.last-level.v1';
// A restore is a single localStorage write; later saves update this snapshot.
// Existing v1 keys remain readable until a backup is restored.
const RESTORED_STATE_KEY = 'lemmings.restored-state.v1';
const MAX_BACKUP_LENGTH = 64 * 1024;

function readJson(key: string): unknown {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function writeJson(key: string, value: unknown): boolean {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isLocation(value: unknown): value is LevelLocation {
    return isRecord(value) && value.gameType === 1 &&
        Number.isInteger(value.groupIndex) && (value.groupIndex as number) >= 0 && (value.groupIndex as number) < 4 &&
        Number.isInteger(value.levelIndex) && (value.levelIndex as number) >= 0 && (value.levelIndex as number) < 30;
}

function isCompletion(value: unknown): value is LevelCompletion {
    return isLocation(value) && isRecord(value) && typeof value.bestSavedPercent === 'number' &&
        Number.isInteger(value.bestSavedPercent) && value.bestSavedPercent >= 0 && value.bestSavedPercent <= 100;
}

function isSettings(value: unknown): value is GameSettings {
    return isRecord(value) && [1, 2, 4].includes(value.speed as number) &&
        typeof value.musicEnabled === 'boolean' && typeof value.soundEnabled === 'boolean';
}

function validLastLevel(value: unknown): boolean {
    return value === null || (isLocation(value) &&
        hasExactKeys(value as unknown as Record<string, unknown>, ['gameType', 'groupIndex', 'levelIndex']));
}

function validProgress(value: unknown): boolean {
    if (!Array.isArray(value) || value.length > 120) return false;
    const seen = new Set<string>();
    for (const entry of value) {
        if (!isCompletion(entry) || !hasExactKeys(entry as unknown as Record<string, unknown>, ['gameType', 'groupIndex', 'levelIndex', 'bestSavedPercent'])) return false;
        const key = `${entry.gameType}/${entry.groupIndex}/${entry.levelIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
    }
    return true;
}

function isBackup(value: unknown): value is RestoredBackup {
    if (!isRecord(value) || value.format !== 'lemmings-progress' || !isSettings(value.settings) ||
        !hasExactKeys(value.settings as unknown as Record<string, unknown>, ['speed', 'musicEnabled', 'soundEnabled']) ||
        !validProgress(value.progress) || !validLastLevel(value.lastLevel)) return false;
    if (value.version === 1) return hasExactKeys(value, ['format', 'version', 'progress', 'settings', 'lastLevel']);
    return value.version === 2 && hasExactKeys(value, ['format', 'version', 'progress', 'settings', 'lastLevel', 'windowsProgress', 'windowsLastLevel']) &&
        validProgress(value.windowsProgress) && validLastLevel(value.windowsLastLevel);
}

function restoredState(): RestoredBackup | null {
    const value = readJson(RESTORED_STATE_KEY);
    return isBackup(value) ? value : null;
}

export function readProgress(edition: ProgressEdition = 'dos'): LevelCompletion[] {
    const restored = restoredState();
    if (restored) return edition === 'dos' ? restored.progress : restored.version === 2 ? restored.windowsProgress : [];
    const value = readJson(edition === 'dos' ? PROGRESS_KEY : WINDOWS_PROGRESS_KEY);
    if (!Array.isArray(value)) return [];
    const entries = new Map<string, LevelCompletion>();
    for (const item of value) {
        if (!isCompletion(item)) continue;
        const { gameType, groupIndex, levelIndex, bestSavedPercent } = item;
        const key = `${gameType}/${groupIndex}/${levelIndex}`;
        const previous = entries.get(key);
        if (!previous || bestSavedPercent > previous.bestSavedPercent) {
            // Copy only known fields, even if old browser data was edited.
            entries.set(key, { gameType, groupIndex, levelIndex, bestSavedPercent });
        }
    }
    return Array.from(entries.values());
}

export function recordCompletion(gameType: number, groupIndex: number, levelIndex: number, savedPercent: number, edition: ProgressEdition = 'dos'): boolean {
    const entry = { gameType, groupIndex, levelIndex, bestSavedPercent: savedPercent };
    if (!isCompletion(entry)) return false;
    const restored = restoredState();
    const progress = readProgress(edition);
    const previous = progress.find(item => item.gameType === gameType && item.groupIndex === groupIndex && item.levelIndex === levelIndex);
    if (previous) previous.bestSavedPercent = Math.max(previous.bestSavedPercent, savedPercent);
    else progress.push(entry);
    if (restored) {
        if (edition === 'dos') return writeJson(RESTORED_STATE_KEY, { ...restored, progress });
        return writeJson(RESTORED_STATE_KEY, { ...restored, version: 2, windowsProgress: progress,
            windowsLastLevel: restored.version === 2 ? restored.windowsLastLevel : null });
    }
    return writeJson(edition === 'dos' ? PROGRESS_KEY : WINDOWS_PROGRESS_KEY, progress);
}

export function readSettings(): GameSettings {
    const restored = restoredState();
    if (restored) return restored.settings;
    const value = readJson(SETTINGS_KEY) as Partial<GameSettings> | null;
    return {
        speed: value && [1, 2, 4].includes(value.speed as number) ? value.speed as number : 1,
        musicEnabled: value?.musicEnabled === true,
        soundEnabled: value?.soundEnabled === true,
    };
}

export function saveSettings(settings: GameSettings): boolean {
    if (!isSettings(settings)) return false;
    const restored = restoredState();
    const cleanSettings = { speed: settings.speed, musicEnabled: settings.musicEnabled, soundEnabled: settings.soundEnabled };
    return restored ? writeJson(RESTORED_STATE_KEY, { ...restored, settings: cleanSettings }) : writeJson(SETTINGS_KEY, cleanSettings);
}

/** Forget every DOS completion and the last level played; returns false when storage is unavailable. */
export function clearDosProgress(): boolean {
    try {
        const restored = restoredState();
        if (restored) writeJson(RESTORED_STATE_KEY, { ...restored, progress: [], lastLevel: null });
        localStorage.removeItem(PROGRESS_KEY);
        localStorage.removeItem(LAST_LEVEL_KEY);
        return true;
    } catch {
        return false;
    }
}

export function readLastLevel(edition: ProgressEdition = 'dos'): LevelLocation | null {
    const restored = restoredState();
    if (restored) return edition === 'dos' ? restored.lastLevel : restored.version === 2 ? restored.windowsLastLevel : null;
    const value = readJson(edition === 'dos' ? LAST_LEVEL_KEY : WINDOWS_LAST_LEVEL_KEY);
    return isLocation(value)
        ? { gameType: value.gameType, groupIndex: value.groupIndex, levelIndex: value.levelIndex }
        : null;
}

/** Suggest the level after a completed last selection, using the active edition's catalogue. */
export function suggestNextLevel(last: LevelLocation | null, progress: readonly LevelCompletion[], groupLengths: readonly number[]): LevelLocation | null {
    if (!last || !isLocation(last) || !Number.isInteger(groupLengths[last.groupIndex]) ||
        last.levelIndex >= groupLengths[last.groupIndex]) return null;
    const completed = progress.some(entry => entry.gameType === last.gameType &&
        entry.groupIndex === last.groupIndex && entry.levelIndex === last.levelIndex);
    if (!completed) return last;
    if (last.levelIndex + 1 < groupLengths[last.groupIndex]) return { ...last, levelIndex: last.levelIndex + 1 };
    for (let group = last.groupIndex + 1; group < groupLengths.length; group++) {
        if (Number.isInteger(groupLengths[group]) && groupLengths[group] > 0) return { ...last, groupIndex: group, levelIndex: 0 };
    }
    // At the end of the catalogue retain the final level, rather than wrapping.
    return last;
}

export function rememberLevel(gameType: number, groupIndex: number, levelIndex: number, edition: ProgressEdition = 'dos'): boolean {
    const lastLevel = { gameType, groupIndex, levelIndex };
    if (!isLocation(lastLevel)) return false;
    const restored = restoredState();
    if (restored) {
        if (edition === 'dos') return writeJson(RESTORED_STATE_KEY, { ...restored, lastLevel });
        return writeJson(RESTORED_STATE_KEY, { ...restored, version: 2, windowsLastLevel: lastLevel,
            windowsProgress: restored.version === 2 ? restored.windowsProgress : [] });
    }
    return writeJson(edition === 'dos' ? LAST_LEVEL_KEY : WINDOWS_LAST_LEVEL_KEY, lastLevel);
}

/** Export only project-owned progress/settings, never the original game files. */
export function exportProgressBackup(): string {
    // Do not silently export empty defaults when the browser blocks storage.
    try { localStorage.getItem(RESTORED_STATE_KEY); } catch { throw new Error('Could not read saved progress from this browser.'); }
    const backup: ProgressBackup = {
        format: 'lemmings-progress', version: 1,
        progress: readProgress(), settings: readSettings(), lastLevel: readLastLevel(),
    };
    const windowsProgress = readProgress('windows');
    const windowsLastLevel = readLastLevel('windows');
    return JSON.stringify(windowsProgress.length || windowsLastLevel
        ? { ...backup, version: 2, windowsProgress, windowsLastLevel } : backup, null, 2);
}

/** Replace progress/settings atomically after validating the entire backup. */
export function restoreProgressBackup(text: string): boolean {
    if (text.length > MAX_BACKUP_LENGTH) throw new Error('This backup file is too large.');
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error('This is not a valid progress backup.'); }
    if (!isBackup(value)) throw new Error('This progress backup is invalid or uses an unsupported version.');
    return writeJson(RESTORED_STATE_KEY, value);
}
