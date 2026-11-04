import { describe, expect, it, vi } from 'vitest';
import { DOS_MINIMAP, GameGui } from '../../src/game/view/game-gui';
import { EventHandler } from '../../src/game/utilities/event-handler';
import type { Game } from '../../src/game/game';
import type { GameSkills } from '../../src/game/game-play/game-skills';
import type { GameTimer } from '../../src/game/game-play/game-timer';
import type { GameVictoryCondition } from '../../src/game/game-play/game-victory-condition';
import type { SkillPanelSprites } from '../../src/game/resources/skill-panel-sprites';
import type { DisplayImage } from '../../src/game/view/display-image';
import { Position2D } from '../../src/game/utilities/position2d';
import { GameStateTypes } from '../../src/game/game-state-types';

function setup() {
    const event = () => new EventHandler();
    const level = { width: 1600, height: 160, hasGroundAt: (_x: number, y: number) => y >= 120 };
    const lemmings = [{ x: 800, y: 50 }];
    const game = {
        level, queueCommand: vi.fn(), getGameState: () => GameStateTypes.RUNNING,
        getLemmingManager: () => ({ getSelectableLemmings: () => lemmings }),
    };
    const skills = { onCountChanged: event(), onSelectionChanged: event(), getSkill: () => 5, getSelectedSkill: () => 1 };
    const timer = { onGameTick: new EventHandler<void>(), getGameLeftTimeString: () => '5-00' };
    const victory = { getReleaseCount: () => 10, getNeedCount: () => 5, getOutCount: () => 1, getSurvivorPercentage: () => 0,
        getMinReleaseRate: () => 50, getCurrentReleaseRate: () => 50 };
    const sprite = { width: 16, height: 16 };
    const panelSprites = { getPanelSprite: () => ({ width: 320, height: 40, getData: () => new Uint8ClampedArray(320 * 40 * 4) }),
        getLetterSprite: () => null, getNumberSpriteLeft: () => sprite, getNumberSpriteRight: () => sprite, getNumberSpriteEmpty: () => sprite };
    const pixels = new Map<string, string>();
    const display = {
        onMouseDown: new EventHandler<Position2D>(), onMouseUp: event(), onMouseMove: new EventHandler<Position2D>(), onDoubleClick: new EventHandler<Position2D>(),
        initSize: vi.fn(), setBackground: vi.fn(), drawFrameCovered: vi.fn(), drawFrame: vi.fn(), drawRect: vi.fn(),
        fillRect: vi.fn((x: number, y: number, w: number, h: number, r: number, g: number, b: number) => {
            for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) pixels.set(`${px},${py}`, `${r},${g},${b}`);
        }),
        setPixel: vi.fn((x: number, y: number, r: number, g: number, b: number) => pixels.set(`${x},${y}`, `${r},${g},${b}`)),
        drawHorizontalLine: vi.fn((x1: number, y: number, x2: number, r: number, g: number, b: number) => {
            for (let x = x1; x <= x2; x++) pixels.set(`${x},${y}`, `${r},${g},${b}`);
        }),
        drawVerticalLine: vi.fn((x: number, y1: number, y2: number, r: number, g: number, b: number) => {
            for (let y = y1; y <= y2; y++) pixels.set(`${x},${y}`, `${r},${g},${b}`);
        }),
    };
    const gui = new GameGui(game as unknown as Game, panelSprites as unknown as SkillPanelSprites, skills as unknown as GameSkills,
        timer as unknown as GameTimer, victory as unknown as GameVictoryCondition);
    gui.setGuiDisplay(display as unknown as DisplayImage);
    return { game, gui, display, pixels, timer, lemmings, level };
}

const TERRAIN = '48,160,48', LEMMING = '224,255,128', VIEW = '255,255,255', BLACK = '0,0,0';

describe('DOS panel minimap', () => {
    it('draws terrain, lemmings and the visible area inside the panel frame', () => {
        const { gui, pixels } = setup();
        gui.setViewportProvider(() => ({ x: 320, y: 0, width: 320, height: 160 }));
        gui.render();
        // 1600×160 maps to 100×20 at 16×8 per cell, centred in the 104-wide box.
        const originX = DOS_MINIMAP.x + 2, originY = DOS_MINIMAP.y;
        expect(pixels.get(`${originX + 10},${originY + 19}`)).toBe(TERRAIN); // ground from row 120 = map row 15 down
        expect(pixels.get(`${originX + 10},${originY + 2}`)).toBe(BLACK);
        expect(pixels.get(`${originX + 50},${originY + 6}`)).toBe(LEMMING); // (800, 50) → (50, 6)
        // Viewport 320..640 wide → map columns 20..39, full height.
        expect(pixels.get(`${originX + 20},${originY}`)).toBe(VIEW);
        expect(pixels.get(`${originX + 39},${originY + 19}`)).toBe(VIEW);
        expect(pixels.get(`${originX + 30},${originY + 5}`)).toBe(BLACK);
        // Nothing is drawn outside the frame.
        expect(pixels.has(`${DOS_MINIMAP.x - 1},${originY}`)).toBe(false);
    });

    it('re-samples terrain only every few ticks but moves lemmings every frame', () => {
        const { gui, pixels, timer, lemmings, level } = setup();
        gui.render();
        const originX = DOS_MINIMAP.x + 2, originY = DOS_MINIMAP.y;
        level.hasGroundAt = () => false;
        lemmings[0] = { x: 160, y: 20 };
        gui.render();
        expect(pixels.get(`${originX + 10},${originY + 19}`)).toBe(TERRAIN); // stale terrain is still shown
        expect(pixels.get(`${originX + 10},${originY + 2}`)).toBe(LEMMING); // but the lemming moved
        for (let i = 0; i < 4; i++) timer.onGameTick.trigger();
        gui.render();
        expect(pixels.get(`${originX + 10},${originY + 19}`)).toBe(BLACK);
    });

    it('navigates on tap and drag within the map and leaves the skill buttons alone', () => {
        const { game, gui, display } = setup();
        const navigate = vi.fn();
        gui.setMinimapNavigationHandler(navigate);
        display.onMouseDown.trigger(new Position2D(DOS_MINIMAP.x + 50, DOS_MINIMAP.y + 10));
        expect(navigate).toHaveBeenLastCalledWith(800, 80);
        display.onMouseMove.trigger(new Position2D(DOS_MINIMAP.x + 200, DOS_MINIMAP.y - 5)); // off the map while dragging
        expect(navigate).toHaveBeenLastCalledWith(1599, 0);
        display.onMouseUp.trigger();
        display.onMouseMove.trigger(new Position2D(DOS_MINIMAP.x + 10, DOS_MINIMAP.y + 10));
        expect(navigate).toHaveBeenCalledTimes(2);
        expect(game.queueCommand).not.toHaveBeenCalled();
        display.onMouseDown.trigger(new Position2D(2 * 16 + 1, 20)); // the climber button
        expect(game.queueCommand).toHaveBeenCalledOnce();
        expect(navigate).toHaveBeenCalledTimes(2);
    });
});
