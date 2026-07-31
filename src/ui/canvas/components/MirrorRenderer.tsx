/**
 * MirrorRenderer: Draws a flat mirror as a reflective coating on the front
 * face of a substrate, at the correct orientation.
 *
 * component.position anchors the reflective surface exactly (the front edge
 * drawn here, unshifted) - all beam physics, hit-testing, and snapping stay
 * keyed to that surface. The substrate is drawn purely behind it for visual
 * purposes and never affects those calculations.
 */

import React, { useRef } from 'react';
import { Line, Text, Group } from 'react-konva';
import type Konva from 'konva';
import type { FlatMirrorComponent, MirrorOrientation, Point2d } from '../../../app/state/schema';

interface MirrorRendererProps {
  component: FlatMirrorComponent;
  mmToPx: (mm: number) => number;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
}

// Direction the substrate extends behind the reflective face, per
// orientation. Derived from the reflection table in beamPathResolver.ts:
// the reflective face must point back toward every valid incoming
// direction for that orientation, so the substrate sits on the far side.
const SUBSTRATE_DIRECTION: Record<MirrorOrientation, { x: number; y: number }> = {
  45: { x: 1, y: 1 },
  135: { x: 1, y: -1 },
  225: { x: -1, y: -1 },
  315: { x: -1, y: 1 },
};

export const MirrorRenderer: React.FC<MirrorRendererProps> = ({
  component,
  mmToPx,
  onDragEnd,
  onSelect,
  isDraggable,
  isSelected,
}) => {
  const lineRef = useRef<Konva.Line>(null);
  const groupRef = useRef<Konva.Group>(null);

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const mirrorLengthMm = 24; // ~grid-spacing display length
  const substrateThicknessMm = mirrorLengthMm / 4;
  const mirrorLength = mmToPx(mirrorLengthMm);
  const substrateThickness = mmToPx(substrateThicknessMm);

  // Calculate reflective-face endpoints based on orientation (45, 135, 225, 315)
  const angleRad = (-component.orientation * Math.PI) / 180;
  const dx = Math.cos(angleRad) * (mirrorLength / 2);
  const dy = Math.sin(angleRad) * (mirrorLength / 2);

  const substrateDir = SUBSTRATE_DIRECTION[component.orientation];
  const nx = substrateDir.x * Math.SQRT1_2;
  const ny = substrateDir.y * Math.SQRT1_2;

  const frontLeft: Point2d = { x: -dx, y: -dy };
  const frontRight: Point2d = { x: dx, y: dy };
  const backRight: Point2d = { x: dx + nx * substrateThickness, y: dy + ny * substrateThickness };
  const backLeft: Point2d = { x: -dx + nx * substrateThickness, y: -dy + ny * substrateThickness };

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
      onClick={() => onSelect(component.id)}
      onTap={() => onSelect(component.id)}
      onMouseEnter={() => {
        if (isDraggable) document.body.style.cursor = 'grab';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Substrate: visual only, extends behind the reflective face */}
      <Line
        points={[
          frontLeft.x, frontLeft.y,
          frontRight.x, frontRight.y,
          backRight.x, backRight.y,
          backLeft.x, backLeft.y,
        ]}
        closed
        fill={isSelected ? '#cfd8e3' : '#b7c2cf'}
        stroke={isSelected ? '#1f6feb' : '#5b6b7a'}
        strokeWidth={isSelected ? 2 : 1.5}
      />
      {/* Reflective coating: the front face, exactly at component.position */}
      <Line
        ref={lineRef}
        points={[frontLeft.x, frontLeft.y, frontRight.x, frontRight.y]}
        stroke={isSelected ? '#1f6feb' : '#4A90E2'}
        strokeWidth={isSelected ? 4 : 3}
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
