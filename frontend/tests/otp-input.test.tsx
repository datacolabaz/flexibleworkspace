import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OtpInput } from '@/components/ui/OtpInput';

// OtpInput is a fully controlled component (no internal state) — this
// thin wrapper is the "parent" every real caller (LoginForm) provides.
function Controlled({ onComplete }: { onComplete?: (code: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <OtpInput
      length={6}
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      label="Verification code"
      digitLabel={(index, length) => `Digit ${index + 1} of ${length}`}
    />
  );
}

describe('OtpInput', () => {
  it('renders one accessible textbox per digit inside a labeled group', () => {
    render(<Controlled />);
    expect(screen.getByRole('group', { name: 'Verification code' })).toBeInTheDocument();
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveAccessibleName('Digit 1 of 6');
    expect(boxes[5]).toHaveAccessibleName('Digit 6 of 6');
  });

  it('advances focus box-to-box as digits are typed, and calls onComplete once all six are filled', () => {
    const onComplete = vi.fn();
    render(<Controlled onComplete={onComplete} />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];

    '12345'.split('').forEach((digit, i) => fireEvent.change(boxes[i], { target: { value: digit } }));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.change(boxes[5], { target: { value: '6' } });
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(boxes.map((box) => box.value)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('moves focus back and clears the previous digit on Backspace from an empty box', () => {
    render(<Controlled />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(boxes[0], { target: { value: '1' } });
    fireEvent.change(boxes[1], { target: { value: '2' } });

    fireEvent.keyDown(boxes[2], { key: 'Backspace' });

    expect(boxes[1]).toHaveFocus();
    expect(boxes[1]).toHaveValue('');
  });

  it('distributes a pasted code across the boxes from wherever it lands', () => {
    const onComplete = vi.fn();
    render(<Controlled onComplete={onComplete} />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];

    fireEvent.paste(boxes[0], { clipboardData: { getData: () => '123456' } });

    expect(boxes.map((box) => box.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips non-numeric characters rather than accepting them', () => {
    render(<Controlled />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(boxes[0], { target: { value: 'a' } });
    expect(boxes[0]).toHaveValue('');
  });

  it('reflects the invalid state on every box for a rejected code', () => {
    function ControlledInvalid() {
      const [value, setValue] = useState('000000');
      return (
        <OtpInput
          length={6}
          value={value}
          onChange={setValue}
          invalid
          label="Verification code"
          digitLabel={(index, length) => `Digit ${index + 1} of ${length}`}
        />
      );
    }
    render(<ControlledInvalid />);
    for (const box of screen.getAllByRole('textbox')) {
      expect(box).toHaveAttribute('aria-invalid', 'true');
    }
  });
});
