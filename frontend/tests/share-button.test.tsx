import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { ShareButton } from '@/components/features/rooms/ShareButton';

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ShareButton title="Sunny Meeting Room" url="https://spotva.example/en/rooms/room-1" />
    </NextIntlClientProvider>,
  );
}

describe('ShareButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error -- cleaning up a test-only stub on navigator.
    delete navigator.share;
  });

  it('uses the Web Share API when the browser supports it', () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: shareMock, clipboard: { writeText: vi.fn() } });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(shareMock).toHaveBeenCalledWith({ title: 'Sunny Meeting Room', url: 'https://spotva.example/en/rooms/room-1' });
  });

  it('falls back to copying the link and shows a confirmation when Web Share is unavailable', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: writeTextMock } });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith('https://spotva.example/en/rooms/room-1'));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });
});
