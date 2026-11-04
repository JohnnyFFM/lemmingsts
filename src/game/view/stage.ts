import { Position2D } from '../utilities/position2d';
import { EventHandler } from '../utilities/event-handler';
import { Frame } from '../resources/frame';
import { DisplayImage } from './display-image';
import type { PresentFrame, PresentLayer } from './gl-presenter';
import { StageImageProperties } from './stage-image-properties';
import { UserInputManager } from './user-input-manager';

/** Native Windows layout, in canvas pixels. DOS keeps its original geometry. */
const WINDOWS_WIDTH = 960, WINDOWS_HEIGHT = 440, WINDOWS_PANEL_HEIGHT = 120;
const WINDOWS_ICON_X = 8, WINDOWS_ICON_Y = 20, WINDOWS_ICON_SCALE = 2.75;
const WINDOWS_ICON_TOP = 16, WINDOWS_ICON_COUNT = 13;
const WINDOWS_MAP_X = 608, WINDOWS_MAP_Y = 20, WINDOWS_MAP_WIDTH = 320, WINDOWS_MAP_HEIGHT = 76;
const WINDOWS_STATUS_Y = 98;
const WINDOWS_SCROLL_X = 4, WINDOWS_SCROLL_Y = 0, WINDOWS_SCROLL_WIDTH = 952, WINDOWS_SCROLL_HEIGHT = 16;
const WINDOWS_SCROLL_ARROW = 16;
/** DOS full-screen layout: the original 320×40 panel spans the whole width. */
const DOS_PANEL_WIDTH = 320, DOS_PANEL_HEIGHT = 40, DOS_LEVEL_HEIGHT = 160, DOS_STAGE_HEIGHT = 600;
/** A touch held this long without moving switches the press into a pan. */
const HOLD_TO_PAN_MS = 250;
export interface WindowsStatus {
    needed: number;
    total: number;
    out: number;
    home: number;
    time: string;
}

/** handel the display / output of game, gui, ... */
export class Stage {

    private stageCav: HTMLCanvasElement;
    private gameImgProps: StageImageProperties;
    private guiImgProps: StageImageProperties;

    private controller: UserInputManager;
    private pressedImage: StageImageProperties | null = null;
    private pressPosition: Position2D | null = null;
    private dragging = false;
    private keyboardTarget: (() => Position2D | null) | null = null;
    private exampleHint: Position2D | null = null;
    private nativeCanvas: HTMLCanvasElement | null = null;
    private nativeForegroundCanvas: HTMLCanvasElement | null = null;
    private nativeGuiCanvas: HTMLCanvasElement | null = null;
    private nativeGuiForegroundCanvas: HTMLCanvasElement | null = null;
    private minimapLemmings: (() => readonly { x: number; y: number }[]) | null = null;
    private windowsStatus: (() => WindowsStatus) | null = null;
    private minimapDragging = false;
    private scrollbarDragging = false;
    private scrollbarDragOffset = 0;
    private dosViewport: { width: number; height: number } | null = null;
    private dosPanelScale: number | null = null;
    private holdTimer: ReturnType<typeof setTimeout> | null = null;
    /** A full-screen picture (such as a DOS menu) shown instead of the level and panel. */
    private overlay: { frame: Frame; canvas: HTMLCanvasElement; onTap: ((x: number, y: number) => void) | null } | null = null;
    public readonly onGraphicsError = new EventHandler<string>();
    /** True when the playfield is away from its starting scale. */
    public readonly onZoomChange = new EventHandler<boolean>();
    /** Raised after each composition with what was drawn, for a filtering presenter to redraw. */
    public readonly onPresent = new EventHandler<PresentFrame>();
    private readonly defaultZoom: number;
    private fittedZoom: number;
    private customZoom = false;
    private fullscreenViewport: { width: number; height: number } | null = null;
    private readonly originalCanvasWidth: number;
    private readonly originalCanvasHeight: number;


    constructor(canvasForOutput: HTMLCanvasElement, zoom = 2) {
        this.defaultZoom = zoom;
        this.fittedZoom = zoom;
        this.originalCanvasWidth = canvasForOutput.width;
        this.originalCanvasHeight = canvasForOutput.height;
        this.controller = new UserInputManager(canvasForOutput);

        this.handleOnMouseUp();
        this.handleOnMouseDown();
        this.handleOnMouseMove();
        this.controller.onCancel.on(() => this.cancelPress());
        this.handleOnDoubleClick();
        this.handelOnZoom();
        this.handlePinch();

        this.stageCav = canvasForOutput;

        this.gameImgProps = new StageImageProperties(zoom);

        this.guiImgProps = new StageImageProperties(zoom);

        this.updateStageSize();

        this.clear();
    }

    /** Centre a playfield that does not fill the viewport; the panel stays fixed. */
    private contentOffset(stageImage: StageImageProperties): Position2D {
        if (!stageImage.display) return new Position2D(0, 0);
        if (stageImage === this.guiImgProps && this.minimapLemmings) {
            return new Position2D(WINDOWS_ICON_X, WINDOWS_ICON_Y);
        }
        if (stageImage !== this.gameImgProps) return new Position2D(0, 0);
        const width = stageImage.display.getWidth(), height = stageImage.display.getHeight();
        if (!width || !height) return new Position2D(0, 0);
        const scale = stageImage.viewPoint.scale;
        return new Position2D(Math.max(0, Math.floor((stageImage.width - width * scale) / 2)),
            Math.max(0, Math.floor((stageImage.height - height * scale) / 2)));
    }

    private calcPosition2D(stageImage: StageImageProperties, e: Position2D): Position2D {
        const offset = this.contentOffset(stageImage);
        const x = (stageImage.viewPoint.getSceneX(e.x - stageImage.x - offset.x));
        const y = (stageImage.viewPoint.getSceneY(e.y - stageImage.y - offset.y)) +
            (stageImage === this.guiImgProps && this.minimapLemmings ? WINDOWS_ICON_TOP : 0);

        const result = new Position2D(x, y);
        // Keep touch assistance bounded so a tap still selects a nearby lemming.
        result.hitSlop = Math.min(12, e.hitSlop / stageImage.viewPoint.scale);
        return result;
    }

