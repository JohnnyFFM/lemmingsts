import { defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { Game } from '@/game/game';
import { GameFactory } from '@/game/game-factory';
import { GameResources } from '@/game/game-resources';
import { GameStateTypes } from '@/game/game-state-types';
import { GameTypes } from '@/game/game-types';
import { CommandNuke } from '@/game/game-play/commands/command-nuke';
import { CommandSelectSkill } from '@/game/game-play/commands/command-select-skill';
import { SkillTypes } from '@/game/game-play/skill-types';
import { readLastLevel, readProgress, readSettings, recordCompletion, rememberLevel, suggestNextLevel, type LevelLocation } from '@/game/progress';
import { hasLemmingsFiles, importLemmingsFiles } from '@/game/resources/file/game-file-store';
import { MenuFont } from '@/game/resources/menu-font';
import { AudioPlayer } from '@/game/resources/sound/audio-player';
import { SoundEffectsPlayer } from '@/game/resources/sound/sound-effects-player';
import { buildLevelIntro, buildLevelResult } from '@/game/view/dos-screens';
import { Stage } from '@/game/view/stage';

const SETTINGS_KEY = 'lemmings.settings.v1';
/** A second press on the panel's nuke button within this time confirms it. */
const NUKE_CONFIRM_MS = 3000;

const SKILL_ORDER = [SkillTypes.CLIMBER, SkillTypes.FLOATER, SkillTypes.BOMBER, SkillTypes.BLOCKER,
    SkillTypes.BUILDER, SkillTypes.BASHER, SkillTypes.MINER, SkillTypes.DIGGER];

/** Music and effects default to on; a stored preference from the full app still wins. */
function readAudioPreference(): { music: boolean; sound: boolean } {
    let stored = false;
    try { stored = localStorage.getItem(SETTINGS_KEY) !== null; } catch { stored = false; }
    if (!stored) return { music: true, sound: true };
    const settings = readSettings();
    return { music: settings.musicEnabled, sound: settings.soundEnabled };
}

/** The level after `location`, or the same level at the end of the catalogue. */
export function nextLevelLocation(location: LevelLocation, groupLengths: readonly number[]): LevelLocation {
    if (location.levelIndex + 1 < (groupLengths[location.groupIndex] ?? 0)) return { ...location, levelIndex: location.levelIndex + 1 };
    for (let group = location.groupIndex + 1; group < groupLengths.length; group++) {
        if (groupLengths[group] > 0) return { ...location, groupIndex: group, levelIndex: 0 };
    }
    return location;
}

export default defineComponent({
    setup() {
        const container = ref<HTMLElement | null>(null);
        const gameCanvas = ref<HTMLCanvasElement | null>(null);
        const fileInput = ref<HTMLInputElement | null>(null);
        const setupNeeded = ref(false);
        const busy = ref(false);
        const message = ref('');
        const error = ref('');

        const factory = new GameFactory(`${import.meta.env.BASE_URL}data`, 'dos');
        const audio = readAudioPreference();
        let stage: Stage | null = null;
        let resources: GameResources | null = null;
        let menuFont: MenuFont | null = null;
        let game: Game | null = null;
        let effects: SoundEffectsPlayer | null = null;
        let music: AudioPlayer | null = null;
        let location: LevelLocation = { gameType: GameTypes.LEMMINGS, groupIndex: 0, levelIndex: 0 };
        let groupLengths: number[] = [];
        let groupNames: string[] = [];
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
            if (!resources || !audio.music || !game) return;
            const generationAtStart = generation;
            try {
                const player = await resources.getMusicPlayer(location.levelIndex % 20);
                if (disposed || generationAtStart !== generation || !game) { player.stop(); return; }
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

                const activeResources = nextResources;
                effects = audio.sound ? new SoundEffectsPlayer(index => activeResources.getSoundTrack(index)) : null;
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
                    releaseRate: level.releaseRate, minutes: level.timeLimit, rating: groupNames[next.groupIndex] ?? '',
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
                groupNames = config.level.groups;
                const start = suggestNextLevel(readLastLevel('dos'), readProgress('dos'), groupLengths)
                    ?? { gameType: GameTypes.LEMMINGS, groupIndex: 0, levelIndex: 0 };
                await playLevel(start);
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
