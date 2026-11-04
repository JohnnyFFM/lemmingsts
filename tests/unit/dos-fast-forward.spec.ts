import { describe, expect, it, vi } from 'vitest';
import { GameGui, TIME_READOUT_X } from '../../src/game/view/game-gui';
import { EventHandler } from '../../src/game/utilities/event-handler';
import type { Game } from '../../src/game/game';
import type { GameSkills } from '../../src/game/game-play/game-skills';
import type { GameTimer } from '../../src/game/game-play/game-timer';
import type { GameVictoryCondition } from '../../src/game/game-play/game-victory-condition';
import type { SkillPanelSprites } from '../../src/game/resources/skill-panel-sprites';
import type { DisplayImage } from '../../src/game/view/display-image';
import { Position2D } from '../../src/game/utilities/position2d';
import { GameStateTypes } from '../../src/game/game-state-types';

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
    return { instance, display };
}

describe('fast forward from the DOS panel', () => {
    it('toggles on a tap on the clock, flashes the label, and leaves the rest of the row alone', () => {
        vi.useFakeTimers();
        try {
            const { instance, display } = gui();
            const fastForward = vi.fn(() => 'FAST FORWARD');
            const filter = vi.fn(() => 'SMOOTH');
            instance.setFastForwardRequestHandler(fastForward);
            instance.setFilterRequestHandler(filter);
            display.onMouseDown.trigger(new Position2D(TIME_READOUT_X + 20, 6));
            vi.advanceTimersByTime(150);
            display.onMouseUp.trigger(new Position2D(TIME_READOUT_X + 20, 6));
            expect(fastForward).toHaveBeenCalledOnce();
            expect(filter).not.toHaveBeenCalled();
            expect(display.drawFrameCovered).toHaveBeenCalled(); // the label was painted
            display.onMouseDown.trigger(new Position2D(40, 6)); // NEED, not the clock
            vi.advanceTimersByTime(150);
            display.onMouseUp.trigger(new Position2D(40, 6));
            expect(fastForward).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not toggle when the clock was held long enough to change the filter', () => {
        vi.useFakeTimers();
        try {
            const { instance, display } = gui();
            const fastForward = vi.fn(() => 'FAST FORWARD');
            const filter = vi.fn(() => 'SMOOTH');
            instance.setFastForwardRequestHandler(fastForward);
            instance.setFilterRequestHandler(filter);
            display.onMouseDown.trigger(new Position2D(TIME_READOUT_X + 20, 6));
            vi.advanceTimersByTime(800);
            display.onMouseUp.trigger(new Position2D(TIME_READOUT_X + 20, 6));
            expect(filter).toHaveBeenCalledOnce();
            expect(fastForward).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('still works as a tap when no filter handler is installed', () => {
        const { instance, display } = gui();
        const fastForward = vi.fn(() => 'FAST FORWARD');
        instance.setFastForwardRequestHandler(fastForward);
        display.onMouseDown.trigger(new Position2D(300, 6));
        display.onMouseUp.trigger(new Position2D(300, 6));
        expect(fastForward).toHaveBeenCalledOnce();
    });
});
