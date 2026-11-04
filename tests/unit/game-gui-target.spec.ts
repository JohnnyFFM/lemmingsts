import { describe, expect, it, vi } from 'vitest';
import type { Game } from '../../src/game/game';
import type { GameSkills } from '../../src/game/game-play/game-skills';
import type { GameTimer } from '../../src/game/game-play/game-timer';
import type { GameVictoryCondition } from '../../src/game/game-play/game-victory-condition';
import { ColorPalette } from '../../src/game/resources/lemmings/color-palette';
import { SkillPanelSprites } from '../../src/game/resources/skill-panel-sprites';
import { GameGui } from '../../src/game/view/game-gui';
import type { DisplayImage } from '../../src/game/view/display-image';
import { Frame } from '../../src/game/resources/frame';

/** Collect the letters handed to the renderer at their actual panel coordinates. */
function renderTarget(need: number, total: number) {
  const panel = new SkillPanelSprites(null, null, new ColorPalette());
  const letters = new Map('NEED OUT IN TIME0123456789%-'.split('').map(character => [panel.getLetterSprite(character), character]));
  const covered: { character: string; x: number; y: number }[] = [];
  const event = { on: vi.fn() };
  const display = {
    onMouseDown: event, onMouseUp: event, onMouseMove: event, onDoubleClick: event,
    initSize: vi.fn(), setBackground: vi.fn(), drawFrame: vi.fn(), drawRect: vi.fn(),
    drawFrameCovered: vi.fn((frame, x, y) => {
      const character = letters.get(frame);
      if (character !== undefined) covered.push({ character, x, y });
    }),
  };
  const timer = { onGameTick: event, getGameLeftTimeString: () => '5-00' };
  const skills = { onCountChanged: event, onSelectionChanged: event, getSkill: () => 0, getSelectedSkill: () => 1 };
  const victory = { getNeedCount: () => need, getReleaseCount: () => total, getOutCount: () => 0,
    getSurvivorPercentage: () => 0, getMinReleaseRate: () => 50, getCurrentReleaseRate: () => 50 };
  const gui = new GameGui({} as Game, panel, skills as unknown as GameSkills,
    timer as unknown as GameTimer, victory as unknown as GameVictoryCondition);
  gui.setGuiDisplay(display as unknown as DisplayImage);
  gui.render();
  return { covered, gui, display };
}

describe('in-game target panel', () => {
  it.each([[1, 10, 'NEED  10%'], [1, 80, 'NEED   1%'], [80, 80, 'NEED 100%'], [1, 3, 'NEED  33%'], [2, 3, 'NEED  66%'], [1, 200, 'NEED 1'], [200, 200, 'NEED 200'], [65535, 65535, 'NEED 65535'], [0, 0, 'NEED   0%']])(
    'draws the target in the same percentage convention for %i of %i', (need, total, expected) => {
      const { covered } = renderTarget(need, total);
      const target = covered.filter(item => item.y === 0 && item.x < 112);
      expect(target.map(item => item.character).join('')).toBe(expected);
      expect(Math.max(...target.map(item => item.x + 8))).toBeLessThanOrEqual(112);
      expect(covered.some(item => item.x === 112 && item.character === 'O')).toBe(true);
    });
  it('uses a visible D glyph and redraws the target with the panel', () => {
    const panel = new SkillPanelSprites(null, null, new ColorPalette());
    expect(panel.getLetterSprite('D').getMask().some(value => value !== 0)).toBe(true);
    const { covered, gui } = renderTarget(8, 10);
    covered.length = 0;
    gui.setWindowsPanel(null);
    gui.render();
    expect(covered.filter(item => item.y === 0 && item.x < 112).map(item => item.character).join('')).toBe('NEED  80%');
  });

  it('centres Windows status fields evenly and keeps the complete time inside the panel', () => {
    const { covered, gui } = renderTarget(1, 10);
    covered.length = 0;
    gui.setWindowsPanel(Array.from({ length: 13 }, () => new Frame(16, 20)));
    gui.render();
    const fields = Array.from({ length: 4 }, (_, i) => covered
      .filter(item => item.y === 0 && item.x >= i * 80 && item.x < (i + 1) * 80)
      .map(item => item.character).join(''));
    expect(fields).toEqual(['NEED  10% ', '  OUT 0   ', '  IN 0%   ', 'TIME 5-00 ']);
    expect(covered.every(item => item.y !== 0 || item.x < 320)).toBe(true);
  });
});
