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
    { label: 'P', value: pathValue },
    { label: 'O', value: bestOverlap },
    { label: 'S', value: state.optimiser.status },
  ];

  return (
    <section className="status-corner" aria-label="Simulation status">
      {statusItems.map((item) => (
        <div className="status-chip" key={item.label}>
          <strong>{item.label}</strong>
          <span title={item.value}>{item.value}</span>
        </div>
      ))}
    </section>
  );
}
