import { EventHandler } from '../utilities/event-handler';
import { Position2D } from '../utilities/position2d';

export class MouseMoveEventArguments extends Position2D {
    public mouseDownX = 0;
    public mouseDownY = 0;

    constructor(x = 0, y = 0, public deltaX = 0, public deltaY = 0, public button = false) {
        super(x, y);
    }
}

export class ZoomEventArguments extends Position2D {
    /** The stage sets this only when the wheel is used to zoom the level. */
    public handled = false;
    constructor(x = 0, y = 0, public deltaZoom = 0) {
        super(x, y);
    }
}

/** The stage accepts a pinch only when both touch points belong to the level. */
export class PinchStartEventArguments {
    public handled = false;
    constructor(public first: Position2D, public second: Position2D) {}
}

/** Ratio and centre in canvas coordinates, including centre motion for panning. */
export class PinchEventArguments {
    constructor(public previousCenter: Position2D, public center: Position2D, public scale: number) {}
}

/** Translates pointer coordinates from CSS pixels to the canvas's drawing space. */
export class UserInputManager {
    private activePointer: number | null = null;
    private activePointerType = '';
    private mouseDownX = 0;
    private mouseDownY = 0;
    private lastMouseX = 0;
    private lastMouseY = 0;
    private pinchPointer: number | null = null;
    private pinching = false;
    private pinchZoomAllowed = false;
    private pinchX = 0;
    private pinchY = 0;

    public onMouseMove = new EventHandler<MouseMoveEventArguments>();
    public onMouseUp = new EventHandler<Position2D>();
    public onMouseDown = new EventHandler<Position2D>();
    public onCancel = new EventHandler<void>();
    public onDoubleClick = new EventHandler<Position2D>();
    public onZoom = new EventHandler<ZoomEventArguments>();
    public onPinchStart = new EventHandler<PinchStartEventArguments>();
    public onPinch = new EventHandler<PinchEventArguments>();

    constructor(private element: HTMLCanvasElement) {
        element.addEventListener('pointerdown', this.pointerDown);
        element.addEventListener('pointermove', this.pointerMove);
        element.addEventListener('pointerup', this.pointerUp);
        element.addEventListener('pointercancel', this.pointerCancel);
        element.addEventListener('lostpointercapture', this.pointerCancel);
        element.addEventListener('dblclick', this.doubleClick);
        element.addEventListener('wheel', this.wheel, { passive: false });
    }

    public dispose(): void {
        this.element.removeEventListener('pointerdown', this.pointerDown);
        this.element.removeEventListener('pointermove', this.pointerMove);
        this.element.removeEventListener('pointerup', this.pointerUp);
        this.element.removeEventListener('pointercancel', this.pointerCancel);
        this.element.removeEventListener('lostpointercapture', this.pointerCancel);
        this.element.removeEventListener('dblclick', this.doubleClick);
        this.element.removeEventListener('wheel', this.wheel);
        this.activePointer = null;
        this.pinchPointer = null;
        this.pinching = false;
        this.pinchZoomAllowed = false;
    }

    /** Abort an in-progress press or pinch when the canvas geometry changes. */
    public cancelActive(): void {
        if (this.activePointer === null && this.pinchPointer === null) return;
        this.activePointer = null;
        this.pinchPointer = null;
        this.activePointerType = '';
        this.pinching = false;
        this.pinchZoomAllowed = false;
        this.onCancel.trigger();
    }

