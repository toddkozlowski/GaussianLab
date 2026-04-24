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

  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const cavityLengthPx = mmToPx(Math.max(1, Math.round(component.length)));
  const mirrorThickness = Math.max(2, mmToPx(1));
  const mirrorSpan = Math.max(12, mmToPx(24));
  const isHorizontal = component.direction === 'right' || component.direction === 'left';
  const leftMirrorX = -cavityLengthPx / 2 - mirrorThickness / 2;
  const rightMirrorX = cavityLengthPx / 2 - mirrorThickness / 2;
  const topMirrorY = -cavityLengthPx / 2 - mirrorThickness / 2;
  const bottomMirrorY = cavityLengthPx / 2 - mirrorThickness / 2;

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
          <Rect
            x={leftMirrorX}
            y={-mirrorSpan / 2}
            width={mirrorThickness}
            height={mirrorSpan}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
          <Line
            points={[-cavityLengthPx / 2, 0, cavityLengthPx / 2, 0]}
            stroke="#999"
            strokeWidth={1}
          />
          <Rect
            x={rightMirrorX}
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
          <Rect
            x={-mirrorSpan / 2}
            y={topMirrorY}
            width={mirrorSpan}
            height={mirrorThickness}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
          <Line
            points={[0, -cavityLengthPx / 2, 0, cavityLengthPx / 2]}
            stroke="#999"
            strokeWidth={1}
          />
          <Rect
            x={-mirrorSpan / 2}
            y={bottomMirrorY}
            width={mirrorSpan}
            height={mirrorThickness}
            fill={fillColor}
            stroke={isSelected ? '#1f6feb' : '#333'}
            strokeWidth={isSelected ? 3 : 2}
          />
        </>
      )}

      {/* Label */}
      <Text
        x={isHorizontal ? cavityLengthPx / 2 + 5 : mirrorSpan / 2 + 5}
        y={isHorizontal ? -mirrorSpan / 2 - 8 : -cavityLengthPx / 2 - 16}
        text={component.label}
        fontSize={12}
        fill="#333"
        pointerEvents="none"
      />

      {/* Length label */}
      <Text
        x={isHorizontal ? -cavityLengthPx / 4 : mirrorSpan / 2 + 5}
        y={isHorizontal ? -mirrorSpan / 2 - 20 : -cavityLengthPx / 2 - 2}
        text={`L=${Math.round(component.length)}mm`}
        fontSize={10}
        fill="#666"
        pointerEvents="none"
      />
    </Group>
  );
};
