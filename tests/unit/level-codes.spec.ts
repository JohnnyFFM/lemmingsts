import { describe, expect, it } from 'vitest';
import { decodeLevelCode, levelCode } from '../../src/game/level-codes';

// 100 % codes from the LemGen notes on the Lemmings Forums.
const HUNDRED_PERCENT: Array<[number, string]> = [
    [1, 'CAJJLDLBCS'], [2, 'IJJLDLCCCL'], [3, 'NJLDLCADCY'], [4, 'JLDLCINECR'], [5, 'LDLCAJNFCK'],
    [6, 'DLCIJNLGCT'], [7, 'LCANNLDHCQ'], [8, 'CINNLDLICJ'], [9, 'CAJJMDLJCL'], [10, 'IJJMDLCKCU'],
    [11, 'NJMDLCALCR'], [12, 'JMDLCINMCK'], [13, 'MDLCAJNNCT'], [14, 'DLCIJNMOCM'], [15, 'LCANNMDPCJ'],
    [16, 'CINNMDLQCS'], [17, 'CAJJLFLBDV'], [18, 'IJJLFLCCDO'], [19, 'NJLFLCADDL'], [20, 'JLFLCINEDU'],
];

// Codes from a published walkthrough table; they carry other percentages and spare bits.
const PUBLISHED: Array<[number, string]> = [
    [2, 'IJJLDNCCCN'], [8, 'CINNLDLICJ'], [31, 'HCEONONPDX'], [33, 'CAJJLDMBEV'], [61, 'MFMCCJONFM'],
    [91, 'NKMFLGCLHP'], [97, 'GCJKLDMBIQ'], [120, 'GKNONNIIJQ'],
];

describe('DOS level codes', () => {
    it('reproduces the published 100 % codes', () => {
        for (const [level, code] of HUNDRED_PERCENT) expect(levelCode(level, 100), `level ${level}`).toBe(code);
    });

    it('decodes its own codes for every level and percentage', () => {
        for (let level = 1; level <= 120; level++) {
            for (const percent of [0, 1, 37, 50, 99, 100]) {
                expect(decodeLevelCode(levelCode(level, percent))).toEqual({ levelNumber: level, percentSaved: percent });
            }
        }
    });

    it('accepts codes published for the game even when their spare bits differ', () => {
        for (const [level, code] of PUBLISHED) expect(decodeLevelCode(code)?.levelNumber, code).toBe(level);
    });

    it('rejects codes with a wrong checksum, a wrong length or inconsistent level bits', () => {
        expect(decodeLevelCode('CAJJLDLBCT')).toBeNull();
        expect(decodeLevelCode('CAJJLDLBC')).toBeNull();
        expect(decodeLevelCode('cajjldlbcs')).toEqual({ levelNumber: 1, percentSaved: 100 });
        // Level 2's leading letters with level 1's number letters.
        const mismatched = 'IJJLDLCBC';
        let sum = 0; for (const c of mismatched) sum += c.charCodeAt(0);
        expect(decodeLevelCode(mismatched + String.fromCharCode('J'.charCodeAt(0) + (sum & 15)))).toBeNull();
    });
});