    private getRelativePosition(clientX: number, clientY: number): Position2D {
        const rect = this.element.getBoundingClientRect();
        // The drawing buffer stays fixed while CSS makes the canvas responsive.
        const scaleX = rect.width ? this.element.width / rect.width : 1;
        const scaleY = rect.height ? this.element.height / rect.height : 1;
        return new Position2D((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    }

    private pointerDown = (event: PointerEvent): void => {
        if (this.pinching || (event.pointerType === 'mouse' && event.button !== 0)) return;
        if (this.activePointer !== null) {
            if (event.pointerType !== 'touch' || this.activePointerType !== 'touch' || event.pointerId === this.activePointer) return;
            const second = this.getRelativePosition(event.clientX, event.clientY);
            const first = new Position2D(this.lastMouseX, this.lastMouseY);
            const pinch = new PinchStartEventArguments(first, second);
            if (Math.hypot(second.x - first.x, second.y - first.y) >= 8) this.onPinchStart.trigger(pinch);
            // Cancel a pending tap even when a second finger is outside the
            // playfield, so a mixed gesture cannot assign an unintended skill.
            this.onCancel.trigger();
            this.pinchPointer = event.pointerId;
            this.pinching = true;
            this.pinchZoomAllowed = pinch.handled;
            this.pinchX = second.x; this.pinchY = second.y;
            this.element.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            return;
        }
        this.activePointer = event.pointerId;
        this.activePointerType = event.pointerType;
        const position = this.getRelativePosition(event.clientX, event.clientY);
        position.touch = event.pointerType === 'touch';
        this.mouseDownX = this.lastMouseX = position.x;
        this.mouseDownY = this.lastMouseY = position.y;
        this.element.setPointerCapture?.(event.pointerId);
        this.onMouseDown.trigger(position);
        event.preventDefault();
    };

    private pointerMove = (event: PointerEvent): void => {
        if (this.pinching) {
            if ((event.pointerId !== this.activePointer && event.pointerId !== this.pinchPointer) ||
                this.activePointer === null || this.pinchPointer === null) return;
            const previousCenter = new Position2D((this.lastMouseX + this.pinchX) / 2, (this.lastMouseY + this.pinchY) / 2);
            const previousDistance = Math.hypot(this.pinchX - this.lastMouseX, this.pinchY - this.lastMouseY);
            const position = this.getRelativePosition(event.clientX, event.clientY);
            if (event.pointerId === this.activePointer) { this.lastMouseX = position.x; this.lastMouseY = position.y; }
            else { this.pinchX = position.x; this.pinchY = position.y; }
            const distance = Math.hypot(this.pinchX - this.lastMouseX, this.pinchY - this.lastMouseY);
            if (this.pinchZoomAllowed && previousDistance >= 1 && distance >= 1) {
                this.onPinch.trigger(new PinchEventArguments(previousCenter,
                    new Position2D((this.lastMouseX + this.pinchX) / 2, (this.lastMouseY + this.pinchY) / 2), distance / previousDistance));
            }
            event.preventDefault();
            return;
        }
        if (this.activePointer !== null && event.pointerId !== this.activePointer) return;
        const position = this.getRelativePosition(event.clientX, event.clientY);
        const pressed = this.activePointer === event.pointerId;
        const args = new MouseMoveEventArguments(position.x, position.y,
            pressed ? this.lastMouseX - position.x : 0,
            pressed ? this.lastMouseY - position.y : 0, pressed);
        args.mouseDownX = this.mouseDownX;
        args.mouseDownY = this.mouseDownY;
        if (pressed) {
            this.lastMouseX = position.x;
            this.lastMouseY = position.y;
        }
        this.onMouseMove.trigger(args);
        if (pressed) event.preventDefault();
    };

    private pointerUp = (event: PointerEvent): void => {
        if (this.pinching) {
            if (event.pointerId === this.activePointer) this.activePointer = null;
            else if (event.pointerId === this.pinchPointer) this.pinchPointer = null;
            else return;
            if (this.activePointer === null && this.pinchPointer === null) {
                this.pinching = false;
                this.pinchZoomAllowed = false;
                this.activePointerType = '';
            }
            event.preventDefault();
            return;
        }
        if (event.pointerId !== this.activePointer) return;
        this.activePointer = null;
        const position = this.getRelativePosition(event.clientX, event.clientY);
        if (this.activePointerType === 'touch') {
            const width = this.element.getBoundingClientRect().width;
            position.hitSlop = width ? 8 * this.element.width / width : 0;
        }
        this.activePointerType = '';
        this.onMouseUp.trigger(position);
        event.preventDefault();
    };

    private pointerCancel = (event: PointerEvent): void => {
        if (this.pinching) {
            if (event.pointerId === this.activePointer) this.activePointer = null;
            else if (event.pointerId === this.pinchPointer) this.pinchPointer = null;
            else return;
            if (this.activePointer === null && this.pinchPointer === null) {
                this.pinching = false;
                this.pinchZoomAllowed = false;
                this.activePointerType = '';
            }
            return;
        }
        if (event.pointerId !== this.activePointer) return;
        this.activePointer = null;
        this.onCancel.trigger();
    };

    private doubleClick = (event: MouseEvent): void => {
        this.onDoubleClick.trigger(this.getRelativePosition(event.clientX, event.clientY));
        event.preventDefault();
    };

    private wheel = (event: WheelEvent): void => {
        const position = this.getRelativePosition(event.clientX, event.clientY);
        if (event.deltaY === 0) return;
        const zoom = new ZoomEventArguments(position.x, position.y, event.deltaY < 0 ? 1 : -1);
        this.onZoom.trigger(zoom);
        if (zoom.handled) event.preventDefault();
    };
}
