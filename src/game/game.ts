import { GameResources } from './game-resources';
import { GameResult } from './game-result';
import { GameStateTypes } from './game-state-types';
import { ICommand } from './game-play/commands/command';
import { CommandManager } from './game-play/commands/command-manager';
import { GameSkills } from './game-play/game-skills';
import { GameTimer } from './game-play/game-timer';
import { GameVictoryCondition } from './game-play/game-victory-condition';
import { LemmingManager } from './game-play/lemming-manager';
import { ObjectManager } from './game-play/object-manager';
import { TriggerManager } from './game-play/trigger-manager';
import { SoundEffect } from './game-play/sound-effects';
import { LemmingsSprite } from './resources/lemmings-sprite';
import { Level } from './resources/level';
import { MaskProvider } from './resources/mask-provider';
import { ParticleTable } from './resources/particle-table';
import { SkillPanelSprites } from './resources/skill-panel-sprites';
import { EventHandler } from './utilities/event-handler';
import { LogHandler } from './utilities/log-handler';
import { DisplayImage } from './view/display-image';
import { GameDisplay } from './view/game-display';
import { GameGui } from './view/game-gui';
import type { Frame } from './resources/frame';
import { PlayerAssignmentResult } from './view/player-assignment-result';

/** provides an game object to control the game */
export class Game {

    private log: LogHandler = new LogHandler('Game');

    public level: Level;
    private triggerManager: TriggerManager;
    private lemmingManager: LemmingManager;
    private objectManager: ObjectManager;

    private gameVictoryCondition: GameVictoryCondition;

    private gameGui: GameGui;
    private guiDisplay: DisplayImage | null = null;

    private display: DisplayImage | null = null;
    private gameDisplay: GameDisplay;
    private gameTimer: GameTimer;
    private commandManager: CommandManager;
    private readonly lemmingSprites: LemmingsSprite;

    private skills: GameSkills;
    private showDebug = false;

    public onGameEnd = new EventHandler<GameResult>();
    public readonly onSoundEffect = new EventHandler<SoundEffect>();
    public readonly onPlayerAssignment = new EventHandler<PlayerAssignmentResult>();

    private finalGameState: GameStateTypes = GameStateTypes.UNKNOWN;

    public constructor(
        level: Level,
        masks: MaskProvider, 
        lemSprite: LemmingsSprite,
        skillPanelSprites: SkillPanelSprites
     ) {

        this.gameTimer = new GameTimer(level);
        this.skills = new GameSkills(level);

        this.level = level;
        this.lemmingSprites = lemSprite;

        this.gameVictoryCondition = new GameVictoryCondition(level);
 
        this.commandManager = new CommandManager(this, this.gameTimer);

        this.gameTimer.onGameTick.on(() => {
            this.onGameTimerTick()
        });

        this.triggerManager = new TriggerManager(this.gameTimer);
        this.triggerManager.onSoundEffect.on(effect => {
            if (effect !== undefined) this.onSoundEffect.trigger(effect);
        });
        this.triggerManager.addRange(level.triggers);
        level.setBlockerFieldLookup((x, y) => this.triggerManager.hasBlockerFieldAt(x, y));


        /// setup Lemmings
        const particleTable = new ParticleTable(level.colorPalette);

        this.lemmingManager = new LemmingManager(level, lemSprite, this.triggerManager, this.gameVictoryCondition, masks, particleTable);
        this.lemmingManager.onSoundEffect.on(effect => {
            if (effect !== undefined) this.onSoundEffect.trigger(effect);
        });

        /// setup gui
        this.gameGui = new GameGui(this, skillPanelSprites, this.skills, this.gameTimer, this.gameVictoryCondition);

        if (this.guiDisplay) {
            this.gameGui.setGuiDisplay(this.guiDisplay);
        }

        this.objectManager = new ObjectManager(this.gameTimer);
        this.objectManager.addRange(this.level.objects);

        this.gameDisplay = new GameDisplay(this, this.level, this.lemmingManager, this.objectManager, this.triggerManager);

        if (this.display) {
            this.gameDisplay.setGuiDisplay(this.display);
        }

    }

