/**
 * LensRenderer: Draws thin lens component as rectangle with focal length
 */

import React, { useRef } from 'react';
import { Rect, Text } from 'react-konva';
import Konva from 'konva';
import type { CardinalDirection, LensThinComponent, Point2d } from '../../../app/state/schema';

interface LensRendererProps {
  component: LensThinComponent;
  mmToPx: (mm: number) => number;
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
  onDragEnd,
  onSelect,
  isDraggable,
  isSelected,
  axisDirection,
  getSnappedDragPositionPx,
}) => {
  const rectRef = useRef<Konva.Rect>(null);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const vertical = axisDirection === null || axisDirection === 'right' || axisDirection === 'left';
  const width = mmToPx(vertical ? 5 : 24);
  const height = mmToPx(vertical ? 24 : 5);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const newX = (e.target.x() + width / 2) / mmToPx(1);
    const newY = (e.target.y() + height / 2) / mmToPx(1);
    onDragEnd(component.id, { x: newX, y: newY });
  };

  return (
    <>
      <Rect
        ref={rectRef}
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        fill={component.focalLength > 0 ? '#7ED321' : '#F5A623'}
        stroke={isSelected ? '#1f6feb' : '#2E7D32'}
        strokeWidth={isSelected ? 3 : 2}
        draggable={isDraggable}
        dragBoundFunc={(pos) => {
          const snapped = getSnappedDragPositionPx(component, {
            x: pos.x + width / 2,
            y: pos.y + height / 2,
          });
          return {
            x: snapped.x - width / 2,
            y: snapped.y - height / 2,
          };
        }}
        onDragEnd={handleDragEnd}
        onClick={() => onSelect(component.id)}
        onTap={() => onSelect(component.id)}
        cursor={isDraggable ? 'grab' : 'default'}
      />
      <Text
        x={x + width / 2 + 5}
        y={y - 8}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />
      <Text
        x={x + width / 2 + 5}
        y={y + 6}
        text={`f=${component.focalLength.toFixed(0)}mm`}
        fontSize={10}
        fill="#666"
        pointerEvents="none"
      />
    </>
  );
};
