import 'server-only';
import { buildActionFeedbackPrompt } from '@/lib/ai/prompts/action-feedback';
import { runStructuredTask } from '@/lib/ai/structured';
import { JournalError } from './errors';
import type { ActionReportSnapshot } from './queries';
import { actionFeedbackResultSchema, type JournalIdentity } from './schemas';

export type ActionFeedbackGrade = {
  qualityScore: number;
  feedback: string;
};

export type ActionFeedbackContext = {
  moduleTitle: string;
  moduleSummary: string;
  content: ActionReportSnapshot['content'];
  whatIDid: string;
  result: string;
  reflection: string;
  evidenceUrl?: string | null;
};

/**
 * E7-02 AC2: grade one application report with the `action_feedback` task.
 * The module/report/evidence text is only sent to the AI task and is never
 * logged. Any config, provider or invalid-output failure is a safe
 * `gradingUnavailable`; no report is stored here, so a revision is not burned.
 */
export async function gradeActionFeedback(
  identity: JournalIdentity,
  context: ActionFeedbackContext,
): Promise<ActionFeedbackGrade> {
  try {
    const result = await runStructuredTask({
      task: 'action_feedback',
      schema: actionFeedbackResultSchema,
      prompt: buildActionFeedbackPrompt({
        moduleTitle: context.moduleTitle,
        moduleSummary: context.moduleSummary,
        practitioner: context.content?.layers?.practitioner ?? [],
        whatIDid: context.whatIDid,
        result: context.result,
        reflection: context.reflection,
        evidenceUrl: context.evidenceUrl ?? null,
      }),
      userId: identity.userId,
      timeoutMs: 25_000,
      deadlineMs: 30_000,
    });
    return result.data;
  } catch (error) {
    if (error instanceof JournalError) throw error;
    throw new JournalError('gradingUnavailable');
  }
}
