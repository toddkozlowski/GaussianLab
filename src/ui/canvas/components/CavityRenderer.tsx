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
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
}

export const CavityRenderer: React.FC<CavityRendererProps> = ({
  component,
  mmToPx,
  onDragEnd,
  onSelect,
  isDraggable,
  isSelected,
}) => {
  const groupRef = useRef<Konva.Group>(null);

  // component.position anchors the input mirror (M1), not the cavity center.
  // The output mirror (M2) sits `length` further downstream, in `direction`.
  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const cavityLengthPx = mmToPx(Math.max(1, Math.round(component.length)));
  const mirrorThickness = Math.max(2, mmToPx(1));
  const mirrorSpan = Math.max(12, mmToPx(24));
  const isHorizontal = component.direction === 'right' || component.direction === 'left';
  // Beam travels in +x/+y for 'right'/'down', -x/-y for 'left'/'up'.
  const dirSign = component.direction === 'right' || component.direction === 'down' ? 1 : -1;
  const m2OffsetPx = dirSign * cavityLengthPx;
  const m1RectX = -mirrorThickness / 2;
  const m2RectX = m2OffsetPx - mirrorThickness / 2;
  const m1RectY = -mirrorThickness / 2;
  const m2RectY = m2OffsetPx - mirrorThickness / 2;

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
      onClick={() => onSelect(component.id)}
      onTap={() => onSelect(component.id)}
      onMouseEnter={() => {
        if (isDraggable) document.body.style.cursor = 'grab';
      }}
      onMouseLeave={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {isHorizontal ? (
        <>
          {/* M1 (input mirror), anchored at the component position */}
          <Rect
            x={m1RectX}
            y={-mirrorSpan / 2}
            width={mirrorThickness}
            height={mirrorSpan}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
          <Line
            points={[0, 0, m2OffsetPx, 0]}
            stroke="#999"
            strokeWidth={1}
          />
          {/* M2 (output mirror), `length` downstream of M1 */}
          <Rect
            x={m2RectX}
            y={-mirrorSpan / 2}
            width={mirrorThickness}
            height={mirrorSpan}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
        </>
      ) : (
        <>
          {/* M1 (input mirror), anchored at the component position */}
          <Rect
            x={-mirrorSpan / 2}
            y={m1RectY}
            width={mirrorSpan}
            height={mirrorThickness}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
          <Line
            points={[0, 0, 0, m2OffsetPx]}
            stroke="#999"
            strokeWidth={1}
          />
          {/* M2 (output mirror), `length` downstream of M1 */}
          <Rect
            x={-mirrorSpan / 2}
            y={m2RectY}
            width={mirrorSpan}
            height={mirrorThickness}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
        </>
      )}

      {/* Label, anchored near M1 */}
      <Text
        x={isHorizontal ? -mirrorThickness / 2 : mirrorSpan / 2 + 5}
        y={isHorizontal ? -mirrorSpan / 2 - 16 : -mirrorThickness / 2 - 8}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />

      {/* Length label, centered between M1 and M2 */}
      <Text
        x={isHorizontal ? m2OffsetPx / 2 - 12 : mirrorSpan / 2 + 5}
        y={isHorizontal ? -mirrorSpan / 2 - 2 : m2OffsetPx / 2 - 6}
        text={`L=${Math.round(component.length)}mm`}
        fontSize={10}
        fill="#666"
        pointerEvents="none"
      />
    </Group>
  );
};
