import { ColorPalette } from './lemmings/color-palette';
import { PaletteImage } from './lemmings/palette-image';
import { BinaryReader } from './file/binary-reader';
import { Frame } from './frame';
import { MenuFont } from './menu-font';

export class MainImageSprites {
    private fr3: BinaryReader;
    private fr4: BinaryReader;
    private colorPalette: ColorPalette;

    public constructor(fr3: BinaryReader, fr4: BinaryReader) {
        this.fr3 = fr3;
        this.fr4 = fr4;

        this.colorPalette = new ColorPalette();
        this.colorPalette.setMainColors();
    }

    public getBackground() {
        const paletteImg = new PaletteImage(320, 104);
        paletteImg.readImageData(this.fr3, 2, 0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getLogo() {
        const paletteImg = new PaletteImage(632, 94);
        paletteImg.readImageData(this.fr3, 4, 0x2080);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getF1() {
        const paletteImg = new PaletteImage(120, 61);
        paletteImg.readImageData(this.fr3, 4, 0x9488);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getF2() {
        const paletteImg = new PaletteImage(120, 61);
        paletteImg.readImageData(this.fr3, 4, 0xA2D4);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }


    public getF3() {
        const paletteImg = new PaletteImage(120, 61);
        paletteImg.readImageData(this.fr3, 4, 0xB120);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getF4() {
        const paletteImg = new PaletteImage(120, 61);
        paletteImg.readImageData(this.fr3, 4, 0xDC04);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getLevelRating() {
        const paletteImg = new PaletteImage(120, 61);
        paletteImg.readImageData(this.fr3, 4, 0xBF6C);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getExit() {
        const paletteImg = new PaletteImage(120, 61);
        paletteImg.readImageData(this.fr3, 4, 0xCDB8);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getMusicIcon() {
        const paletteImg = new PaletteImage(64, 31);
        paletteImg.readImageData(this.fr3, 4, 0xEA50);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getFxIcon() {
        const paletteImg = new PaletteImage(64, 31);
        paletteImg.readImageData(this.fr3, 4, 0xEE30);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }


    public getLeftScroll() {
        const paletteImg = new PaletteImage(48, 16);
        paletteImg.readImageData(this.fr4, 4, 0x2A00);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getRightScroll() {
        const paletteImg = new PaletteImage(48, 16);
        paletteImg.readImageData(this.fr4, 4, 0x4200);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    public getReel() {
        const paletteImg = new PaletteImage(16, 16);
        paletteImg.readImageData(this.fr4, 4, 0x5A00);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    /** The 72×27 rating sign for a difficulty: 0 Fun, 1 Tricky, 2 Taxing, 3 Mayhem. */
    public getRatingSign(rating: number) {
        const offsets = [0x65E4, 0x6218, 0x5E4C, 0x5A80];
        const paletteImg = new PaletteImage(72, 27);
        paletteImg.readImageData(this.fr4, 4, offsets[Math.max(0, Math.min(offsets.length - 1, rating))]);
        paletteImg.setTransparencyByColorIndex(0);
        return paletteImg.createFrame(this.colorPalette);
    }

    /** One of the seven blinking-eyes animations on the title screen, 8 frames of 32×12. */
    public getBlink(index: number) {
        const frames: Frame[] = [];
        for (let frame = 0; frame < 8; frame++) {
            const paletteImg = new PaletteImage(32, 12);
            paletteImg.readImageData(this.fr4, 4, index * 0x600 + frame * 0xC0);
            paletteImg.setTransparencyByColorIndex(0);
            frames.push(paletteImg.createFrame(this.colorPalette));
        }
        return frames;
    }

    /** The purple 16×16 text font used by the DOS menu, preview and result screens. */
    public getMenuFont() {
        return new MenuFont(this.fr4, this.colorPalette);
    }
}