import { describe, expect, it } from 'vitest';
import { globalLevelIndex, levelMusicIndex, LEVEL_MUSIC_CYCLE, TUNE } from '../../src/game/music';

describe('DOS level music', () => {
    it('cycles through the seventeen level tunes in the game order', () => {
        expect(levelMusicIndex(0)).toBe(TUNE.lemming1);
        expect(levelMusicIndex(1)).toBe(TUNE.lemming2);
        expect(levelMusicIndex(5)).toBe(TUNE.canCan);
        expect(levelMusicIndex(16)).toBe(TUNE.tim10);
        expect(levelMusicIndex(17)).toBe(TUNE.lemming1);
        expect(levelMusicIndex(30)).toBe(LEVEL_MUSIC_CYCLE[13]);
        expect(new Set(LEVEL_MUSIC_CYCLE).size).toBe(17);
    });

    it('plays the four special themes on their levels', () => {
        const lengths = [30, 30, 30, 30];
        expect(levelMusicIndex(globalLevelIndex(0, 21, lengths))).toBe(TUNE.beast1);
        expect(levelMusicIndex(globalLevelIndex(1, 13, lengths))).toBe(TUNE.menace);
        expect(levelMusicIndex(globalLevelIndex(2, 14, lengths))).toBe(TUNE.awesome);
        expect(levelMusicIndex(globalLevelIndex(3, 21, lengths))).toBe(TUNE.beast2);
        expect(globalLevelIndex(3, 21, lengths)).toBe(111);
    });
});
