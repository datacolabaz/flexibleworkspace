import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Logo } from '@/components/ui/Logo';

describe('Logo', () => {
  it('renders both light and dark images for the theme-aware default variant', () => {
    const { container } = render(<Logo />);
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveClass('spotva-logo-light');
    expect(images[1]).toHaveClass('spotva-logo-dark');
  });

  it('renders a single forced-variant image when asked for one explicitly', () => {
    const { container } = render(<Logo variant="mono" />);
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/brand/logo-horizontal-mono.svg');
  });

  it('has an accessible label on the theme-aware wrapper', () => {
    const { getByRole } = render(<Logo ariaLabel="Spotva" />);
    expect(getByRole('img', { name: 'Spotva' })).toBeInTheDocument();
  });
});
