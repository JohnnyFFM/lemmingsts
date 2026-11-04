import { GameConfig } from './config/game-config';
import { FileContainer } from './resources/file/file-container';
import { FileProvider } from './resources/file/file-provider';
import { MainImageSprites } from './resources/main-image-sprites';
import { MenuFont } from './resources/menu-font';
import { LemmingsSprite } from './resources/lemmings-sprite';
import { ColorPalette } from './resources/lemmings/color-palette';
import { Level } from './resources/level';
import { LevelLoader } from './resources/level-loader';
import { MaskProvider } from './resources/mask-provider';
import { SkillPanelSprites } from './resources/skill-panel-sprites';
import { AudioPlayer } from './resources/sound/audio-player';
import { SoundImageManager } from './resources/sound/sound-image-manager';
import { SoundImagePlayer } from './resources/sound/sound-image-player';
import { getWindowsGameFile } from './resources/file/windows-game-store';
import { getWindowsGraphicsFile } from './resources/file/windows-graphics-store';
import { readWindowsLevelRecord, type WindowsLevelGroup } from './resources/windows-level-database';
import { prepareStandaloneWindowsSprites } from './resources/standalone-windows-sprites';
import { createWindowsLevel } from './resources/windows-level-art';
import { createWindowsMaskProvider } from './resources/windows-mask-provider';

/** represent access to the resources of a Lemmings Game */
export class GameResources {

    private musicPlayer: AudioPlayer | null = null;
    private soundPlayer: AudioPlayer | null = null;
    private soundImage: Promise<SoundImageManager> | null = null;
    private mainDat: Promise<FileContainer> | null = null;

    constructor(private fileProvider: FileProvider, private config: GameConfig, private windowsGroups?: WindowsLevelGroup[]) {

    }

    /** free resources */
    public dispose() {
        this.stopMusic();
        this.stopSound();
        this.soundImage;
    }

    /** return the main.dat file container */
    public getMainDat(): Promise<FileContainer> {
        if (this.mainDat) {
            return this.mainDat;
        }

        this.mainDat = this.fileProvider.loadBinary(this.config.path, 'MAIN.DAT')
            .then((data) => new FileContainer(data))
            .catch((error) => {
                this.mainDat = null;
                throw error;
            });

        return this.mainDat;
    }


    /** return the Lemmings animations */
    public async getLemmingsSprite(colorPalette: ColorPalette): Promise<LemmingsSprite> {
        if (this.windowsGroups) return prepareStandaloneWindowsSprites();
        const container = await this.getMainDat();
        return new LemmingsSprite(container.getPart(0), colorPalette);
    }


    public async getSkillPanelSprite(colorPalette: ColorPalette): Promise<SkillPanelSprites> {
        if (this.windowsGroups) return new SkillPanelSprites(null, null, colorPalette);
        const container = await this.getMainDat();
        return new SkillPanelSprites(container.getPart(2), container.getPart(6), colorPalette);
    }

    public async getMasks(): Promise<MaskProvider> {
        if (this.windowsGroups) {
            const bytes = await getWindowsGraphicsFile('LEMMSMA.SPR');
            if (!bytes) throw new Error('Windows gameplay masks are missing. Please add the Windows files again.');
            return createWindowsMaskProvider(new Uint8Array(bytes));
        }
        const container = await this.getMainDat();
        return new MaskProvider(container.getPart(1));
    }

    /** return images for the games start screen */
    public async getMainImageSprites(): Promise<MainImageSprites> {
        const container = await this.getMainDat();

        return new MainImageSprites(container.getPart(3), container.getPart(4));
    }

    private menuFont: Promise<MenuFont> | null = null;

    /** The purple DOS menu font, decoded once per resource set. */
    public getMenuFont(): Promise<MenuFont> {
        if (!this.menuFont) {
            this.menuFont = this.getMainImageSprites().then(sprites => sprites.getMenuFont()).catch(error => {
                this.menuFont = null;
                throw error;
            });
        }
        return this.menuFont;
    }


    /** return the Level Data for a given Level-Index */
    public async getLevel(levelMode: number, levelIndex: number): Promise<Level | undefined> {
        if (this.windowsGroups) {
            const entry = this.windowsGroups[levelMode]?.levels[levelIndex];
            if (!entry) return undefined;
            const record = await getWindowsGameFile(entry.fileName);
            if (!record) throw new Error(`Windows level file ${entry.fileName} is missing.`);
            const reader = readWindowsLevelRecord(entry, record);
            const style = reader.graphicSet1;
            const [ground, terrain, objects] = await Promise.all([
                getWindowsGameFile(`GROUND${style}O.DAT`),
                getWindowsGraphicsFile(`LEVEL${style}S.SPR`),
                getWindowsGraphicsFile(`LEVEL${style}OS.SPR`),
            ]);
            if (!ground || !terrain || !objects) throw new Error('Windows level artwork is missing. Please add the Windows files again.');
            return createWindowsLevel(reader, levelMode, levelIndex, ground, terrain, objects);
        }
        const levelReader = new LevelLoader(this.fileProvider, this.config);
        return levelReader.getLevel(levelMode, levelIndex);
    }


    /** return the level group names for this game */
    public getLevelGroups(): string[] {
        return this.config.level.groups;
    }


    private initSoundImage(): Promise<SoundImageManager> {
        if (this.soundImage) {
            // cached sound image
            return this.soundImage;
        }

        this.soundImage = this.fileProvider.loadBinary(this.config.path, 'ADLIB.DAT')
            .then((data) => {
                const container = new FileContainer(data);
                return new SoundImageManager(container.getPart(0), this.config.audioConfig);
            })
            .catch((error) => {
                this.soundImage = null;
                throw error;
            });

        return this.soundImage;
    }


    /** stop playback of the music song */
    public stopMusic() {
        if (!this.musicPlayer) {
            return;
        }

        this.musicPlayer.stop();
        this.musicPlayer = null;
    }

    /** return a audio player to playback a music song */
    public async getMusicPlayer(songIndex: number): Promise<AudioPlayer> {
        this.stopMusic();

        const soundImage = await this.initSoundImage();
        /// get track
        const adlibSrc: SoundImagePlayer = soundImage.getMusicTrack(songIndex);

        /// play
        this.musicPlayer = new AudioPlayer(adlibSrc);

        return this.musicPlayer;
    }


    /** stop playback of the music song */
    public stopSound() {
        if (!this.soundPlayer) {
            return;
        }

        this.soundPlayer.stop();
        this.soundPlayer = null;
    }

    /** return a player to playback a sound effect */
    public async getSoundPlayer(soundIndex: number) {

        this.stopSound();

        const soundImage = await this.initSoundImage();

        /// get track
        const adlibSrc: SoundImagePlayer = soundImage.getSoundTrack(soundIndex);

        /// play
        this.soundPlayer = new AudioPlayer(adlibSrc);

        /// return
        return this.soundPlayer;
    }

    /** Decode a sound effect without allocating a Web Audio graph. */
    public async getSoundTrack(soundIndex: number): Promise<SoundImagePlayer> {
        return (await this.initSoundImage()).getSoundTrack(soundIndex);
    }


}

