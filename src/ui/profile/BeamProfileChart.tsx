import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BeamPath, PropagationResult, SourceComponent } from '../../app/state/schema';

interface BeamProfileChartProps {
  source: SourceComponent | null;
  beamPath: BeamPath | null;
  propagationResult: PropagationResult | null;
}

interface ProfilePoint {
  z: number;
  w: number;
}

function buildFallbackProfile(source: SourceComponent | null, beamPath: BeamPath | null): ProfilePoint[] {
  if (!beamPath || beamPath.segments.length === 0) {
    return [];
  }

  const radius = source ? Math.max(0.05, source.waistRadius) : 0.25;
  const points: ProfilePoint[] = [];

  points.push({ z: 0, w: radius });
  for (const segment of beamPath.segments) {
    points.push({ z: segment.zEnd, w: radius });
  }

  return points;
}

export const BeamProfileChart: React.FC<BeamProfileChartProps> = ({
  source,
  beamPath,
  propagationResult,
}) => {
  const profileData =
    propagationResult && propagationResult.profile.length > 0
      ? propagationResult.profile
      : buildFallbackProfile(source, beamPath);

  if (profileData.length === 0) {
    return <div className="profile-placeholder">No beam profile data available.</div>;
  }

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={profileData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d5dde6" />
          <XAxis
            dataKey="z"
            type="number"
            domain={[0, 'dataMax']}
            tick={{ fontSize: 11, fill: '#55677a' }}
            label={{ value: 'z (mm)', position: 'insideBottomRight', offset: -5, fill: '#55677a' }}
          />
          <YAxis
            dataKey="w"
            type="number"
            domain={['auto', 'auto']}
            tick={{ fontSize: 11, fill: '#55677a' }}
            label={{ value: 'w (mm)', angle: -90, position: 'insideLeft', fill: '#55677a' }}
          />
          <Tooltip
            formatter={(value) => {
              const numeric = typeof value === 'number' ? value : Number(value);
              return Number.isFinite(numeric) ? numeric.toFixed(4) : String(value);
            }}
            labelFormatter={(label) => {
              const numeric = typeof label === 'number' ? label : Number(label);
              return Number.isFinite(numeric) ? `z=${numeric.toFixed(2)} mm` : `z=${String(label)}`;
            }}
          />
          <Line
            dataKey="w"
            type="monotone"
            stroke="#ff6a2a"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />

          {propagationResult?.waists.map((waist, index) => (
            <ReferenceDot
              key={`waist-${index}`}
              x={waist.z}
              y={waist.w}
              r={4}
              fill="#2d9bf0"
              stroke="#ffffff"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};