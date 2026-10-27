import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { generateUnbook } from '@/inngest/generate-unbook';
import { ingestSource } from '@/inngest/ingest-source';
import { regenerateQuiz } from '@/inngest/regenerate-quiz';

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestSource, generateUnbook, regenerateQuiz],
});
