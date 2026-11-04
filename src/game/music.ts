/**
 * Which tune the DOS game plays on each level.
 *
 * ADLIB.DAT holds 21 tunes in the driver's order; the engine indexes them
 * from 0. The game cycles through seventeen of them in its own order as the
 * levels go by, and four levels have a theme of their own.
 */

/** Engine indices of the tunes, in the driver's order. */
export const TUNE = {
    awesome: 0, beast1: 1, beast2: 2, canCan: 3, doggie: 4, lemming1: 5, lemming2: 6, lemming3: 7, menace: 8,
    mountain: 9, tenLemmings: 10, tim1: 11, tim2: 12, tim3: 13, tim4: 14, tim5: 15, tim6: 16, tim7: 17, tim8: 18, tim9: 19, tim10: 20,
} as const;

/** The level rotation: Lemming 1 to 3, Mountain, Ten Lemmings, Can-Can, Tim 1 to 4, Doggie, Tim 5 to 10. */
export const LEVEL_MUSIC_CYCLE = [TUNE.lemming1, TUNE.lemming2, TUNE.lemming3, TUNE.mountain, TUNE.tenLemmings, TUNE.canCan,
    TUNE.tim1, TUNE.tim2, TUNE.tim3, TUNE.tim4, TUNE.doggie, TUNE.tim5, TUNE.tim6, TUNE.tim7, TUNE.tim8, TUNE.tim9, TUNE.tim10] as const;

/** Levels with their own theme, by 0-based position across the whole game. */
export const SPECIAL_LEVEL_MUSIC: Readonly<Record<number, number>> = {
    21: TUNE.beast1,   // Fun 22, A Beast of a level
    43: TUNE.menace,   // Tricky 14, MENACING !!
    74: TUNE.awesome,  // Taxing 15, What an AWESOME level
    111: TUNE.beast2,  // Mayhem 22, The Beast II
};

/** The engine tune index for a level's 0-based position across the whole game. */
export function levelMusicIndex(globalLevelIndex: number): number {
    return SPECIAL_LEVEL_MUSIC[globalLevelIndex] ?? LEVEL_MUSIC_CYCLE[((globalLevelIndex % 17) + 17) % 17];
}

/** A level's 0-based position across the whole game from its rating and index within it. */
export function globalLevelIndex(groupIndex: number, levelIndex: number, groupLengths: readonly number[]): number {
    let position = 0;
    for (let group = 0; group < groupIndex; group++) position += groupLengths[group] ?? 0;
    return position + levelIndex;
}
