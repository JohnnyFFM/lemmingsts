import { Frame } from '../resources/frame';
import { MenuFont, MENU_GLYPH_HEIGHT } from '../resources/menu-font';

/** The DOS menu, preview and result screens ran in a 640×400 text mode. */
export const DOS_SCREEN_WIDTH = 640, DOS_SCREEN_HEIGHT = 400;
const LINE = MENU_GLYPH_HEIGHT;

export interface LevelIntroInfo {
    /** 1-based level number within its rating. */
    number: number;
    name: string;
    lemmings: number;
    /** Lemmings that must be saved, as a count. */
    needed: number;
    releaseRate: number;
    /** Time limit in minutes. */
    minutes: number;
    rating: string;
}

export interface LevelResultInfo {
    rescuedPercent: number;
    neededPercent: number;
    outOfTime: boolean;
    succeeded: boolean;
}

export function createDosScreen(): Frame {
    const frame = new Frame(DOS_SCREEN_WIDTH, DOS_SCREEN_HEIGHT);
    frame.fill(0, 0, 0);
    return frame;
}

/** The level preview card shown before a level starts. */
export function buildLevelIntro(font: MenuFont, info: LevelIntroInfo): Frame {
    const screen = createDosScreen();
    const percent = info.lemmings > 0 ? Math.floor(info.needed / info.lemmings * 100) : 0;
    const lines: Array<[string, number]> = [
        [`Level ${info.number}`, 3 * LINE],
        [info.name.trim(), 6 * LINE],
        [`Number of Lemmings ${info.lemmings}`, 9 * LINE],
        [`${percent}% To Be Saved`, 10 * LINE],
        [`Release Rate ${info.releaseRate}`, 11 * LINE],
        [`Time ${info.minutes} ${info.minutes === 1 ? 'Minute' : 'Minutes'}`, 12 * LINE],
        [`Rating ${info.rating}`, 13 * LINE],
        ['Press mouse button to continue', 20 * LINE],
    ];
    for (const [text, y] of lines) font.drawCentered(screen, text, y);
    return screen;
}

/** The DOS game's verdict on a result, as two lines. */
export function resultVerdict(rescued: number, needed: number): [string, string] {
    if (rescued === 0) return ['ROCK BOTTOM! I hope for your sake', 'that you nuked that level.'];
    if (rescued < Math.floor(needed / 2)) return ['Better rethink your strategy before', 'you try this level again!'];
    if (rescued < needed - 5) return ['A little more practice on this', 'level is definitely recommended.'];
    if (rescued < needed - 1) return ['You got pretty close that time.', 'Now try again for that few % extra.'];
    if (rescued === needed - 1) return ['OH NO, So near and yet so far (teehee)', 'Maybe this time.....'];
    if (rescued === needed) return ['SPOT ON. You can\'t get much closer', 'than that. Let\'s try the next....'];
    if (rescued < needed + 20) return ['That level seemed no problem to you on', 'that attempt. Onto the next....'];
    if (rescued < 100) return ['You totally stormed that level!', 'Let\'s see if you can storm the next...'];
    return ['Superb! You rescued every Lemming on', 'that level. Can you do it again....?'];
}

/** The screen shown when a level ends. */
export function buildLevelResult(font: MenuFont, info: LevelResultInfo): Frame {
    const screen = createDosScreen();
    const [first, second] = resultVerdict(info.rescuedPercent, info.neededPercent);
    const lines: Array<[string, number]> = [
        [info.outOfTime ? 'Your time is up!' : 'All lemmings accounted for.', 2 * LINE],
        [`You rescued ${String(info.rescuedPercent).padStart(3)}%`, 5 * LINE],
        [`You needed  ${String(info.neededPercent).padStart(3)}%`, 6 * LINE],
        [first, 9 * LINE],
        [second, 10 * LINE],
        [info.succeeded ? 'Press mouse button for next level' : 'Press mouse button to retry level', 20 * LINE],
    ];
    for (const [text, y] of lines) font.drawCentered(screen, text, y);
    return screen;
}
