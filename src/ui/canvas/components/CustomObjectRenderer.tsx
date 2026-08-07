/**
 * CustomObjectRenderer: Draws a flat-faced dielectric slab as a shaded band
 * extending downstream from component.position (its front face) along the
 * beam axis, for `thickness` mm to its back face. Both faces are strictly
 * flat (normal incidence), so the band is always axis-aligned in 2D.
 */

import React, { useRef } from 'react';
import { Group, Line, Text } from 'react-konva';
import type Konva from 'konva';
import type { CardinalDirection, CustomObjectComponent, Point2d } from '../../../app/state/schema';

interface CustomObjectRendererProps {
  component: CustomObjectComponent;
  mmToPx: (mm: number) => number;
  axisDirection: CardinalDirection | null;
  onDragMove: (componentId: string, newPos: Point2d) => void;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
  getSnappedDragPositionPx: (component: CustomObjectComponent, rawPx: Point2d) => Point2d;
}

// Unit vector the beam continues along after passing through (unchanged by
// this component - it's a pure pass-through slab, not a reflector).
const DIRECTION_UNIT: Record<CardinalDirection, Point2d> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

export const CustomObjectRenderer: React.FC<CustomObjectRendererProps> = ({
  component,
  mmToPx,
  axisDirection,
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

  const dir = DIRECTION_UNIT[axisDirection ?? 'right'];
  const perp: Point2d = { x: -dir.y, y: dir.x };
  const thicknessPx = mmToPx(component.thickness);
  const halfWidthPx = Math.max(6, mmToPx(10));

  const frontLeft: Point2d = { x: perp.x * halfWidthPx, y: perp.y * halfWidthPx };
  const frontRight: Point2d = { x: -perp.x * halfWidthPx, y: -perp.y * halfWidthPx };
  const backLeft: Point2d = {
    x: dir.x * thicknessPx + perp.x * halfWidthPx,
    y: dir.y * thicknessPx + perp.y * halfWidthPx,
  };
  const backRight: Point2d = {
    x: dir.x * thicknessPx - perp.x * halfWidthPx,
    y: dir.y * thicknessPx - perp.y * halfWidthPx,
  };
  const labelAnchor: Point2d = {
    x: dir.x * (thicknessPx / 2) + perp.x * (halfWidthPx + 6),
    y: dir.y * (thicknessPx / 2) + perp.y * (halfWidthPx + 6),
  };

  // Optically inert at n=1 (still occupies physical space, but affects no
  // propagation) - shown as a neutral gray rather than the active tint.
  const isOpticallyActive = Math.abs(component.indexOfRefraction - 1) > 1e-9;
  const faceColor = isSelected ? '#1f6feb' : isOpticallyActive ? '#3d7ea6' : '#8a939c';

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
      <Line
        points={[
          frontLeft.x, frontLeft.y,
          backLeft.x, backLeft.y,
          backRight.x, backRight.y,
          frontRight.x, frontRight.y,
        ]}
        closed
        fill={isOpticallyActive ? 'rgba(94, 158, 214, 0.28)' : 'rgba(148, 158, 168, 0.22)'}
        stroke={faceColor}
        strokeWidth={isSelected ? 3 : 1.5}
      />
      {/* Face highlights: both faces are strictly flat (normal incidence) */}
      <Line points={[frontLeft.x, frontLeft.y, frontRight.x, frontRight.y]} stroke={faceColor} strokeWidth={2} />
      <Line points={[backLeft.x, backLeft.y, backRight.x, backRight.y]} stroke={faceColor} strokeWidth={2} />

      <Text
        x={labelAnchor.x - 10}
        y={labelAnchor.y - 6}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />
    </Group>
  );
};
