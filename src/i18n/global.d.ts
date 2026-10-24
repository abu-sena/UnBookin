import type messages from '@/messages/id.json';

// Type augmentation for next-intl (v4): makes translation keys and the active
// locale type-checked across the app. `IntlMessages` from next-intl v3 was
// replaced by the `AppConfig.Messages` interface below.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'id';
    Messages: typeof messages;
  }
}
