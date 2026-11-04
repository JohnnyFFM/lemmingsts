import { describe, expect, it, vi } from 'vitest';
import { GameGui } from '../../src/game/view/game-gui';
import { GameStateTypes } from '../../src/game/game-state-types';
import { SkillTypes } from '../../src/game/game-play/skill-types';
import { Frame } from '../../src/game/resources/frame';
import { EventHandler } from '../../src/game/utilities/event-handler';
import { Position2D } from '../../src/game/utilities/position2d';
import type { Game } from '../../src/game/game';
import type { GameSkills } from '../../src/game/game-play/game-skills';
import type { GameTimer } from '../../src/game/game-play/game-timer';
import type { GameVictoryCondition } from '../../src/game/game-play/game-victory-condition';
import type { SkillPanelSprites } from '../../src/game/resources/skill-panel-sprites';
import type { DisplayImage } from '../../src/game/view/display-image';

function fixture() {
  const events = () => new EventHandler();
  const game = { queueCommand: vi.fn(), getGameState: () => GameStateTypes.RUNNING };
  const timer = { onGameTick: events(), toggle: vi.fn(), getGameLeftTimeString: () => '5' };
  const skills = { onCountChanged: events(), onSelectionChanged: events(), getSkill: () => 9, getSelectedSkill: () => SkillTypes.DIGGER };
  const victory = { getReleaseCount: () => 10, getNeedCount: () => 1, getOutCount: () => 0,
    getSurvivorPercentage: () => 0, getMinReleaseRate: () => 10, getCurrentReleaseRate: () => 12 };
  const frame = new Frame(8, 8);
  const sprites = { getPanelSprite: () => new Frame(320, 40), getLetterSprite: () => undefined,
    getNumberSpriteLeft: () => frame, getNumberSpriteRight: () => frame, getNumberSpriteEmpty: () => frame };
  const display = { onMouseDown: new EventHandler<Position2D>(), onMouseUp: events(), onMouseMove: new EventHandler<Position2D>(), onDoubleClick: new EventHandler<Position2D>(),
    initSize: vi.fn(), setBackground: vi.fn(), getImageData: () => undefined, drawFrameCovered: vi.fn(), drawFrame: vi.fn(), drawRect: vi.fn() };
  const gui = new GameGui(game as unknown as Game, sprites as unknown as SkillPanelSprites,
    skills as unknown as GameSkills, timer as unknown as GameTimer, victory as unknown as GameVictoryCondition);
  gui.setGuiDisplay(display as unknown as DisplayImage);
  const press = (index: number) => { display.onMouseDown.trigger(new Position2D(index * 16 + 1, 20)); display.onMouseUp.trigger(); };
  return { gui, game, timer, display, press };
}

