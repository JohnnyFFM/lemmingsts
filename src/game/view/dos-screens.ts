import { Frame } from '../resources/frame';
import { ColorPalette } from '../resources/lemmings/color-palette';
import { MainImageSprites } from '../resources/main-image-sprites';
import { blitFrame, MenuFont, MENU_GLYPH_HEIGHT, MENU_GLYPH_WIDTH } from '../resources/menu-font';

/** The DOS menu, preview and result screens ran in a 640×400 text mode. */
export const DOS_SCREEN_WIDTH = 640, DOS_SCREEN_HEIGHT = 400;
const LINE = MENU_GLYPH_HEIGHT;

export interface HitArea<A> { x: number; y: number; width: number; height: number; action: A }

/** The action under a point on a screen, or null between the targets. */
export function hitAt<A>(hits: readonly HitArea<A>[], x: number, y: number): A | null {
    const hit = hits.find(area => x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height);
    return hit ? hit.action : null;
}

export type AudioMode = 'music' | 'fx' | 'off';
export type TitleAction = { kind: 'play' } | { kind: 'levels' } | { kind: 'rating' } | { kind: 'audio' } | { kind: 'setup' };
export type LevelListAction = { kind: 'level'; index: number } | { kind: 'back' };

export interface TitleScreenState {
    /** Index of the rating shown on the sign: 0 Fun to 3 Mayhem. */
    rating: number;
    audio: AudioMode;
}

/** The four signs sit in one row under the logo; the exit sign is centred below them. */
const SIGN_WIDTH = 120, SIGN_HEIGHT = 61, SIGN_Y = 128, SIGN_XS = [44, 188, 332, 476] as const;
const EXIT_X = 260, EXIT_Y = 206;
const SCROLLER_Y = 320;

function tileBackground(screen: Frame, sprites: MainImageSprites): void {
    const background = sprites.getBackground();
    for (let y = 0; y < screen.height; y += background.height) {
        for (let x = 0; x < screen.width; x += background.width) blitFrame(screen, background, x, y);
    }
}

/** The DOS title screen: logo, the four signs, the exit sign and the scroller lemmings. */
export function buildTitleScreen(sprites: MainImageSprites, state: TitleScreenState): { frame: Frame; hits: HitArea<TitleAction>[] } {
    const screen = createDosScreen();
    tileBackground(screen, sprites);
    blitFrame(screen, sprites.getLogo(), 4, 12);

    const signs = [sprites.getF1(), sprites.getF2(), sprites.getF3(), sprites.getF4()];
    const actions: TitleAction[] = [{ kind: 'play' }, { kind: 'levels' }, { kind: 'rating' }, { kind: 'audio' }];
    const hits: HitArea<TitleAction>[] = [];
    signs.forEach((sign, index) => {
        blitFrame(screen, sign, SIGN_XS[index], SIGN_Y);
        hits.push({ x: SIGN_XS[index], y: SIGN_Y, width: SIGN_WIDTH, height: SIGN_HEIGHT, action: actions[index] });
    });
    // The blank F3 board carries the current rating; the F4 board shows the audio mode.
    blitFrame(screen, sprites.getRatingSign(state.rating), SIGN_XS[2] + 24, SIGN_Y + 26);
    if (state.audio === 'music') blitFrame(screen, sprites.getMusicIcon(), SIGN_XS[3] + 28, SIGN_Y + 24);
    else if (state.audio === 'fx') blitFrame(screen, sprites.getFxIcon(), SIGN_XS[3] + 28, SIGN_Y + 24);

    blitFrame(screen, sprites.getExit(), EXIT_X, EXIT_Y);
    hits.push({ x: EXIT_X, y: EXIT_Y, width: SIGN_WIDTH, height: SIGN_HEIGHT, action: { kind: 'setup' } });

    const reel = sprites.getReel();
    for (let x = 96; x < 544; x += reel.width) blitFrame(screen, reel, x, SCROLLER_Y);
    blitFrame(screen, sprites.getLeftScroll(), 48, SCROLLER_Y);
    blitFrame(screen, sprites.getRightScroll(), 544, SCROLLER_Y);
    return { frame: screen, hits };
}

const LIST_COLUMNS = 2, LIST_ROWS = 15, LIST_TOP = 3 * LINE, LIST_COLUMN_WIDTH = DOS_SCREEN_WIDTH / LIST_COLUMNS;
const NAME_LENGTH = 16, BACK_Y = 22 * LINE;
const DONE_COLOR = ColorPalette.colorFromRGB(0, 176, 0);

/** The level list for one rating: two columns in the menu font, with a green mark on solved levels. */
export function buildLevelList(sprites: MainImageSprites, font: MenuFont, rating: number, names: readonly string[],
    solved: ReadonlySet<number>): { frame: Frame; hits: HitArea<LevelListAction>[] } {
    const screen = createDosScreen();
    const sign = sprites.getRatingSign(rating);
    blitFrame(screen, sign, Math.floor((screen.width - sign.width) / 2), 8);
    const hits: HitArea<LevelListAction>[] = [];
    names.slice(0, LIST_COLUMNS * LIST_ROWS).forEach((name, index) => {
        const column = Math.floor(index / LIST_ROWS), row = index % LIST_ROWS;
        const x = column * LIST_COLUMN_WIDTH + 2 * MENU_GLYPH_WIDTH, y = LIST_TOP + row * LINE;
        font.drawText(screen, `${String(index + 1).padStart(2)} ${name.slice(0, NAME_LENGTH)}`, x, y);
        if (solved.has(index)) {
            for (let py = 5; py < 11; py++) for (let px = 5; px < 11; px++) screen.setPixel(x - MENU_GLYPH_WIDTH + px, y + py, DONE_COLOR);
        }
        hits.push({ x: column * LIST_COLUMN_WIDTH, y, width: LIST_COLUMN_WIDTH, height: LINE, action: { kind: 'level', index } });
    });
    font.drawCentered(screen, 'Back', BACK_Y);
    hits.push({ x: 0, y: BACK_Y - LINE, width: screen.width, height: 3 * LINE, action: { kind: 'back' } });
    return { frame: screen, hits };
}

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
