// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildExitScreen, hitAt } from '../../src/game/view/dos-screens';
import { Frame } from '../../src/game/resources/frame';
import { MenuFont, MENU_GLYPH_WIDTH } from '../../src/game/resources/menu-font';
import { ColorPalette } from '../../src/game/resources/lemmings/color-palette';
import { clearDosProgress, readLastLevel, readProgress, recordCompletion, rememberLevel } from '../../src/game/progress';

class RecordingFont extends MenuFont {
    public lines: Array<{ text: string; x: number; y: number }> = [];
    constructor() { super(null, new ColorPalette()); }
    override drawText(_target: Frame, text: string, x: number, y: number): number {
        this.lines.push({ text, x, y });
        return x + text.length * MENU_GLYPH_WIDTH;
    }
}

describe('exit screen', () => {
    it('offers the file chooser, erasing progress and a way back', () => {
        const font = new RecordingFont();
        const { hits } = buildExitScreen(font);
        expect(font.lines.map(line => line.text)).toEqual(['There is no DOS to exit to', 'Change game files', 'Erase progress', 'Back to the game']);
        expect(hitAt(hits, 320, 10 * 16 + 8)).toEqual({ kind: 'files' });
        expect(hitAt(hits, 320, 13 * 16 + 8)).toEqual({ kind: 'erase' });
        expect(hitAt(hits, 320, 18 * 16 + 8)).toEqual({ kind: 'back' });
        expect(hitAt(hits, 320, 60)).toBeNull();
    });

    it('asks before erasing and reports the result', () => {
        const confirm = new RecordingFont();
        const { hits } = buildExitScreen(confirm, true);
        expect(confirm.lines[0].text).toBe('Erase all progress?');
        expect(hitAt(hits, 320, 11 * 16 + 8)).toEqual({ kind: 'confirm-erase' });
        expect(hitAt(hits, 320, 14 * 16 + 8)).toEqual({ kind: 'back' });
        const after = new RecordingFont();
        buildExitScreen(after, false, 'Progress erased');
        expect(after.lines[1].text).toBe('Progress erased');
    });

    it('erases DOS completions and the last level', () => {
        localStorage.clear();
        recordCompletion(1, 0, 3, 100, 'dos');
        rememberLevel(1, 0, 4, 'dos');
        expect(readProgress('dos')).toHaveLength(1);
        expect(clearDosProgress()).toBe(true);
        expect(readProgress('dos')).toEqual([]);
        expect(readLastLevel('dos')).toBeNull();
    });
});
