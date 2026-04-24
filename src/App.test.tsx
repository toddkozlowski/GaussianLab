import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { getGlobalStore } from './app/state/Store';

describe('App shell', () => {
  it('renders the main scaffold sections', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Unfolded Beam Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Beam Path Components' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mode Matching' })).toBeInTheDocument();
  });

  it('computes cavity eigenmode in the live app when a cavity is added', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '+ Cavity' }));

    await waitFor(() => {
      const store = getGlobalStore();
      const cavity = Object.values(store.getState().components).find((component) => component.kind === 'cavity_fp');
      expect(cavity).toBeTruthy();
      expect(cavity?.kind).toBe('cavity_fp');
      if (cavity?.kind === 'cavity_fp') {
        expect(cavity.eigenmode).not.toBeNull();
        expect(cavity.eigenmode?.waistRadius).toBeGreaterThan(0);
      }
    });
  });
});