    /** Do not target the edge of a level by tapping its empty margins. */
    private isInContent(stageImage: StageImageProperties, e: Position2D): boolean {
        if (!stageImage.display || (stageImage !== this.gameImgProps && !(stageImage === this.guiImgProps && this.minimapLemmings))) return true;
        if (stageImage === this.guiImgProps) {
            const x = e.x - stageImage.x - WINDOWS_ICON_X, y = e.y - stageImage.y - WINDOWS_ICON_Y;
            return x >= 0 && x < WINDOWS_ICON_COUNT * 16 * WINDOWS_ICON_SCALE &&
                y >= 0 && y < (40 - WINDOWS_ICON_TOP) * WINDOWS_ICON_SCALE;
        }
        const width = stageImage.display.getWidth(), height = stageImage.display.getHeight();
        if (!width || !height) return true;
        const offset = this.contentOffset(stageImage), scale = stageImage.viewPoint.scale;
        const x = e.x - stageImage.x - offset.x, y = e.y - stageImage.y - offset.y;
        return x >= 0 && y >= 0 && x < width * scale && y < height * scale;
    }


    /**
     * Show a picture over the whole stage, scaled to fit and centred, until it
     * is cleared. While it is up, the level and panel take no input; a tap on
     * the picture reports its position in the picture's own pixels.
     */
    public setOverlay(frame: Frame | null, onTap: ((x: number, y: number) => void) | null = null): void {
        this.cancelPress();
        this.controller.cancelActive();
        if (!frame) {
            this.overlay = null;
            this.redraw();
            return;
        }
        const canvas = this.overlay?.canvas ?? document.createElement('canvas');
        if (canvas.width !== frame.width || canvas.height !== frame.height) {
            canvas.width = frame.width;
            canvas.height = frame.height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx && typeof ImageData !== 'undefined') ctx.putImageData(new ImageData(frame.getData(), frame.width, frame.height), 0, 0);
        this.overlay = { frame, canvas, onTap };
        this.redraw();
    }

    public hasOverlay(): boolean {
        return this.overlay !== null;
    }

    /** Where the overlay lands on the stage: letterboxed, keeping its pixels square. */
    private overlayBounds(): { x: number; y: number; width: number; height: number; scale: number } | null {
        if (!this.overlay) return null;
        const { frame } = this.overlay;
        const scale = Math.min(this.stageCav.width / frame.width, this.stageCav.height / frame.height);
        const width = Math.floor(frame.width * scale), height = Math.floor(frame.height * scale);
        return { x: Math.floor((this.stageCav.width - width) / 2), y: Math.floor((this.stageCav.height - height) / 2), width, height, scale };
    }

