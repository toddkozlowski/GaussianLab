/**
 * MirrorRenderer: Draws flat mirror component at correct orientation
 */

import React, { useRef } from 'react';
import { Line, Text, Group } from 'react-konva';
import type Konva from 'konva';
import type { FlatMirrorComponent, Point2d } from '../../../app/state/schema';

interface MirrorRendererProps {
  component: FlatMirrorComponent;
  mmToPx: (mm: number) => number;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  isDraggable: boolean;
}

export const MirrorRenderer: React.FC<MirrorRendererProps> = ({
  component,
  mmToPx,
  onDragEnd,
  isDraggable,
}) => {
  const lineRef = useRef<Konva.Line>(null);
  const groupRef = useRef<Konva.Group>(null);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const mirrorLength = mmToPx(8); // 8mm display length

  // Calculate endpoints based on orientation (45, 135, 225, 315)
  const angleRad = (component.orientation * Math.PI) / 180;
  const dx = Math.cos(angleRad) * (mirrorLength / 2);
  const dy = Math.sin(angleRad) * (mirrorLength / 2);

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
      onDragEnd={handleDragEnd}
      onMouseEnter={() => {
        if (isDraggable) document.body.style.cursor = 'grab';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <Line
        ref={lineRef}
        points={[-dx, -dy, dx, dy]}
        stroke="#4A90E2"
        strokeWidth={3}
        lineCap="round"
      />
      <Text
        x={dx + 5}
        y={dy - 8}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />
    </Group>
  );
};
