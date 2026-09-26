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

/**
 * Stub fetch globally. On each call, if the first arg contains
 * 'location-categories' return an empty array so the form falls back to
 * its static list and doesn't consume one of the test-specific mocked
 * responses. Otherwise delegate to the per-test mock queue.
 */
function setupFetch(queue: Response[] = []) {
  let qi = 0;
  const fetchMock = vi.fn().mockImplementation((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (urlStr.includes('location-categories')) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    const res = queue[qi++];
    return res ? Promise.resolve(res) : Promise.resolve(new Response('{}', { status: 500 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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
    setupFetch();
    pushMock.mockClear();
    refreshMock.mockClear();
  });

  it('rejects submission with legal/display name blank, without calling the BFF route', () => {
    const fetchMock = setupFetch();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(screen.getByText('Enter your legal and display name.')).toBeInTheDocument();
    // Only the location-categories fetch should have been called, not the providers endpoint
    expect(fetchMock).not.toHaveBeenCalledWith('/api/providers', expect.anything());
  });

  it('rejects submission with no logo attached, without calling the BFF route', () => {
    const fetchMock = setupFetch();
    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Acme LLC' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme Spaces' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(screen.getByText('Please upload a logo / cover photo.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/providers', expect.anything());
  });

  it('POSTs the trimmed fields to /api/providers, uploads the logo, and redirects straight into /provider', async () => {
    const fetchMock = setupFetch([
      new Response(
        JSON.stringify({
          id: 'provider-1',
          legalName: 'Acme LLC',
          displayName: 'Acme Spaces',
          verificationStatus: 'PENDING',
        }),
        { status: 201 },
      ),
      new Response(JSON.stringify({ id: 'provider-1' }), { status: 200 }),
      // refresh call to rotate the access token after the new PROVIDER_OWNER role is granted
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ]);

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: '  Acme LLC  ' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  Acme Spaces  ' } });

    // P2: categories are now multi-select checkboxes loaded from the static fallback list.
    // Check "Coworking" checkbox.
    const coworkingCheckbox = await screen.findByRole('checkbox', { name: 'Coworking' });
    fireEvent.click(coworkingCheckbox);

    attachLogo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/provider'));
    expect(fetchMock).toHaveBeenCalledWith('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces', categories: ['coworking'] }),
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/providers/provider-1/logo', expect.objectContaining({ method: 'POST' }));
  });

  it('omits categories from the request body when none are selected', async () => {
    const fetchMock = setupFetch([
      new Response(
        JSON.stringify({
          id: 'provider-1',
          legalName: 'Acme LLC',
          displayName: 'Acme Spaces',
          verificationStatus: 'PENDING',
        }),
        { status: 201 },
      ),
      // logo upload (best-effort, but needs a response object to avoid TypeError)
      new Response(JSON.stringify({}), { status: 200 }),
      // refresh call
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ]);

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Acme LLC' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme Spaces' } });
    attachLogo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/provider'));
    expect(fetchMock).toHaveBeenCalledWith('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legalName: 'Acme LLC', displayName: 'Acme Spaces' }),
    });
  });

  it('shows a signed-out message on a 401 UNAUTHENTICATED response', async () => {
    setupFetch([
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }),
    ]);

    renderForm();
    fireEvent.change(screen.getByLabelText('Legal business name'), { target: { value: 'Acme LLC' } });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Acme Spaces' } });
    attachLogo();
    fireEvent.click(screen.getByRole('button', { name: 'Submit application' }));

    expect(await screen.findByText("You've been signed out. Please sign in again.")).toBeInTheDocument();
  });
});
