/**
 * LensRenderer: Draws thin lens component as rectangle with focal length
 */

import React, { useRef } from 'react';
import { Group, Rect, Text } from 'react-konva';
import Konva from 'konva';
import type { CardinalDirection, LensThinComponent, Point2d } from '../../../app/state/schema';
import { useTheme } from '../../../app/adapters/useTheme';
import { getCanvasColors } from '../canvasTheme';

interface LensRendererProps {
  component: LensThinComponent;
  mmToPx: (mm: number) => number;
  onDragMove: (componentId: string, newPos: Point2d) => void;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
  axisDirection: CardinalDirection | null;
  getSnappedDragPositionPx: (component: LensThinComponent, rawPx: Point2d) => Point2d;
}

export const LensRenderer: React.FC<LensRendererProps> = ({
  component,
  mmToPx,
  onDragMove,
  onDragEnd,
  onSelect,
  isDraggable,
  isSelected,
  axisDirection,
  getSnappedDragPositionPx,
}) => {
  const groupRef = useRef<Konva.Group>(null);
  const { theme } = useTheme();
  const colors = getCanvasColors(theme);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const vertical = axisDirection === null || axisDirection === 'right' || axisDirection === 'left';
  const width = mmToPx(vertical ? 5 : 24);
  const height = mmToPx(vertical ? 24 : 5);

  // Group is anchored at the component's own center (x, y) so dragBoundFunc
  // - which works in absolute/screen pixels - can hand off directly to
  // getSnappedDragPositionPx without needing to separately rescale the
  // rect's local top-left offset by the Stage's own zoom.
  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x() / mmToPx(1);
    const newY = e.target.y() / mmToPx(1);
    onDragMove(component.id, { x: newX, y: newY });
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x() / mmToPx(1);
    const newY = e.target.y() / mmToPx(1);
    onDragEnd(component.id, { x: newX, y: newY });
  };

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      draggable={isDraggable}
      dragBoundFunc={(pos) => getSnappedDragPositionPx(component, pos)}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(component.id)}
      onTap={() => onSelect(component.id)}
      onMouseEnter={() => {
        document.body.style.cursor = isDraggable ? 'grab' : 'pointer';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={component.focalLength > 0 ? '#7ED321' : '#F5A623'}
        stroke={isSelected ? '#1f6feb' : '#2E7D32'}
        strokeWidth={isSelected ? 3 : 2}
      />
      <Text
        x={width / 2 + 5}
        y={-8}
        text={component.label}
        fontSize={12}
        fill={colors.label}
        pointerEvents="none"
      />
      <Text
        x={width / 2 + 5}
        y={6}
        text={`f=${component.focalLength.toFixed(0)}mm`}
        fontSize={10}
        fill={colors.labelSecondary}
        pointerEvents="none"
      />
    </Group>
  );
};
