import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField, fieldDescribedBy } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';

describe('Button', () => {
  it('disables itself and sets aria-busy while loading (08_DESIGN_SYSTEM.md §8.2 loading state)', () => {
    render(<Button isLoading>Send code</Button>);
    const button = screen.getByRole('button', { name: 'Send code' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button');
  });
});

describe('Input', () => {
  it('marks itself invalid for assistive tech when passed invalid', () => {
    render(<Input aria-label="Email" invalid />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('has no aria-invalid attribute in the default state', () => {
    render(<Input aria-label="Email" />);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });
});

describe('FormField', () => {
  it('renders the error message and wires the field to it via fieldDescribedBy (07_UX_ARCHITECTURE.md §7.7)', () => {
    render(
      <FormField id="email" label="Email" error="Enter a valid email">
        <Input id="email" aria-describedby={fieldDescribedBy('email', { error: 'Enter a valid email' })} />
      </FormField>,
    );
    expect(screen.getByText('Enter a valid email')).toHaveAttribute('id', 'email-error');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-describedby', 'email-error');
  });

  it('falls back to the hint when there is no error, and prefers the error once one appears', () => {
    const { rerender } = render(
      <FormField id="email" label="Email" hint="We will never share this">
        <Input id="email" aria-describedby={fieldDescribedBy('email', { hint: 'We will never share this' })} />
      </FormField>,
    );
    expect(screen.getByText('We will never share this')).toHaveAttribute('id', 'email-hint');

    rerender(
      <FormField id="email" label="Email" hint="We will never share this" error="Required">
        <Input
          id="email"
          aria-describedby={fieldDescribedBy('email', { hint: 'We will never share this', error: 'Required' })}
        />
      </FormField>,
    );
    expect(screen.queryByText('We will never share this')).not.toBeInTheDocument();
    expect(screen.getByText('Required')).toHaveAttribute('id', 'email-error');
  });
});

describe('Alert', () => {
  it('uses an assertive alert role for errors', () => {
    render(<Alert variant="error">Something broke</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something broke');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('uses a polite status role for success/info messages', () => {
    render(<Alert variant="success">All set</Alert>);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('All set');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});

describe('Card', () => {
  it('renders its children inside a surface panel', () => {
    render(<Card>content</Card>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
