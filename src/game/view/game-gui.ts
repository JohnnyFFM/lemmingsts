import { Game } from '../game';
import { CommandNuke } from '../game-play/commands/command-nuke';
import { CommandReleaseRateDecrease } from '../game-play/commands/command-release-rate-decrease';
import { CommandReleaseRateIncrease } from '../game-play/commands/command-release-rate-increase';
import { CommandSelectSkill } from '../game-play/commands/command-select-skill';
import { GameSkills } from '../game-play/game-skills';
import { GameTimer } from '../game-play/game-timer';
import { GameVictoryCondition } from '../game-play/game-victory-condition';
import { SkillTypes } from '../game-play/skill-types';
import { SkillPanelSprites } from '../resources/skill-panel-sprites';
import { DisplayImage } from './display-image';
import { Frame } from '../resources/frame';
import { GameStateTypes } from '../game-state-types';

/** The DOS panel's minimap: the black area inside the red frame at the right of the panel. */
export const DOS_MINIMAP = { x: 208, y: 18, width: 104, height: 20 } as const;
/** Terrain is re-sampled for the minimap this often, in game ticks. */
const MINIMAP_TERRAIN_REFRESH_TICKS = 4;
const MINIMAP_TERRAIN_RGB = [0x30, 0xa0, 0x30] as const;
const MINIMAP_LEMMING_RGB = [0xe0, 0xff, 0x80] as const;
const MINIMAP_VIEW_RGB = [0xff, 0xff, 0xff] as const;

export interface LevelViewport { x: number; y: number; width: number; height: number }

/** handles the in-game-gui. e.g. the panel on the bottom of the game */
export class GameGui {

    private viewportProvider: (() => LevelViewport | null) | null = null;
    private minimapNavigationHandler: ((x: number, y: number) => void) | null = null;
    private minimapDragging = false;
    private minimapTerrain: Uint8Array | null = null;
    /** Game ticks since the terrain was last sampled. */
    private minimapTerrainAge = MINIMAP_TERRAIN_REFRESH_TICKS;

    private gameTimeChanged = true;
    private skillsCountChanged = true;
    private skillSelectionChanged = true;
    private backgroundChanged = true;

    private display?: DisplayImage;
    private deltaReleaseRate = 0;
    private nukeRequestHandler: (() => void) | null = null;
    private fastForwardRequestHandler: (() => void) | null = null;
    private fastForwardActive = false;
    private windowsPanel: readonly Frame[] | null = null;
    private windowsNativePanel: readonly Frame[] | null = null;
    private windowsAnimations: readonly (readonly Frame[])[] | null = null;
    private windowsNativeAnimations: readonly (readonly Frame[])[] | null = null;
    private iconAnimationTick = 0;
    private iconAnimationChanged = false;
    private iconAnimationsEnabled = true;

    /** Use the original first frame when animation is turned off. */
    public setWindowsIconAnimationsEnabled(enabled: boolean) {
        if (this.iconAnimationsEnabled === enabled) return;
        this.iconAnimationsEnabled = enabled;
        this.iconAnimationTick = 0;
        this.iconAnimationChanged = true;
    }

    /** New Windows art uses its original 13-button layout; older sets use DOS positions. */
    public setWindowsPanel(icons: readonly Frame[] | null, nativeIcons?: readonly Frame[] | null,
        animations?: readonly (readonly Frame[])[] | null, nativeAnimations?: readonly (readonly Frame[])[] | null) {
        this.windowsPanel = icons?.length === 12 || icons?.length === 13 ? icons : null;
        this.windowsNativePanel = this.windowsPanel && nativeIcons?.length === this.windowsPanel.length &&
            nativeIcons.every(icon => icon.width === 32 && icon.height === 40) ? nativeIcons : null;
        const validAnimations = this.windowsNativePanel && animations && nativeAnimations &&
            animations.length === this.windowsPanel?.length && nativeAnimations.length === this.windowsPanel?.length && animations.every((frames, index) =>
                frames.length > 0 && frames.length === nativeAnimations[index].length &&
                frames.every(frame => frame.width === 16 && frame.height === 20) &&
                nativeAnimations[index].every(frame => frame.width === 32 && frame.height === 40));
        this.windowsAnimations = validAnimations ? animations ?? null : null;
        this.windowsNativeAnimations = validAnimations ? nativeAnimations ?? null : null;
        this.iconAnimationTick = 0;
        this.iconAnimationChanged = false;
        this.backgroundChanged = true;
    }

