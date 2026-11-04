import { describe, expect, it } from 'vitest';
import { buildCodeEntry, buildLevelResult, drawScrollerText, hitAt, SCROLLER } from '../../src/game/view/dos-screens';
import { Frame } from '../../src/game/resources/frame';
import { MenuFont, MENU_GLYPH_WIDTH } from '../../src/game/resources/menu-font';
import { ColorPalette } from '../../src/game/resources/lemmings/color-palette';
import { locationOfLevelNumber } from '../../src/views/dos-view';

class RecordingFont extends MenuFont {
    public lines: Array<{ text: string; x: number; y: number }> = [];
    constructor() { super(null, new ColorPalette()); }
    override drawText(_target: Frame, text: string, x: number, y: number): number {
        this.lines.push({ text, x, y });
        return x + text.length * MENU_GLYPH_WIDTH;
    }
}

/** A font whose every glyph is a solid 16×16 block, to see where text lands. */
class BlockFont extends MenuFont {
    private block = (() => { const frame = new Frame(16, 16); frame.fill(255, 255, 255); return frame; })();
    constructor() { super(null, new ColorPalette()); }
    override getGlyph(character: string): Frame | null { return character === ' ' ? null : this.block; }
}

describe('level code entry screen', () => {
    it('shows the typed letters, offers every code letter and the ways out', () => {
        const font = new RecordingFont();
        const { hits } = buildCodeEntry(font, 'CAJ', 'Not a valid code');
        expect(font.lines[0].text).toBe('Enter Level Code');
        expect(font.lines[1].text).toBe('C A J - - - - - - -');
        expect(font.lines[2].text).toBe('Not a valid code');
        const letters = hits.filter(hit => hit.action.kind === 'letter').map(hit => hit.action.kind === 'letter' ? hit.action.letter : '').join('');
        expect(letters).toBe('ABCDEFGHIJKLMNOPQRSTUVWXY');
        const key = (label: string) => hits.find(hit => font.lines.some(line => line.text === label && line.x >= hit.x && line.x < hit.x + hit.width && line.y >= hit.y && line.y < hit.y + hit.height))!;
        expect(hitAt(hits, key('A').x + 1, key('A').y + 1)).toEqual({ kind: 'letter', letter: 'A' });
        expect(hitAt(hits, key('DEL').x + 1, key('DEL').y + 1)).toEqual({ kind: 'delete' });
        expect(hitAt(hits, key('OK').x + 1, key('OK').y + 1)).toEqual({ kind: 'enter' });
        expect(hitAt(hits, 40, 21 * 16 + 4)).toEqual({ kind: 'back' });
        expect(hitAt(hits, 600, 21 * 16 + 4)).toEqual({ kind: 'list' });
        // Every key is at least 48×32 pixels, a comfortable tap target at 640×400.
        expect(hits.filter(hit => hit.action.kind === 'letter').every(hit => hit.width >= 48 && hit.height >= 32)).toBe(true);
    });

    it('prints the access code of the unlocked level on the result screen', () => {
        const font = new RecordingFont();
        buildLevelResult(font, { rescuedPercent: 100, neededPercent: 10, outOfTime: false, succeeded: true, accessCode: { levelNumber: 2, code: 'IJJLDLCCCL' } });
        expect(font.lines.map(line => line.text)).toContain('Your Access Code for Level 2');
        expect(font.lines.map(line => line.text)).toContain('is IJJLDLCCCL');
    });

    it('maps a level number across the ratings', () => {
        const lengths = [30, 30, 30, 30];
        expect(locationOfLevelNumber(1, 1, lengths)).toEqual({ gameType: 1, groupIndex: 0, levelIndex: 0 });
        expect(locationOfLevelNumber(31, 1, lengths)).toEqual({ gameType: 1, groupIndex: 1, levelIndex: 0 });
        expect(locationOfLevelNumber(120, 1, lengths)).toEqual({ gameType: 1, groupIndex: 3, levelIndex: 29 });
        expect(locationOfLevelNumber(121, 1, lengths)).toBeNull();
    });
});

describe('title scroller', () => {
    it('moves text through the reel and never paints outside it', () => {
        const font = new BlockFont();
        const base = new Frame(640, 400);
        base.fill(0, 0, 0);
        const white = ColorPalette.colorFromRGB(255, 255, 255) >>> 0;
        const painted = (frame: Frame) => {
            const buffer = frame.getBuffer(); const xs: number[] = [];
            for (let y = 0; y < 400; y++) for (let x = 0; x < 640; x++) if (buffer[y * 640 + x] === white) {
                expect(y).toBeGreaterThanOrEqual(SCROLLER.y); expect(y).toBeLessThan(SCROLLER.y + SCROLLER.height);
                expect(x).toBeGreaterThanOrEqual(SCROLLER.x); expect(x).toBeLessThan(SCROLLER.x + SCROLLER.width);
                xs.push(x);
            }
            return xs;
        };
        expect(painted(drawScrollerText(base, font, 'AB', 0))).toHaveLength(0); // text starts just right of the reel
        const early = painted(drawScrollerText(base, font, 'AB', 8));
        expect(early.length).toBe(8 * 16);
        expect(Math.max(...early)).toBe(SCROLLER.x + SCROLLER.width - 1);
        const later = painted(drawScrollerText(base, font, 'AB', 100));
        expect(Math.min(...later)).toBeLessThan(Math.min(...early));
        expect(base.getBuffer().some(pixel => pixel === white)).toBe(false); // the base is untouched
    });
});