describe('Windows original toolbar', () => {
  it('maps eight skills, plus, minus, pause, fast forward and nuke to their Windows slots', () => {
    const { gui, game, timer, press } = fixture();
    gui.setWindowsPanel(Array.from({ length: 13 }, () => new Frame(16, 20)));
    const fastForward = vi.fn(), nuke = vi.fn();
    gui.setFastForwardRequestHandler(fastForward); gui.setNukeRequestHandler(nuke);
    for (let slot = 0; slot < 8; slot++) {
      press(slot);
      const command = game.queueCommand.mock.lastCall![0];
      expect(command.getCommandKey()).toBe('s');
      expect(command.save()).toEqual([slot + 1]);
    }
    press(8); expect(game.queueCommand.mock.lastCall![0].getCommandKey()).toBe('i');
    press(9); expect(game.queueCommand.mock.lastCall![0].getCommandKey()).toBe('d');
    press(10); expect(timer.toggle).toHaveBeenCalledOnce();
    press(11); expect(fastForward).toHaveBeenCalledOnce(); expect(nuke).not.toHaveBeenCalled();
    press(12); expect(nuke).toHaveBeenCalledOnce();
  });

  it('renders skill numbers and both selection indicators at the matching Windows slots', () => {
    const { gui, display } = fixture();
    const icons = Array.from({ length: 13 }, () => new Frame(16, 20));
    gui.setWindowsPanel(icons); gui.setFastForwardActive(true); gui.render();
    for (let i = 0; i < icons.length; i++) expect(display.drawFrameCovered).toHaveBeenCalledWith(icons[i], i * 16, 20, 192, 192, 192);
    expect(display.drawRect).toHaveBeenCalledWith(7 * 16, 16, 16, 23, 255, 255, 255);
    expect(display.drawRect).toHaveBeenCalledWith(11 * 16, 16, 16, 23, 255, 255, 255);
    // The first skill's number is drawn over slot 0 rather than DOS slot 2.
    expect(display.drawFrameCovered).toHaveBeenCalledWith(expect.any(Frame), 4, 17, 0, 0, 0);
  });

  it('advances original icon frames on game ticks and keeps static icons unchanged', () => {
    const { gui, display, timer } = fixture();
    const icons = Array.from({ length: 13 }, () => new Frame(16, 20));
    const native = Array.from({ length: 13 }, () => new Frame(32, 40));
    const next = new Frame(16, 20), nextNative = new Frame(32, 40);
    const animations = icons.map((frame, index) => index === 0 ? [frame, next] : [frame]);
    const nativeAnimations = native.map((frame, index) => index === 0 ? [frame, nextNative] : [frame]);
    gui.setWindowsPanel(icons, native, animations, nativeAnimations);
    gui.render();
    expect(display.drawFrameCovered).toHaveBeenCalledWith(icons[0], 0, 20, 192, 192, 192);
    display.drawFrameCovered.mockClear();
    timer.onGameTick.trigger();
    gui.render();
    expect(display.drawFrameCovered).toHaveBeenCalledWith(next, 0, 20, 192, 192, 192);
    expect(display.drawFrameCovered).toHaveBeenCalledWith(icons[8], 8 * 16, 20, 192, 192, 192);
    display.drawFrameCovered.mockClear();
    timer.onGameTick.trigger();
    gui.render();
    expect(display.drawFrameCovered).toHaveBeenCalledWith(icons[0], 0, 20, 192, 192, 192);
  });

  it('returns animated icons to their first frame when disabled and resumes only after re-enabling', () => {
    const { gui, display, timer } = fixture();
    const icons = Array.from({ length: 13 }, () => new Frame(16, 20));
    const native = Array.from({ length: 13 }, () => new Frame(32, 40));
    const next = new Frame(16, 20), nextNative = new Frame(32, 40);
    gui.setWindowsPanel(icons, native, icons.map((frame, i) => i === 0 ? [frame, next] : [frame]),
      native.map((frame, i) => i === 0 ? [frame, nextNative] : [frame]));
    gui.render(); timer.onGameTick.trigger(); gui.render();
    expect(display.drawFrameCovered).toHaveBeenCalledWith(next, 0, 20, 192, 192, 192);
    display.drawFrameCovered.mockClear();
    gui.setWindowsIconAnimationsEnabled(false); gui.render();
    expect(display.drawFrameCovered).toHaveBeenCalledWith(icons[0], 0, 20, 192, 192, 192);
    display.drawFrameCovered.mockClear();
    timer.onGameTick.trigger(); timer.onGameTick.trigger(); gui.render();
    expect(display.drawFrameCovered).not.toHaveBeenCalledWith(next, 0, 20, 192, 192, 192);
    gui.setWindowsIconAnimationsEnabled(true); timer.onGameTick.trigger(); gui.render();
    expect(display.drawFrameCovered).toHaveBeenCalledWith(next, 0, 20, 192, 192, 192);
  });

  it('keeps DOS controls and legacy 12-icon Windows installations on the original mapping', () => {
    for (const icons of [null, Array.from({ length: 12 }, () => new Frame(16, 20))]) {
      const { gui, game, press } = fixture(); gui.setWindowsPanel(icons);
      const nuke = vi.fn(), fastForward = vi.fn();
      gui.setNukeRequestHandler(nuke); gui.setFastForwardRequestHandler(fastForward);
      press(0); expect(game.queueCommand.mock.lastCall![0].getCommandKey()).toBe('d');
      press(2); expect(game.queueCommand.mock.lastCall![0].save()).toEqual([SkillTypes.CLIMBER]);
      press(11); expect(nuke).toHaveBeenCalledOnce(); expect(fastForward).not.toHaveBeenCalled();
    }
  });
});
