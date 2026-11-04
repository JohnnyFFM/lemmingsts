// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Stage } from '../../src/game/view/stage';
import { Frame } from '../../src/game/resources/frame';

function setup() {
    const drawImage = vi.fn();
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 480;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 480 } as DOMRect);
    const context = { canvas, fillRect: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(),
        moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(), putImageData: vi.fn(), drawImage };
    const getContext = vi.fn(() => context);
    canvas.getContext = getContext as unknown as typeof canvas.getContext;
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        const element = Object.getPrototypeOf(document).createElement.call(document, tag) as HTMLElement;
        if (tag === 'canvas') (element as HTMLCanvasElement).getContext = getContext as unknown as HTMLCanvasElement['getContext'];
        return element;
    }) as typeof document.createElement);
    const stage = new Stage(canvas);
    const scene = stage.getGameDisplay();
    vi.spyOn(scene, 'getWidth').mockReturnValue(1600);
    vi.spyOn(scene, 'getHeight').mockReturnValue(160);
    const click = vi.fn(); scene.onMouseDown.on(click);
    return { canvas, stage, click, drawImage };
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', button: 0 });
    canvas.dispatchEvent(event);
}

describe('stage overlay', () => {
    it('letterboxes the picture, maps taps into its pixels and blocks level input while it is up', () => {
        const { canvas, stage, click, drawImage } = setup();
        const picture = new Frame(640, 400);
        const tap = vi.fn();
        stage.setOverlay(picture, tap);
        expect(stage.hasOverlay()).toBe(true);
        // 640×400 fits an 800×480 stage at 1.2: 768×480, offset 16 px from the left.
        expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 640, 400, 16, 0, 768, 480);
        pointer(canvas, 'pointerdown', 400, 240);
        pointer(canvas, 'pointerup', 400, 240);
        expect(tap).toHaveBeenCalledWith(320, 200);
        expect(click).not.toHaveBeenCalled();
        pointer(canvas, 'pointerdown', 5, 240);   // in the black side bar
        pointer(canvas, 'pointerup', 5, 240);
        expect(tap).toHaveBeenCalledTimes(1);
        stage.setOverlay(null);
        expect(stage.hasOverlay()).toBe(false);
        pointer(canvas, 'pointerdown', 400, 100);
        pointer(canvas, 'pointerup', 400, 100);
        expect(click).toHaveBeenCalledTimes(1);
        stage.dispose();
        vi.restoreAllMocks();
    });

    it('keeps a tap alive while the same screen is redrawn for an animation, but not across a different screen', () => {
        const { canvas, stage } = setup();
        const tap = vi.fn();
        stage.setOverlay(new Frame(640, 400), tap);
        pointer(canvas, 'pointerdown', 400, 240);
        stage.setOverlay(new Frame(640, 400), tap);   // a scroller step while the finger is down
        stage.setOverlay(new Frame(640, 400), tap);
        pointer(canvas, 'pointerup', 400, 240);
        expect(tap).toHaveBeenCalledOnce();
        const other = vi.fn();
        pointer(canvas, 'pointerdown', 400, 240);
        stage.setOverlay(new Frame(640, 400), other); // a new screen replaces the old one mid-press
        pointer(canvas, 'pointerup', 400, 240);
        expect(other).not.toHaveBeenCalled();
        expect(tap).toHaveBeenCalledOnce();
        stage.dispose();
        vi.restoreAllMocks();
    });

    it('keeps a tap on the picture alive across a relayout, while a level press is cancelled', () => {
        const { canvas, stage, click } = setup();
        stage.setDosViewport(1600, 900);
        const tap = vi.fn();
        stage.setOverlay(new Frame(640, 400), tap);
        // Entering fullscreen on the first tap resizes the stage between press and release.
        pointer(canvas, 'pointerdown', 400, 240);
        stage.setDosViewport(1600, 1000);
        pointer(canvas, 'pointerup', 400, 240);
        expect(tap).toHaveBeenCalledOnce();
        stage.setOverlay(null);
        pointer(canvas, 'pointerdown', 400, 100);
        stage.setDosViewport(1600, 900);
        pointer(canvas, 'pointerup', 400, 100);
        expect(click).not.toHaveBeenCalled();
        stage.dispose();
        vi.restoreAllMocks();
    });
});
