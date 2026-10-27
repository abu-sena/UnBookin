import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { ingestSource } from '@/inngest/ingest-source';

export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestSource],
});
