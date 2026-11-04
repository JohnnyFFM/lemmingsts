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
import { readLastLevel, readProgress, readSettings, recordCompletion, rememberLevel, saveSettings, suggestNextLevel, type LevelLocation } from '@/game/progress';
import { hasLemmingsFiles, importLemmingsFiles } from '@/game/resources/file/game-file-store';
import { MainImageSprites } from '@/game/resources/main-image-sprites';
import { MenuFont } from '@/game/resources/menu-font';
import { AudioPlayer } from '@/game/resources/sound/audio-player';
import { SoundEffectsPlayer } from '@/game/resources/sound/sound-effects-player';
import { buildLevelIntro, buildLevelList, buildLevelResult, buildTitleScreen, hitAt, type AudioMode } from '@/game/view/dos-screens';
import { Stage } from '@/game/view/stage';

const SETTINGS_KEY = 'lemmings.settings.v1';
/** A second press on the panel's nuke button within this time confirms it. */
const NUKE_CONFIRM_MS = 3000;

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

/** The first unsolved level of a rating, or its first level once everything is solved. */
export function firstUnsolvedLevel(gameType: number, groupIndex: number, groupLength: number, solved: ReadonlySet<number>): LevelLocation {
    for (let index = 0; index < groupLength; index++) {
        if (!solved.has(index)) return { gameType, groupIndex, levelIndex: index };
    }
    return { gameType, groupIndex, levelIndex: 0 };
}

export default defineComponent({
    setup() {
        const router = useRouter();
        const container = ref<HTMLElement | null>(null);
        const gameCanvas = ref<HTMLCanvasElement | null>(null);
        const fileInput = ref<HTMLInputElement | null>(null);
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

        function fitStage() {
            const bounds = container.value?.getBoundingClientRect();
            if (stage && bounds?.width && bounds.height) stage.setDosViewport(bounds.width, bounds.height);
        }

        function stopMusic() {
            music?.stop();
            music = null;
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
                const player = await resources.getMusicPlayer(location.levelIndex % 20);
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

        /** The DOS title screen; whatever is chosen there starts a new level or leaves the game. */
        async function showTitle() {
            const current = ++generation;
            paused = true;
            music?.suspend();
            effects?.stop();
            game?.getGameTimer().suspend();
            try {
                const menu = await loadMenuResources();
                if (!menu || !stage || disposed || current !== generation) return;
                const { frame, hits } = buildTitleScreen(menu.sprites, { rating, audio: audioMode });
                stage.setOverlay(frame, (x, y) => {
                    if (disposed || current !== generation) return;
                    const action = hitAt(hits, x, y);
                    switch (action?.kind) {
                        case 'play':
                            void playLevel(firstUnsolvedLevel(GameTypes.LEMMINGS, rating, groupLengths[rating] ?? 0, solvedLevels(rating)));
                            break;
                        case 'levels': void showLevelList(); break;
                        case 'rating': rating = (rating + 1) % Math.max(1, groupLengths.length); void showTitle(); break;
                        case 'audio': setAudioMode(nextAudioMode(audioMode)); void showTitle(); break;
                        case 'setup': void router.push('/setup'); break;
                    }
                });
            } catch (reason) {
                if (current === generation && !disposed) error.value = reason instanceof Error ? reason.message : 'Could not show the menu.';
            }
        }

        async function showLevelList() {
            const current = ++generation;
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
                    const screen = buildLevelResult(font, {
                        rescuedPercent: result.survivorPercentage, neededPercent,
                        outOfTime: result.state === GameStateTypes.FAILED_OUT_OF_TIME, succeeded,
                    });
                    activeStage.setOverlay(screen, () => {
                        if (disposed || current !== generation) return;
                        void playLevel(succeeded ? nextLevelLocation(location, groupLengths) : location);
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
                // already showing where the player left off; F1 then continues from there.
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
            disposeGame();
            stage?.dispose();
            stage = null;
            observer?.disconnect();
            window.removeEventListener('resize', fitStage);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        });

        return { container, gameCanvas, fileInput, setupNeeded, busy, message, error, chooseFiles, onFilesSelected, retry, requestImmersive };
    },
});
