/**
 * BeamStopRenderer: Draws a beam stop as an opaque hazard-striped block.
 *
 * A beam stop has no optical parameters - its only job is to fully absorb
 * the beam wherever it sits on the path, terminating propagation there.
 */

import React, { useRef } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { BeamStopComponent, Point2d } from '../../../app/state/schema';
import { useTheme } from '../../../app/adapters/useTheme';
import { getCanvasColors } from '../canvasTheme';

interface BeamStopRendererProps {
  component: BeamStopComponent;
  mmToPx: (mm: number) => number;
  onDragMove: (componentId: string, newPos: Point2d) => void;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
  getSnappedDragPositionPx: (component: BeamStopComponent, rawPx: Point2d) => Point2d;
}

export const BeamStopRenderer: React.FC<BeamStopRendererProps> = ({
  component,
  mmToPx,
  onDragMove,
  onDragEnd,
  onSelect,
  isDraggable,
  isSelected,
  getSnappedDragPositionPx,
}) => {
  const groupRef = useRef<Konva.Group>(null);
  const { theme } = useTheme();
  const colors = getCanvasColors(theme);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const size = Math.max(16, mmToPx(18));
  const half = size / 2;

  const handleDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (groupRef.current) {
      const newX = groupRef.current.x() / mmToPx(1);
      const newY = groupRef.current.y() / mmToPx(1);
      onDragMove(component.id, { x: newX, y: newY });
    }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (groupRef.current) {
      const newX = groupRef.current.x() / mmToPx(1);
      const newY = groupRef.current.y() / mmToPx(1);
      onDragEnd(component.id, { x: newX, y: newY });
    }
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
        if (isDraggable) document.body.style.cursor = 'grab';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <Rect
        x={-half}
        y={-half}
        width={size}
        height={size}
        cornerRadius={2}
        fill="#2c2f36"
        stroke={isSelected ? '#1f6feb' : '#111318'}
        strokeWidth={isSelected ? 3 : 2}
      />
      {/* Hazard-stripe "blocked" cross */}
      <Line points={[-half + 3, -half + 3, half - 3, half - 3]} stroke="#e64545" strokeWidth={2.5} lineCap="round" />
      <Line points={[half - 3, -half + 3, -half + 3, half - 3]} stroke="#e64545" strokeWidth={2.5} lineCap="round" />

      <Text
        x={half + 5}
        y={-8}
        text={component.label}
        fontSize={12}
        fill={colors.label}
        pointerEvents="none"
      />
      <Text
        x={half + 5}
        y={6}
        text="beam stop"
        fontSize={10}
        fill={colors.labelSecondary}
        pointerEvents="none"
      />
    </Group>
  );
};
