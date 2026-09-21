'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AdminPasswordForm({ redirectTo = '/admin' }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Email və ya şifrə yanlışdır.');
      router.push(redirectTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Admin giriş mümkün olmadı.');
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="flex flex-col gap-4" onSubmit={submit}>
    <div>
      <p className="text-label font-semibold text-text-primary">Admin girişi</p>
      <p className="mt-1 text-small text-text-secondary">Bu giriş yalnız admin rolu olan hesablar üçündür.</p>
    </div>
    {error && <Alert variant="error">{error}</Alert>}
    <label className="flex flex-col gap-2 text-label">Admin email<Input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@spotva.co" /></label>
    <label className="flex flex-col gap-2 text-label">Şifrə<Input type="password" autoComplete="current-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 12 simvol" /></label>
    <Button type="submit" fullWidth isLoading={submitting}>{submitting ? 'Yoxlanılır…' : 'Admin panelinə daxil ol'}</Button>
  </form>;
}
