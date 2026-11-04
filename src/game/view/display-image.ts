import { DrawProperties } from '../resources/draw-properties';
import { Frame } from '../resources/frame';
import { Mask } from '../resources/mask';
import { SolidLayer } from '../resources/solid-layer';
import { EventHandler } from '../utilities/event-handler';
import { Position2D } from '../utilities/position2d';
import { Rectangle } from '../utilities/rectangle';
import { Stage } from './stage';
import type { WindowsLemmingSprite } from '../resources/windows-lemming-sprites';

/** handel the display of the game images */
export class DisplayImage {

    private imgData?: ImageData;
    private groundMask?: SolidLayer;
    private nativeBackground?: ImageData;
    private nativeForeground?: ImageData;
    private nativeForegroundPixels?: Uint32Array;
    private nativeSprites?: ReadonlyMap<Frame, WindowsLemmingSprite>;
    private rejectedNativeBackground?: Uint8ClampedArray<ArrayBuffer>;

    /** Supply an optional 2× terrain layer without affecting the logical DOS raster. */
    public setNativeBackground(pixels: Uint8ClampedArray<ArrayBuffer> | null, width?: number, height?: number): void {
        if (!pixels) { this.nativeBackground = undefined; this.nativeForeground = undefined; this.nativeForegroundPixels = undefined; this.rejectedNativeBackground = undefined; return; }
        if (pixels === this.rejectedNativeBackground) return;
        if (!this.imgData || width !== this.imgData.width * 2 || height !== this.imgData.height * 2 || pixels.length !== width * height * 4) {
            this.rejectNativeBackground(pixels);
            return;
        }
        if (this.nativeBackground?.data !== pixels) {
            try {
                this.nativeBackground = new ImageData(pixels, width, height);
                this.nativeForeground = new ImageData(width, height);
                this.nativeForegroundPixels = new Uint32Array(this.nativeForeground.data.buffer, this.nativeForeground.data.byteOffset, this.nativeForeground.data.byteLength / 4);
            } catch { this.rejectNativeBackground(pixels); }
        }
    }

    /** Fall back to the DOS frame after an invalid native layer or allocation failure. */
    public rejectNativeBackground(pixels = this.nativeBackground?.data): void {
        this.rejectedNativeBackground = pixels;
        this.nativeBackground = undefined;
        this.nativeForeground = undefined;
        this.nativeForegroundPixels = undefined;
        this.stage.onGraphicsError.trigger('Windows graphics are unavailable. Original graphics have been restored.');
    }

    public setNativeSprites(sprites: ReadonlyMap<Frame, WindowsLemmingSprite> | null): void {
        this.nativeSprites = sprites ?? undefined;
    }

    public getNativeLayers(): { background: ImageData; foreground: ImageData } | undefined {
        return this.nativeBackground && this.nativeForeground ? { background: this.nativeBackground, foreground: this.nativeForeground } : undefined;
    }

    private setNativePixel(x: number, y: number, rgba: number): void {
        const layer = this.nativeForeground;
        if (!layer || x < 0 || y < 0 || x * 2 + 1 >= layer.width || y * 2 + 1 >= layer.height) return;
        const pixels = this.nativeForegroundPixels!;
        const at = y * 2 * layer.width + x * 2;
        pixels[at] = pixels[at + 1] = pixels[at + layer.width] = pixels[at + layer.width + 1] = rgba;
    }


    public getWidth(): number {
        if (!this.imgData) {
            return 0;
        }
        return this.imgData.width;
    }
    public getHeight(): number {
        if (!this.imgData) {
            return 0;
        }
        return this.imgData.height;
    }

    constructor(private stage: Stage) {}

    public onMouseUp = new EventHandler<Position2D>();
    public onMouseDown = new EventHandler<Position2D>();
    public onMouseMove = new EventHandler<Position2D>();
    public onDoubleClick = new EventHandler<Position2D>();

    public initSize(width: number, height: number) {
        /// create image data
        if ((this.imgData) && (this.imgData.width == width) && (this.imgData.height == height)) {
            return;
        }

        const tmpImg = this.stage.createImage(this, width, height);

        if (!tmpImg) {
            return;
        }

        this.imgData = tmpImg;

        this.clear();
    }

