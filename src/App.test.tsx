import { render, screen } from '@testing-library/react';
import App from './App';

describe('App shell', () => {
  it('renders the main scaffold sections', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Optical Table' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unfolded Beam Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Component Palette' })).toBeInTheDocument();
  });
});
