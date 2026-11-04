import { BinaryReader } from './file/binary-reader';
import { Frame } from './frame';
import { ColorPalette } from './lemmings/color-palette';
import { PaletteImage } from './lemmings/palette-image';

/** The DOS menu font: 94 purple 16×16 glyphs from "!" to "~" in MAIN.DAT section 4. */
const FONT_OFFSET = 0x69B0, GLYPH_BYTES = 0x60, FIRST_CHAR = 0x21, LAST_CHAR = 0x7E;
export const MENU_GLYPH_WIDTH = 16, MENU_GLYPH_HEIGHT = 16;

export class MenuFont {
    private glyphs = new Map<number, Frame>();

    constructor(private fr4: BinaryReader | null, private palette: ColorPalette) {}

    /** The glyph for a character, or null for a space and characters outside the font. */
    public getGlyph(character: string): Frame | null {
        const code = character.charCodeAt(0);
        if (!this.fr4 || code < FIRST_CHAR || code > LAST_CHAR) return null;
        let glyph = this.glyphs.get(code);
        if (!glyph) {
            const image = new PaletteImage(MENU_GLYPH_WIDTH, MENU_GLYPH_HEIGHT);
            image.readImageData(this.fr4, 3, FONT_OFFSET + (code - FIRST_CHAR) * GLYPH_BYTES);
            image.setTransparencyByColorIndex(0);
            glyph = image.createFrame(this.palette);
            this.glyphs.set(code, glyph);
        }
        return glyph;
    }

    /** Draw text with its top-left corner at (x, y); returns the x after the last glyph. */
    public drawText(target: Frame, text: string, x: number, y: number): number {
        for (const character of text) {
            const glyph = this.getGlyph(character);
            if (glyph) blitFrame(target, glyph, x, y);
            x += MENU_GLYPH_WIDTH;
        }
        return x;
    }

    /** Draw text centred on the target's width. */
    public drawCentered(target: Frame, text: string, y: number): void {
        this.drawText(target, text, Math.floor((target.width - text.length * MENU_GLYPH_WIDTH) / 2), y);
    }
}

/** Copy the opaque pixels of one frame onto another. */
export function blitFrame(target: Frame, source: Frame, left: number, top: number): void {
    const data = source.getBuffer(), mask = source.getMask();
    for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
            const index = y * source.width + x;
            if (mask[index]) target.setPixel(left + x, top + y, data[index]);
        }
    }
}
