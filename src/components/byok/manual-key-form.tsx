'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { connectManualKey } from '@/lib/byok/actions';

type ManualKeyFormProps = {
  onConnected: (last4: string) => void;
};

function errorKey(code: string | null | undefined):
  | 'errors.byokKeyRejected'
  | 'errors.byokKeyMissing'
  | 'errors.invalidInput'
  | 'errors.generic' {
  switch (code) {
    case 'byokKeyRejected':
      return 'errors.byokKeyRejected';
    case 'byokKeyMissing':
      return 'errors.byokKeyMissing';
    case 'invalidInput':
      return 'errors.invalidInput';
    default:
      return 'errors.generic';
  }
}

/** E12: manual key entry. The value is never echoed and is cleared after submit. */
export function ManualKeyForm({ onConnected }: ManualKeyFormProps) {
  const t = useTranslations('byokSettings');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await connectManualKey({ key });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onConnected(result.data.last4);
    } finally {
      setKey('');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" autoComplete="off">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="byok-manual-key">{t('keyLabel')}</Label>
        <Input
          id="byok-manual-key"
          name="byok-key"
          type="password"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          placeholder={t('keyPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11"
        />
      </div>
      {error ? (
        <p role="alert" className="text-danger text-small">
          {t(errorKey(error))}
        </p>
      ) : null}
      <Button type="submit" className="min-h-11 w-full" disabled={saving || key.trim().length < 20}>
        {saving ? t('saving') : t('saveKey')}
      </Button>
    </form>
  );
}