import { getRequestConfig } from 'next-intl/server';

// The MVP ships in Indonesian only (PRD §5.1), so the locale is fixed to `id`
// and there is no locale-based routing.
export const locale = 'id' as const;

export default getRequestConfig(async () => ({
  locale,
  messages: (await import('../messages/id.json')).default,
}));
