import { describe, expect, it, vi } from 'vitest';
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

function setup() {
    const game = { queueCommand: vi.fn(), getGameState: () => GameStateTypes.RUNNING };
    const event = () => new EventHandler();
    const skills = { onCountChanged: event(), onSelectionChanged: event() };
    let running = true;
    const timer = { onGameTick: event(), toggle: vi.fn(() => { running = !running; }), isRunning: () => running, suspend: vi.fn(() => { running = false; }) };
    const display = { onMouseDown: new EventHandler<Position2D>(), onMouseUp: new EventHandler<Position2D>(), onMouseMove: event(), onDoubleClick: new EventHandler<Position2D>() };
    const gui = new GameGui(game as unknown as Game, {} as SkillPanelSprites, skills as unknown as GameSkills,
        timer as unknown as GameTimer, {} as GameVictoryCondition);
    gui.setGuiDisplay(display as unknown as DisplayImage);
    return { gui, display, timer, pause: new Position2D(10 * 16 + 4, 24) };
}

describe('holding the pause button', () => {
    it('opens the menu after a long press and leaves the game paused', () => {
        vi.useFakeTimers();
        try {
            const { gui, display, timer, pause } = setup();
            const menu = vi.fn();
            gui.setMenuRequestHandler(menu);
            display.onMouseDown.trigger(pause);
            expect(timer.toggle).toHaveBeenCalledOnce();
            vi.advanceTimersByTime(650);
            expect(menu).not.toHaveBeenCalled();
            vi.advanceTimersByTime(100);
            expect(menu).toHaveBeenCalledOnce();
            expect(timer.isRunning()).toBe(false);
            display.onMouseUp.trigger(pause);
            vi.advanceTimersByTime(2000);
            expect(menu).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('is only a pause toggle when released early', () => {
        vi.useFakeTimers();
        try {
            const { gui, display, timer, pause } = setup();
            const menu = vi.fn();
            gui.setMenuRequestHandler(menu);
            display.onMouseDown.trigger(pause);
            vi.advanceTimersByTime(200);
            display.onMouseUp.trigger(pause);
            vi.advanceTimersByTime(2000);
            expect(menu).not.toHaveBeenCalled();
            expect(timer.toggle).toHaveBeenCalledOnce();
            display.onMouseDown.trigger(pause);
            display.onMouseUp.trigger(pause);
            expect(timer.isRunning()).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});
