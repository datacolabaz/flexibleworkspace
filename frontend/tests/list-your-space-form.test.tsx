import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { ListYourSpaceForm } from '@/components/features/business/ListYourSpaceForm';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

function renderForm() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ListYourSpaceForm />
    </NextIntlClientProvider>,
  );
}

function attachLogo() {
  const file = new File(['fake-image-bytes'], 'logo.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Logo / cover photo'), { target: { files: [file] } });
}

describe('ListYourSpaceForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it('rejects submission with legal/display name blank, without calling the BFF route', () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(screen.getByText('Enter your legal and display name.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects submission with no logo attached, without calling the BFF route', () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Acme LLC' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme Spaces' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(screen.getByText('Please upload a logo / cover photo.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the trimmed fields to /api/providers, uploads the logo, and redirects straight into /provider', async () => {
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
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'provider-1' }), { status: 200 }));

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: '  Acme LLC  ' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Acme Spaces  ' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '  Coworking  ' } });
    attachLogo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/provider'));
    expect(fetchMock).toHaveBeenCalledWith('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces', category: 'Coworking' }),
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/providers/provider-1/logo', expect.objectContaining({ method: 'POST' }));
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
    attachLogo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/provider'));
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
    attachLogo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(await screen.findByText("You've been signed out. Please sign in again.")).toBeInTheDocument();
  });
});