    public setFastForwardRequestHandler(handler: (() => void) | null) {
        this.fastForwardRequestHandler = handler;
    }

    public setFastForwardActive(active: boolean) {
        if (this.fastForwardActive === active) return;
        this.fastForwardActive = active;
        this.backgroundChanged = true;
    }

    private get isWindowsLayout(): boolean { return this.windowsPanel?.length === 13; }

    public setNukeRequestHandler(handler: (() => void) | null) {
        this.nukeRequestHandler = handler;
    }

    public setViewportProvider(provider: (() => LevelViewport | null) | null) {
        this.viewportProvider = provider;
    }

    public setMinimapNavigationHandler(handler: ((x: number, y: number) => void) | null) {
        this.minimapNavigationHandler = handler;
        this.minimapDragging = false;
    }

    /** The minimap belongs to the DOS panel; the Windows toolbar draws its own. */
    private get hasDosMinimap(): boolean { return !this.windowsPanel && !!this.game.level; }

    private isOnDosMinimap(e: { x: number; y: number }): boolean {
        return this.hasDosMinimap && e.x >= DOS_MINIMAP.x && e.x < DOS_MINIMAP.x + DOS_MINIMAP.width &&
            e.y >= DOS_MINIMAP.y && e.y < DOS_MINIMAP.y + DOS_MINIMAP.height;
    }

    /** Level pixels per minimap pixel, chosen so the whole level fits the box. */
    private minimapScale(): { x: number; y: number } {
        const level = this.game.level;
        return { x: Math.max(1, Math.ceil(level.width / DOS_MINIMAP.width)), y: Math.max(1, Math.ceil(level.height / DOS_MINIMAP.height)) };
    }

    /** Centre the view on the level position under a minimap point; off-map points clamp to the edge. */
    private navigateDosMinimap(e: { x: number; y: number }) {
        if (!this.minimapNavigationHandler || !this.hasDosMinimap) return;
        const level = this.game.level, scale = this.minimapScale();
        const x = Math.max(0, Math.min(level.width - 1, (e.x - DOS_MINIMAP.x) * scale.x));
        const y = Math.max(0, Math.min(level.height - 1, (e.y - DOS_MINIMAP.y) * scale.y));
        this.minimapNavigationHandler(x, y);
    }

    constructor(private game: Game,
        private skillPanelSprites: SkillPanelSprites,
        private skills: GameSkills,
        private gameTimer: GameTimer,
        private gameVictoryCondition: GameVictoryCondition) {

        gameTimer.onGameTick.on(() => {
            this.gameTimeChanged = true;
            this.minimapTerrainAge++;
            this.doReleaseRateChanges();
            // Advance the supplied Win95 sprite sequences with simulation
            // ticks: pause freezes them and the speed control scales them.
            if (this.iconAnimationsEnabled && this.windowsAnimations?.some(frames => frames.length > 1)) {
                this.iconAnimationTick++;
                this.iconAnimationChanged = true;
            }
        });

        skills.onCountChanged.on(() => {
            this.skillsCountChanged = true;
            this.backgroundChanged = true;
        });

        skills.onSelectionChanged.on(() => {
            this.skillSelectionChanged = true;
            this.backgroundChanged = true;
        })
    }

    private doReleaseRateChanges() {
        if (this.deltaReleaseRate == 0) {
            return;
        }

        if (this.deltaReleaseRate > 0) {
            this.game.queueCommand(new CommandReleaseRateIncrease(this.deltaReleaseRate));
        }
        else {
            this.game.queueCommand(new CommandReleaseRateDecrease(-this.deltaReleaseRate));
        }

    }

