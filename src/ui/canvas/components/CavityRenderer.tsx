/**
 * CavityRenderer: Draws Fabry-Perot cavity as pair of mirrors with separation.
 *
 * Each mirror is drawn as a reflective coating (a thin, possibly slightly
 * curved band facing into the cavity) plus a substrate block extending
 * outward, purely for visual depth. component.position anchors M1 and
 * component.position + length anchors M2 exactly as before - only the
 * *inner* face of each mirror sits at those positions, so nothing about the
 * physics/snapping changes.
 */

import React, { useRef } from 'react';
import { Rect, Text, Line, Group } from 'react-konva';
import type Konva from 'konva';
import type { CavityFPComponent, Point2d } from '../../../app/state/schema';

interface CavityRendererProps {
  component: CavityFPComponent;
  mmToPx: (mm: number) => number;
  onDragMove: (componentId: string, newPos: Point2d) => void;
  onDragEnd: (componentId: string, newPos: Point2d) => void;
  onSelect: (componentId: string) => void;
  isDraggable: boolean;
  isSelected: boolean;
  getSnappedDragPositionPx: (component: CavityFPComponent, rawPx: Point2d) => Point2d;
}

const CONCAVE_BOW_PX = 4;

function isConcave(radiusMm: number): boolean {
  return Number.isFinite(radiusMm) && radiusMm > 0;
}

interface MirrorFaceProps {
  /** Local coordinate along the cavity's propagation axis where the reflective surface sits. */
  axisPos: number;
  /** +1 or -1: which way along the axis the substrate extends (away from the cavity interior). */
  outwardSign: 1 | -1;
  span: number;
  thickness: number;
  radiusMm: number;
  isHorizontal: boolean;
  isSelected: boolean;
  fillColor: string;
}

const MirrorFace: React.FC<MirrorFaceProps> = ({
  axisPos,
  outwardSign,
  span,
  thickness,
  radiusMm,
  isHorizontal,
  isSelected,
  fillColor,
}) => {
  const bow = isConcave(radiusMm) ? outwardSign * CONCAVE_BOW_PX : 0;
  const substrateRectStart = outwardSign > 0 ? axisPos : axisPos - thickness;

  const coatingPoints = isHorizontal
    ? [axisPos, -span / 2, axisPos + bow, 0, axisPos, span / 2]
    : [-span / 2, axisPos, 0, axisPos + bow, span / 2, axisPos];

  return (
    <>
      <Rect
        x={isHorizontal ? substrateRectStart : -span / 2}
        y={isHorizontal ? -span / 2 : substrateRectStart}
        width={isHorizontal ? thickness : span}
        height={isHorizontal ? span : thickness}
        fill="#c2c9d1"
        stroke={isSelected ? '#1f6feb' : '#5b6b7a'}
        strokeWidth={isSelected ? 2 : 1.5}
      />
      <Line
        points={coatingPoints}
        tension={bow !== 0 ? 0.5 : 0}
        stroke={isSelected ? '#1f6feb' : fillColor}
        strokeWidth={isSelected ? 3.5 : 2.5}
        lineCap="round"
      />
    </>
  );
};

export const CavityRenderer: React.FC<CavityRendererProps> = ({
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

  // component.position anchors the input mirror (M1), not the cavity center.
  // The output mirror (M2) sits `length` further downstream, in `direction`.
  const x = mmToPx(component.position.x);
  const y = mmToPx(component.position.y);
  const cavityLengthPx = mmToPx(Math.max(1, Math.round(component.length)));
  const mirrorSpan = Math.max(12, mmToPx(24));
  const substrateThickness = Math.max(3, mirrorSpan / 4);
  const isHorizontal = component.direction === 'right' || component.direction === 'left';
  // Beam travels in +x/+y for 'right'/'down', -x/-y for 'left'/'up'.
  const dirSign = component.direction === 'right' || component.direction === 'down' ? 1 : -1;
  const m2OffsetPx = dirSign * cavityLengthPx;

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

  const isStable = component.eigenmode?.isStable ?? false;
  const fillColor = isStable ? '#9013FE' : '#F8E71C';

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
      {/* M1 (input mirror): reflective face at axis 0, substrate extends upstream (away from M2) */}
      <MirrorFace
        axisPos={0}
        outwardSign={dirSign > 0 ? -1 : 1}
        span={mirrorSpan}
        thickness={substrateThickness}
        radiusMm={component.r1}
        isHorizontal={isHorizontal}
        isSelected={isSelected}
        fillColor={fillColor}
      />

      <Line
        points={isHorizontal ? [0, 0, m2OffsetPx, 0] : [0, 0, 0, m2OffsetPx]}
        stroke="#999"
        strokeWidth={1}
      />

      {/* M2 (output mirror): reflective face `length` downstream of M1, substrate extends further downstream (away from M1) */}
      <MirrorFace
        axisPos={m2OffsetPx}
        outwardSign={dirSign > 0 ? 1 : -1}
        span={mirrorSpan}
        thickness={substrateThickness}
        radiusMm={component.r2}
        isHorizontal={isHorizontal}
        isSelected={isSelected}
        fillColor={fillColor}
      />

      {/* Label, anchored near M1 */}
      <Text
        x={isHorizontal ? -substrateThickness / 2 : mirrorSpan / 2 + 5}
        y={isHorizontal ? -mirrorSpan / 2 - 16 : -substrateThickness / 2 - 8}
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