    public setGameDisplay(display: DisplayImage) {
        this.display = display;

        if (!this.gameDisplay) {
            return;
        }

        this.gameDisplay.setGuiDisplay(display);

        if (this.level) {
            this.display.setScreenPosition(this.level.screenPositionX, 0);
        }
        
     
    }

    public setGuiDisplay(display: DisplayImage) {
        this.guiDisplay = display;

        if (this.gameGui) {
            this.gameGui.setGuiDisplay(display);
        }
    }

    public setNukeRequestHandler(handler: (() => void) | null) {
        this.gameGui.setNukeRequestHandler(handler);
    }

    /** Tell the DOS panel's minimap which part of the level is on screen. */
    public setViewportProvider(provider: (() => { x: number; y: number; width: number; height: number } | null) | null) {
        this.gameGui.setViewportProvider(provider);
    }

    /** Called with level coordinates when the player taps or drags the DOS minimap. */
    public setMinimapNavigationHandler(handler: ((x: number, y: number) => void) | null) {
        this.gameGui.setMinimapNavigationHandler(handler);
    }

    /** Called when the player holds the panel's pause button to open the menu. */
    public setMenuRequestHandler(handler: (() => void) | null) {
        this.gameGui.setMenuRequestHandler(handler);
    }

    /** Called when the player holds the panel's green readout row; a returned label is flashed there. */
    public setFilterRequestHandler(handler: (() => string | void) | null) {
        this.gameGui.setFilterRequestHandler(handler);
    }

    public setFastForwardRequestHandler(handler: (() => void) | null) {
        this.gameGui.setFastForwardRequestHandler(handler);
    }

    public setFastForwardActive(active: boolean) {
        this.gameGui.setFastForwardActive(active);
        this.gameGui.render();
        this.guiDisplay?.redraw();
    }

    public setWindowsIconAnimationsEnabled(enabled: boolean) {
        this.gameGui.setWindowsIconAnimationsEnabled(enabled);
        this.gameGui.render();
        this.guiDisplay?.redraw();
    }

    public setWindowsPanel(icons: readonly Frame[] | null, nativeIcons?: readonly Frame[] | null,
        animations?: readonly (readonly Frame[])[] | null, nativeAnimations?: readonly (readonly Frame[])[] | null) {
        this.gameGui.setWindowsPanel(icons, nativeIcons, animations, nativeAnimations);
    }


    /** load a new game/level */
    public static async loadLevel(gameResources: GameResources, levelGroupIndex: number, levelIndex: number): Promise<Game | undefined> {

        // read level data
        const level = await gameResources.getLevel(levelGroupIndex, levelIndex);

        if (!level) {
            return;
        }

        /// request next resources
        const maskPromise = gameResources.getMasks();
        const lemPromise = gameResources.getLemmingsSprite(level.colorPalette);

        const results = await Promise.all([maskPromise, lemPromise]);

        // query gui elements
        const skillPanelSprites = await gameResources.getSkillPanelSprite(level.colorPalette);

        /// create the game
        return new Game(level, results[0], results[1], skillPanelSprites);

    }


    /** run the game */
    public start() {
        if (this.getGameState() !== GameStateTypes.RUNNING) return;
        this.gameTimer.continue();
    }

    /** end the game */
    public stop() {
        if (this.gameTimer) {
            this.gameTimer.stop();
        }

        this.onGameEnd.dispose();
        this.onSoundEffect.dispose();
        this.onPlayerAssignment.dispose();
        this.gameGui.setNukeRequestHandler(null);
        this.gameGui.setFastForwardRequestHandler(null);
        this.gameGui.setMenuRequestHandler(null);
        this.gameGui.setFilterRequestHandler(null);
        this.gameGui.setMinimapNavigationHandler(null);
        this.gameGui.setViewportProvider(null);
        this.triggerManager.onSoundEffect.dispose();
    }


