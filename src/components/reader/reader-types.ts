import type { LayerValue } from '@/components/module/layer-toggle';
import type { ModuleContent } from '@/lib/engine/module-content';
import type { ChecklistState } from '@/lib/learning/schemas';

export type ReaderModuleProps = {
  unbookId: string;
  moduleId: string;
  title: string;
  content: ModuleContent;
  status: 'not_started' | 'reading' | 'read';
  deepestLayer: LayerValue;
  checklist: ChecklistState;
  quizId: string | null;
  quizQuestionCount: number;
  reviewCardCount: number;
  plannedActionId: string | null;
  nextModuleId: string | null;
  /** Deep link from the quiz "Pelajari ulang": open Pahami at this layer, skip position restore. */
  focusLayer?: LayerValue | null;
};
