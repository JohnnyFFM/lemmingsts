// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import GameView from '../../src/views/game-view.vue';
import { GameStateTypes } from '../../src/game/game-state-types';
import { readProgress } from '../../src/game/progress';
import { CommandNuke } from '../../src/game/game-play/commands/command-nuke';

const mock = vi.hoisted(() => {
    const timer = {
        running: false,
        speedFactor: 1,
        continue: vi.fn(function (this: { running: boolean }) { this.running = true; }),
        suspend: vi.fn(function (this: { running: boolean }) { this.running = false; }),
        toggle: vi.fn(function (this: { running: boolean }) { this.running = !this.running; }),
        isRunning: vi.fn(function (this: { running: boolean }) { return this.running; }),
        getGameLeftTimeString: vi.fn(() => '5-00'),
        onGameTick: { on: vi.fn() },
    };
    const level = { name: 'Just dig!', screenPositionX: 0, needCount: 8, releaseCount: 10, timeLimit: 5, render: vi.fn(), setWindowsTerrain: vi.fn(), getWindowsTerrain: vi.fn(() => undefined) };
    const event = { on: vi.fn() };
    const display = { onMouseDown: event, clear: vi.fn(), redraw: vi.fn(), setScreenPosition: vi.fn(), setNativeSprites: vi.fn() };
    const graphicsError: { handler?: (message?: string) => void } = {};
    const zoomChange: { handler?: (changed?: boolean) => void } = {};
    const stage = { setWindowsFullscreenViewport: vi.fn(), setWindowsStatusProvider: vi.fn(), setMinimapProvider: vi.fn(), panGameBy: vi.fn(), getGameDisplay: vi.fn(() => display), getGuiDisplay: vi.fn(() => display), resetFade: vi.fn(), clearInputBindings: vi.fn(), dispose: vi.fn(), zoomGame: vi.fn(), resetZoom: vi.fn(), onZoomChange: { on: vi.fn((handler: (changed?: boolean) => void) => { zoomChange.handler = handler; }), off: vi.fn() }, setExampleHint: vi.fn(), setGraphicsMode: vi.fn(), setComparisonCanvases: vi.fn(), onGraphicsError: { on: vi.fn((handler: (message?: string) => void) => { graphicsError.handler = handler; }), off: vi.fn() } };
    const skills = { getSkill: vi.fn((_type: number) => 10), getSelectedSkill: vi.fn(() => 1) };
    const endEvent: { handler?: (result: { state: number; survivorPercentage: number }) => void } = {};
    const soundEvent: { handler?: (effect: number) => void } = {};
    const assignmentEvent: { handler?: (result: string) => void } = {};
    const nukeRequest: { handler?: () => void } = {};
    const fastForwardRequest: { handler?: () => void } = {};
    const effects = { play: vi.fn(async () => undefined), stop: vi.fn() };
    const game = {
        level,
        getGameTimer: vi.fn(() => timer), getGameSkills: vi.fn(() => skills),
        getVictoryCondition: vi.fn(() => ({ getCurrentReleaseRate: () => 50, getSurvivorsCount: () => 3 })),
        setGameDisplay: vi.fn(), setGuiDisplay: vi.fn(), setWindowsPanel: vi.fn(), setWindowsIconAnimationsEnabled: vi.fn(), setNukeRequestHandler: vi.fn((handler: () => void) => { nukeRequest.handler = handler; }),
        setFastForwardRequestHandler: vi.fn((handler: () => void) => { fastForwardRequest.handler = handler; }), setFastForwardActive: vi.fn(),
        setViewportProvider: vi.fn(), setMinimapNavigationHandler: vi.fn(),
        start: vi.fn(() => timer.continue()),
        stop: vi.fn(() => timer.suspend()), queueCommand: vi.fn(() => true),
        onGameEnd: { on: vi.fn((handler: (result: { state: number; survivorPercentage: number }) => void) => { endEvent.handler = handler; }) },
        onSoundEffect: { on: vi.fn((handler: (effect: number) => void) => { soundEvent.handler = handler; }) },
        onPlayerAssignment: { on: vi.fn((handler: (result: string) => void) => { assignmentEvent.handler = handler; }) },
    };
    const music = { play: vi.fn(), suspend: vi.fn(), stop: vi.fn() };
    const midiContext = {
        state: 'running' as AudioContextState,
        resume: vi.fn(async function (this: { state: AudioContextState }) { this.state = 'running'; }),
        suspend: vi.fn(async function (this: { state: AudioContextState }) { this.state = 'suspended'; }),
    };
    const midiSynth = { getAudioContext: vi.fn(() => midiContext), setLoop: vi.fn(), loadMIDI: vi.fn(), playMIDI: vi.fn(), stopMIDI: vi.fn() };
    const getWindowsAudioFile = vi.fn(async (_name: string): Promise<ArrayBuffer | undefined> => undefined);
    const prepareWindowsTerrain = vi.fn(async (_level: unknown): Promise<{ status: 'ready'; layer: object; usesDosBackground?: true } | { status: 'unavailable' }> => ({ status: 'unavailable' }));
    const prepareWindowsSprites = vi.fn(async (_sprites: unknown): Promise<Map<object, object> | null> => null);
    const prepareWindowsObjects = vi.fn(async (_level: unknown): Promise<Map<object, object> | null> => null);
    const prepareWindowsPanel = vi.fn(async (): Promise<{ panel: object[]; nativePanel: object[]; skillIcons: string[] } | null> => null);
    const resources = { getLevel: vi.fn(async () => level), getSoundTrack: vi.fn(), getMusicPlayer: vi.fn(async () => music) };
    const config = { level: { groups: ['Fun'], order: [[0, 1]], getGroupLength: () => 2 } };
    const getGame = vi.fn(async () => game);
    const replace = vi.fn(async () => undefined);
    const route = { params: { gameType: '1' }, query: {} as Record<string, string | number> };
    const verifyHints = vi.fn(async (): Promise<'verified' | 'different' | 'unavailable'> => 'verified');
    const verifyWindowsHints = vi.fn(async (): Promise<'verified' | 'different' | 'unavailable'> => 'verified');
    const exampleMove = vi.fn(async (): Promise<{ x: number; y: number; skill: number; gameSeconds: number } | null> => ({ x: 100, y: 60, skill: 8, gameSeconds: 5 }));
    return { timer, level, display, stage, game, skills, resources, music, midiContext, midiSynth, getWindowsAudioFile, prepareWindowsTerrain, prepareWindowsSprites, prepareWindowsObjects, prepareWindowsPanel, config, getGame, replace, route, endEvent, soundEvent, effects, assignmentEvent, nukeRequest, fastForwardRequest, verifyHints, verifyWindowsHints, exampleMove, graphicsError, zoomChange };
});