    /** return the game Timer for this game */
    public getGameTimer(): GameTimer {
        return this.gameTimer;
    }

    /** increase the amount of skills */
    public cheat() {
        if (!this.skills) {
            return;
        }

        this.skills.cheat();
    }

    public getGameSkills(): GameSkills {
        return this.skills;
    }

    public getLemmingManager(): LemmingManager {
        return this.lemmingManager;
    }

    /** Animation frames used by this game, for optional presentation mappings. */
    public getLemmingsSprite(): LemmingsSprite {
        return this.lemmingSprites;
    }

    public getVictoryCondition(): GameVictoryCondition {
        return this.gameVictoryCondition;
    }

    public getCommandManager(): CommandManager {
        return this.commandManager;
    }

    public queueCommand(newCommand: ICommand): boolean {
        if (!this.commandManager || this.getGameState() !== GameStateTypes.RUNNING) {
            return false;
        }

        return this.commandManager.queueCommand(newCommand);
    }

    /** enables / disables the display of debug information */
    public setDebugMode(vale: boolean) {
        this.showDebug = vale;
    }

    /** run one step in game time and render the result */
    private onGameTimerTick() {
        // A result is final, even if a caller resumes the exposed timer.
        if (this.finalGameState !== GameStateTypes.UNKNOWN) {
            this.gameTimer.suspend();
            return;
        }

        /// run game logic
        this.runGameLogic();
        this.checkForGameOver();
        this.render();
    }

    /** return the current state of the game */
    public getGameState(): GameStateTypes {

        if ((!this.gameTimer) || (!this.gameVictoryCondition)) {
            return GameStateTypes.UNKNOWN;
        }

        /// if the game has finished return it's saved state
        if (this.finalGameState != GameStateTypes.UNKNOWN) {
            return this.finalGameState;
        }

        const hasWon = this.gameVictoryCondition.getSurvivorsCount() >= this.gameVictoryCondition.getNeedCount();

        /// are there any lemmings alive?
        if ((this.gameVictoryCondition.getLeftCount() <= 0) && (this.gameVictoryCondition.getOutCount() <= 0)) {
            if (hasWon) {
                return GameStateTypes.SUCCEEDED;
            }
            else {
                return GameStateTypes.FAILED_LESS_LEMMINGS;
            }
        }

        /// is the game out of time?
        if (this.gameTimer.getGameLeftTime() <= 0) {
            if (hasWon) {
                return GameStateTypes.SUCCEEDED;
            }
            else {
                return GameStateTypes.FAILED_OUT_OF_TIME;
            }

        }

        return GameStateTypes.RUNNING;

    }

    /** check if the game  */
    private checkForGameOver() {
        if (!this.gameVictoryCondition) {
            return;
        }

        if (this.finalGameState != GameStateTypes.UNKNOWN) {
            return;
        }

        const state = this.getGameState();

        if ((state != GameStateTypes.RUNNING) && (state != GameStateTypes.UNKNOWN)) {
            this.gameVictoryCondition.doFinalize();
            this.finalGameState = state;
            this.gameTimer.suspend();

            this.onGameEnd.trigger(new GameResult(this));
        }
    }

    /** run the game logic one step in time */
    private runGameLogic() {
        if (!this.lemmingManager) {
            this.log.log('level not loaded!');
            return;
        }

        this.lemmingManager.tick();
    }


    /** refresh display */
    private render() {
        if (this.gameDisplay) {
            this.gameDisplay.render();

            if (this.showDebug) {
                this.gameDisplay.renderDebug();
            }
        }

        if (this.gameGui) {
            this.gameGui.render();
        }

        if (this.guiDisplay) {
            this.guiDisplay.redraw();
        }
    }

}
