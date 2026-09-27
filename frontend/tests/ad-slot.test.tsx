import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '../messages/en.json';
import { AdSlot } from '@/components/features/ads/AdSlot';

const fetchMock = vi.fn();

describe('AdSlot', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ recorded: true }) });
    vi.stubGlobal('fetch', fetchMock);
    class ImmediateObserver {
      callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = '';
      thresholds = [0.5];
    }
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('reserves a stable creative box and records an impression when visible', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AdSlot
          slot={{
            placementKey: 'homepage_sidebar',
            rotationIntervalSeconds: 45,
            ads: [{
              id: 'ad-1',
              advertiserName: 'Acme',
              creativeUrl: 'https://cdn.example/a.jpg',
              clickUrl: 'https://acme.example',
              weight: 1,
              creativeSize: '336x280',
            }],
          }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('img', { name: 'Acme' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ type: 'impression' });
  });

  it('falls back to the house advertise CTA when the slot is empty', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AdSlot slot={{ placementKey: 'homepage_sidebar', rotationIntervalSeconds: 45, ads: [] }} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link', { name: /Advertising options/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
