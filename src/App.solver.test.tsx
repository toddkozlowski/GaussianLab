import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

describe('Layer 5 solver workflow', () => {
  it('supports target-object solve and solution preview/apply flow', async () => {
    render(<App />);

    // Ensure at least one movable lens exists for optimization.
    fireEvent.click(screen.getByRole('button', { name: '+ Lens' }));

    // Add a target object (placed on the beam by default) to mode-match against.
    fireEvent.click(screen.getByRole('button', { name: '+ Target' }));

    // Expand mode-matching controls (collapsed by default).
    fireEvent.click(screen.getByRole('button', { name: 'Expand mode matching' }));

    // Selecting the target object from the dropdown implicitly primes it as
    // the mode-matching target - no separate confirmation button.
    const targetSelect = screen.getByRole('combobox');
    const targetOption = within(targetSelect).getByText(/\(target\)/);
    fireEvent.change(targetSelect, { target: { value: (targetOption as HTMLOptionElement).value } });

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