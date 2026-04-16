import { useAppStore } from '../adapters/useAppStore';

export function StatusBar() {
  const { state } = useAppStore();

  const pathValue = !state.sourceId
    ? 'No source placed'
    : state.beamPath?.isValid
      ? `${state.beamPath.segments.length} segment(s)`
      : state.beamPath?.invalidReason ?? 'Invalid path';

  const bestOverlap = state.optimiser.solutions.length > 0
    ? `${(state.optimiser.solutions[0].overlap * 100).toFixed(1)}%`
    : state.targetMode
      ? 'Pending solve'
      : 'Target unset';

  const statusItems = [
    { label: 'Path', value: pathValue },
    { label: 'Overlap', value: bestOverlap },
    { label: 'Solver', value: state.optimiser.status },
  ];

  return (
    <section className="status-bar" aria-label="Simulation status">
      {statusItems.map((item) => (
        <div className="status-pill" key={item.label}>
          <strong>{item.label}</strong>
          <span>{item.value}</span>
        </div>
      ))}
    </section>
  );
}
