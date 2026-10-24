// Strict data-collection policy, the equivalent of the `sendDefaultPii: false`
// option that was removed in Sentry v11 (PRD §11: never log secrets or user
// content). Everything that could carry user content or PII is opted out.
// The shape matches `DataCollection` from @sentry/core (SentryBuildOptions).
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};