    /// handel click on the skills panel
    private handleSkillMouseDown(x: number) {
        if (this.game.getGameState() !== GameStateTypes.RUNNING) return;
        const panelIndex = Math.trunc(x / 16);

        if (panelIndex == (this.isWindowsLayout ? 9 : 0)) {
            this.deltaReleaseRate = -3;
            this.doReleaseRateChanges();
            return;
        }
        if (panelIndex == (this.isWindowsLayout ? 8 : 1)) {

            this.deltaReleaseRate = 3;
            this.doReleaseRateChanges();
            return;
        }

        if (panelIndex == 10) {
            this.gameTimer.toggle();
            return;
        }

        if (this.isWindowsLayout && panelIndex == 11) {
            this.fastForwardRequestHandler?.();
            return;
        }

        if (panelIndex == (this.isWindowsLayout ? 12 : 11)) {
            this.nukeRequestHandler?.();
            return;
        }

        const newSkill = this.getSkillByPanelIndex(panelIndex);
        if (newSkill == SkillTypes.UNKNOWN) return;

        this.game.queueCommand(new CommandSelectSkill(newSkill));

        this.skillSelectionChanged = true;
    }


    public handleSkillDoubleClick(x: number) {
        if (this.game.getGameState() !== GameStateTypes.RUNNING) return;
        const panelIndex = Math.trunc(x / 16);

        /// trigger the nuke for all lemmings
        if (panelIndex == (this.isWindowsLayout ? 12 : 11) && !this.nukeRequestHandler) {
            this.game.queueCommand(new CommandNuke());
        }
    }

    /** init the display */
    public setGuiDisplay(display: DisplayImage) {
        this.display = display;

        /// handle user input in gui
        this.display.onMouseDown.on((e) => {
            this.deltaReleaseRate = 0;
            this.minimapDragging = false;

            if (!e) {
                return;
            }

            if (this.isOnDosMinimap(e)) {
                this.minimapDragging = true;
                this.navigateDosMinimap(e);
                return;
            }

            if (e.y > 15) {
                this.handleSkillMouseDown(e.x);
            }
        });

        this.display.onMouseMove.on((e) => {
            if (e && this.minimapDragging) this.navigateDosMinimap(e);
        });

        this.display.onMouseUp.on(() => {
            /// clear release rate change
            this.deltaReleaseRate = 0;
            this.minimapDragging = false;
        })

        this.display.onDoubleClick.on((e) => {
            /// clear release rate change
            this.deltaReleaseRate = 0;

            if (!e) {
                return;
            }

            if (e.y > 15) {
                this.handleSkillDoubleClick(e.x);
            }

        })


        this.gameTimeChanged = true;
        this.skillsCountChanged = true;
        this.skillSelectionChanged = true;
        this.backgroundChanged = true;
    }