    public clear() {
        if (!this.imgData) {
            return;
        }

        const data = this.imgData.data;
        new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4).fill(0xFF000000);
    }


    /** render the level-background to an image */
    public setBackground(groundImage: Uint8ClampedArray, groundMask?: SolidLayer) {
        if (!this.imgData) {
            return;
        }

        /// set pixels
        this.imgData.data.set(groundImage);
        this.groundMask = groundMask;
        this.nativeForeground?.data.fill(0);
    }


    private uint8ClampedColor(colorValue: number): number {
        return colorValue & 0xFF;
    }

    public drawRectangle(rect: Rectangle, red: number, green: number, blue: number) {
        this.drawHorizontalLine(rect.x1, rect.y1, rect.x2, red, green, blue);
        this.drawHorizontalLine(rect.x1, rect.y2, rect.x2, red, green, blue);
        this.drawVerticalLine(rect.x1, rect.y1, rect.y2, red, green, blue);
        this.drawVerticalLine(rect.x2, rect.y1, rect.y2, red, green, blue);
    }

    /** fill a solid rectangle, clipped to the display */
    public fillRect(x: number, y: number, width: number, height: number, red: number, green: number, blue: number) {
        if (!this.imgData) return;
        const x1 = Math.max(0, x), y1 = Math.max(0, y);
        const x2 = Math.min(this.imgData.width, x + width), y2 = Math.min(this.imgData.height, y + height);
        for (let py = y1; py < y2; py++) {
            for (let px = x1; px < x2; px++) this.setPixel(px, py, red, green, blue);
        }
    }

    /** draw a rect to the display */
    public drawRect(x: number, y: number, width: number, height: number, red: number, green: number, blue: number) {

        const x2 = x + width;
        const y2 = y + height;

        this.drawHorizontalLine(x, y, x2, red, green, blue);
        this.drawHorizontalLine(x, y2, x2, red, green, blue);
        this.drawVerticalLine(x, y, y2, red, green, blue);
        this.drawVerticalLine(x2, y, y2, red, green, blue);

    }

    public drawVerticalLine(x1: number, y1: number, y2: number, red: number, green: number, blue: number) {
        if (!this.imgData) {
            return;
        }

        red = this.uint8ClampedColor(red);
        green = this.uint8ClampedColor(green);
        blue = this.uint8ClampedColor(blue);

        const destW = this.imgData.width;
        const destH = this.imgData.height;
        const destData = this.imgData.data;

        x1 = (x1 >= destW) ? (destW - 1) : (x1 < 0) ? 0 : x1;
        y1 = (y1 >= destH) ? (destH - 1) : (y1 < 0) ? 0 : y1;
        y2 = (y2 >= destH) ? (destH - 1) : (y2 < 0) ? 0 : y2;

        for (let y = y1; y <= y2; y += 1) {
            const destIndex = ((destW * y) + x1) * 4;

            destData[destIndex] = red;
            destData[destIndex + 1] = green;
            destData[destIndex + 2] = blue;
            destData[destIndex + 3] = 255;
            this.setNativePixel(x1, y, (0xff000000 | blue << 16 | green << 8 | red) >>> 0);
        }
    }


    public drawHorizontalLine(x1: number, y1: number, x2: number, red: number, green: number, blue: number) {
        if (!this.imgData) {
            return;
        }

        red = this.uint8ClampedColor(red);
        green = this.uint8ClampedColor(green);
        blue = this.uint8ClampedColor(blue);

        const destW = this.imgData.width;
        const destH = this.imgData.height;
        const destData = this.imgData.data;

        x1 = (x1 >= destW) ? (destW - 1) : (x1 < 0) ? 0 : x1;
        y1 = (y1 >= destH) ? (destH - 1) : (y1 < 0) ? 0 : y1;
        x2 = (x2 >= destW) ? (destW - 1) : (x2 < 0) ? 0 : x2;

        for (let x = x1; x <= x2; x += 1) {
            const destIndex = ((destW * y1) + x) * 4;

            destData[destIndex] = red;
            destData[destIndex + 1] = green;
            destData[destIndex + 2] = blue;
            destData[destIndex + 3] = 255;
            this.setNativePixel(x, y1, (0xff000000 | blue << 16 | green << 8 | red) >>> 0);
        }
    }


    /** copy a mask frame to the display */
    public drawMask(mask: Mask, posX: number, posY: number) {
        if (!this.imgData) {
            return;
        }

        const srcW = mask.width;
        const srcH = mask.height;
        const srcMask = mask.getMask();

        const destW = this.imgData.width;
        const destH = this.imgData.height;
        const destData = new Uint32Array(this.imgData.data.buffer);

        const destX = posX + mask.offsetX;
        const destY = posY + mask.offsetY;

        for (let y = 0; y < srcH; y++) {

            const outY = y + destY;
            if ((outY < 0) || (outY >= destH)) {
                continue;
            }

            for (let x = 0; x < srcW; x++) {
                const srcIndex = ((srcW * y) + x);

                /// ignore transparent pixels
                if (srcMask[srcIndex] == 0) {
                    continue;
                }

                const outX = x + destX;
                if ((outX < 0) || (outX >= destW)) {
                    continue;
                }

                const destIndex = ((destW * outY) + outX);

                destData[destIndex] = 0xFFFFFFFF;
                this.setNativePixel(outX, outY, 0xffffffff);
            }
        }
    }

    /** copy a frame to the display - transparent color is changed to (r,g,b) */
    public drawFrameCovered(frame: Frame, posX: number, posY: number, red: number, green: number, blue: number) {
        if (!this.imgData) {
            return;
        }

        const srcW = frame.width;
        const srcH = frame.height;
        const srcBuffer = frame.getBuffer();
        const srcMask = frame.getMask();

        const nullColor = 0xFF << 24 | blue << 16 | green << 8 | red;

        const destW = this.imgData.width;
        const destH = this.imgData.height;
        const destData = new Uint32Array(this.imgData.data.buffer);

        const destX = posX + frame.offsetX;
        const destY = posY + frame.offsetY;

        red = this.uint8ClampedColor(red);
        green = this.uint8ClampedColor(green);
        blue = this.uint8ClampedColor(blue);

        for (let y = 0; y < srcH; y++) {

            const outY = y + destY;
            if ((outY < 0) || (outY >= destH)) {
                continue;
            }

            for (let x = 0; x < srcW; x++) {
                const srcIndex = ((srcW * y) + x);

                const outX = x + destX;
                if ((outX < 0) || (outX >= destW)) {
                    continue;
                }

                const destIndex = ((destW * outY) + outX);

                if (srcMask[srcIndex] == 0) {
                    /// transparent pixel
                    destData[destIndex] = nullColor;
                    this.setNativePixel(outX, outY, nullColor);
                }
                else {
                    destData[destIndex] = srcBuffer[srcIndex];
                    this.setNativePixel(outX, outY, srcBuffer[srcIndex]);
                }
            }
        }
    }


    /** copy a frame to the display */
    public drawFrame(frame: Frame, posX: number, posY: number) {
        if (!this.imgData) {
            return;
        }

        const srcW = frame.width;
        const srcH = frame.height;
        const srcBuffer = frame.getBuffer();
        const srcMask = frame.getMask();

        const destW = this.imgData.width;
        const destH = this.imgData.height;
        const destData = new Uint32Array(this.imgData.data.buffer);

        const destX = posX + frame.offsetX;
        const destY = posY + frame.offsetY;
        const nativeSprite = this.nativeForeground && this.nativeSprites?.get(frame);

        for (let y = 0; y < srcH; y++) {

            const outY = y + destY;
            if ((outY < 0) || (outY >= destH)) {
                continue;
            }

            for (let x = 0; x < srcW; x++) {
                const srcIndex = ((srcW * y) + x);

                /// ignore transparent pixels
                if (srcMask[srcIndex] == 0) {
                    continue;
                }

                const outX = x + destX;
                if ((outX < 0) || (outX >= destW)) {
                    continue;
                }

                const destIndex = ((destW * outY) + outX);

                destData[destIndex] = srcBuffer[srcIndex];
                if (!nativeSprite) this.setNativePixel(outX, outY, srcBuffer[srcIndex]);
            }
        }
        if (nativeSprite && this.nativeForeground) {
            const output = this.nativeForegroundPixels!;
            const width = this.nativeForeground.width, height = this.nativeForeground.height;
            const left = posX * 2 + nativeSprite.offsetX, top = posY * 2 + nativeSprite.offsetY;
            for (let y = 0; y < nativeSprite.height; y++) {
                const outY = top + y;
                if (outY < 0 || outY >= height) continue;
                for (let x = 0; x < nativeSprite.width; x++) {
                    const outX = left + x, pixel = nativeSprite.pixels[y * nativeSprite.width + x];
                    if (outX >= 0 && outX < width && pixel >>> 24) output[outY * width + outX] = pixel;
                }
            }
        }
    }


    /** copy a frame to the display */
    public drawFrameFlags(frame: Frame, posX: number, posY: number, destConfig: DrawProperties) {
        if (!this.imgData) {
            return;
        }

        const srcW = frame.width;
        const srcH = frame.height;
        const srcBuffer = frame.getBuffer();
        const srcMask = frame.getMask();

        const destW = this.imgData.width;
        const destH = this.imgData.height;
        const destData = new Uint32Array(this.imgData.data.buffer);

        const destX = posX + frame.offsetX;
        const destY = posY + frame.offsetY;

        const upsideDown = destConfig.isUpsideDown;
        const noOverwrite = destConfig.noOverwrite;
        const onlyOverwrite = destConfig.onlyOverwrite;

        const mask = this.groundMask;
        const nativeSprite = this.nativeForeground && this.nativeSprites?.get(frame);

        for (let srcY = 0; srcY < srcH; srcY++) {

            const outY = srcY + destY;
            if ((outY < 0) || (outY >= destH)) {
                continue;
            }

            for (let srcX = 0; srcX < srcW; srcX++) {

                const sourceY = upsideDown ? (srcH - srcY - 1) : srcY;
                const srcIndex = ((srcW * sourceY) + srcX);

                /// ignore transparent pixels
                if (srcMask[srcIndex] == 0) {
                    continue;
                }

                const outX = srcX + destX;
                if ((outX < 0) || (outX >= destW)) {
                    continue;
                }

                /// check flags
                if (noOverwrite && mask) {
                    if (mask.hasGroundAt(outX, outY)) {
                        continue;
                    }
                }

                if (onlyOverwrite && mask) {
                    if (!mask.hasGroundAt(outX, outY)) {
                        continue;
                    }
                }

                /// draw
                const destIndex = ((destW * outY) + outX);

                destData[destIndex] = srcBuffer[srcIndex];
                if (!nativeSprite) this.setNativePixel(outX, outY, srcBuffer[srcIndex]);
            }
        }

        if (nativeSprite && this.nativeForeground) {
            const output = this.nativeForegroundPixels!;
            const width = this.nativeForeground.width, height = this.nativeForeground.height;
            const left = posX * 2 + nativeSprite.offsetX, top = posY * 2 + nativeSprite.offsetY;
            for (let y = 0; y < nativeSprite.height; y++) {
                const outY = top + y;
                if (outY < 0 || outY >= height) continue;
                const sourceY = upsideDown ? nativeSprite.height - y - 1 : y;
                for (let x = 0; x < nativeSprite.width; x++) {
                    const outX = left + x, pixel = nativeSprite.pixels[sourceY * nativeSprite.width + x];
                    if (outX < 0 || outX >= width || !(pixel >>> 24)) continue;
                    const solid = mask?.hasGroundAt(Math.floor(outX / 2), Math.floor(outY / 2)) ?? false;
                    if (mask && ((noOverwrite && solid) || (onlyOverwrite && !solid))) continue;
                    output[outY * width + outX] = pixel;
                }
            }
        }

    }

    public setDebugPixel(x: number, y: number) {
        this.setPixel(x, y, 255, 0, 0);
    }


    public setPixel(x: number, y: number, r: number, g: number, b: number) {
        if (!this.imgData) {
            return;
        }
        if (x < 0 || x >= this.imgData.width || y < 0 || y >= this.imgData.height) return;

        const pointIndex = (this.imgData.width * (y) + x) * 4;

        this.imgData.data[pointIndex] = r;
        this.imgData.data[pointIndex + 1] = g;
        this.imgData.data[pointIndex + 2] = b;
        this.imgData.data[pointIndex + 3] = 255;
        this.setNativePixel(x, y, (0xff000000 | b << 16 | g << 8 | r) >>> 0);
    }


    public setScreenPosition(x: number, y: number) {
        this.stage.setGameViewPointPosition(x, y);
    }

    public getImageData() {
        return this.imgData;
    }

    public redraw() {
        this.stage.redraw();
    }
}
