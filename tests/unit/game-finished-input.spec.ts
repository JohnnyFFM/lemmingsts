// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../src/game/game';
import { GameStateTypes } from '../../src/game/game-state-types';
import { GameTypes } from '../../src/game/game-types';
import { Level } from '../../src/game/resources/level';
import { LevelProperties } from '../../src/game/resources/lemmings/level-properties';
import { ColorPalette } from '../../src/game/resources/lemmings/color-palette';
import { LemmingsSprite } from '../../src/game/resources/lemmings-sprite';
import { MaskProvider } from '../../src/game/resources/mask-provider';
import { MaskList } from '../../src/game/resources/mask-list';
import { SkillPanelSprites } from '../../src/game/resources/skill-panel-sprites';
import { SolidLayer } from '../../src/game/resources/solid-layer';
import { EventHandler } from '../../src/game/utilities/event-handler';
import { Position2D } from '../../src/game/utilities/position2d';
import type { DisplayImage } from '../../src/game/view/display-image';

/** Entirely synthetic resources; no original game files are needed. */
function createGame() {
    const palette = new ColorPalette();
    const properties = Object.assign(new LevelProperties(), {
        releaseCount: 1, needCount: 1, releaseRate: 50, timeLimit: 1,
    });
    const level = new Level(32, 32, GameTypes.LEMMINGS, 0, 0, properties, 0, false,
        new Uint8ClampedArray(32 * 32 * 4), new SolidLayer(32, 32, new Int8Array(32 * 32)), palette, palette);
    return new Game(level, new MaskProvider(Array.from({ length: 6 }, () => new MaskList([]))),
        new LemmingsSprite(null, palette), new SkillPanelSprites(null, null, palette));
}

function panelInput(game: Game) {
    const display = { onMouseDown: new EventHandler<Position2D>(), onMouseUp: new EventHandler<Position2D>(), onMouseMove: new EventHandler<Position2D>(),
        onDoubleClick: new EventHandler<Position2D>() };
    game.setGuiDisplay(display as unknown as DisplayImage);
    return display;
}

afterEach(() => { vi.useRealTimers(); });

describe('finished game input', () => {
    it.each(['success', 'loss', 'timeout'] as const)('keeps a %s result final after classic-panel presses', outcome => {
        vi.useFakeTimers();
        const game = createGame();
        const timer = game.getGameTimer();
        const victory = game.getVictoryCondition();
        const end = vi.fn();
        game.onGameEnd.on(end);
        game.start();
        if (outcome === 'timeout') {
            for (let tick = 0; tick < 1020; tick++) timer.tick();
        } else {
            victory.releaseOne();
            victory.removeOne();
            if (outcome === 'success') victory.addSurvivor();
            timer.tick();
        }
        expect(game.getGameState()).toBe(outcome === 'success' ? GameStateTypes.SUCCEEDED :
            outcome === 'timeout' ? GameStateTypes.FAILED_OUT_OF_TIME : GameStateTypes.FAILED_LESS_LEMMINGS);
        expect(timer.isRunning()).toBe(false);
        const ticks = timer.getGameTicks();
        const display = panelInput(game);
        const requestNuke = vi.fn();
        game.setNukeRequestHandler(requestNuke);
        display.onMouseDown.trigger(new Position2D(10 * 16 + 1, 20));
        display.onMouseDown.trigger(new Position2D(11 * 16 + 1, 20));
        game.setNukeRequestHandler(null);
        display.onDoubleClick.trigger(new Position2D(11 * 16 + 1, 20));
        // Skill commands use this same entry point from pointer and keyboard input.
        const execute = vi.fn(() => true);
        expect(game.queueCommand({ execute, getCommandKey: () => 'test', save: () => [], load: () => {} })).toBe(false);
        game.start();
        vi.advanceTimersByTime(1000);
        expect(timer.getGameTicks()).toBe(ticks);
        expect(timer.isRunning()).toBe(false);
        expect(requestNuke).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
        expect(end).toHaveBeenCalledOnce();
        expect(game.getCommandManager().serialize()).toBe('');
        game.stop();
    });

    it('allows a fresh game to start and pause after the previous game finishes', () => {
        vi.useFakeTimers();
        const previous = createGame();
        previous.getVictoryCondition().doNuke();
        previous.getGameTimer().tick();
        previous.stop();
        const next = createGame();
        const display = panelInput(next);
        next.start();
        expect(next.getGameTimer().isRunning()).toBe(true);
        display.onMouseDown.trigger(new Position2D(10 * 16 + 1, 20));
        expect(next.getGameTimer().isRunning()).toBe(false);
        display.onMouseDown.trigger(new Position2D(10 * 16 + 1, 20));
        expect(next.getGameTimer().isRunning()).toBe(true);
        next.stop();
    });
});
