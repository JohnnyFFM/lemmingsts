import { describe, expect, it, vi } from 'vitest';
import { buildLevelList, buildTitleScreen, hitAt } from '../../src/game/view/dos-screens';
import { Frame } from '../../src/game/resources/frame';
import { MenuFont, MENU_GLYPH_WIDTH } from '../../src/game/resources/menu-font';
import { ColorPalette } from '../../src/game/resources/lemmings/color-palette';
import type { MainImageSprites } from '../../src/game/resources/main-image-sprites';
import { firstUnsolvedLevel, nextAudioMode } from '../../src/views/dos-view';

function solid(width: number, height: number, r = 200, g = 100, b = 50): Frame {
    const frame = new Frame(width, height);
    frame.fill(r, g, b);
    return frame;
}

function sprites() {
    const sign = () => solid(120, 61);
    return {
        getBackground: () => solid(320, 104, 60, 30, 20), getLogo: () => solid(632, 94, 0, 200, 0),
        getF1: sign, getF2: sign, getF3: sign, getF4: sign, getExit: sign,
        getRatingSign: vi.fn(() => solid(72, 27, 0, 120, 0)), getMusicIcon: vi.fn(() => solid(64, 31, 250, 250, 0)), getFxIcon: vi.fn(() => solid(64, 31, 250, 0, 0)),
        getReel: () => solid(16, 16), getLeftScroll: () => solid(48, 16), getRightScroll: () => solid(48, 16),
    };
}

class RecordingFont extends MenuFont {
    public lines: Array<{ text: string; x: number; y: number }> = [];
    constructor() { super(null, new ColorPalette()); }
    override drawText(_target: Frame, text: string, x: number, y: number): number {
        this.lines.push({ text, x, y });
        return x + text.length * MENU_GLYPH_WIDTH;
    }
}

describe('DOS title screen', () => {
    it('places the five signs and reports which one was tapped', () => {
        const art = sprites();
        const { frame, hits } = buildTitleScreen(art as unknown as MainImageSprites, { rating: 2, audio: 'music' });
        expect([frame.width, frame.height]).toEqual([640, 400]);
        expect(art.getRatingSign).toHaveBeenCalledWith(2);
        expect(art.getMusicIcon).toHaveBeenCalled();
        expect(hitAt(hits, 104, 158)).toEqual({ kind: 'play' });
        expect(hitAt(hits, 248, 158)).toEqual({ kind: 'levels' });
        expect(hitAt(hits, 392, 158)).toEqual({ kind: 'rating' });
        expect(hitAt(hits, 536, 158)).toEqual({ kind: 'audio' });
        expect(hitAt(hits, 320, 236)).toEqual({ kind: 'setup' });
        expect(hitAt(hits, 320, 60)).toBeNull();
        const fx = sprites();
        buildTitleScreen(fx as unknown as MainImageSprites, { rating: 0, audio: 'fx' });
        expect(fx.getFxIcon).toHaveBeenCalled();
        expect(fx.getMusicIcon).not.toHaveBeenCalled();
    });

    it('lists levels in two columns, marks solved ones and offers a way back', () => {
        const font = new RecordingFont();
        const names = Array.from({ length: 30 }, (_, index) => `Level name number ${index + 1}`);
        const { frame, hits } = buildLevelList(sprites() as unknown as MainImageSprites, font, 1, names, new Set([0, 17]));
        expect(font.lines).toHaveLength(31);
        expect(font.lines[0]).toEqual({ text: ' 1 Level name numbe', x: 32, y: 48 });
        expect(font.lines[15]).toEqual({ text: '16 Level name numbe', x: 352, y: 48 });
        expect(font.lines[29].text).toBe('30 Level name numbe');
        expect(font.lines.at(-1)?.text).toBe('Back');
        expect(hitAt(hits, 100, 48 + 3 * 16 + 8)).toEqual({ kind: 'level', index: 3 });
        expect(hitAt(hits, 400, 48 + 2 * 16 + 8)).toEqual({ kind: 'level', index: 17 });
        expect(hitAt(hits, 320, 22 * 16 + 8)).toEqual({ kind: 'back' });
        const green = ColorPalette.colorFromRGB(0, 176, 0) >>> 0; // the frame buffer is unsigned
        expect(frame.getBuffer()[(48 + 7) * 640 + (32 - 16 + 7)]).toBe(green); // level 1 is solved
        expect(frame.getBuffer()[(64 + 7) * 640 + (32 - 16 + 7)]).not.toBe(green); // level 2 is not
    });
});

describe('DOS menu choices', () => {
    it('cycles the audio modes like the F4 sign', () => {
        expect(nextAudioMode('music')).toBe('fx');
        expect(nextAudioMode('fx')).toBe('off');
        expect(nextAudioMode('off')).toBe('music');
    });

    it('starts a rating at its first unsolved level', () => {
        expect(firstUnsolvedLevel(1, 2, 30, new Set([0, 1, 2]))).toEqual({ gameType: 1, groupIndex: 2, levelIndex: 3 });
        expect(firstUnsolvedLevel(1, 2, 3, new Set([0, 1, 2]))).toEqual({ gameType: 1, groupIndex: 2, levelIndex: 0 });
    });
});
