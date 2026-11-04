// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Stage } from '../../src/game/view/stage';

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 480;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height } as DOMRect);
  canvas.getContext = vi.fn(() => ({ canvas, fillRect: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(), putImageData: vi.fn(), drawImage: vi.fn() })) as unknown as typeof canvas.getContext;
  const stage = new Stage(canvas);
  const scene = stage.getGameDisplay();
  vi.spyOn(scene, 'getWidth').mockReturnValue(1600);
  vi.spyOn(scene, 'getHeight').mockReturnValue(160);
  stage.getGuiDisplay();
  const click = vi.fn(); scene.onMouseDown.on(click);
  return { canvas, stage, scene, click };
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, pointerType = 'touch', id = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y, pointerId: id, pointerType, button: 0 });
  canvas.dispatchEvent(event);
}

describe('DOS full-screen layout', () => {
  it('sizes the buffer to the viewport, spans the panel across it and fits the level above', () => {
    const { canvas, stage } = setup();
    stage.setDosViewport(1600, 900);
    expect([canvas.width, canvas.height]).toEqual([1067, 600]);
    const panelScale = 1067 / 320;
    expect(stage.getDosPanelScale()).toBeCloseTo(panelScale);
    const panel = stage.getStageImageAt(10, 599)!;
    expect(panel.viewPoint.scale).toBeCloseTo(panelScale);
    expect(panel.height).toBe(Math.round(40 * panelScale));
    const level = stage.getStageImageAt(10, 10)!;
    expect(level.height).toBe(600 - panel.height);
    // 160 level rows fill the space above the panel until the player zooms.
    expect(level.viewPoint.scale).toBeCloseTo(level.height / 160);
    stage.dispose();
  });

  it('keeps a custom zoom across viewport changes and never shrinks below the panel width', () => {
    const { canvas, stage } = setup();
    stage.setDosViewport(1600, 900);
    const level = stage.getStageImageAt(10, 10)!;
    stage.zoomGame(2);
    const custom = level.viewPoint.scale;
    stage.setDosViewport(1200, 900);
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
    expect(level.viewPoint.scale).toBe(custom);
    stage.setDosViewport(100, 900);
    expect(canvas.width).toBe(320);
    stage.setDosViewport(0, 900);
    expect(canvas.width).toBe(320);
    stage.dispose();
  });
});

describe('touch-and-hold panning', () => {
  it('turns a held touch into a pan so release does not assign a skill', () => {
    vi.useFakeTimers();
    try {
      const { canvas, stage, click } = setup();
      stage.setDosViewport(1600, 900);
      const level = stage.getStageImageAt(10, 10)!;
      const startX = level.viewPoint.x;
      pointer(canvas, 'pointerdown', 300, 200);
      vi.advanceTimersByTime(300);
      pointer(canvas, 'pointermove', 295, 200);
      expect(level.viewPoint.x).toBeGreaterThan(startX);
      pointer(canvas, 'pointerup', 295, 200);
      expect(click).not.toHaveBeenCalled();
      stage.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still assigns on a quick tap and does not hold-pan for a mouse', () => {
    vi.useFakeTimers();
    try {
      const { canvas, stage, click } = setup();
      stage.setDosViewport(1600, 900);
      pointer(canvas, 'pointerdown', 300, 200);
      vi.advanceTimersByTime(100);
      pointer(canvas, 'pointerup', 302, 201);
      expect(click).toHaveBeenCalledTimes(1);
      pointer(canvas, 'pointerdown', 300, 200, 'mouse');
      vi.advanceTimersByTime(1000);
      pointer(canvas, 'pointerup', 300, 200, 'mouse');
      expect(click).toHaveBeenCalledTimes(2);
      stage.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
