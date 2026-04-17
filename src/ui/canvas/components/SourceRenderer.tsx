/**
 * SourceRenderer: Draws laser source component on canvas
 */

import React, { useRef } from 'react';
import { Circle, Text } from 'react-konva';
import Konva from 'konva';
import type { SourceComponent, Point2d } from '../../../app/state/schema';

interface SourceRendererProps {
  component: SourceComponent;
  mmToPx: (mm: number) => number;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
}

export const SourceRenderer: React.FC<SourceRendererProps> = ({
  component,
  mmToPx,
  onDragEnd,
  onSelect,
  isDraggable,
  isSelected,
}) => {
  const circleRef = useRef<Konva.Circle>(null);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const radius = mmToPx(6); // 6mm display radius

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = e.target.x() / mmToPx(1);
    const newY = e.target.y() / mmToPx(1);
    onDragEnd(component.id, { x: newX, y: newY });
  };

  return (
    <>
      <Circle
        ref={circleRef}
        x={x}
        y={y}
        radius={radius}
        fill="#FF6B6B"
        stroke={isSelected ? '#1f6feb' : '#8B0000'}
        strokeWidth={isSelected ? 3 : 2}
        draggable={isDraggable}
        onDragEnd={handleDragEnd}
        onClick={() => onSelect(component.id)}
        onTap={() => onSelect(component.id)}
        cursor={isDraggable ? 'grab' : 'default'}
      />
      <Text
        x={x + radius + 5}
        y={y - 8}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />
    </>
  );
};
