import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { ProfileForm } from '@/components/features/account/ProfileForm';
import type { Profile } from '@/lib/api-client/account';

const BASE_PROFILE: Profile = {
  id: 'user-1',
  email: 'user@example.com',
  phone: '+994501234567',
  displayName: 'Original Name',
  locale: 'az',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderForm(profile: Profile = BASE_PROFILE) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProfileForm initialProfile={profile} />
    </NextIntlClientProvider>,
  );
}

describe('ProfileForm', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the current displayName/locale as editable fields, and email/phone as read-only text', () => {
    renderForm();
    expect(screen.getByLabelText('Display name')).toHaveValue('Original Name');
    expect(screen.getByLabelText('Notification language')).toHaveValue('az');
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('+994501234567')).toBeInTheDocument();
    // Neither read-only field renders as an editable control.
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phone')).not.toBeInTheDocument();
  });

  it('shows "Not set" for a null email/phone rather than an empty line', () => {
    renderForm({ ...BASE_PROFILE, email: null, phone: null });
    expect(screen.getAllByText('Not set')).toHaveLength(2);
  });

  it('PATCHes /api/account/profile with the trimmed displayName and selected locale on submit', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...BASE_PROFILE, displayName: 'New Name', locale: 'en' }), { status: 200 }),
    );

    renderForm();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '  New Name  ' } });
    fireEvent.change(screen.getByLabelText('Notification language'), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByText('Your profile has been updated.')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/account/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'New Name', locale: 'en' }),
    });
  });

  it('rejects an empty display name without calling the BFF route', () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    renderForm();
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Enter a display name.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a signed-out message on a 401 from the BFF route', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED' } }), { status: 401 }),
    );

    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText("You've been signed out. Please sign in again.")).toBeInTheDocument();
  });
});
