import { describe, expect, it } from 'vitest';
import { buildLevelIntro, buildLevelResult, DOS_SCREEN_HEIGHT, DOS_SCREEN_WIDTH, resultVerdict } from '../../src/game/view/dos-screens';
import { MenuFont, MENU_GLYPH_WIDTH } from '../../src/game/resources/menu-font';
import { ColorPalette } from '../../src/game/resources/lemmings/color-palette';
import type { Frame } from '../../src/game/resources/frame';

/** A font without data draws nothing, but still records what it was asked to draw. */
class RecordingFont extends MenuFont {
    public lines: Array<{ text: string; x: number; y: number }> = [];
    constructor() { super(null, new ColorPalette()); }
    override drawText(_target: Frame, text: string, x: number, y: number): number {
        this.lines.push({ text, x, y });
        return x + text.length * MENU_GLYPH_WIDTH;
    }
}

describe('DOS screens', () => {
    it('lays out the level preview centred on a 640×400 screen', () => {
        const font = new RecordingFont();
        const screen = buildLevelIntro(font, { number: 3, name: ' Just dig! ', lemmings: 10, needed: 1, releaseRate: 50, minutes: 1, rating: 'Fun' });
        expect([screen.width, screen.height]).toEqual([DOS_SCREEN_WIDTH, DOS_SCREEN_HEIGHT]);
        expect(font.lines.map(line => line.text)).toEqual([
            'Level 3', 'Just dig!', 'Number of Lemmings 10', '10% To Be Saved', 'Release Rate 50', 'Time 1 Minute', 'Rating Fun',
            'Press mouse button to continue',
        ]);
        const level = font.lines[0];
        expect(level.x).toBe((DOS_SCREEN_WIDTH - 'Level 3'.length * MENU_GLYPH_WIDTH) / 2);
        expect(font.lines.every(line => line.x >= 0 && line.x + line.text.length * MENU_GLYPH_WIDTH <= DOS_SCREEN_WIDTH)).toBe(true);
        expect(font.lines.map(line => line.y)).toEqual([48, 96, 144, 160, 176, 192, 208, 320]);
    });

    it('describes the result with the DOS verdicts', () => {
        expect(resultVerdict(0, 50)[0]).toMatch(/ROCK BOTTOM/);
        expect(resultVerdict(20, 50)[0]).toMatch(/rethink your strategy/);
        expect(resultVerdict(40, 50)[0]).toMatch(/little more practice/);
        expect(resultVerdict(47, 50)[0]).toMatch(/pretty close/);
        expect(resultVerdict(49, 50)[0]).toMatch(/So near and yet so far/);
        expect(resultVerdict(50, 50)[0]).toMatch(/SPOT ON/);
        expect(resultVerdict(60, 50)[0]).toMatch(/no problem/);
        expect(resultVerdict(90, 50)[0]).toMatch(/stormed/);
        expect(resultVerdict(100, 50)[0]).toMatch(/Superb/);
    });

    it('builds the result screen for success, failure and running out of time', () => {
        const font = new RecordingFont();
        buildLevelResult(font, { rescuedPercent: 100, neededPercent: 10, outOfTime: false, succeeded: true });
        expect(font.lines.map(line => line.text)).toEqual([
            'All lemmings accounted for.', 'You rescued 100%', 'You needed   10%',
            'Superb! You rescued every Lemming on', 'that level. Can you do it again....?', 'Press mouse button for next level',
        ]);
        font.lines = [];
        buildLevelResult(font, { rescuedPercent: 5, neededPercent: 10, outOfTime: true, succeeded: false });
        expect(font.lines[0].text).toBe('Your time is up!');
        expect(font.lines.at(-1)?.text).toBe('Press mouse button to retry level');
    });
});
