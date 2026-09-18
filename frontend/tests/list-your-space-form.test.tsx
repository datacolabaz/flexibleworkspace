import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { ListYourSpaceForm } from '@/components/features/business/ListYourSpaceForm';

function renderForm() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ListYourSpaceForm />
    </NextIntlClientProvider>,
  );
}

describe('ListYourSpaceForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('rejects submission with legal/display name blank, without calling the BFF route', () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(screen.getByText('Enter your legal and display name.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the trimmed fields to /api/providers, and shows the success confirmation', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'provider-1',
          legalName: 'Acme LLC',
          displayName: 'Acme Spaces',
          category: 'Coworking',
          verificationStatus: 'PENDING',
        }),
        { status: 201 },
      ),
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: '  Acme LLC  ' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Acme Spaces  ' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '  Coworking  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(screen.getByText('Application received')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces', category: 'Coworking' }),
    });
  });

  it('omits category from the request body when left blank', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'provider-1',
          legalName: 'Acme LLC',
          displayName: 'Acme Spaces',
          verificationStatus: 'PENDING',
        }),
        { status: 201 },
      ),
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Acme LLC' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme Spaces' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces', category: undefined }),
    });
  });

  it('shows a signed-out message on a 401 UNAUTHENTICATED response', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }),
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Acme LLC' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme Spaces' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(await screen.findByText("You've been signed out. Please sign in again.")).toBeInTheDocument();
  });
});