vi.mock('vue-router', () => ({
    useRoute: () => reactive(mock.route),
    useRouter: () => ({ replace: mock.replace }),
}));
vi.mock('@/game/view/stage', () => ({ Stage: vi.fn(function () { return mock.stage; }) }));
vi.mock('@/game/view/keyboard-targeting', () => ({ KeyboardTargeting: vi.fn(function () { return { reset: vi.fn(), dispose: vi.fn() }; }) }));
vi.mock('@/game/solutions/hint-compatibility', () => ({ verifyHintData: mock.verifyHints, verifyWindowsHintData: mock.verifyWindowsHints }));
vi.mock('@/game/solutions/example-first-move', () => ({ getExampleFirstMove: mock.exampleMove }));
vi.mock('@/game/resources/sound/sound-effects-player', () => ({ SoundEffectsPlayer: vi.fn(function () { return mock.effects; }) }));
vi.mock('webaudio-tinysynth', () => ({ default: vi.fn(function () { return mock.midiSynth; }) }));
vi.mock('@/game/resources/file/game-file-store', () => ({ getWindowsAudioFile: mock.getWindowsAudioFile }));
vi.mock('@/game/resources/prepare-windows-terrain', () => ({ prepareWindowsTerrain: mock.prepareWindowsTerrain }));
vi.mock('@/game/resources/prepare-windows-sprites', () => ({ prepareWindowsSprites: mock.prepareWindowsSprites }));
vi.mock('@/game/resources/prepare-windows-objects', () => ({ prepareWindowsObjects: mock.prepareWindowsObjects }));
vi.mock('@/game/resources/windows-panel', () => ({ prepareWindowsPanel: mock.prepareWindowsPanel }));
vi.mock('@/game/game-factory', () => ({ GameFactory: vi.fn(function () {
    return { getConfig: async () => mock.config, getGameResources: async () => mock.resources, getGame: mock.getGame };
}) }));

async function flushPromises() {
    for (let index = 0; index < 8; index++) await Promise.resolve();
    await nextTick();
}

const mountedViews = new Set<() => void>();

function mountView() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const app = createApp(GameView);
    app.component('RouterLink', defineComponent({ setup: (_props, { slots }) => () => h('a', slots.default?.()) }));
    app.mount(container);
    const unmount = () => {
        if (!mountedViews.delete(unmount)) return;
        app.unmount();
        container.remove();
    };
    mountedViews.add(unmount);
    return { container, unmount };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent?.trim() === label);
    if (!found) throw new Error(`Button ${label} not found`);
    return found;
}

function midiFixture(): ArrayBuffer {
    return new Uint8Array([
        0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
        0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12,
        0, 0x90, 60, 100, 48, 0x80, 60, 0, 0, 0xff, 0x2f, 0,
    ]).buffer;
}

