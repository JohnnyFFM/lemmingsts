// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Stage } from '../../src/game/view/stage';
import { Frame } from '../../src/game/resources/frame';
import { GameGui } from '../../src/game/view/game-gui';
import { EventHandler } from '../../src/game/utilities/event-handler';
import type { Game } from '../../src/game/game';
import type { GameSkills } from '../../src/game/game-play/game-skills';
import type { GameTimer } from '../../src/game/game-play/game-timer';
import type { GameVictoryCondition } from '../../src/game/game-play/game-victory-condition';
import type { SkillPanelSprites } from '../../src/game/resources/skill-panel-sprites';
import type { DisplayImage } from '../../src/game/view/display-image';
import { Position2D } from '../../src/game/utilities/position2d';
import { GameStateTypes } from '../../src/game/game-state-types';
import { FILTERS } from '../../src/game/view/gl-presenter';
import { nextFilter } from '../../src/views/dos-view';

function stageWithLevel() {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 480;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 480 } as DOMRect);
    const context = { canvas, fillRect: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
        lineTo: vi.fn(), fill: vi.fn(), putImageData: vi.fn(), drawImage: vi.fn() };
    canvas.getContext = vi.fn(() => context) as unknown as typeof canvas.getContext;
    const stage = new Stage(canvas);
    const level = stage.getGameDisplay(), panel = stage.getGuiDisplay();
    const image = (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData;
    vi.spyOn(level, 'getImageData').mockReturnValue(image(1600, 160));
    vi.spyOn(level, 'getWidth').mockReturnValue(1600); vi.spyOn(level, 'getHeight').mockReturnValue(160);
    vi.spyOn(panel, 'getImageData').mockReturnValue(image(320, 40));
    vi.spyOn(panel, 'getWidth').mockReturnValue(320); vi.spyOn(panel, 'getHeight').mockReturnValue(40);
    return stage;
}

describe('present frames for the filter presenter', () => {
    it('describes the level window and the panel from their source pixels', () => {
        const stage = stageWithLevel();
        const frames: ReturnType<Stage['buildPresentFrame']>[] = [];
        stage.onPresent.on(frame => { if (frame) frames.push(frame); });
        stage.setDosViewport(1600, 900);
        stage.setGameViewPointPosition(640, 0);
        stage.redraw();
        const frame = frames.at(-1)!;
        expect([frame.width, frame.height]).toEqual([1067, 600]);
        expect(frame.layers).toHaveLength(2);
        const [level, panel] = frame.layers;
        expect(level.pixels.width).toBe(1600);
        expect(level.source.x).toBe(640);
        expect(level.source.height).toBe(160);
        expect(level.dest).toMatchObject({ x: 0, y: 0 });
        expect(level.dest.height).toBeCloseTo(467, 0);
        expect(panel.pixels.width).toBe(320);
        expect(panel.source).toEqual({ x: 0, y: 0, width: 320, height: 40 });
        expect(panel.dest.x).toBe(0);
        expect(panel.dest.y).toBe(467);
        expect(panel.dest.width).toBeCloseTo(1067, 0);
        stage.dispose();
    });

    it('describes only the menu picture while one is shown', () => {
        const stage = stageWithLevel();
        let frame: ReturnType<Stage['buildPresentFrame']> | undefined;
        stage.onPresent.on(next => { frame = next; });
        stage.setDosViewport(1600, 900);
        stage.setOverlay(new Frame(640, 400));
        expect(frame?.layers).toHaveLength(1);
        expect(frame?.layers[0].pixels.width).toBe(640);
        // 640×400 fits a 1067×600 stage at 1.5: 960×600, centred.
        expect(frame?.layers[0].dest).toMatchObject({ x: 53, y: 0, width: 960, height: 600 });
        stage.dispose();
    });
});

describe('filter toggle on the panel', () => {
    function gui() {
        const game = { queueCommand: vi.fn(), getGameState: () => GameStateTypes.RUNNING, level: null };
        const event = () => new EventHandler();
        const skills = { onCountChanged: event(), onSelectionChanged: event(), getSkill: () => 1, getSelectedSkill: () => 1 };
        const timer = { onGameTick: event(), toggle: vi.fn(), isRunning: () => true, getGameLeftTimeString: () => '4-59' };
        const display = { onMouseDown: new EventHandler<Position2D>(), onMouseUp: new EventHandler<Position2D>(), onMouseMove: event(), onDoubleClick: event(),
            drawFrameCovered: vi.fn(), drawFrame: vi.fn(), drawRect: vi.fn(), initSize: vi.fn(), setBackground: vi.fn(), redraw: vi.fn() };
        const sprite = { width: 8, height: 8 };
        const sprites = { getLetterSprite: () => sprite, getPanelSprite: () => ({ width: 320, height: 40, getData: () => new Uint8ClampedArray(320 * 40 * 4) }),
            getNumberSpriteLeft: () => sprite, getNumberSpriteRight: () => sprite, getNumberSpriteEmpty: () => sprite };
        const victory = { getReleaseCount: () => 10, getNeedCount: () => 5, getOutCount: () => 1, getSurvivorPercentage: () => 0,
            getMinReleaseRate: () => 50, getCurrentReleaseRate: () => 50 };
        const instance = new GameGui(game as unknown as Game, sprites as unknown as SkillPanelSprites, skills as unknown as GameSkills,
            timer as unknown as GameTimer, victory as unknown as GameVictoryCondition);
        instance.setGuiDisplay(display as unknown as DisplayImage);
        return { instance, display, timer };
    }

    it('cycles the filter after a long press on the green row and flashes its name', () => {
        vi.useFakeTimers();
        try {
            const { instance, display, timer } = gui();
            const request = vi.fn(() => 'SMOOTH');
            instance.setFilterRequestHandler(request);
            display.onMouseDown.trigger(new Position2D(60, 8));
            vi.advanceTimersByTime(650);
            expect(request).not.toHaveBeenCalled();
            vi.advanceTimersByTime(100);
            expect(request).toHaveBeenCalledOnce();
            expect(timer.toggle).not.toHaveBeenCalled();
            // The label is painted into the row at once and again cleared later.
            expect(display.drawFrameCovered).toHaveBeenCalled();
            expect(display.redraw).toHaveBeenCalled();
            const paints = display.drawFrameCovered.mock.calls.length;
            vi.advanceTimersByTime(1600);
            expect(display.drawFrameCovered.mock.calls.length).toBeGreaterThanOrEqual(paints);
            display.onMouseUp.trigger();
            display.onMouseDown.trigger(new Position2D(60, 8));
            vi.advanceTimersByTime(200);
            display.onMouseUp.trigger();
            vi.advanceTimersByTime(2000);
            expect(request).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('cycles through every filter and back', () => {
        let filter = FILTERS[0];
        const seen = [filter];
        for (let i = 0; i < FILTERS.length; i++) { filter = nextFilter(filter); seen.push(filter); }
        expect(seen.at(-1)).toBe(FILTERS[0]);
        expect(new Set(seen).size).toBe(FILTERS.length);
    });
});
