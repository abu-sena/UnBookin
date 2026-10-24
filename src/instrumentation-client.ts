import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Sentry stays disabled in local development and any environment without a DSN.
if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
  });
}