describe('game view lifecycle', () => {
    afterEach(() => {
        for (const unmount of mountedViews) unmount();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mock.timer.running = false;
        mock.timer.speedFactor = 1;
        mock.route.params.gameType = '1';
        mock.route.query = {};
        mock.getGame.mockImplementation(async () => mock.game);
        mock.skills.getSkill.mockImplementation(() => 10);
        mock.verifyHints.mockResolvedValue('verified');
        mock.verifyWindowsHints.mockResolvedValue('verified');
        mock.exampleMove.mockResolvedValue({ x: 100, y: 60, skill: 8, gameSeconds: 5 });
        mock.resources.getLevel.mockImplementation(async () => mock.level);
        mock.resources.getMusicPlayer.mockImplementation(async () => mock.music);
        mock.midiContext.state = 'running';
        mock.getWindowsAudioFile.mockReset().mockResolvedValue(undefined);
        mock.prepareWindowsTerrain.mockReset().mockResolvedValue({ status: 'unavailable' });
        mock.prepareWindowsSprites.mockReset().mockResolvedValue(null);
        mock.prepareWindowsObjects.mockReset().mockResolvedValue(null);
        mock.prepareWindowsPanel.mockReset().mockResolvedValue(null);
        mock.level.getWindowsTerrain.mockReset().mockReturnValue(undefined);
    });

    it('provides the live saved count and exact target in the game canvas description, including fullscreen', async () => {
        const wrapper = mountView(); await flushPromises();
        const canvas = wrapper.container.querySelector<HTMLCanvasElement>('canvas[aria-label^="Lemmings level"]')!;
        const objective = () => wrapper.container.querySelector<HTMLElement>('#game-objective')!;
        expect(canvas.getAttribute('aria-describedby')?.split(' ')).toContain('game-objective');
        expect(objective().textContent).toContain('Saved 0. Save at least 8 of 10 lemmings.');
        expect(objective().hasAttribute('aria-live')).toBe(false);
        expect(objective().hasAttribute('role')).toBe(false);
        button(wrapper.container, 'Start level').click(); await flushPromises();
        expect(objective().textContent).toContain('Saved 3. Save at least 8 of 10 lemmings.');
        button(wrapper.container, 'Fullscreen').click(); await flushPromises();
        expect(wrapper.container.querySelector('.game-screen.is-fullscreen')).not.toBeNull();
        expect(wrapper.container.querySelector('.game-screen #game-objective')).toBe(objective());
        expect(wrapper.container.querySelector('.game-header')?.hasAttribute('inert')).toBe(true);
        wrapper.unmount();
    });

    it('explains when Windows art is missing without preventing the level from starting', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        const wrapper = mountView(); await flushPromises();
        expect(wrapper.container.textContent).toContain('Windows artwork is unavailable.');
        expect(button(wrapper.container, 'Start level').disabled).toBe(false);
        button(wrapper.container, 'Start level').click(); await flushPromises();
        expect(mock.game.start).toHaveBeenCalledOnce();
    });

    it('connects the Windows fast-forward icon to speed, settings and panel state', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        mock.prepareWindowsPanel.mockResolvedValue({ panel: Array(13).fill({}), nativePanel: Array(13).fill({}), skillIcons: [] });
        const wrapper = mountView(); await flushPromises();
        button(wrapper.container, 'Start level').click(); await flushPromises();
        expect(mock.game.setFastForwardActive).toHaveBeenLastCalledWith(false);
        mock.fastForwardRequest.handler?.(); await nextTick();
        expect(mock.timer.speedFactor).toBe(4);
        expect(mock.game.setFastForwardActive).toHaveBeenLastCalledWith(true);
        expect(JSON.parse(localStorage.getItem('lemmings.settings.v1')!).speed).toBe(4);
        button(wrapper.container, 'Pause game').click(); await nextTick();
        const select = wrapper.container.querySelector<HTMLSelectElement>('.speed select')!;
        select.value = '2'; select.dispatchEvent(new Event('change', { bubbles: true })); await nextTick();
        expect(mock.timer.speedFactor).toBe(2);
        expect(mock.game.setFastForwardActive).toHaveBeenLastCalledWith(true);
        button(wrapper.container, 'Resume').click(); await nextTick();
        mock.fastForwardRequest.handler?.(); await nextTick();
        expect(mock.timer.speedFactor).toBe(1);
        expect(mock.game.setFastForwardActive).toHaveBeenLastCalledWith(false);
        wrapper.unmount();
    });

    it('keeps extra Windows controls tucked away while a second panel press confirms nuke', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        mock.prepareWindowsPanel.mockResolvedValue({ panel: Array(13).fill({}), nativePanel: Array(13).fill({}), skillIcons: [] });
        const wrapper = mountView(); await flushPromises();
        button(wrapper.container, 'Start level').click(); await flushPromises();
        const toolbar = wrapper.container.querySelector<HTMLElement>('.game-toolbar')!;
        const skills = wrapper.container.querySelector<HTMLElement>('.skill-section')!;
        const audio = wrapper.container.querySelector<HTMLElement>('.audio-controls')!;
        const hints = wrapper.container.querySelector<HTMLElement>('.hints')!;
        const screen = wrapper.container.querySelector<HTMLElement>('.game-screen')!;
        expect(toolbar.classList.contains('windows-hidden-controls')).toBe(true);
        expect(skills.classList.contains('windows-hidden-controls')).toBe(true);
        expect(audio.classList.contains('windows-hidden-controls')).toBe(true);
        expect(hints.classList.contains('windows-hidden-controls')).toBe(true);
        expect(screen.classList.contains('native-windows-playing')).toBe(true);
        expect(button(wrapper.container, 'Pause game')).toBeDefined();
        expect(button(wrapper.container, 'Dig10')).toBeDefined();
        mock.nukeRequest.handler?.(); await nextTick();
        expect(toolbar.classList.contains('windows-hidden-controls')).toBe(true);
        expect(skills.classList.contains('windows-hidden-controls')).toBe(true);
        expect(audio.classList.contains('windows-hidden-controls')).toBe(true);
        expect(hints.classList.contains('windows-hidden-controls')).toBe(true);
        expect(screen.classList.contains('native-windows-playing')).toBe(true);
        expect(wrapper.container.querySelector('.native-nuke-notice')?.textContent).toContain('Press Nuke again to confirm');
        expect(mock.game.queueCommand).not.toHaveBeenCalledWith(expect.any(CommandNuke));
        mock.nukeRequest.handler?.(); await nextTick();
        expect(mock.game.queueCommand).toHaveBeenCalledWith(expect.any(CommandNuke));
        expect(wrapper.container.querySelector('.native-nuke-notice')).toBeNull();
        expect(skills.classList.contains('windows-hidden-controls')).toBe(true);
        button(wrapper.container, 'Pause game').click(); await nextTick();
        expect(toolbar.classList.contains('windows-hidden-controls')).toBe(false);
        expect(skills.classList.contains('windows-hidden-controls')).toBe(false);
        expect(hints.classList.contains('windows-hidden-controls')).toBe(false);
        expect(screen.classList.contains('native-windows-playing')).toBe(false);
        expect(button(wrapper.container, 'Resume')).toBeDefined();
        expect(wrapper.container.querySelector('#pause-menu')?.textContent).toContain('Save at least');
        expect(button(wrapper.container, 'Button animations on').getAttribute('aria-pressed')).toBe('true');
        button(wrapper.container, 'Button animations on').click(); await nextTick();
        expect(button(wrapper.container, 'Button animations off').getAttribute('aria-pressed')).toBe('false');
        expect(mock.game.setWindowsIconAnimationsEnabled).toHaveBeenLastCalledWith(false);
        expect(localStorage.getItem('lemmings.windows-icon-animations.v1')).toBe('off');
        expect(mock.stage.setMinimapProvider).toHaveBeenCalledWith(expect.any(Function));
        button(wrapper.container, 'Move view left').click();
        button(wrapper.container, 'Move view right').click();
        expect(mock.stage.panGameBy).toHaveBeenNthCalledWith(1, -200);
        expect(mock.stage.panGameBy).toHaveBeenNthCalledWith(2, 200);
        wrapper.unmount();
    });

    it('keeps the animation choice for this visit and warns when saving it fails', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        mock.prepareWindowsPanel.mockResolvedValue({ panel: Array(13).fill({}), nativePanel: Array(13).fill({}), skillIcons: [] });
        const wrapper = mountView(); await flushPromises();
        button(wrapper.container, 'Start level').click(); await flushPromises();
        button(wrapper.container, 'Pause game').click(); await nextTick();
        const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
        try {
            button(wrapper.container, 'Button animations on').click(); await nextTick();
            expect(button(wrapper.container, 'Button animations off').getAttribute('aria-pressed')).toBe('false');
            expect(mock.game.setWindowsIconAnimationsEnabled).toHaveBeenLastCalledWith(false);
            expect(wrapper.container.textContent).toContain('Progress or preferences could not be saved on this device.');
        } finally { blocked.mockRestore(); wrapper.unmount(); }
    });

    it('expires a native Windows nuke press and clears it on pause, Escape and level change', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        mock.prepareWindowsPanel.mockResolvedValue({ panel: Array(13).fill({}), nativePanel: Array(13).fill({}), skillIcons: [] });
        const wrapper = mountView(); await flushPromises();
        button(wrapper.container, 'Start level').click(); await flushPromises();
        vi.useFakeTimers();
        const setTimer = vi.spyOn(globalThis, 'setTimeout');
        const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
        try {
            mock.nukeRequest.handler?.(); await nextTick();
            expect(wrapper.container.querySelector('.native-nuke-notice')).not.toBeNull();
            vi.advanceTimersByTime(3000); await nextTick();
            expect(wrapper.container.querySelector('.native-nuke-notice')).toBeNull();
            mock.nukeRequest.handler?.(); await nextTick();
            expect(mock.game.queueCommand).not.toHaveBeenCalledWith(expect.any(CommandNuke));
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await nextTick();
            expect(wrapper.container.querySelector('.native-nuke-notice')).toBeNull();
            mock.nukeRequest.handler?.(); await nextTick();
            button(wrapper.container, 'Pause game').click(); await nextTick();
            expect(wrapper.container.querySelector('.native-nuke-notice')).toBeNull();
            expect(button(wrapper.container, 'Nuke')).toBeDefined();
            button(wrapper.container, 'Resume').click(); await nextTick();
            mock.nukeRequest.handler?.(); await nextTick();
            const nukeTimerIndex = setTimer.mock.calls.map(call => call[1]).lastIndexOf(3000);
            expect(nukeTimerIndex).toBeGreaterThanOrEqual(0);
            const nukeTimer = setTimer.mock.results[nukeTimerIndex].value;
            reactive(mock.route).query = { group: 0, level: 1 }; await flushPromises();
            expect(clearTimer).toHaveBeenCalledWith(nukeTimer);
        } finally { wrapper.unmount(); vi.restoreAllMocks(); vi.useRealTimers(); }
    });

    it.each([null, { panel: Array(12).fill({}), nativePanel: Array(12).fill({}), skillIcons: [] }])(
        'keeps the normal controls available if the Windows fast-forward panel is missing', async panel => {
            localStorage.setItem('lemmings.game-mode.v1', 'windows');
            mock.prepareWindowsPanel.mockResolvedValue(panel);
            const wrapper = mountView(); await flushPromises();
            button(wrapper.container, 'Start level').click(); await flushPromises();
            expect(wrapper.container.querySelector('.game-toolbar')!.classList.contains('windows-hidden-controls')).toBe(false);
            expect(wrapper.container.querySelector('.skill-section')!.classList.contains('windows-hidden-controls')).toBe(false);
            expect(wrapper.container.textContent).toContain('reimport your Windows ISO');
            expect(button(wrapper.container, 'Pause')).toBeDefined();
            expect(mock.stage.setMinimapProvider).not.toHaveBeenCalledWith(expect.any(Function));
            wrapper.unmount();
        });

    it('prepares native terrain and sprite mapping before the game clock starts', async () => {
        const layer = { marker: 'native terrain' }, sprites = new Map(), objectFrame = {}, objectImage = {};
        mock.prepareWindowsTerrain.mockResolvedValue({ status: 'ready', layer });
        mock.prepareWindowsSprites.mockResolvedValue(sprites);
        mock.prepareWindowsObjects.mockResolvedValue(new Map([[objectFrame, objectImage]]));
        mock.level.getWindowsTerrain.mockReturnValue(layer as never);
        Object.assign(mock.game, { getLemmingsSprite: vi.fn(() => ({})) });
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        const wrapper = mountView(); await flushPromises();
        expect(mock.level.setWindowsTerrain).toHaveBeenCalledWith(layer);
        button(wrapper.container, 'Start level').click(); await flushPromises();
        expect(mock.display.setNativeSprites).toHaveBeenCalledWith(sprites);
        expect(sprites.get(objectFrame)).toBe(objectImage);
        expect(mock.level.setWindowsTerrain.mock.invocationCallOrder.at(-1)!).toBeLessThan(mock.game.start.mock.invocationCallOrder[0]);
    });

    it('does not apply a late graphics load to a changed level', async () => {
        let finish!: (value: { status: 'ready'; layer: object; usesDosBackground?: true }) => void;
        mock.prepareWindowsTerrain.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ status: 'ready', layer: { marker: 'special' }, usesDosBackground: true });
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        const wrapper = mountView(); await flushPromises();
        reactive(mock.route).query = { group: 0, level: 1 }; await flushPromises();
        const stale = { marker: 'stale' }; finish({ status: 'ready', layer: stale }); await flushPromises();
        expect(mock.level.setWindowsTerrain).not.toHaveBeenCalledWith(stale);
        expect(wrapper.container.textContent).toContain('This special level uses its DOS background with Windows characters and objects.');
    });

    it('cancels a pending Windows MIDI track on mute without starting it or falling back', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        let finish!: (value: ArrayBuffer | undefined) => void;
        mock.getWindowsAudioFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        expect(mock.getWindowsAudioFile).toHaveBeenCalledOnce();
        button(wrapper.container, 'Music on').click();
        finish(midiFixture());
        await flushPromises();
        expect(mock.midiSynth.playMIDI).not.toHaveBeenCalled();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
    });

    it('keeps pending Windows MIDI silent while paused and resumes it on request', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        let finish!: (value: ArrayBuffer | undefined) => void;
        mock.getWindowsAudioFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(midiFixture());
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        button(wrapper.container, 'Pause').click();
        await nextTick();
        finish(midiFixture());
        await flushPromises();
        expect(mock.midiSynth.playMIDI).not.toHaveBeenCalled();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        button(wrapper.container, 'Resume').click();
        await flushPromises();
        expect(mock.midiSynth.playMIDI).toHaveBeenCalledOnce();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
    });

    it('does not let an older MIDI load cancel a resume that is still loading', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        const finish: Array<(value: ArrayBuffer | undefined) => void> = [];
        mock.getWindowsAudioFile.mockImplementation(() => new Promise(resolve => { finish.push(resolve); }));
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        button(wrapper.container, 'Pause').click();
        await nextTick();
        button(wrapper.container, 'Resume').click();
        await flushPromises();
        expect(finish).toHaveLength(2);
        finish[0](midiFixture());
        await flushPromises();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        finish[1](midiFixture());
        await flushPromises();
        expect(mock.midiSynth.playMIDI).toHaveBeenCalledOnce();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
    });

    it('does not request DOS audio when a resumed Windows MIDI track is unavailable', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        let finish!: (value: ArrayBuffer | undefined) => void;
        mock.getWindowsAudioFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(undefined);
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        button(wrapper.container, 'Pause').click();
        await nextTick();
        finish(undefined);
        await flushPromises();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        button(wrapper.container, 'Resume').click();
        await flushPromises();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        expect(mock.music.play).not.toHaveBeenCalled();
    });

    it('does not start a delayed Windows MIDI track after navigating to another level', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        let finish!: (value: ArrayBuffer | undefined) => void;
        mock.getWindowsAudioFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        reactive(mock.route).query = { group: 0, level: 1 };
        await flushPromises();
        finish(midiFixture());
        await flushPromises();
        expect(mock.midiSynth.playMIDI).not.toHaveBeenCalled();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        expect(mock.resources.getLevel).toHaveBeenLastCalledWith(0, 1);
    });

    it('keeps a delayed Windows MIDI preview silent while the tab is hidden', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        let finish!: (value: ArrayBuffer | undefined) => void;
        mock.getWindowsAudioFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(midiFixture());
        const original = Object.getOwnPropertyDescriptor(document, 'hidden');
        const wrapper = mountView();
        try {
            await flushPromises();
            button(wrapper.container, 'Music off').click();
            await flushPromises();
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            finish(midiFixture());
            await flushPromises();
            expect(mock.midiSynth.playMIDI).not.toHaveBeenCalled();
            expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
            await flushPromises();
            expect(mock.midiSynth.playMIDI).toHaveBeenCalledOnce();
            expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        } finally {
            if (original) Object.defineProperty(document, 'hidden', original);
            else delete (document as { hidden?: boolean }).hidden;
            wrapper.unmount();
        }
    });

    it('offers reset when stage zoom changes and keeps it available across levels', async () => {
        const wrapper = mountView();
        await flushPromises();
        expect(button(wrapper.container, 'Reset zoom').disabled).toBe(true);
        mock.zoomChange.handler?.(true);
        await nextTick();
        expect(button(wrapper.container, 'Reset zoom').disabled).toBe(false);
        button(wrapper.container, 'Next level').click();
        await flushPromises();
        expect(button(wrapper.container, 'Reset zoom').disabled).toBe(false);
        button(wrapper.container, 'Reset zoom').click();
        expect(mock.stage.resetZoom).toHaveBeenCalledOnce();
        mock.zoomChange.handler?.(false);
        await nextTick();
        expect(button(wrapper.container, 'Reset zoom').disabled).toBe(true);
        wrapper.unmount();
        expect(mock.stage.onZoomChange.off).toHaveBeenCalledOnce();
    });

    it('persists the sound toggle and silences effects on pause and teardown', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        mock.soundEvent.handler?.(3);
        expect(mock.effects.play).not.toHaveBeenCalled();

        button(wrapper.container, 'Sound off').click();
        await nextTick();
        expect(JSON.parse(localStorage.getItem('lemmings.settings.v1')!).soundEnabled).toBe(true);
        mock.soundEvent.handler?.(3);
        expect(mock.effects.play).toHaveBeenCalledWith(3);
        button(wrapper.container, 'Pause').click();
        await nextTick();
        expect(mock.effects.stop).toHaveBeenCalled();
        mock.effects.play.mockClear();
        mock.soundEvent.handler?.(15);
        expect(mock.effects.play).not.toHaveBeenCalled();
        button(wrapper.container, 'Sound on').click();
        await nextTick();
        expect(JSON.parse(localStorage.getItem('lemmings.settings.v1')!).soundEnabled).toBe(false);
        wrapper.unmount();
        expect(mock.effects.stop).toHaveBeenCalled();
    });

    it('pauses, resumes, and stops the old game and music when the route changes', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        expect(mock.timer.isRunning()).toBe(true);
        button(wrapper.container, 'Pause').click();
        await nextTick();
        expect(mock.timer.isRunning()).toBe(false);
        button(wrapper.container, 'Resume').click();
        await nextTick();
        expect(mock.timer.isRunning()).toBe(true);
        expect(wrapper.container.querySelector('nav[aria-label="Level navigation"]')).toBeNull();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        reactive(mock.route).query = { group: 0, level: 1 };
        await flushPromises();
        expect(mock.game.stop).toHaveBeenCalledOnce();
        expect(mock.music.stop).toHaveBeenCalledOnce();
        expect(wrapper.container.textContent).toContain('Level 2');
        expect(mock.resources.getLevel).toHaveBeenLastCalledWith(0, 1);
        expect(button(wrapper.container, 'Start level').disabled).toBe(false);
        wrapper.unmount();
        expect(mock.stage.dispose).toHaveBeenCalledOnce();
    });

    it('moves focus to the pause menu and returns it when Escape or Back resumes', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();

        for (const key of ['Escape', 'BrowserBack']) {
            button(wrapper.container, 'Pause').focus();
            button(wrapper.container, 'Pause').click();
            await nextTick();
            const menu = wrapper.container.querySelector<HTMLElement>('[role="region"][aria-labelledby="pause-menu-heading"]');
            expect(menu).not.toBeNull();
            expect(document.activeElement).toBe(menu!.querySelector('h2'));
            expect(menu!.textContent).toContain('Level selection');
            expect(mock.timer.isRunning()).toBe(false);

            window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            await nextTick();
            expect(mock.timer.isRunning()).toBe(true);
            expect(wrapper.container.querySelector('#pause-menu')).toBeNull();
            expect(document.activeElement).toBe(button(wrapper.container, 'Pause'));
        }
        wrapper.unmount();
    });

    it('loads the URL level when the router reuses a running game view', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        const route = reactive(mock.route);
        route.query = { group: 0, level: 1 };
        await flushPromises();
        expect(mock.game.stop).toHaveBeenCalledOnce();
        expect(mock.music.stop).toHaveBeenCalledOnce();
        expect(mock.resources.getLevel).toHaveBeenLastCalledWith(0, 1);
        expect(wrapper.container.textContent).toContain('Level 2');
        expect(button(wrapper.container, 'Start level').disabled).toBe(false);
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        expect(mock.getGame).toHaveBeenLastCalledWith(1, 0, 1);

        route.params.gameType = '2';
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        expect(mock.getGame).toHaveBeenLastCalledWith(2, 0, 1);
        expect(wrapper.container.textContent).not.toContain('Show a hint');
        wrapper.unmount();
    });

    it('does not reload again for its own level-navigation URL update', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Next level').click();
        await flushPromises();
        expect(mock.resources.getLevel).toHaveBeenCalledTimes(2);
        reactive(mock.route).query = { group: 0, level: 1 };
        await flushPromises();
        expect(mock.resources.getLevel).toHaveBeenCalledTimes(2);
        wrapper.unmount();
    });

    it('ignores a level load superseded by later route navigation', async () => {
        const wrapper = mountView();
        await flushPromises();
        let finish!: (level: typeof mock.level) => void;
        mock.resources.getLevel.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const route = reactive(mock.route);
        route.query = { level: 1 };
        await flushPromises();
        route.query = { level: 0 };
        await flushPromises();
        finish({ ...mock.level, name: 'Old level result' });
        await flushPromises();
        expect(wrapper.container.querySelector('h1')!.textContent).toBe('Just dig!');
        expect(mock.resources.getLevel).toHaveBeenLastCalledWith(0, 0);
        expect(button(wrapper.container, 'Start level').disabled).toBe(false);
        wrapper.unmount();
    });

    it('does not preview the old soundtrack while a different level is loading', async () => {
        const wrapper = mountView();
        expect(button(wrapper.container, 'Music off').disabled).toBe(true);
        await flushPromises();
        let finish!: (level: typeof mock.level) => void;
        mock.resources.getLevel.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        button(wrapper.container, 'Next level').click();
        await flushPromises();
        expect(button(wrapper.container, 'Music off').disabled).toBe(true);
        button(wrapper.container, 'Music off').click();
        expect(mock.resources.getMusicPlayer).not.toHaveBeenCalled();
        finish(mock.level);
        await flushPromises();
        expect(button(wrapper.container, 'Music off').disabled).toBe(false);
        button(wrapper.container, 'Music off').click();
        await flushPromises();
        expect(mock.resources.getMusicPlayer).toHaveBeenCalledWith(1);
        wrapper.unmount();
    });

    it.each(['0.5', 'Infinity', 'NaN', '-1'])('normalizes invalid level indices in links (%s)', async index => {
        mock.route.query = { group: index, level: index };
        const wrapper = mountView();
        await flushPromises();
        expect(mock.resources.getLevel).toHaveBeenCalledWith(0, 0);
        expect(button(wrapper.container, 'Start level').disabled).toBe(false);
        wrapper.unmount();
    });

    it('restarts the paused level and starts the new game', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        button(wrapper.container, 'Pause').click();
        await nextTick();
        button(wrapper.container, 'Restart level').click();
        await flushPromises();
        expect(mock.game.stop).toHaveBeenCalledOnce();
        expect(mock.getGame).toHaveBeenCalledTimes(2);
        expect(mock.game.start).toHaveBeenCalledTimes(2);
        expect(mock.timer.isRunning()).toBe(true);
        expect(wrapper.container.querySelector('#pause-menu')).toBeNull();
        expect(document.activeElement).toBe(button(wrapper.container, 'Pause'));
        wrapper.unmount();
    });

    it('stops a game that finishes loading after the view is closed', async () => {
        let resolveGame!: (game: typeof mock.game) => void;
        mock.getGame.mockImplementation(() => new Promise(resolve => { resolveGame = resolve; }));
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        wrapper.unmount();
        resolveGame(mock.game);
        await flushPromises();
        expect(mock.game.stop).toHaveBeenCalledOnce();
        expect(mock.game.start).not.toHaveBeenCalled();
    });

    it('pauses on backgrounding and requires the player to resume', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        const original = Object.getOwnPropertyDescriptor(document, 'hidden');
        try {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await nextTick();
            expect(mock.timer.isRunning()).toBe(false);
            expect(button(wrapper.container, 'Resume')).toBeDefined();
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
            expect(mock.timer.isRunning()).toBe(false);
            button(wrapper.container, 'Resume').click();
            expect(mock.timer.isRunning()).toBe(true);
        } finally {
            if (original) Object.defineProperty(document, 'hidden', original);
            else delete (document as { hidden?: boolean }).hidden;
            wrapper.unmount();
        }
    });

    it('keeps a game paused when startup finishes in a hidden tab', async () => {
        let finish!: (game: typeof mock.game) => void;
        mock.getGame.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const wrapper = mountView();
        const original = Object.getOwnPropertyDescriptor(document, 'hidden');
        try {
            await flushPromises();
            button(wrapper.container, 'Start level').click();
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            finish(mock.game);
            await flushPromises();
            expect(mock.timer.isRunning()).toBe(false);
            expect(button(wrapper.container, 'Resume')).toBeDefined();
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
            expect(mock.timer.isRunning()).toBe(false);
            button(wrapper.container, 'Resume').click();
            expect(mock.timer.isRunning()).toBe(true);
        } finally {
            if (original) Object.defineProperty(document, 'hidden', original);
            else delete (document as { hidden?: boolean }).hidden;
            wrapper.unmount();
        }
    });

    it.each([false, true])('suspends soundtrack previews in a hidden tab, including delayed loading (%s)', async delayed => {
        let finish!: (player: typeof mock.music) => void;
        if (delayed) mock.resources.getMusicPlayer.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const wrapper = mountView();
        const original = Object.getOwnPropertyDescriptor(document, 'hidden');
        try {
            await flushPromises();
            button(wrapper.container, 'Music off').click();
            await flushPromises();
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            if (delayed) { finish(mock.music); await flushPromises(); }
            expect(mock.music.suspend).toHaveBeenCalled();
            mock.music.play.mockClear();
            Object.defineProperty(document, 'hidden', { configurable: true, value: false });
            document.dispatchEvent(new Event('visibilitychange'));
            expect(mock.music.play).toHaveBeenCalledOnce();
            expect(mock.game.start).not.toHaveBeenCalled();
        } finally {
            if (original) Object.defineProperty(document, 'hidden', original);
            else delete (document as { hidden?: boolean }).hidden;
            wrapper.unmount();
        }
    });

    it('stores a successful level result and stops its timer', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        mock.endEvent.handler?.({ state: GameStateTypes.SUCCEEDED, survivorPercentage: 80 });
        await nextTick();
        expect(mock.timer.isRunning()).toBe(false);
        expect(wrapper.container.textContent).toContain('Level complete! You saved 80%.');
        expect(readProgress()).toEqual([{ gameType: 1, groupIndex: 0, levelIndex: 0, bestSavedPercent: 80 }]);
        button(wrapper.container, 'Next level').click();
        await flushPromises();
        expect(wrapper.container.textContent).toContain('Level 2');
        wrapper.unmount();
    });

    it('shows the objective, selects an available initial skill and reports failed assignments', async () => {
        mock.skills.getSkill.mockImplementation((type: number) => type === 8 ? 10 : 0);
        const wrapper = mountView();
        await flushPromises();
        expect(wrapper.container.textContent).toContain('Save at least 8 of 10 lemmings');
        expect(wrapper.container.textContent).toContain('5 minutes');
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        expect(mock.game.queueCommand).toHaveBeenCalledWith(expect.objectContaining({ skill: 8 }));
        expect(wrapper.container.textContent).toContain('Saved 3');
        expect(button(wrapper.container, 'Climb0').disabled).toBe(true);
        mock.assignmentEvent.handler?.('rejected');
        await nextTick();
        expect(wrapper.container.textContent).toContain('That lemming cannot use this skill right now.');
        mock.assignmentEvent.handler?.('assigned');
        await nextTick();
        expect(wrapper.container.textContent).not.toContain('That lemming cannot use this skill right now.');
        wrapper.unmount();
    });

    it('shares nuke confirmation between the classic panel and web controls', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Start level').click();
        await flushPromises();
        mock.nukeRequest.handler?.();
        await nextTick();
        expect(button(wrapper.container, 'Confirm nuke')).toBeDefined();
        expect(wrapper.container.textContent).toContain('Nuke will bomb all lemmings');
        expect(mock.game.queueCommand).not.toHaveBeenCalled();
        button(wrapper.container, 'Confirm nuke').click();
        await nextTick();
        expect(mock.game.queueCommand).toHaveBeenCalledOnce();
        expect(button(wrapper.container, 'Nuke').disabled).toBe(true);
        mock.nukeRequest.handler?.();
        expect(mock.game.queueCommand).toHaveBeenCalledOnce();
        wrapper.unmount();
    });

    it('warns without blocking play if the device refuses to save progress', async () => {
        const failedSave = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
        const wrapper = mountView();
        try {
            await flushPromises();
            expect(wrapper.container.textContent).toContain('Progress or preferences could not be saved on this device.');
            expect(button(wrapper.container, 'Start level').disabled).toBe(false);
            button(wrapper.container, 'Start level').click();
            await flushPromises();
            expect(mock.timer.isRunning()).toBe(true);
        } finally {
            wrapper.unmount();
            failedSave.mockRestore();
        }
    });

    it('reports a graphics failure and retains the DOS fallback', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        const wrapper = mountView(); await flushPromises();
        mock.graphicsError.handler?.('Windows graphics are unavailable. DOS graphics have been restored.');
        await nextTick();
        expect(wrapper.container.textContent).toContain('DOS graphics have been restored.');
        expect(mock.display.setNativeSprites).toHaveBeenLastCalledWith(null);
        wrapper.unmount();
    });

    it('reveals verified hints one at a time and hides them on level change', async () => {
        const wrapper = mountView();
        await flushPromises();
        expect(wrapper.container.textContent).not.toContain('Look for a place to dig');
        button(wrapper.container, 'Show a hint').click();
        await nextTick();
        expect(wrapper.container.textContent).toContain('Look for a place to dig');
        expect(wrapper.container.textContent).not.toContain('Make the first lemming');
        button(wrapper.container, 'Another hint').click();
        await nextTick();
        expect(wrapper.container.textContent).toContain('Make the first lemming');
        button(wrapper.container, 'Next level').click();
        await flushPromises();
        expect(wrapper.container.textContent).not.toContain('Look for a place to dig');
        expect(wrapper.container.textContent).not.toContain('What could protect a lemming');
        expect(button(wrapper.container, 'Show a hint')).toBeDefined();
        wrapper.unmount();
    });

    it('hides hints for different data and ignores a late result from the previous level', async () => {
        let resolveFirst!: (value: 'verified' | 'different' | 'unavailable') => void;
        mock.verifyHints.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
        mock.verifyHints.mockResolvedValue('different');
        const wrapper = mountView();
        await flushPromises();
        expect(wrapper.container.textContent).not.toContain('Show a hint');
        button(wrapper.container, 'Next level').click();
        await flushPromises();
        expect(wrapper.container.textContent).toContain('Hints were verified for a different DOS data set. You can still play this level.');
        resolveFirst('verified');
        await flushPromises();
        expect(wrapper.container.textContent).not.toContain('Show a hint');
        wrapper.unmount();
    });

    it('gates Windows hints and first-move examples on the Windows compatibility result', async () => {
        localStorage.setItem('lemmings.game-mode.v1', 'windows');
        mock.verifyWindowsHints.mockResolvedValueOnce('different');
        const wrapper = mountView(); await flushPromises();
        expect(mock.verifyWindowsHints).toHaveBeenCalledOnce();
        expect(mock.verifyHints).not.toHaveBeenCalled();
        expect(wrapper.container.textContent).toContain('Hints were verified for a different Windows data set.');
        expect(wrapper.container.textContent).not.toContain('Show a hint');
        wrapper.unmount();

        mock.verifyWindowsHints.mockResolvedValue('verified');
        const second = mountView(); await flushPromises();
        button(second.container, 'Show a hint').click(); await nextTick();
        button(second.container, 'Show example first move').click(); await flushPromises();
        expect(mock.exampleMove).toHaveBeenCalledWith(expect.anything(), 0, 0,
            expect.objectContaining({ groupIndex: 0, levelIndex: 0, replay: expect.any(String) }));
        second.unmount();
    });

    it('shows an optional tested example and clears it when hints are hidden', async () => {
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Show a hint').click();
        await nextTick();
        button(wrapper.container, 'Show example first move').click();
        await flushPromises();
        expect(wrapper.container.textContent).toContain('Tested example, not live advice: use Dig near the highlighted spot when the timer shows about 4-55.');
        expect(mock.stage.setExampleHint).toHaveBeenLastCalledWith(expect.objectContaining({ x: 100, y: 60 }));
        button(wrapper.container, 'Hide hints').click();
        await nextTick();
        expect(mock.stage.setExampleHint).toHaveBeenLastCalledWith(null);
        expect(wrapper.container.textContent).not.toContain('Tested example, not live advice');
        wrapper.unmount();
    });

    it('ignores an example that resolves after hints are hidden', async () => {
        let finish!: (value: { x: number; y: number; skill: number; gameSeconds: number }) => void;
        mock.exampleMove.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const wrapper = mountView();
        await flushPromises();
        button(wrapper.container, 'Show a hint').click();
        await nextTick();
        button(wrapper.container, 'Show example first move').click();
        await nextTick();
        button(wrapper.container, 'Hide hints').click();
        finish({ x: 100, y: 60, skill: 8, gameSeconds: 5 });
        await flushPromises();
        expect(mock.stage.setExampleHint).toHaveBeenLastCalledWith(null);
        expect(wrapper.container.textContent).not.toContain('Tested example, not live advice');
        wrapper.unmount();
    });
});
