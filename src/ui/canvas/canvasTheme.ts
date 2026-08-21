import type { Theme } from '../../app/theme';

/**
 * Component renderers draw to a Konva <canvas> bitmap, not the DOM, so they
 * can't pick up the app's CSS custom properties - the handful of colors that
 * were tuned assuming the table's light surface (component labels, and the
 * neutral gray lines/outlines used where a component isn't a strongly
 * saturated color of its own) need an explicit dark-mode counterpart here
 * instead. Each component's own body color (lens green/orange, source's
 * already-dark casing, target teal, the danger red on a beam stop, etc.)
 * stays constant across themes - already saturated or self-consistently
 * dark enough to read on either table surface.
 */
export interface CanvasColors {
  /** Primary component label (e.g. "L1"). */
  label: string;
  /** Secondary annotation under the label (e.g. "f=100mm"). */
  labelSecondary: string;
  /** Outline/line color for parts that were a plain mid gray, not a component's own accent color. */
  neutralLine: string;
  /** A lighter-touch version of neutralLine, for thin connector lines (e.g. the line between a cavity's two mirrors). */
  neutralLineFaint: string;
}

const CANVAS_COLORS: Record<Theme, CanvasColors> = {
  light: {
    label: '#333333',
    labelSecondary: '#666666',
    neutralLine: '#5b6b7a',
    neutralLineFaint: '#999999',
  },
  dark: {
    label: '#eef2f8',
    labelSecondary: '#aab4c0',
    neutralLine: '#98a3b3',
    neutralLineFaint: '#78838f',
  },
};

export function getCanvasColors(theme: Theme): CanvasColors {
  return CANVAS_COLORS[theme];
}
