import { defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Game } from '@/game/game';
import { GameFactory } from '@/game/game-factory';
import { GameResources } from '@/game/game-resources';
import { GameStateTypes } from '@/game/game-state-types';
import { GameTypes } from '@/game/game-types';
import { CommandNuke } from '@/game/game-play/commands/command-nuke';
import { CommandSelectSkill } from '@/game/game-play/commands/command-select-skill';
import { SkillTypes } from '@/game/game-play/skill-types';
import { decodeLevelCode, levelCode, LEVEL_CODE_LENGTH } from '@/game/level-codes';
import { globalLevelIndex, levelMusicIndex } from '@/game/music';
import { readLastLevel, readProgress, readSettings, recordCompletion, rememberLevel, saveSettings, suggestNextLevel, type LevelLocation } from '@/game/progress';
import { hasLemmingsFiles, importLemmingsFiles } from '@/game/resources/file/game-file-store';
import { MainImageSprites } from '@/game/resources/main-image-sprites';
import { MenuFont } from '@/game/resources/menu-font';
import { AudioPlayer } from '@/game/resources/sound/audio-player';
import { SoundEffectsPlayer } from '@/game/resources/sound/sound-effects-player';
import { buildCodeEntry, buildLevelIntro, buildLevelList, buildLevelResult, buildTitleScreen, drawScrollerText, hitAt, type AudioMode } from '@/game/view/dos-screens';
import { FILTER_LABELS, FILTERS, GlPresenter, type FilterName, type PresentFrame } from '@/game/view/gl-presenter';
import { Stage } from '@/game/view/stage';

const SETTINGS_KEY = 'lemmings.settings.v1';
const FILTER_KEY = 'lemmings.dos-filter.v1';

/** The saved display filter, or the plain sharp pixels. */
export function readFilter(): FilterName {
    try {
        const saved = localStorage.getItem(FILTER_KEY);
        return FILTERS.includes(saved as FilterName) ? saved as FilterName : 'sharp';
    } catch { return 'sharp'; }
}

export function saveFilter(filter: FilterName): void {
    try { localStorage.setItem(FILTER_KEY, filter); } catch { /* preferences are optional */ }
}

/** The filter after `filter`, wrapping round. */
export function nextFilter(filter: FilterName): FilterName {
    return FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length];
}
/** A second press on the panel's nuke button within this time confirms it. */
const NUKE_CONFIRM_MS = 3000;
/** The title scroller moves this many pixels per step, this often. */
const SCROLL_STEP = 2, SCROLL_INTERVAL_MS = 50;
const CREDITS = '    Lemmings  (c) 1991 DMA Design and Psygnosis  ...  Web engine by Thomas Zeugner and Paul O\'Brien  ...  ' +
    'F1 plays the shown rating from level 1  ...  F2 enters a level code  ...  F3 changes the rating  ...  F4 changes the sound  ...  ' +
    'During a level, hold the pause button to return here  ...  ';

const SKILL_ORDER = [SkillTypes.CLIMBER, SkillTypes.FLOATER, SkillTypes.BOMBER, SkillTypes.BLOCKER,
    SkillTypes.BUILDER, SkillTypes.BASHER, SkillTypes.MINER, SkillTypes.DIGGER];

/** Music and effects default to on; a stored preference from the full app still wins. */
export function readAudioMode(): AudioMode {
    let stored = false;
    try { stored = localStorage.getItem(SETTINGS_KEY) !== null; } catch { stored = false; }
    if (!stored) return 'music';
    const settings = readSettings();
    return settings.musicEnabled ? 'music' : settings.soundEnabled ? 'fx' : 'off';
}

/** The DOS F4 sign cycles music with effects, effects only, then silence. */
export function nextAudioMode(mode: AudioMode): AudioMode {
    return mode === 'music' ? 'fx' : mode === 'fx' ? 'off' : 'music';
}

/** The level after `location`, or the same level at the end of the catalogue. */
export function nextLevelLocation(location: LevelLocation, groupLengths: readonly number[]): LevelLocation {
    if (location.levelIndex + 1 < (groupLengths[location.groupIndex] ?? 0)) return { ...location, levelIndex: location.levelIndex + 1 };
    for (let group = location.groupIndex + 1; group < groupLengths.length; group++) {
        if (groupLengths[group] > 0) return { ...location, groupIndex: group, levelIndex: 0 };
    }
    return location;
}

/** The DOS game showed levels through a window this wide; its stored start positions assume it. */
export const DOS_VIEW_WIDTH = 320;

