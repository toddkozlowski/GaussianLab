/**
 * CavityRenderer: Draws Fabry-Perot cavity as pair of mirrors with separation
 */

import React, { useRef } from 'react';
import { Rect, Text, Line, Group } from 'react-konva';
import type Konva from 'konva';
import type { CavityFPComponent, Point2d } from '../../../app/state/schema';

interface CavityRendererProps {
  component: CavityFPComponent;
  mmToPx: (mm: number) => number;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  isDraggable: boolean;
}

export const CavityRenderer: React.FC<CavityRendererProps> = ({
  component,
  mmToPx,
  onDragEnd,
  isDraggable,
}) => {
  const groupRef = useRef<Konva.Group>(null);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const cavityLengthPx = mmToPx(Math.min(component.length, 30)); // Cap display length
  const mirrorHeight = mmToPx(8);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (groupRef.current) {
      const newX = groupRef.current.x() / mmToPx(1);
      const newY = groupRef.current.y() / mmToPx(1);
      onDragEnd(component.id, { x: newX, y: newY });
    }
  };

  const isStable = component.eigenmode?.isStable ?? false;
  const fillColor = isStable ? '#9013FE' : '#F8E71C';

  return (
    <Group
      ref={groupRef}
      x={x}
      y={y}
      draggable={isDraggable}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => {
        if (isDraggable) document.body.style.cursor = 'grab';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* M1 (left mirror) */}
      <Rect
        x={-cavityLengthPx / 2}
        y={-mirrorHeight / 2}
        width={mmToPx(1)}
        height={mirrorHeight}
        fill={fillColor}
        stroke="#333"
        strokeWidth={2}
      />

      {/* Cavity space */}
      <Line
        points={[-cavityLengthPx / 2, 0, cavityLengthPx / 2, 0]}
        stroke="#999"
        strokeWidth={1}
      />

      {/* M2 (right mirror) */}
      <Rect
        x={cavityLengthPx / 2 - mmToPx(1)}
        y={-mirrorHeight / 2}
        width={mmToPx(1)}
        height={mirrorHeight}
        fill={fillColor}
        stroke="#333"
        strokeWidth={2}
      />

      {/* Label */}
      <Text
        x={cavityLengthPx / 2 + 5}
        y={-mirrorHeight / 2 - 8}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />

      {/* Length label */}
      <Text
        x={-cavityLengthPx / 4}
        y={-mirrorHeight / 2 - 20}
        text={`L=${component.length.toFixed(0)}mm`}
        fontSize={10}
        fill="#666"
        pointerEvents="none"
      />
    </Group>
  );
};