    /** render the gui to the screen display */
    public render() {
        if (!this.display) {
            return;
        }

        const display = this.display;

        /// background
        if (this.backgroundChanged) {
            this.backgroundChanged = false;

            const panelImage = this.skillPanelSprites.getPanelSprite();
            display.initSize(panelImage.width, panelImage.height);
            // The Stage can reuse its GUI display for a different game/mode.
            if (display.getNativeLayers?.()) display.setNativeBackground(null);
            display.setBackground(panelImage.getData());

            if (this.windowsPanel) {
                for (let index = 0; index < this.windowsPanel.length; index++) {
                    const frames = this.windowsAnimations?.[index];
                    const icon = frames ? frames[this.iconAnimationTick % frames.length] : this.windowsPanel[index];
                    display.drawFrameCovered(icon, index * 16, 20, 192, 192, 192);
                }
                if (this.windowsNativePanel) this.setNativeWindowsPanel(display);
            }

            /// redraw everything
            this.gameTimeChanged = true;
            this.skillsCountChanged = true;
            this.skillSelectionChanged = true;
            this.iconAnimationChanged = false;
        } else if (this.iconAnimationChanged && this.windowsPanel) {
            this.iconAnimationChanged = false;
            const background = display.getNativeLayers?.()?.background;
            if (background && this.windowsNativePanel) {
                // Reuse the existing native image rather than allocate an
                // entire panel on every game tick (especially at 4× speed).
                this.paintNativeWindowsIcons(new Uint32Array(background.data.buffer, background.data.byteOffset, background.data.byteLength / 4), background.width, background.height);
            } else {
                for (let index = 0; index < this.windowsPanel.length; index++) {
                    const frames = this.windowsAnimations?.[index];
                    display.drawFrameCovered(frames ? frames[this.iconAnimationTick % frames.length] : this.windowsPanel[index], index * 16, 20, 192, 192, 192);
                }
            }
        }

        /////////
        /// green text
        // IN uses the floor of saved / total, so display the target using
        // the same percentage convention while victory uses exact counts.
        const total = this.gameVictoryCondition.getReleaseCount();
        const needed = this.gameVictoryCondition.getNeedCount();
        // Above 100 lemmings, adjacent counts can have the same displayed
        // percentage. Show the exact count instead of implying an early win.
        const target = total > 100 ? String(needed) : `${this.stringPad(String(total > 0 ? Math.floor(needed / total * 100) : 0), 3)}%`;
        if (this.isWindowsLayout) {
            // Four equally sized fields keep the labels balanced across the
            // toolbar, including the area above the minimap. Painting spaces
            // on both sides also clears digits when values become shorter.
            const fields = [
                `Need ${target}`,
                `Out ${this.gameVictoryCondition.getOutCount()}`,
                `In ${this.gameVictoryCondition.getSurvivorPercentage()}%`,
                `Time ${this.gameTimer.getGameLeftTimeString()}`,
            ];
            fields.forEach((field, index) => {
                const leftPadding = Math.max(0, Math.floor((10 - field.length) / 2));
                this.drawGreenString(display, field.padStart(field.length + leftPadding).padEnd(10), index * 80, 0);
            });
            this.gameTimeChanged = false;
        } else {
            this.drawGreenString(display, `Need ${target}`, 0, 0);
            this.drawGreenString(display, 'Out ' + this.gameVictoryCondition.getOutCount() + '  ', 112, 0);
            this.drawGreenString(display, 'In' + this.stringPad(this.gameVictoryCondition.getSurvivorPercentage() + '', 3) + '%', 186, 0);

            if (this.gameTimeChanged) {
                this.gameTimeChanged = false;
                this.renderGameTime(display, 248, 0);
            }
        }

        /////////
        /// white skill numbers
        this.drawPanelNumber(display, this.gameVictoryCondition.getMinReleaseRate(), this.isWindowsLayout ? 9 : 0);
        this.drawPanelNumber(display, this.gameVictoryCondition.getCurrentReleaseRate(), this.isWindowsLayout ? 8 : 1);

        if (this.skillsCountChanged) {
            this.skillsCountChanged = false;

            for (let i = 1 /* jump over unknown */; i < SkillTypes.length(); i++) {
                const count = this.skills.getSkill(i);
                // Windows leaves unavailable skills blank. The background is
                // rebuilt on count changes, so the last digit is also erased.
                if (this.isWindowsLayout && count <= 0) continue;
                this.drawPanelNumber(display, count, this.getPanelIndexBySkill(i));
            }
        }

        ////////
        /// selected skill
        if (this.skillSelectionChanged) {
            this.skillSelectionChanged = false;
            this.drawSelection(display, this.getPanelIndexBySkill(this.skills.getSelectedSkill()));
            if (this.isWindowsLayout && this.fastForwardActive) this.drawSelection(display, 11);
        }

        if (this.hasDosMinimap) this.renderDosMinimap(display);
    }

