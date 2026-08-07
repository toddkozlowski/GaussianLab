/**
 * SourceRenderer: Draws the laser source as a laser-pointer pen, roughly two
 * grid spaces long, aimed along component.direction.
 *
 * component.position anchors the aperture exactly (the front edge drawn
 * here, unshifted) - beam physics stays keyed to that point. The casing
 * trails behind it, purely for visual purposes.
 */

import React, { useRef } from 'react';
import { Circle, Group, Line, Text } from 'react-konva';
import type Konva from 'konva';
import type { CardinalDirection, Point2d, SourceComponent } from '../../../app/state/schema';

interface SourceRendererProps {
  component: SourceComponent;
  mmToPx: (mm: number) => number;
  spacingMm: number;
  onDragMove: (componentId: string, newPos: Point2d) => void;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
  getSnappedDragPositionPx: (component: SourceComponent, rawPx: Point2d) => Point2d;
}

// Unit vector the beam launches along, per direction.
const DIRECTION_UNIT: Record<CardinalDirection, Point2d> = {
  right: { x: 1, y: 0 },
  left: { x: -1, y: 0 },
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
};

export const SourceRenderer: React.FC<SourceRendererProps> = ({
  component,
  mmToPx,
  spacingMm,
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

  const lengthPx = mmToPx(spacingMm * 2);
  const noseLengthPx = lengthPx * 0.28;
  const halfWidthPx = Math.max(3, lengthPx * 0.09);

  const dir = DIRECTION_UNIT[component.direction];
  const perp: Point2d = { x: -dir.y, y: dir.x };

  const tip: Point2d = { x: 0, y: 0 };
  const tipLeft: Point2d = { x: perp.x * halfWidthPx, y: perp.y * halfWidthPx };
  const tipRight: Point2d = { x: -perp.x * halfWidthPx, y: -perp.y * halfWidthPx };
  const noseBackCenter: Point2d = { x: -dir.x * noseLengthPx, y: -dir.y * noseLengthPx };
  const noseBackLeft: Point2d = {
    x: noseBackCenter.x + perp.x * halfWidthPx,
    y: noseBackCenter.y + perp.y * halfWidthPx,
  };
  const noseBackRight: Point2d = {
    x: noseBackCenter.x - perp.x * halfWidthPx,
    y: noseBackCenter.y - perp.y * halfWidthPx,
  };
  const bodyBackCenter: Point2d = { x: -dir.x * lengthPx, y: -dir.y * lengthPx };
  const bodyBackLeft: Point2d = {
    x: bodyBackCenter.x + perp.x * halfWidthPx,
    y: bodyBackCenter.y + perp.y * halfWidthPx,
  };
  const bodyBackRight: Point2d = {
    x: bodyBackCenter.x - perp.x * halfWidthPx,
    y: bodyBackCenter.y - perp.y * halfWidthPx,
  };
  const buttonCenter: Point2d = {
    x: -dir.x * (noseLengthPx + (lengthPx - noseLengthPx) * 0.45),
    y: -dir.y * (noseLengthPx + (lengthPx - noseLengthPx) * 0.45),
  };
  const labelAnchor: Point2d = {
    x: bodyBackCenter.x + perp.x * (halfWidthPx + 6) - dir.x * 4,
    y: bodyBackCenter.y + perp.y * (halfWidthPx + 6) - dir.y * 4,
  };

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
        if (isDraggable) document.body.style.cursor = 'grab';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Casing: the full-length pen body, from the aperture back to the grip */}
      <Line
        points={[
          tipLeft.x, tipLeft.y,
          bodyBackLeft.x, bodyBackLeft.y,
          bodyBackRight.x, bodyBackRight.y,
          tipRight.x, tipRight.y,
        ]}
        closed
        fill="#2c2f36"
        stroke={isSelected ? '#1f6feb' : '#111318'}
        strokeWidth={isSelected ? 2.5 : 1.5}
      />
      {/* Power-button accent */}
      <Circle x={buttonCenter.x} y={buttonCenter.y} radius={Math.max(1.5, halfWidthPx * 0.4)} fill="#FF6B6B" />
      {/* Aperture cap: same width as the body, no taper */}
      <Line
        points={[
          tipLeft.x, tipLeft.y,
          noseBackLeft.x, noseBackLeft.y,
          noseBackRight.x, noseBackRight.y,
          tipRight.x, tipRight.y,
        ]}
        closed
        fill="#FF6B6B"
        stroke={isSelected ? '#1f6feb' : '#8B0000'}
        strokeWidth={isSelected ? 2.5 : 1.5}
      />
      {/* Aperture: exactly at component.position, where the beam launches */}
      <Circle x={tip.x} y={tip.y} radius={Math.max(1.5, halfWidthPx * 0.35)} fill="#fff" stroke="#FF6B6B" strokeWidth={1} />

      <Text
        x={labelAnchor.x}
        y={labelAnchor.y - 6}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />
    </Group>
  );
};