/**
 * Where a wider view should start so that the DOS game's 320-pixel window
 * sits in its middle, with the extra width split evenly to both sides.
 */
export function centredScreenX(screenPositionX: number, visibleWidth: number, levelWidth: number): number {
    const x = screenPositionX - Math.max(0, (visibleWidth - DOS_VIEW_WIDTH) / 2);
    return Math.max(0, Math.min(Math.max(0, levelWidth - visibleWidth), Math.round(x)));
}

/** The location of a 1-based level number across the whole game, or null past the end. */
export function locationOfLevelNumber(levelNumber: number, gameType: number, groupLengths: readonly number[]): LevelLocation | null {
    let remaining = levelNumber - 1;
    for (let group = 0; group < groupLengths.length; group++) {
        if (remaining < groupLengths[group]) return { gameType, groupIndex: group, levelIndex: remaining };
        remaining -= groupLengths[group];
    }
    return null;
}

export default defineComponent({
    setup() {
        const router = useRouter();
        const container = ref<HTMLElement | null>(null);
        const gameCanvas = ref<HTMLCanvasElement | null>(null);
        const filterCanvas = ref<HTMLCanvasElement | null>(null);
        const fileInput = ref<HTMLInputElement | null>(null);
        const filterActive = ref(false);
        const setupNeeded = ref(false);
        const busy = ref(false);
        const message = ref('');
        const error = ref('');

        const factory = new GameFactory(`${import.meta.env.BASE_URL}data`, 'dos');
        let audioMode = readAudioMode();
        let stage: Stage | null = null;
        let resources: GameResources | null = null;
        let menuFont: MenuFont | null = null;
        let titleSprites: MainImageSprites | null = null;
        let game: Game | null = null;
        let effects: SoundEffectsPlayer | null = null;
        let music: AudioPlayer | null = null;
        let location: LevelLocation = { gameType: GameTypes.LEMMINGS, groupIndex: 0, levelIndex: 0 };
        let rating = 0;
        let groupLengths: number[] = [];
        let generation = 0;
        let disposed = false;
        let paused = false;
        let nukeArmedUntil = 0;
        let observer: ResizeObserver | null = null;
        let scrollTimer: ReturnType<typeof setInterval> | null = null;
        let presenter: GlPresenter | null = null;
        let filter = readFilter();
        let lastFrame: PresentFrame | null = null;

        function fitStage() {
            const bounds = container.value?.getBoundingClientRect();
            if (stage && bounds?.width && bounds.height) {
                presenter?.resize(bounds.width, bounds.height, window.devicePixelRatio || 1);
                stage.setDosViewport(bounds.width, bounds.height);
            }
        }

        /** Redraw the last composition through the presenter, or fall back to the plain canvas. */
        function presentFrame(frame: PresentFrame) {
            lastFrame = frame;
            if (!presenter?.supported || filter === 'sharp') { filterActive.value = false; return; }
            filterActive.value = presenter.present(frame, filter);
        }

        function applyFilter(next: FilterName) {
            filter = next;
            saveFilter(next);
            if (lastFrame) presentFrame(lastFrame);
            else stage?.redraw();
        }

        /** Holding the panel's green row cycles the filter; its name is flashed there. */
        function cycleFilter(): string {
            const next = presenter?.supported ? nextFilter(filter) : 'sharp';
            applyFilter(next);
            return presenter?.supported ? FILTER_LABELS[next] : 'NO FILTER SUPPORT';
        }

        function stopMusic() {
            music?.stop();
            music = null;
        }

        function stopScroller() {
            if (scrollTimer !== null) clearInterval(scrollTimer);
            scrollTimer = null;
        }

        function disposeGame() {
            effects?.stop();
            effects = null;
            stopMusic();
            game?.stop();
            game = null;
            stage?.clearInputBindings();
            paused = false;
            nukeArmedUntil = 0;
        }

        async function playMusic() {
            if (!resources || audioMode !== 'music' || !game) return;
            const generationAtStart = generation;
            try {
                const player = await resources.getMusicPlayer(levelMusicIndex(globalLevelIndex(location.groupIndex, location.levelIndex, groupLengths)));
                if (disposed || generationAtStart !== generation || !game || audioMode !== 'music') { player.stop(); return; }
                stopMusic();
                music = player;
                if (paused || document.hidden) music.suspend();
                else music.play();
            } catch {
                // Music is optional; the level still plays without it.
            }
        }

        function confirmNuke() {
            if (!game) return;
            const now = Date.now();
            if (now < nukeArmedUntil) {
                nukeArmedUntil = 0;
                game.queueCommand(new CommandNuke());
                return;
            }
            nukeArmedUntil = now + NUKE_CONFIRM_MS;
        }

        /** The panel's pause button toggles the timer inside the engine; follow it with the audio. */
        function syncPauseState() {
            if (!game) return;
            const running = game.getGameTimer().isRunning();
            if (running === !paused) return;
            paused = !running;
            if (paused) { music?.suspend(); effects?.stop(); }
            else music?.play();
        }

        function solvedLevels(groupIndex: number): Set<number> {
            return new Set(readProgress('dos').filter(entry => entry.gameType === GameTypes.LEMMINGS && entry.groupIndex === groupIndex).map(entry => entry.levelIndex));
        }

        async function loadMenuResources(): Promise<{ sprites: MainImageSprites; font: MenuFont } | null> {
            const active = resources ?? await factory.getGameResources(GameTypes.LEMMINGS);
            if (!active) return null;
            resources = active;
            titleSprites ??= await active.getMainImageSprites();
            menuFont ??= await active.getMenuFont();
            return { sprites: titleSprites, font: menuFont };
        }

        /** Leave whatever was running and show a menu screen. */
        function beginMenu(): number {
            const current = ++generation;
            stopScroller();
            paused = true;
            music?.suspend();
            effects?.stop();
            game?.getGameTimer().suspend();
            return current;
        }

        /** The DOS title screen; whatever is chosen there starts a new level or leaves the game. */
        async function showTitle() {
            const current = beginMenu();
            try {
                const menu = await loadMenuResources();
                if (!menu || !stage || disposed || current !== generation) return;
                const { frame, hits } = buildTitleScreen(menu.sprites, { rating, audio: audioMode });
                const activeStage = stage;
                let offset = 0;
                const onTap = (x: number, y: number) => {
                    if (disposed || current !== generation) return;
                    const action = hitAt(hits, x, y);
                    switch (action?.kind) {
                        case 'play': void playLevel({ gameType: GameTypes.LEMMINGS, groupIndex: rating, levelIndex: 0 }); break;
                        case 'levels': void showCodeEntry(); break;
                        case 'rating': rating = (rating + 1) % Math.max(1, groupLengths.length); void showTitle(); break;
                        case 'audio': setAudioMode(nextAudioMode(audioMode)); void showTitle(); break;
                        case 'setup': void router.push('/setup'); break;
                    }
                };
                activeStage.setOverlay(drawScrollerText(frame, menu.font, CREDITS, offset), onTap);
                scrollTimer = setInterval(() => {
                    if (disposed || current !== generation) { stopScroller(); return; }
                    offset += SCROLL_STEP;
                    activeStage.setOverlay(drawScrollerText(frame, menu.font, CREDITS, offset), onTap);
                }, SCROLL_INTERVAL_MS);
            } catch (reason) {
                if (current === generation && !disposed) error.value = reason instanceof Error ? reason.message : 'Could not show the menu.';
            }
        }

        /** The F2 screen: type a level code on the tap keyboard, or go to the list instead. */
        async function showCodeEntry(typed = '', notice = '') {
            const current = beginMenu();
            try {
                const menu = await loadMenuResources();
                if (!menu || !stage || disposed || current !== generation) return;
                const { frame, hits } = buildCodeEntry(menu.font, typed, notice);
                stage.setOverlay(frame, (x, y) => {
                    if (disposed || current !== generation) return;
                    const action = hitAt(hits, x, y);
                    switch (action?.kind) {
                        case 'letter': if (typed.length < LEVEL_CODE_LENGTH) void showCodeEntry(typed + action.letter); break;
                        case 'delete': void showCodeEntry(typed.slice(0, -1)); break;
                        case 'enter': submitCode(typed); break;
                        case 'list': void showLevelList(); break;
                        case 'back': void showTitle(); break;
                    }
                });
            } catch (reason) {
                if (current === generation && !disposed) error.value = reason instanceof Error ? reason.message : 'Could not show the code screen.';
            }
        }

        function submitCode(typed: string) {
            const decoded = decodeLevelCode(typed);
            const target = decoded ? locationOfLevelNumber(decoded.levelNumber, GameTypes.LEMMINGS, groupLengths) : null;
            if (!target) { void showCodeEntry('', 'Not a valid code'); return; }
            void playLevel(target);
        }

        async function showLevelList() {
            const current = beginMenu();
            try {
                const menu = await loadMenuResources();
                if (!menu || !resources || !stage) return;
                const names = await resources.getLevelNames(rating);
                if (disposed || current !== generation || !stage) return;
                const { frame, hits } = buildLevelList(menu.sprites, menu.font, rating, names, solvedLevels(rating));
                stage.setOverlay(frame, (x, y) => {
                    if (disposed || current !== generation) return;
                    const action = hitAt(hits, x, y);
                    if (action?.kind === 'level') void playLevel({ gameType: GameTypes.LEMMINGS, groupIndex: rating, levelIndex: action.index });
                    else if (action?.kind === 'back') void showTitle();
                });
            } catch (reason) {
                if (current === generation && !disposed) error.value = reason instanceof Error ? reason.message : 'Could not list the levels.';
            }
        }

        function setAudioMode(mode: AudioMode) {
            audioMode = mode;
            saveSettings({ speed: 1, musicEnabled: mode === 'music', soundEnabled: mode !== 'off' });
            if (mode !== 'music') stopMusic();
            if (mode === 'off') { effects?.stop(); effects = null; }
        }

        /** Begin the loaded level once the player leaves its preview card. */
        function startLoadedGame() {
            if (!game || !stage) return;
            stage.setOverlay(null);
            game.start();
            paused = false;
            onVisibilityChange();
            void playMusic();
        }

        async function playLevel(next: LevelLocation) {
            const current = ++generation;
            stopScroller();
            disposeGame();
            error.value = '';
            try {
                if (!stage) throw new Error('The game screen is not ready.');
                const nextResources = resources ?? await factory.getGameResources(GameTypes.LEMMINGS);
                if (!nextResources) throw new Error('Could not load the game files.');
                const [level, font] = await Promise.all([nextResources.getLevel(next.groupIndex, next.levelIndex), menuFont ?? nextResources.getMenuFont()]);
                if (!level) throw new Error('Could not load this level.');
                if (disposed || current !== generation) return;
                resources = nextResources;
                menuFont = font;
                location = next;
                rating = next.groupIndex;
                rememberLevel(next.gameType, next.groupIndex, next.levelIndex, 'dos');

                const display = stage.getGameDisplay();
                stage.resetFade();
                display.clear();
                level.render(display);
                display.setScreenPosition(level.screenPositionX, 0);
                stage.applyDosLayout();
                const viewport = stage.getGameViewport();
                if (viewport) stage.setGameViewPointPosition(centredScreenX(level.screenPositionX, viewport.width, level.width), 0);

                const nextGame = await factory.getGame(GameTypes.LEMMINGS, next.groupIndex, next.levelIndex);
                if (!nextGame) throw new Error('Could not start this level.');
                if (disposed || current !== generation || !stage) { nextGame.stop(); return; }
                game = nextGame;

                const skills = game.getGameSkills();
                if (skills.getSkill(skills.getSelectedSkill()) <= 0) {
                    const firstAvailable = SKILL_ORDER.find(skill => skills.getSkill(skill) > 0);
                    if (firstAvailable !== undefined) game.queueCommand(new CommandSelectSkill(firstAvailable));
                }
                game.setNukeRequestHandler(confirmNuke);
                game.setMenuRequestHandler(() => void showTitle());
                game.setFilterRequestHandler(cycleFilter);

                const activeResources = nextResources;
                effects = audioMode !== 'off' ? new SoundEffectsPlayer(index => activeResources.getSoundTrack(index)) : null;
                game.onSoundEffect.on(effect => {
                    if (effect === undefined || !effects || paused || document.hidden) return;
                    void effects.play(effect);
                });

                stage.clearInputBindings();
                game.setGameDisplay(stage.getGameDisplay());
                game.setGuiDisplay(stage.getGuiDisplay());
                stage.getGuiDisplay().onMouseDown.on(syncPauseState);
                const activeStage = stage;
                game.setViewportProvider(() => activeStage.getGameViewport());
                game.setMinimapNavigationHandler((x, y) => activeStage.revealGamePosition(x, y));

                const neededPercent = level.releaseCount > 0 ? Math.floor(level.needCount / level.releaseCount * 100) : 0;
                game.onGameEnd.on(result => {
                    if (!result || !game || disposed || current !== generation) return;
                    game.getGameTimer().suspend();
                    effects?.stop();
                    stopMusic();
                    const succeeded = result.state === GameStateTypes.SUCCEEDED;
                    if (succeeded) recordCompletion(location.gameType, location.groupIndex, location.levelIndex, result.survivorPercentage, 'dos');
                    const following = nextLevelLocation(location, groupLengths);
                    const unlocked = succeeded && (following.groupIndex !== location.groupIndex || following.levelIndex !== location.levelIndex)
                        ? globalLevelIndex(following.groupIndex, following.levelIndex, groupLengths) + 1 : null;
                    const screen = buildLevelResult(font, {
                        rescuedPercent: result.survivorPercentage, neededPercent,
                        outOfTime: result.state === GameStateTypes.FAILED_OUT_OF_TIME, succeeded,
                        accessCode: unlocked ? { levelNumber: unlocked, code: levelCode(unlocked, result.survivorPercentage) } : undefined,
                    });
                    activeStage.setOverlay(screen, () => {
                        if (disposed || current !== generation) return;
                        void playLevel(succeeded ? following : location);
                    });
                });

                const intro = buildLevelIntro(font, {
                    number: next.levelIndex + 1, name: level.name, lemmings: level.releaseCount, needed: level.needCount,
                    releaseRate: level.releaseRate, minutes: level.timeLimit, rating: nextResources.getLevelGroups()[next.groupIndex] ?? '',
                });
                stage.setOverlay(intro, () => {
                    if (disposed || current !== generation) return;
                    startLoadedGame();
                });
            } catch (reason) {
                if (current === generation && !disposed) error.value = reason instanceof Error ? reason.message : 'Could not load this level.';
            }
        }

        async function boot() {
            error.value = '';
            try {
                if (!(await hasLemmingsFiles())) { setupNeeded.value = true; return; }
                setupNeeded.value = false;
                const config = await factory.getConfig(GameTypes.LEMMINGS);
                if (!config) throw new Error('The game configuration is not available.');
                groupLengths = config.level.order.map(group => group.length);
                // Like the DOS game, open on the title screen, with the rating sign
                // already showing where the player last played.
                const next = suggestNextLevel(readLastLevel('dos'), readProgress('dos'), groupLengths);
                rating = next ? next.groupIndex : 0;
                await showTitle();
            } catch (reason) {
                if (!disposed) error.value = reason instanceof Error ? reason.message : 'Could not start the game.';
            }
        }

        function chooseFiles() {
            fileInput.value?.click();
        }

        async function onFilesSelected(event: Event) {
            const input = event.target as HTMLInputElement;
            if (!input.files?.length) return;
            busy.value = true;
            message.value = '';
            try {
                await importLemmingsFiles(input.files);
                message.value = '';
                await boot();
            } catch (reason) {
                message.value = reason instanceof Error ? reason.message : 'Could not read those files. Please try again.';
            } finally {
                input.value = '';
                busy.value = false;
            }
        }

        function retry() {
            void boot();
        }

        function onVisibilityChange() {
            if (!game) return;
            if (document.hidden) {
                if (game.getGameTimer().isRunning()) game.getGameTimer().suspend();
                syncPauseState();
            }
        }

        /** In a plain browser tab, the first touch asks for full screen and landscape; installed apps already have both. */
        function requestImmersive() {
            const root = document.documentElement;
            if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => undefined);
            const orientation = screen.orientation as ScreenOrientation & { lock?: (type: string) => Promise<void> };
            orientation?.lock?.('landscape').catch(() => undefined);
        }

        onMounted(() => {
            if (!gameCanvas.value) return;
            stage = new Stage(gameCanvas.value);
            if (filterCanvas.value) presenter = new GlPresenter(filterCanvas.value);
            stage.onPresent.on(frame => { if (frame) presentFrame(frame); });
            if (typeof ResizeObserver !== 'undefined' && container.value) {
                observer = new ResizeObserver(fitStage);
                observer.observe(container.value);
            }
            window.addEventListener('resize', fitStage);
            document.addEventListener('visibilitychange', onVisibilityChange);
            fitStage();
            void boot();
        });

        onBeforeUnmount(() => {
            disposed = true;
            ++generation;
            stopScroller();
            disposeGame();
            stage?.dispose();
            stage = null;
            presenter?.dispose();
            presenter = null;
            observer?.disconnect();
            window.removeEventListener('resize', fitStage);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        });

        return { container, gameCanvas, filterCanvas, filterActive, fileInput, setupNeeded, busy, message, error, chooseFiles, onFilesSelected, retry, requestImmersive };
    },
});
