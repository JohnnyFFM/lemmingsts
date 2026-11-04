/**
 * The DOS game's ten-letter level access codes.
 *
 * A code carries the level's position in the whole game (0 to 119), the
 * percentage saved on the level before it, and a checksum, spread over
 * letters as nibbles added to a per-game base string. The first seven
 * letters are rotated by an amount that depends on the level, which is why
 * consecutive codes look scrambled. Reconstructed from the published code
 * tables and the LemGen notes on the Lemmings Forums.
 */

export const LEVEL_CODE_LENGTH = 10;

/** Base letters for the original game in logical (unrotated) order. */
const BASE = 'AJHLDHBBCJ';

/** Bit held by each of bits 3..0 of the seven logical nibbles: level bits, percentage bits, spare bits or a fixed zero. */
type Bit = `L${number}` | `%${number}` | `S${number}` | '0';
const LAYOUT: Bit[][] = [
    ['L0', '%0', 'S0', '0'],
    ['S1', 'L1', '0', '%1'],
    ['0', 'L2', '%2', 'S2'],
    ['S4', 'S3', '%3', 'L3'],
    ['%4', '0', 'L4', 'S5'],
    ['0', '%5', 'S6', 'L5'],
    ['0', 'L6', '0', '%6'],
];

/** How far the seven leading letters are rotated left for a level, in blocks of eight levels. */
function rotationFor(levelNumber: number): number {
    return (((levelNumber - 1) % 8) + 6) % 7;
}

function rotateLeft(text: string, count: number): string {
    return text.slice(count) + text.slice(0, count);
}

function letter(base: string, nibble: number): string {
    return String.fromCharCode(base.charCodeAt(0) + (nibble & 15));
}

function checksumLetter(firstNine: string): string {
    let sum = 0;
    for (const character of firstNine) sum += character.charCodeAt(0);
    return letter(BASE[9], sum);
}

/**
 * The code for a level, given its 1-based number across the whole game
 * (Fun 1 = 1, Tricky 1 = 31) and the percentage saved on the previous level.
 */
export function levelCode(levelNumber: number, percentSaved = 0): string {
    if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 128) throw new RangeError('Level number out of range');
    const levelValue = levelNumber - 1;
    const percent = Math.max(0, Math.min(127, Math.round(percentSaved)));
    let logical = '';
    LAYOUT.forEach((bits, index) => {
        let nibble = 0;
        bits.forEach((bit, position) => {
            const weight = 8 >> position;
            if (bit[0] === 'L' && (levelValue >> Number(bit.slice(1))) & 1) nibble |= weight;
            if (bit[0] === '%' && (percent >> Number(bit.slice(1))) & 1) nibble |= weight;
        });
        logical += letter(BASE[index], nibble);
    });
    const head = rotateLeft(logical, rotationFor(levelNumber));
    const number = letter(BASE[7], levelValue & 15) + letter(BASE[8], levelValue >> 4);
    return head + number + checksumLetter(head + number);
}

export interface DecodedLevelCode {
    /** 1-based level number across the whole game. */
    levelNumber: number;
    percentSaved: number;
}

/** The level a code unlocks, or null when the code is not a valid code for this game. */
export function decodeLevelCode(code: string): DecodedLevelCode | null {
    const text = code.toUpperCase().replace(/[^A-Z]/g, '');
    if (text.length !== LEVEL_CODE_LENGTH) return null;
    if (checksumLetter(text.slice(0, 9)) !== text[9]) return null;
    const low = text.charCodeAt(7) - BASE.charCodeAt(7), high = text.charCodeAt(8) - BASE.charCodeAt(8);
    if (low < 0 || low > 15 || high < 0 || high > 7) return null;
    const levelValue = high * 16 + low;
    const levelNumber = levelValue + 1;
    const logical = rotateLeft(text.slice(0, 7), (7 - rotationFor(levelNumber)) % 7);
    let percent = 0, level = 0;
    for (let index = 0; index < 7; index++) {
        const nibble = logical.charCodeAt(index) - BASE.charCodeAt(index);
        if (nibble < 0 || nibble > 15) return null;
        LAYOUT[index].forEach((bit, position) => {
            const set = (nibble >> (3 - position)) & 1;
            if (bit === '0' && set) percent = -1;
            if (bit[0] === 'L' && set) level |= 1 << Number(bit.slice(1));
            if (bit[0] === '%' && set && percent >= 0) percent |= 1 << Number(bit.slice(1));
        });
    }
    if (percent < 0 || level !== levelValue) return null;
    return { levelNumber, percentSaved: Math.min(100, percent) };
}
