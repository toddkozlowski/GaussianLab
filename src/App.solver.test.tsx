import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('Layer 5 solver workflow', () => {
  it('supports manual target solve and solution preview/apply flow', async () => {
    render(<App />);

    // Ensure at least one movable lens exists for optimization.
    fireEvent.click(screen.getByRole('button', { name: 'Add thin lens' }));

    // Configure manual target and run solver.
    fireEvent.click(screen.getByRole('button', { name: 'Use manual target' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }));

    // Solver should produce at least one solution card with Preview/Apply actions.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Preview' }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: 'Apply' }).length).toBeGreaterThan(0);
    });

    // Exercise preview + apply interactions.
    fireEvent.click(screen.getAllByRole('button', { name: 'Preview' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]);

    // Solver summaries remain present after preview/apply operations.
    expect(screen.getAllByText(/Overlap/i).length).toBeGreaterThan(0);
  });
});