/**
 * TargetRenderer: Draws a mode-matching target as a bullseye marker.
 *
 * A target is a pure reference point (position + desired waist size) - it
 * does not modify the beam, it only marks where a desired mode should sit.
 */

import React, { useRef } from 'react';
import { Circle, Group, Text } from 'react-konva';
import type Konva from 'konva';
import type { Point2d, TargetComponent } from '../../../app/state/schema';

interface TargetRendererProps {
  component: TargetComponent;
  mmToPx: (mm: number) => number;
  onDragMove: (componentId: string, newPos: Point2d) => void;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
  getSnappedDragPositionPx: (component: TargetComponent, rawPx: Point2d) => Point2d;
}

export const TargetRenderer: React.FC<TargetRendererProps> = ({
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

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const outerRadius = Math.max(8, mmToPx(10));
  const innerRadius = Math.max(2, outerRadius * 0.35);
  const color = '#17A2B8';

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

  const waistUm = component.waistRadius * 1000;
  const waistLabel = waistUm < 1000 ? `${waistUm.toFixed(0)}um` : `${component.waistRadius.toFixed(2)}mm`;

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
      <Circle
        radius={outerRadius}
        stroke={isSelected ? '#1f6feb' : color}
        strokeWidth={isSelected ? 3 : 2}
        fill="rgba(23, 162, 184, 0.12)"
      />
      <Circle radius={innerRadius} fill={color} />

      <Text
        x={outerRadius + 6}
        y={-outerRadius}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />
      <Text
        x={outerRadius + 6}
        y={-outerRadius + 14}
        text={`w0=${waistLabel}`}
        fontSize={10}
        fill="#666"
        pointerEvents="none"
      />
    </Group>
  );
};