    private drawOverlay(): void {
        const bounds = this.overlayBounds();
        const ctx = this.stageCav.getContext('2d');
        if (!bounds || !ctx || !this.overlay) return;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.stageCav.width, this.stageCav.height);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1;
        ctx.drawImage(this.overlay.canvas, 0, 0, this.overlay.frame.width, this.overlay.frame.height, bounds.x, bounds.y, bounds.width, bounds.height);
    }

    private tapOverlay(e: Position2D): void {
        const bounds = this.overlayBounds();
        if (!bounds || !this.overlay?.onTap) return;
        const x = Math.floor((e.x - bounds.x) / bounds.scale), y = Math.floor((e.y - bounds.y) / bounds.scale);
        if (x < 0 || y < 0 || x >= this.overlay.frame.width || y >= this.overlay.frame.height) return;
        this.overlay.onTap(x, y);
    }

    private handleOnDoubleClick(): void {

        this.controller.onDoubleClick.on((e) => {
            if (!e || this.overlay) {
                return;
            }

            if (this.isOnMinimap(e)) return;
            if (this.isOnScrollbar(e)) return;

            const stageImage = this.getStageImageAt(e.x, e.y);
            if ((stageImage == null) || (stageImage.display == null) || !this.isInContent(stageImage, e)) return;

            stageImage.display.onDoubleClick.trigger(this.calcPosition2D(stageImage, e));
        });
    }


    private handleOnMouseDown(): void {

        this.controller.onMouseDown.on((e) => {
            if (!e || this.overlay) {
                return;
            }

            if (this.isOnScrollbar(e)) {
                this.beginScrollbar(e);
                return;
            }
            if (this.isOnMinimap(e)) {
                this.minimapDragging = true;
                this.navigateMinimap(e);
                return;
            }

            const stageImage = this.getStageImageAt(e.x, e.y);
            if ((stageImage == null) || (stageImage.display == null) || !this.isInContent(stageImage, e)) {
                return;
            }

            this.pressedImage = stageImage;
            this.pressPosition = new Position2D(e.x, e.y);
            this.dragging = false;
            this.clearHoldTimer();
            // The playfield waits until release so a pan doesn't assign a skill.
            // The panel still receives down immediately for held release-rate buttons.
            if (stageImage !== this.gameImgProps) {
                stageImage.display.onMouseDown.trigger(this.calcPosition2D(stageImage, e));
            } else if (e.touch) {
                // Touch-and-hold on the level becomes a pan, so the view can be
                // moved from a standstill without first crossing the tap threshold.
                this.holdTimer = setTimeout(() => {
                    this.holdTimer = null;
                    if (this.pressedImage === stageImage) this.dragging = true;
                }, HOLD_TO_PAN_MS);
            }
        });
    }

    private clearHoldTimer(): void {
        if (this.holdTimer !== null) clearTimeout(this.holdTimer);
        this.holdTimer = null;
    }


    private handleOnMouseUp(): void {

        this.controller.onMouseUp.on((e) => {
            if (!e) {
                return;
            }
            if (this.overlay) {
                this.tapOverlay(e);
                return;
            }

            if (this.scrollbarDragging) {
                this.scrollbarDragging = false;
                return;
            }
            if (this.minimapDragging) {
                this.minimapDragging = false;
                return;
            }

            const stageImage = this.pressedImage;
            const pressPosition = this.pressPosition;
            this.pressedImage = null;
            this.pressPosition = null;
            this.clearHoldTimer();
            if (!stageImage || !stageImage.display || !pressPosition) return;

            const distance = Math.hypot(e.x - pressPosition.x, e.y - pressPosition.y);
            if (stageImage === this.gameImgProps && !this.dragging && distance < 12
                && this.getStageImageAt(e.x, e.y) === stageImage && this.isInContent(stageImage, e)) {
                stageImage.display.onMouseDown.trigger(this.calcPosition2D(stageImage, e));
            }
            stageImage.display.onMouseUp.trigger(this.calcPosition2D(stageImage, e));
        });
    }



    private handleOnMouseMove(): void {
        this.controller.onMouseMove.on((e) => {
            if (!e || this.overlay) {
                return;
            }

            if (this.scrollbarDragging && e.button) {
                this.navigateScrollbar(e.x);
                return;
            }
            if (this.minimapDragging && e.button) {
                this.navigateMinimap(e);
                return;
            }

            if (e.button) {
                const stageImage = this.pressedImage;
                if (stageImage == null) {
                    return;
                }

                if (stageImage == this.gameImgProps) {
                    if (!this.dragging && this.pressPosition &&
                        Math.hypot(e.x - this.pressPosition.x, e.y - this.pressPosition.y) >= 12) {
                        this.dragging = true;
                        this.updateViewPoint(stageImage, this.pressPosition.x - e.x, this.pressPosition.y - e.y, 0);
                    } else if (this.dragging) {
                        this.updateViewPoint(stageImage, e.deltaX, e.deltaY, 0);
                    }
                } else if (stageImage.display) {
                    // A press that started on the panel keeps reporting its
                    // movement, so the panel's minimap can be dragged.
                    stageImage.display.onMouseMove.trigger(this.calcPosition2D(stageImage, e));
                }
            }
            else {
                const stageImage = this.getStageImageAt(e.x, e.y);
                if ((stageImage == null) || (stageImage.display == null) || !this.isInContent(stageImage, e)) {
                    return;
                }

                stageImage.display.onMouseMove.trigger(this.calcPosition2D(stageImage, e));
            }
        });
    }


    private handelOnZoom(): void {
        this.controller.onZoom.on((e) => {
            if (!e || this.overlay) {
                return;
            }

            const stageImage = this.getStageImageAt(e.x, e.y);
            // The classic panel must stay at its original scale; wheel zoom is
            // for inspecting the level only.
            if (stageImage !== this.gameImgProps || !stageImage.display || !this.isInContent(stageImage, e)) {
                return;
            }
            const scene = this.calcPosition2D(stageImage, e);
            if (scene.x < 0 || scene.y < 0 || scene.x >= stageImage.display.getWidth() || scene.y >= stageImage.display.getHeight()) return;
            e.handled = true;
            this.updateViewPoint(stageImage, 0, 0, e.deltaZoom);
        });
    }

    /** Pinch only the playfield and keep the level beneath the fingers fixed. */
    private handlePinch(): void {
        this.controller.onPinchStart.on(event => {
            if (!event || this.overlay || this.pressedImage !== this.gameImgProps || !this.gameImgProps.display) return;
            if (this.getStageImageAt(event.first.x, event.first.y) !== this.gameImgProps ||
                this.getStageImageAt(event.second.x, event.second.y) !== this.gameImgProps ||
                !this.isInContent(this.gameImgProps, event.first) || !this.isInContent(this.gameImgProps, event.second)) return;
            event.handled = true;
        });
        this.controller.onPinch.on(event => {
            const image = this.gameImgProps;
            if (!event || !image.display || !Number.isFinite(event.scale) || event.scale <= 0) return;
            const oldScale = image.viewPoint.scale;
            const oldOffset = this.contentOffset(image);
            const worldX = image.viewPoint.x + (event.previousCenter.x - image.x - oldOffset.x) / oldScale;
            const worldY = image.viewPoint.y + (event.previousCenter.y - image.y - oldOffset.y) / oldScale;
            image.viewPoint.scale = this.limitValue(0.5, oldScale * event.scale, 10);
            const offset = this.contentOffset(image);
            image.viewPoint.x = this.limitValue(0,
                worldX - (event.center.x - image.x - offset.x) / image.viewPoint.scale,
                image.display.getWidth() - image.width / image.viewPoint.scale);
            image.viewPoint.y = this.limitValue(0,
                worldY - (event.center.y - image.y - offset.y) / image.viewPoint.scale,
                image.display.getHeight() - image.height / image.viewPoint.scale);
            if (image.viewPoint.scale !== oldScale) {
                this.customZoom = this.isZoomChanged(image.viewPoint.scale);
                this.onZoomChange.trigger(this.customZoom);
            }
            this.clear(image);
            const frame = image.display.getImageData();
            if (!frame) return;
            this.draw(image, frame);
            this.drawScrollbar();
            this.drawMinimap();
            this.present();
        });
    }

    /** Describe the current composition so a presenter can redraw it from the source pixels. */
    public buildPresentFrame(): PresentFrame {
        const layers: PresentLayer[] = [];
        if (this.overlay) {
            const bounds = this.overlayBounds();
            if (bounds) {
                const { frame } = this.overlay;
                layers.push({ pixels: { data: frame.getData(), width: frame.width, height: frame.height },
                    source: { x: 0, y: 0, width: frame.width, height: frame.height },
                    dest: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } });
            }
            return { width: this.stageCav.width, height: this.stageCav.height, layers };
        }
        for (const image of [this.gameImgProps, this.guiImgProps]) {
            const pixels = image.display?.getImageData();
            if (!pixels || !pixels.width || !pixels.height) continue;
            const scale = image.viewPoint.scale;
            const offset = this.contentOffset(image);
            const width = Math.min(pixels.width - image.viewPoint.x, image.width / scale);
            const height = Math.min(pixels.height - image.viewPoint.y, image.height / scale);
            if (width <= 0 || height <= 0) continue;
            layers.push({ pixels: { data: pixels.data as Uint8ClampedArray, width: pixels.width, height: pixels.height },
                source: { x: image.viewPoint.x, y: image.viewPoint.y, width, height },
                dest: { x: image.x + offset.x, y: image.y + offset.y, width: width * scale, height: height * scale } });
        }
        return { width: this.stageCav.width, height: this.stageCav.height, layers };
    }

    private present(): void {
        this.onPresent.trigger(this.buildPresentFrame());
    }

    private cancelPress(): void {
        this.minimapDragging = false;
        this.scrollbarDragging = false;
        this.clearHoldTimer();
        if (this.pressedImage && this.pressedImage.display && this.pressPosition) {
            this.pressedImage.display.onMouseUp.trigger(this.calcPosition2D(this.pressedImage, this.pressPosition));
        }
        this.pressedImage = null;
        this.pressPosition = null;
        this.dragging = false;
    }

    public zoomGame(delta: number): void {
        this.updateViewPoint(this.gameImgProps, 0, 0, delta);
    }

    /** Restore the level scale without moving its camera more than bounds require. */
    public resetZoom(): void {
        const image = this.gameImgProps;
        this.updateViewPoint(image, 0, 0, (this.fittedZoom - image.viewPoint.scale) / 0.5);
        this.customZoom = false;
    }

    private isZoomChanged(scale: number): boolean {
        return Math.abs(scale - this.fittedZoom) > 0.000001;
    }

    /** Resize only the native Windows fullscreen presentation, retaining camera and custom zoom. */
    public setWindowsFullscreenViewport(width?: number, height?: number): void {
        if (width === undefined || height === undefined) {
            if (!this.fullscreenViewport) return;
            this.fullscreenViewport = null;
        } else {
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
            if (this.fullscreenViewport?.width === width && this.fullscreenViewport.height === height) return;
            this.fullscreenViewport = { width, height };
        }
        if (this.minimapLemmings) this.resizeWindowsCanvas();
    }

    private resizeWindowsCanvas(): void {
        const image = this.gameImgProps;
        const oldOffset = this.contentOffset(image);
        const centerX = image.viewPoint.x + (image.width / 2 - oldOffset.x) / image.viewPoint.scale;
        const centerY = image.viewPoint.y + (image.height / 2 - oldOffset.y) / image.viewPoint.scale;
        const targetHeight = this.fullscreenViewport
            ? this.limitValue(WINDOWS_PANEL_HEIGHT + 1, Math.round(WINDOWS_WIDTH * this.fullscreenViewport.height / this.fullscreenViewport.width), 8192)
            : WINDOWS_HEIGHT;
        if (this.stageCav.width !== WINDOWS_WIDTH || this.stageCav.height !== targetHeight) this.controller.cancelActive();
        // Setting a canvas dimension clears it, so skip unchanged dimensions.
        if (this.stageCav.width !== WINDOWS_WIDTH) this.stageCav.width = WINDOWS_WIDTH;
        if (this.stageCav.height !== targetHeight) this.stageCav.height = targetHeight;
        this.updateStageSize();
        const levelHeight = image.display?.getHeight() ?? 0;
        this.fittedZoom = this.fullscreenViewport && levelHeight > 0
            // Leave room to zoom in further on tall portrait screens; the
            // player can still zoom manually up to the engine's 10× limit.
            ? this.limitValue(0.5, image.height / levelHeight, 7.5) : this.defaultZoom;
        if (!this.customZoom) image.viewPoint.scale = this.fittedZoom;
        else if (!this.isZoomChanged(image.viewPoint.scale)) this.customZoom = false;
        if (image.display) {
            const offset = this.contentOffset(image);
            image.viewPoint.x = this.limitValue(0,
                centerX - (image.width / 2 - offset.x) / image.viewPoint.scale,
                image.display.getWidth() - image.width / image.viewPoint.scale);
            image.viewPoint.y = this.limitValue(0,
                centerY - (image.height / 2 - offset.y) / image.viewPoint.scale,
                image.display.getHeight() - image.height / image.viewPoint.scale);
        }
        this.stageCav.style.setProperty('--windows-fullscreen-ratio', String(WINDOWS_WIDTH / targetHeight));
        this.onZoomChange.trigger(this.isZoomChanged(image.viewPoint.scale));
        this.redraw();
    }

    /** Enable the Windows micro-map for a live game, or remove it on teardown. */
    public setMinimapProvider(provider: (() => readonly { x: number; y: number }[]) | null): void {
        const wasWindows = !!this.minimapLemmings;
        this.minimapLemmings = provider;
        this.minimapDragging = false;
        this.scrollbarDragging = false;
        if (wasWindows !== !!provider) {
            if (provider) {
                this.resizeWindowsCanvas();
            } else {
                this.controller.cancelActive();
                this.stageCav.width = this.originalCanvasWidth;
                this.stageCav.height = this.originalCanvasHeight;
                this.fittedZoom = this.defaultZoom;
                if (!this.customZoom) this.gameImgProps.viewPoint.scale = this.defaultZoom;
                this.updateStageSize();
                const image = this.gameImgProps;
                if (image.display) {
                    image.viewPoint.x = this.limitValue(0, image.viewPoint.x, image.display.getWidth() - image.width / image.viewPoint.scale);
                    image.viewPoint.y = this.limitValue(0, image.viewPoint.y, image.display.getHeight() - image.height / image.viewPoint.scale);
                }
                this.onZoomChange.trigger(this.isZoomChanged(this.gameImgProps.viewPoint.scale));
            }
        }
        this.redraw();
    }

    /** Data for the original-style Windows status strip, updated on redraw. */
    public setWindowsStatusProvider(provider: (() => WindowsStatus) | null): void {
        this.windowsStatus = provider;
        this.redraw();
    }

    /** Fill more of the stage with the Windows panel while preserving its proportions. */
    private updateWindowsPanelScale(): void {
        if (this.dosPanelScale) {
            this.guiImgProps.viewPoint.scale = this.dosPanelScale;
            return;
        }
        if (!this.minimapLemmings) {
            this.guiImgProps.viewPoint.scale = this.defaultZoom;
            return;
        }
        this.guiImgProps.viewPoint.scale = WINDOWS_ICON_SCALE;
    }

    /**
     * Lay the stage out for a full-screen DOS game: the drawing buffer takes
     * the viewport's aspect ratio, the original panel spans the full width and
     * the level is fitted to the remaining height until the player zooms.
     */
    public setDosViewport(width: number, height: number): void {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        if (this.dosViewport?.width === width && this.dosViewport.height === height) return;
        this.dosViewport = { width, height };
        this.applyDosLayout();
    }

    /** Re-fit the level after it has been rendered or the viewport changed. */
    public applyDosLayout(): void {
        if (!this.dosViewport) return;
        const image = this.gameImgProps;
        const oldOffset = this.contentOffset(image);
        const centerX = image.viewPoint.x + (image.width / 2 - oldOffset.x) / image.viewPoint.scale;
        const centerY = image.viewPoint.y + (image.height / 2 - oldOffset.y) / image.viewPoint.scale;
        const stageWidth = Math.max(DOS_PANEL_WIDTH, Math.round(DOS_STAGE_HEIGHT * this.dosViewport.width / this.dosViewport.height));
        this.dosPanelScale = stageWidth / DOS_PANEL_WIDTH;
        if (this.stageCav.width !== stageWidth || this.stageCav.height !== DOS_STAGE_HEIGHT) {
            // A level press must not survive a relayout, but a tap on a menu
            // screen may: entering fullscreen on that very tap resizes the
            // stage, and the tap's release is mapped with the new bounds anyway.
            if (!this.overlay) this.controller.cancelActive();
            // Setting a canvas dimension clears it, so skip unchanged dimensions.
            if (this.stageCav.width !== stageWidth) this.stageCav.width = stageWidth;
            if (this.stageCav.height !== DOS_STAGE_HEIGHT) this.stageCav.height = DOS_STAGE_HEIGHT;
        }
        this.updateStageSize();
        const levelHeight = image.display?.getHeight() || DOS_LEVEL_HEIGHT;
        this.fittedZoom = this.limitValue(0.5, image.height / levelHeight, 10);
        if (!this.customZoom) image.viewPoint.scale = this.fittedZoom;
        else if (!this.isZoomChanged(image.viewPoint.scale)) this.customZoom = false;
        if (image.display) {
            const offset = this.contentOffset(image);
            image.viewPoint.x = this.limitValue(0,
                centerX - (image.width / 2 - offset.x) / image.viewPoint.scale,
                image.display.getWidth() - image.width / image.viewPoint.scale);
            image.viewPoint.y = this.limitValue(0,
                centerY - (image.height / 2 - offset.y) / image.viewPoint.scale,
                image.display.getHeight() - image.height / image.viewPoint.scale);
        }
        this.onZoomChange.trigger(this.isZoomChanged(image.viewPoint.scale));
        this.redraw();
    }

    /** The scale at which the DOS panel is currently drawn, or null outside that layout. */
    public getDosPanelScale(): number | null {
        return this.dosPanelScale;
    }

    /** Move the camera by logical world pixels (also available to keyboard controls). */
    public panGameBy(x: number, y = 0): void {
        const scale = this.gameImgProps.viewPoint.scale;
        this.updateViewPoint(this.gameImgProps, x * scale, y * scale, 0);
    }

    /** Windows horizontal scrollbar mirrors the camera and its current zoom. */
    private scrollbarBounds(): { x: number; y: number; width: number; height: number; thumbX: number; thumbWidth: number; maxX: number } | null {
        if (!this.minimapLemmings || !this.gameImgProps.display?.getWidth()) return null;
        const image = this.gameImgProps;
        const world = image.display!.getWidth();
        const visible = Math.min(world, image.width / image.viewPoint.scale);
        const maxX = Math.max(0, world - visible);
        const width = WINDOWS_SCROLL_WIDTH - 2 * WINDOWS_SCROLL_ARROW;
        const thumbWidth = Math.min(width, Math.max(16, Math.round(width * visible / world)));
        const x = WINDOWS_SCROLL_X + WINDOWS_SCROLL_ARROW;
        const thumbX = x + (maxX ? Math.round((width - thumbWidth) * image.viewPoint.x / maxX) : 0);
        return { x, y: this.guiImgProps.y + WINDOWS_SCROLL_Y, width, height: WINDOWS_SCROLL_HEIGHT, thumbX, thumbWidth, maxX };
    }

    private isOnScrollbar(point: Position2D): boolean {
        const bounds = this.scrollbarBounds();
        return !!bounds && point.x >= WINDOWS_SCROLL_X && point.x < WINDOWS_SCROLL_X + WINDOWS_SCROLL_WIDTH &&
            point.y >= bounds.y && point.y < bounds.y + bounds.height;
    }

    private beginScrollbar(point: Position2D): void {
        const bounds = this.scrollbarBounds();
        if (!bounds) return;
        if (point.x < bounds.x) { this.panGameBy(-160); return; }
        if (point.x >= bounds.x + bounds.width) { this.panGameBy(160); return; }
        this.scrollbarDragging = true;
        this.scrollbarDragOffset = point.x >= bounds.thumbX && point.x < bounds.thumbX + bounds.thumbWidth
            ? point.x - bounds.thumbX : bounds.thumbWidth / 2;
        this.navigateScrollbar(point.x);
    }

    private navigateScrollbar(x: number): void {
        const bounds = this.scrollbarBounds();
        if (!bounds || !bounds.maxX || bounds.width <= bounds.thumbWidth) return;
        const fraction = Math.max(0, Math.min(1, (x - bounds.x - this.scrollbarDragOffset) / (bounds.width - bounds.thumbWidth)));
        const image = this.gameImgProps;
        this.updateViewPoint(image, (fraction * bounds.maxX - image.viewPoint.x) * image.viewPoint.scale, 0, 0);
    }

    private drawScrollbar(): void {
        const bounds = this.scrollbarBounds();
        const ctx = this.stageCav.getContext('2d');
        if (!bounds || !ctx) return;
        ctx.save();
        ctx.fillStyle = '#dedede';
        ctx.fillRect(WINDOWS_SCROLL_X, bounds.y, WINDOWS_SCROLL_WIDTH, WINDOWS_SCROLL_HEIGHT);
        const button = (x: number, width: number) => {
            ctx.fillStyle = '#c0c0c0'; ctx.fillRect(x, bounds.y, width, bounds.height);
            ctx.fillStyle = '#fff'; ctx.fillRect(x, bounds.y, width, 1); ctx.fillRect(x, bounds.y, 1, bounds.height);
            ctx.fillStyle = '#808080'; ctx.fillRect(x, bounds.y + bounds.height - 1, width, 1); ctx.fillRect(x + width - 1, bounds.y, 1, bounds.height);
        };
        button(WINDOWS_SCROLL_X, WINDOWS_SCROLL_ARROW);
        button(bounds.x + bounds.width, WINDOWS_SCROLL_ARROW);
        button(bounds.thumbX, bounds.thumbWidth);
        ctx.fillStyle = '#333';
        for (const [x, direction] of [[WINDOWS_SCROLL_X + 6, -1], [bounds.x + bounds.width + 9, 1]]) {
            ctx.beginPath(); ctx.moveTo(x + 3 * direction, bounds.y + 8);
            ctx.lineTo(x - 2 * direction, bounds.y + 4); ctx.lineTo(x - 2 * direction, bounds.y + 12); ctx.fill();
        }
        ctx.restore();
    }

    /** The map occupies the free part of the Windows bar, to the right of its icons. */
    private minimapBounds(): { x: number; y: number; width: number; height: number } | null {
        if (!this.minimapLemmings || !this.gameImgProps.display?.getWidth() || !this.gameImgProps.display.getHeight()) return null;
        return { x: this.guiImgProps.x + WINDOWS_MAP_X, y: this.guiImgProps.y + WINDOWS_MAP_Y,
            width: WINDOWS_MAP_WIDTH, height: WINDOWS_MAP_HEIGHT };
    }

    private isOnMinimap(point: Position2D): boolean {
        const bounds = this.minimapBounds();
        return !!bounds && point.x >= bounds.x && point.x < bounds.x + bounds.width &&
            point.y >= bounds.y && point.y < bounds.y + bounds.height;
    }

    private navigateMinimap(point: Position2D): void {
        const bounds = this.minimapBounds();
        const display = this.gameImgProps.display;
        if (!bounds || !display) return;
        const clamp = (value: number) => Math.max(0, Math.min(1, value));
        this.revealGamePosition(clamp((point.x - bounds.x) / bounds.width) * display.getWidth(),
            clamp((point.y - bounds.y) / bounds.height) * display.getHeight());
    }

    /** Paint the current scene, live lemmings and the yellow camera rectangle. */
    private drawMinimap(): void {
        const bounds = this.minimapBounds();
        const image = this.gameImgProps;
        if (!bounds || !image.cav || !image.display || !this.minimapLemmings) return;
        const ctx = this.stageCav.getContext('2d');
        if (!ctx) return;
        const width = image.display.getWidth(), height = image.display.getHeight();
        ctx.save();
        // A recessed frame keeps the miniature distinct from the surrounding
        // Windows control bar, as in the original window.
        ctx.fillStyle = '#808080';
        ctx.fillRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 5);
        ctx.fillStyle = '#fff';
        ctx.fillRect(bounds.x - 3, bounds.y + bounds.height + 1, bounds.width + 6, 1);
        ctx.fillRect(bounds.x + bounds.width + 2, bounds.y - 3, 1, bounds.height + 5);
        ctx.beginPath();
        ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.clip();
        ctx.fillStyle = '#000';
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        ctx.imageSmoothingEnabled = false;
        // The already-composited Windows layer preserves the player's native
        // terrain and animated objects; logical art remains a safe fallback.
        const source = image.display.getNativeLayers() && this.nativeCanvas ? this.nativeCanvas : image.cav;
        // The original micro-map renders the terrain in grey, with coloured
        // lemmings and viewport drawn over it. Keep this processing local.
        const supportsFilter = typeof ctx.filter === 'string';
        if (supportsFilter) ctx.filter = 'grayscale(1)';
        ctx.drawImage(source, 0, 0, source.width, source.height, bounds.x, bounds.y, bounds.width, bounds.height);
        if (supportsFilter) {
            ctx.filter = 'none';
        } else {
            ctx.globalCompositeOperation = 'saturation';
            ctx.fillStyle = '#808080';
            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = '#00ff00';
        for (const lemming of this.minimapLemmings()) {
            if (lemming.x >= 0 && lemming.x < width && lemming.y >= 0 && lemming.y < height) {
                ctx.fillRect(bounds.x + Math.floor(lemming.x / width * bounds.width),
                    bounds.y + Math.floor(lemming.y / height * bounds.height), 2, 2);
            }
        }
        const viewWidth = Math.min(width, image.width / image.viewPoint.scale);
        const viewHeight = Math.min(height, image.height / image.viewPoint.scale);
        const left = bounds.x + image.viewPoint.x / width * bounds.width;
        const top = bounds.y + image.viewPoint.y / height * bounds.height;
        const right = Math.min(bounds.x + bounds.width - 1, left + viewWidth / width * bounds.width);
        const bottom = Math.min(bounds.y + bounds.height - 1, top + viewHeight / height * bounds.height);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(left) + .5, Math.floor(top) + .5,
            Math.max(0, Math.floor(right - left) - 1), Math.max(0, Math.floor(bottom - top) - 1));
        ctx.restore();
    }

    /** Follow and outline a keyboard-selected lemming without changing terrain. */
    public setKeyboardTarget(target: (() => Position2D | null) | null): void {
        this.keyboardTarget = target;
        this.redraw();
    }

    /** Mark a position from a tested example; it is not live advice. */
    public setExampleHint(position: Position2D | null): void {
        this.exampleHint = position;
        if (position) this.revealGamePosition(position.x, position.y);
        else this.redraw();
    }

    /** The part of the level currently on screen, in level pixels. */
    public getGameViewport(): { x: number; y: number; width: number; height: number } | null {
        const image = this.gameImgProps;
        if (!image.display) return null;
        const levelWidth = image.display.getWidth(), levelHeight = image.display.getHeight();
        if (!levelWidth || !levelHeight) return null;
        return { x: image.viewPoint.x, y: image.viewPoint.y,
            width: Math.min(levelWidth, image.width / image.viewPoint.scale),
            height: Math.min(levelHeight, image.height / image.viewPoint.scale) };
    }

    public revealGamePosition(x: number, y: number): void {
        const image = this.gameImgProps;
        const desiredX = x - image.width / image.viewPoint.scale / 2;
        const desiredY = y - image.height / image.viewPoint.scale / 2;
        this.updateViewPoint(image, (desiredX - image.viewPoint.x) * image.viewPoint.scale,
            (desiredY - image.viewPoint.y) * image.viewPoint.scale, 0);
    }

    /** Remove listeners belonging to the previous game before attaching a new one. */
    public clearInputBindings(): void {
        this.cancelPress();
        for (const image of [this.gameImgProps.display, this.guiImgProps.display]) {
            if (!image) continue;
            image.onMouseDown.dispose();
            image.onMouseUp.dispose();
            image.onMouseMove.dispose();
            image.onDoubleClick.dispose();
        }
    }

    public dispose(): void {
        this.cancelPress();
        this.overlay = null;
        this.dosViewport = null;
        this.dosPanelScale = null;
        this.keyboardTarget = null;
        this.exampleHint = null;
        this.minimapLemmings = null;
        this.windowsStatus = null;
        this.minimapDragging = false;
        this.scrollbarDragging = false;
        this.nativeCanvas = null;
        this.nativeForegroundCanvas = null;
        this.nativeGuiCanvas = null;
        this.nativeGuiForegroundCanvas = null;
        this.onGraphicsError.dispose();
        this.onZoomChange.dispose();
        this.controller.dispose();
        this.resetFade();
    }


    private updateViewPoint(stageImage: StageImageProperties, deltaX: number, deltaY: number, deltaZoom: number) {
        if (!stageImage.display) {
            return;
        }

        const previousScale = stageImage.viewPoint.scale;
        stageImage.viewPoint.scale += deltaZoom * 0.5;
        stageImage.viewPoint.scale = this.limitValue(0.5, stageImage.viewPoint.scale, 10);
        if (stageImage === this.gameImgProps && stageImage.viewPoint.scale !== previousScale) this.customZoom = this.isZoomChanged(stageImage.viewPoint.scale);

        stageImage.viewPoint.x += deltaX / stageImage.viewPoint.scale;
        stageImage.viewPoint.y += deltaY / stageImage.viewPoint.scale;

        stageImage.viewPoint.x = this.limitValue(0, stageImage.viewPoint.x, stageImage.display.getWidth() - stageImage.width / stageImage.viewPoint.scale);
        stageImage.viewPoint.y = this.limitValue(0, stageImage.viewPoint.y, stageImage.display.getHeight() - stageImage.height / stageImage.viewPoint.scale);

        if (stageImage === this.gameImgProps && stageImage.viewPoint.scale !== previousScale) {
            this.onZoomChange.trigger(this.isZoomChanged(this.gameImgProps.viewPoint.scale));
        }


        /// redraw
        this.clear(stageImage);
        const gameImg = stageImage.display.getImageData();

        if (!gameImg) {
            return;
        }

        this.draw(stageImage, gameImg);

        if (stageImage === this.gameImgProps) { this.drawScrollbar(); this.drawMinimap(); }
        this.present();
    }

    private limitValue(minLimit: number, value: number, maxLimit: number): number {

        const useMax = Math.max(minLimit, maxLimit);

        return Math.min(Math.max(minLimit, value), useMax);
    }

    public updateStageSize() {

        const ctx = this.stageCav.getContext('2d');
        if (!ctx) {
            return;
        }

        const stageHeight = ctx.canvas.height;
        const stageWidth = ctx.canvas.width;

        this.gameImgProps.y = 0;
        const panelHeight = this.dosPanelScale ? Math.round(DOS_PANEL_HEIGHT * this.dosPanelScale)
            : this.minimapLemmings ? WINDOWS_PANEL_HEIGHT : 100;
        this.gameImgProps.height = stageHeight - panelHeight;
        this.gameImgProps.width = stageWidth;

        this.guiImgProps.y = stageHeight - panelHeight;
        this.guiImgProps.height = panelHeight;
        this.guiImgProps.width = stageWidth;
        this.updateWindowsPanelScale();

    }

    public getStageImageAt(x: number, y: number): StageImageProperties | null {
        if (this.isPositionInStageImage(this.gameImgProps, x, y)) {
            return this.gameImgProps;
        }

        if (this.isPositionInStageImage(this.guiImgProps, x, y)) {
            return this.guiImgProps;
        }

        return null;
    }

    private isPositionInStageImage(stageImage: StageImageProperties, x: number, y: number) {
        return ((stageImage.x <= x) && ((stageImage.x + stageImage.width) >= x)
            && (stageImage.y <= y) && ((stageImage.y + stageImage.height) >= y));
    }

    public getGameDisplay(): DisplayImage {
        if (this.gameImgProps.display) {
            return this.gameImgProps.display;
        }

        this.gameImgProps.display = new DisplayImage(this);

        return this.gameImgProps.display;
    }

    public getGuiDisplay(): DisplayImage {
        if (this.guiImgProps.display) {
            return this.guiImgProps.display;
        }
        this.guiImgProps.display = new DisplayImage(this);

        return this.guiImgProps.display;
    }

    /** set the position of the view point for the game display */
    public setGameViewPointPosition(x: number, y: number): void {
        this.gameImgProps.viewPoint.x = x;
        this.gameImgProps.viewPoint.y = y;


    }

    /** redraw everything */
    public redraw() {
        if (this.overlay) {
            this.drawOverlay();
            this.present();
            return;
        }
        if (this.gameImgProps.display) {
            const gameImg = this.gameImgProps.display.getImageData();

            if (gameImg) {
                this.draw(this.gameImgProps, gameImg);
            }
        }

        if (this.guiImgProps.display) {
            const guiImg = this.guiImgProps.display.getImageData();

            if (guiImg) {
                this.draw(this.guiImgProps, guiImg);
            }
        }
        this.drawScrollbar();
        this.drawMinimap();
        this.present();
    }


    public createImage(display: DisplayImage, width: number, height: number): ImageData | null {
        if (display == this.gameImgProps.display) {
            return this.gameImgProps.createImage(width, height);
        }
        else {
            return this.guiImgProps.createImage(width, height);
        }
    }

    /** clear the stage/display/output */
    public clear(stageImage?: StageImageProperties) {
        for (const canvas of [this.stageCav]) {
            if (!canvas) continue;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.fillStyle = '#000000';
            if (stageImage == null) ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            else ctx.fillRect(stageImage.x, stageImage.y, stageImage.width, stageImage.height);
        }
    }

    private fadeTimer = 0;
    private fadeAlpha = 0;

    public resetFade() {
        this.fadeAlpha = 0;

        if (this.fadeTimer != 0) {
            clearInterval(this.fadeTimer);
            this.fadeTimer = 0;
        }
    }

    public startFadeOut() {

        this.resetFade();

        this.fadeTimer = window.setInterval(() => {
            this.fadeAlpha = Math.min(this.fadeAlpha + 0.02, 1);

            if (this.fadeAlpha <= 0) {
                clearInterval(this.fadeTimer);
            }
        }, 40);

    }

    /** draw everything to the stage/display */
    private draw(display: StageImageProperties, img: ImageData) {

        if (!display.ctx) {
            return;
        }

        /// write image to context
        display.ctx.putImageData(img, 0, 0);

        const outH = display.height;
        const outW = display.width;

        // Starting positions can be set before the level image exists. Clamp
        // them once the dimensions are known, including for small levels.
        if (display === this.gameImgProps) {
            display.viewPoint.x = this.limitValue(0, display.viewPoint.x, img.width - outW / display.viewPoint.scale);
            display.viewPoint.y = this.limitValue(0, display.viewPoint.y, img.height - outH / display.viewPoint.scale);
        }
        const offset = this.contentOffset(display);
        const destX = display.x + offset.x, destY = display.y + offset.y;

        //- Display Layers
        let dW = img.width - display.viewPoint.x; //- display width
        if ((dW * display.viewPoint.scale) > outW) {
            dW = outW / display.viewPoint.scale;
        }

        let dH = img.height - display.viewPoint.y; //- display height
        if ((dH * display.viewPoint.scale) > outH) {
            dH = outH / display.viewPoint.scale;
        }

        if (!display.cav || dW <= 0 || dH <= 0) return;

        // Compose native artwork at its original 2× resolution when available.
        let nativeCanvas: HTMLCanvasElement | null = null;
        const native = display.display?.getNativeLayers();
        if (native) {
            try {
                const game = display === this.gameImgProps;
                if (game) {
                    if (!this.nativeCanvas) this.nativeCanvas = document.createElement('canvas');
                    if (!this.nativeForegroundCanvas) this.nativeForegroundCanvas = document.createElement('canvas');
                } else {
                    if (!this.nativeGuiCanvas) this.nativeGuiCanvas = document.createElement('canvas');
                    if (!this.nativeGuiForegroundCanvas) this.nativeGuiForegroundCanvas = document.createElement('canvas');
                }
                const backCanvas = (game ? this.nativeCanvas : this.nativeGuiCanvas)!;
                const frontCanvas = (game ? this.nativeForegroundCanvas : this.nativeGuiForegroundCanvas)!;
                for (const canvas of [backCanvas, frontCanvas]) {
                    if (canvas.width !== native.background.width || canvas.height !== native.background.height) {
                        canvas.width = native.background.width;
                        canvas.height = native.background.height;
                    }
                }
                const background = backCanvas.getContext('2d');
                const foreground = frontCanvas.getContext('2d');
                if (!background || !foreground) throw new Error('Native graphics canvas unavailable');
                background.putImageData(native.background, 0, 0);
                foreground.putImageData(native.foreground, 0, 0);
                background.drawImage(frontCanvas, 0, 0);
                nativeCanvas = backCanvas;
            } catch {
                if (display === this.gameImgProps) { this.nativeCanvas = null; this.nativeForegroundCanvas = null; }
                else { this.nativeGuiCanvas = null; this.nativeGuiForegroundCanvas = null; }
                display.display?.rejectNativeBackground();
            }
        } else if (display === this.gameImgProps) {
            this.nativeCanvas = null;
            this.nativeForegroundCanvas = null;
        } else {
            this.nativeGuiCanvas = null;
            this.nativeGuiForegroundCanvas = null;
        }

        const ctx = this.stageCav.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 1;
        if (display === this.guiImgProps && this.minimapLemmings) {
            // The Win95 window places the command bar above a separate status
            // strip. Crop the shared DOS-shaped panel to its actual icons and
            // numbers so neither its green HUD nor its unused map area shows.
            ctx.fillStyle = '#c0c0c0';
            ctx.fillRect(display.x, display.y, display.width, display.height);
            const source = nativeCanvas ?? display.cav;
            const factor = nativeCanvas ? 2 : 1;
            ctx.drawImage(source, 0, WINDOWS_ICON_TOP * factor,
                WINDOWS_ICON_COUNT * 16 * factor, (40 - WINDOWS_ICON_TOP) * factor,
                display.x + WINDOWS_ICON_X, display.y + WINDOWS_ICON_Y,
                WINDOWS_ICON_COUNT * 16 * WINDOWS_ICON_SCALE, (40 - WINDOWS_ICON_TOP) * WINDOWS_ICON_SCALE);
            this.drawWindowsStatus(ctx);
            return;
        }
        // Transparent erased terrain must replace pixels from the prior frame.
        if (display === this.gameImgProps) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(display.x, display.y, display.width, display.height);
        }
        if (nativeCanvas) {
            ctx.drawImage(nativeCanvas, display.viewPoint.x * 2, display.viewPoint.y * 2, dW * 2, dH * 2,
                destX, destY, Math.trunc(dW * display.viewPoint.scale), Math.trunc(dH * display.viewPoint.scale));
        } else {
            ctx.drawImage(display.cav, display.viewPoint.x, display.viewPoint.y, dW, dH,
                destX, destY, Math.trunc(dW * display.viewPoint.scale), Math.trunc(dH * display.viewPoint.scale));
        }

        if (display === this.gameImgProps && this.exampleHint) {
            const scale = display.viewPoint.scale;
            const x = destX + (this.exampleHint.x - display.viewPoint.x) * scale;
            const y = destY + (this.exampleHint.y - display.viewPoint.y) * scale;
            ctx.save();
            ctx.beginPath();
            ctx.rect(display.x, display.y, display.width, display.height);
            ctx.clip();
            ctx.strokeStyle = '#68e4ff';
            ctx.lineWidth = 3;
            ctx.strokeRect(x - 9 * scale, y - 17 * scale, 18 * scale, 20 * scale);
            ctx.restore();
        }

        if (display === this.gameImgProps && this.keyboardTarget) {
            const selected = this.keyboardTarget();
            if (selected) {
                const scale = display.viewPoint.scale;
                const x = destX + (selected.x - display.viewPoint.x) * scale;
                const y = destY + (selected.y - display.viewPoint.y) * scale;
                ctx.save();
                ctx.beginPath();
                ctx.rect(display.x, display.y, display.width, display.height);
                ctx.clip();
                ctx.strokeStyle = '#ffed76';
                ctx.lineWidth = 2;
                ctx.strokeRect(x - 7 * scale, y - 15 * scale, 14 * scale, 17 * scale);
                ctx.restore();
            }
        }

        //- apply fading
        if (this.fadeAlpha != 0) {
            ctx.globalAlpha = this.fadeAlpha;
            ctx.fillStyle = 'black';
            ctx.fillRect(destX, destY, Math.trunc(dW * display.viewPoint.scale), Math.trunc(dH * display.viewPoint.scale));
        }
    }

    /** A live Win95-style status strip; all game values still come from the engine. */
    private drawWindowsStatus(ctx: CanvasRenderingContext2D): void {
        const y = this.guiImgProps.y + WINDOWS_STATUS_Y;
        const status = this.windowsStatus?.();
        ctx.save();
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(0, y, this.guiImgProps.width, WINDOWS_PANEL_HEIGHT - WINDOWS_STATUS_Y);
        const fields: Array<[number, number, string]> = [
            [4, 650, status ? `Save ${String(status.needed).padStart(2, '0')} of ${status.total} lemmings` : ''],
            [656, 82, status ? `Out: ${String(status.out).padStart(2, '0')}` : ''],
            [740, 92, status ? `Home: ${String(status.home).padStart(2, '0')}` : ''],
            [834, this.guiImgProps.width - 838, status ? `Time: ${status.time.replace(/^(\d+)-(\d+)$/, (_, m: string, s: string) => `${m.padStart(2, '0')}:${s}`)}` : ''],
        ];
        ctx.textBaseline = 'middle';
        ctx.font = '14px Arial, sans-serif';
        for (const [x, width, text] of fields) {
            ctx.fillStyle = '#808080';
            ctx.fillRect(x, y + 1, width, 1);
            ctx.fillRect(x, y + 1, 1, 19);
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, y + 20, width, 1);
            ctx.fillRect(x + width - 1, y + 1, 1, 19);
            ctx.fillStyle = '#000';
            ctx.fillText(text, x + 5, y + 11, Math.max(0, width - 10));
        }
        ctx.restore();
    }
}