    /** Terrain in green, live lemmings as light dots and the visible area as a white box, as on the DOS panel. */
    private renderDosMinimap(display: DisplayImage) {
        const level = this.game.level;
        const scale = this.minimapScale();
        const mapWidth = Math.min(DOS_MINIMAP.width, Math.ceil(level.width / scale.x));
        const mapHeight = Math.min(DOS_MINIMAP.height, Math.ceil(level.height / scale.y));
        // The level's own area is centred in the box; the DOS game leaves a small margin too.
        const originX = DOS_MINIMAP.x + Math.floor((DOS_MINIMAP.width - mapWidth) / 2);
        const originY = DOS_MINIMAP.y + Math.floor((DOS_MINIMAP.height - mapHeight) / 2);

        if (!this.minimapTerrain || this.minimapTerrain.length !== mapWidth * mapHeight || this.minimapTerrainAge >= MINIMAP_TERRAIN_REFRESH_TICKS) {
            this.minimapTerrain = this.sampleMinimapTerrain(mapWidth, mapHeight, scale.x, scale.y);
            this.minimapTerrainAge = 0;
        }

        display.fillRect(DOS_MINIMAP.x, DOS_MINIMAP.y, DOS_MINIMAP.width, DOS_MINIMAP.height, 0, 0, 0);
        const terrain = this.minimapTerrain;
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                if (terrain[y * mapWidth + x]) display.setPixel(originX + x, originY + y, ...MINIMAP_TERRAIN_RGB);
            }
        }

        for (const lemming of this.game.getLemmingManager().getSelectableLemmings()) {
            const x = Math.floor(lemming.x / scale.x), y = Math.floor(lemming.y / scale.y);
            if (x >= 0 && x < mapWidth && y >= 0 && y < mapHeight) display.setPixel(originX + x, originY + y, ...MINIMAP_LEMMING_RGB);
        }

        const view = this.viewportProvider?.();
        if (view) {
            const x1 = originX + Math.floor(view.x / scale.x), y1 = originY + Math.floor(view.y / scale.y);
            const x2 = Math.min(originX + mapWidth, x1 + Math.max(1, Math.round(view.width / scale.x))) - 1;
            const y2 = Math.min(originY + mapHeight, y1 + Math.max(1, Math.round(view.height / scale.y))) - 1;
            display.drawHorizontalLine(x1, y1, x2, ...MINIMAP_VIEW_RGB);
            display.drawHorizontalLine(x1, y2, x2, ...MINIMAP_VIEW_RGB);
            display.drawVerticalLine(x1, y1, y2, ...MINIMAP_VIEW_RGB);
            display.drawVerticalLine(x2, y1, y2, ...MINIMAP_VIEW_RGB);
        }
    }

    /** One byte per minimap cell: 1 when any sampled level pixel in that cell is ground. */
    private sampleMinimapTerrain(mapWidth: number, mapHeight: number, scaleX: number, scaleY: number): Uint8Array {
        const level = this.game.level;
        const terrain = new Uint8Array(mapWidth * mapHeight);
        const stepX = Math.max(1, Math.floor(scaleX / 4)), stepY = Math.max(1, Math.floor(scaleY / 2));
        for (let my = 0; my < mapHeight; my++) {
            for (let mx = 0; mx < mapWidth; mx++) {
                const left = mx * scaleX, top = my * scaleY;
                const right = Math.min(level.width, left + scaleX), bottom = Math.min(level.height, top + scaleY);
                let solid = false;
                for (let y = top; y < bottom && !solid; y += stepY) {
                    for (let x = left; x < right; x += stepX) {
                        if (level.hasGroundAt(x, y)) { solid = true; break; }
                    }
                }
                if (solid) terrain[my * mapWidth + mx] = 1;
            }
        }
        return terrain;
    }

    /** Composite player-supplied 32×40 artwork onto native grey Windows buttons. */
    private setNativeWindowsPanel(display: DisplayImage): void {
        const image = display.getImageData();
        if (!image || !this.windowsNativePanel) return;
        const width = image.width * 2, height = image.height * 2;
        const pixels = new Uint8ClampedArray(width * height * 4);
        const out = new Uint32Array(pixels.buffer);
        const original = new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.byteLength / 4);
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const color = original[y * image.width + x], at = y * 2 * width + x * 2;
            out[at] = out[at + 1] = out[at + width] = out[at + width + 1] = color;
        }
        // The shared DOS panel has a black strip above its icon row. Windows
        // uses the normal grey toolbar here; the live counts and selection
        // border are drawn separately on top of this background.
        if (this.isWindowsLayout) {
            for (let y = 32; y < 40; y++) for (let x = 0; x < 13 * 32; x++) out[y * width + x] = 0xffc0c0c0;
        }
        this.paintNativeWindowsIcons(out, width, height);
        display.setNativeBackground(pixels, width, height);
    }

    private paintNativeWindowsIcons(out: Uint32Array, width: number, height: number): void {
        if (!this.windowsNativePanel) return;
        for (let slot = 0; slot < this.windowsNativePanel.length; slot++) {
            const frames = this.windowsNativeAnimations?.[slot];
            const icon = frames ? frames[this.iconAnimationTick % frames.length] : this.windowsNativePanel[slot];
            const source = icon.getBuffer(), mask = icon.getMask();
            for (let y = 0; y < 40; y++) for (let x = 0; x < 32; x++) {
                const destX = slot * 32 + x, destY = 40 + y;
                if (destX >= width || destY >= height) continue;
                // Win95-style raised control edges; icon pixels remain unscaled.
                const base = y === 0 || x === 0 ? 0xffffffff : y === 39 || x === 31 ? 0xff808080 : 0xffc0c0c0;
                out[destY * width + destX] = mask[y * 32 + x] ? source[y * 32 + x] : base;
            }
        }
    }

    /** left pad a string with spaces */
    private stringPad(str: string, length: number): string {
        if (str.length >= length) {
            return str;
        }

        return ' '.repeat(length - str.length) + str;
    }

    /** return the skillType for an index */
    private getSkillByPanelIndex(panelIndex: number): SkillTypes {
        if (this.isWindowsLayout) panelIndex += 2;
        switch (Math.trunc(panelIndex)) {
            case 2: return SkillTypes.CLIMBER;
            case 3: return SkillTypes.FLOATER;
            case 4: return SkillTypes.BOMBER;
            case 5: return SkillTypes.BLOCKER;
            case 6: return SkillTypes.BUILDER;
            case 7: return SkillTypes.BASHER;
            case 8: return SkillTypes.MINER;
            case 9: return SkillTypes.DIGGER;
            default: return SkillTypes.UNKNOWN;
        }
    }

    /** return the index for a skillType */
    private getPanelIndexBySkill(skill: SkillTypes): number {
        if (this.isWindowsLayout) return SkillTypes.isValid(skill) ? skill - 1 : -1;
        switch (skill) {
            case SkillTypes.CLIMBER: return 2;
            case SkillTypes.FLOATER: return 3;
            case SkillTypes.BOMBER: return 4;
            case SkillTypes.BLOCKER: return 5;
            case SkillTypes.BUILDER: return 6;
            case SkillTypes.BASHER: return 7;
            case SkillTypes.MINER: return 8;
            case SkillTypes.DIGGER: return 9;
            default: return -1;
        }
    }

    /** draw a white rectangle border to the panel */
    private drawSelection(display: DisplayImage, panelIndex: number) {
        display.drawRect(16 * panelIndex, 16, 16, 23, 255, 255, 255);
    }

    /** draw the game time to the panel */
    private renderGameTime(display: DisplayImage, x: number, y: number) {
        const gameTime = this.gameTimer.getGameLeftTimeString();

        this.drawGreenString(display, 'Time ' + gameTime + '-00', x, y);
    }

    /** draw a white number to the skill-panel */
    private drawPanelNumber(display: DisplayImage, number: number, panelIndex: number) {
        this.drawNumber(display, number, 4 + 16 * panelIndex, 17);
    }

    /** draw a white number */
    private drawNumber(display: DisplayImage, number: number, x: number, y: number): number {

        if (number > 0) {
            const num1Img = this.skillPanelSprites.getNumberSpriteLeft(Math.floor(number / 10));
            const num2Img = this.skillPanelSprites.getNumberSpriteRight(number % 10);

            display.drawFrameCovered(num1Img, x, y, 0, 0, 0);
            display.drawFrame(num2Img, x, y);
        }
        else {
            const numImg = this.skillPanelSprites.getNumberSpriteEmpty();
            display.drawFrame(numImg, x, y);
        }


        return x + 8;
    }

    /** draw a text with green letters */
    private drawGreenString(display: DisplayImage, text: string, x: number, y: number): number {

        for (let i = 0; i < text.length; i++) {

            const letterImg = this.skillPanelSprites.getLetterSprite(text[i]);

            if (letterImg != null) {
                display.drawFrameCovered(letterImg, x, y, 0, 0, 0);
            }

            x += 8;
        }

        return x;
    }
}
