'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

type Setting = { key: string; value: string };

const LABELS: Record<string, string> = {
  'social.instagram': 'Instagram',
  'social.facebook': 'Facebook',
  'social.tiktok': 'TikTok',
  'social.linkedin': 'LinkedIn',
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | T | undefined;
  if (!response.ok) {
    throw new Error((body as { error?: { message?: string } } | undefined)?.error?.message ?? 'Sorğu uğursuz oldu.');
  }
  return body as T;
}

export function SiteSettingsSection() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    requestJson<Setting[]>('/api/admin/site-settings')
      .then(setSettings)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = Object.fromEntries(settings.map((row) => [row.key, row.value]));
      const saved = await requestJson<Setting[]>('/api/admin/site-settings', {
        method: 'PATCH',
        body: JSON.stringify({ settings: payload }),
      });
      setSettings(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sorğu uğursuz oldu.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-h3">Sosial linklər</h2>
      <p className="mt-2 text-small text-text-secondary">Boş URL footer-də ikonu gizlədir. Dəyərlər footer-ə hardcoded deyil.</p>
      {error && <p className="mt-3 text-small text-error">{error}</p>}
      <form className="mt-5 space-y-4" onSubmit={save}>
        {settings.map((row) => (
          <label key={row.key} className="block">
            <span className="text-label text-text-primary">{LABELS[row.key] ?? row.key}</span>
            <Input
              className="mt-2"
              value={row.value}
              placeholder="https://"
              onChange={(event) => setSettings((current) => current.map((item) => item.key === row.key ? { ...item, value: event.target.value } : item))}
            />
          </label>
        ))}
        <Button type="submit" isLoading={busy}>Yadda saxla</Button>
      </form>
    </Card>
  );
}
