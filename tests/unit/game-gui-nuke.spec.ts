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

describe('classic nuke control', () => {
    it('sends each panel press to shared confirmation and ignores the double-click event', () => {
        const game = { queueCommand: vi.fn(), getGameState: () => GameStateTypes.RUNNING };
        const event = () => new EventHandler();
        const skills = { onCountChanged: event(), onSelectionChanged: event() };
        const timer = { onGameTick: event() };
        const display = { onMouseDown: new EventHandler<Position2D>(), onMouseUp: event(), onMouseMove: new EventHandler<Position2D>(), onDoubleClick: new EventHandler<Position2D>() };
        const gui = new GameGui(game as unknown as Game, {} as SkillPanelSprites, skills as unknown as GameSkills,
            timer as unknown as GameTimer, {} as GameVictoryCondition);
        gui.setGuiDisplay(display as unknown as DisplayImage);
        const request = vi.fn();
        gui.setNukeRequestHandler(request);
        const point = new Position2D(11 * 16 + 1, 20);
        display.onMouseDown.trigger(point);
        display.onMouseDown.trigger(point);
        display.onDoubleClick.trigger(point);
        expect(request).toHaveBeenCalledTimes(2);
        expect(game.queueCommand).not.toHaveBeenCalled();
        gui.setNukeRequestHandler(null);
        display.onDoubleClick.trigger(point);
        expect(game.queueCommand).toHaveBeenCalledOnce();
    });
});
