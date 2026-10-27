import { describe, expect, it } from 'vitest';
import messages from '@/messages/id.json';

function read(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((node, key) => {
      if (node && typeof node === 'object' && key in node) {
        return (node as Record<string, unknown>)[key];
      }
      return undefined;
    }, messages);
}

const requiredKeys = [
  'module.path.listAria',
  'module.path.nodeAria',
  'module.path.minutes',
  'module.path.states.locked',
  'module.path.states.available',
  'module.path.states.current',
  'module.path.states.done',
  'module.layerToggle.label',
  'module.layerToggle.layers.eli5',
  'module.layerToggle.layers.practitioner',
  'module.layerToggle.layers.expert',
  'module.conceptMap.title',
  'module.conceptMap.ariaLabel',
  'module.conceptMap.loadingAria',
  'module.conceptMap.empty',
  'module.conceptMap.zoomIn',
  'module.conceptMap.zoomOut',
  'module.conceptMap.resetZoom',
  'module.conceptMap.hint',
  'module.conceptMap.selectedLabel',
  'module.conceptMap.noSelection',
  'module.conceptMap.nodeAria',
  'module.conceptMap.kinds.core',
  'module.conceptMap.kinds.concept',
  'module.conceptMap.kinds.example',
  'module.source.chipWithPage',
  'module.source.chipFallback',
  'module.source.sheetTitle',
  'module.source.sheetDescription',
  'module.source.loading',
  'module.source.error',
  'module.source.retry',
  'module.source.pageSingle',
  'module.source.pageRange',
  'module.source.noPage',
  'module.action.label',
  'module.action.doneWhen',
  'module.action.cta',
  'module.action.pending',
  'module.action.created',
  'module.action.dueDate',
  'module.action.stepsAria',
  'module.checklist.progress',
  'module.checklist.progressAria',
  'module.skeletons.moduleAria',
  'module.skeletons.pathAria',
  'module.skeletons.reviewAria',
  'module.showcase.title',
  'module.showcase.description',
  'quiz.progress.label',
  'quiz.progress.ariaLabel',
  'quiz.option.optionAria',
  'quiz.option.selected',
  'quiz.option.correct',
  'quiz.option.incorrect',
  'quiz.feedback.correctTitle',
  'quiz.feedback.incorrectTitle',
  'quiz.feedback.sourceCta',
  'quiz.shortAnswer.label',
  'quiz.shortAnswer.placeholder',
  'quiz.shortAnswer.counter',
  'quiz.shortAnswer.counterAria',
  'quiz.selfGrade.title',
  'quiz.selfGrade.note',
  'quiz.selfGrade.modelAnswer',
  'quiz.selfGrade.rubricTitle',
  'quiz.selfGrade.rubric1',
  'quiz.selfGrade.rubric2',
  'quiz.selfGrade.rubric3',
  'quiz.selfGrade.rubric4',
  'quiz.selfGrade.match',
  'quiz.selfGrade.noMatch',
  'quiz.result.passedTitle',
  'quiz.result.passedBody',
  'quiz.result.failedTitle',
  'quiz.result.failedBody',
  'quiz.result.score',
  'quiz.result.xpLabel',
  'quiz.result.weakTitle',
  'quiz.result.relearn',
  'quiz.result.retry',
  'review.card.flipHint',
  'review.card.frontLabel',
  'review.card.backLabel',
  'review.card.revealed',
  'review.card.hidden',
  'review.rating.label',
  'review.rating.again',
  'review.rating.hard',
  'review.rating.good',
  'review.rating.lockedHint',
  'review.empty.message',
  'review.empty.action',
  'game.xpToast.amount',
  'game.xpToast.announce',
];

describe('learning message namespaces', () => {
  it.each(requiredKeys)('has a non-empty string at %s', (path) => {
    expect(read(path)).toEqual(expect.any(String));
    expect((read(path) as string).trim().length).toBeGreaterThan(0);
  });

  it.each(['module', 'quiz', 'review', 'game'])(
    'has only non-empty string leaves in the %s namespace',
    (namespace) => {
      const root = read(namespace);
      expect(root).toEqual(expect.any(Object));

      function walk(node: unknown, path: string) {
        if (typeof node === 'string') {
          expect(node.trim().length, path).toBeGreaterThan(0);
          return;
        }
        expect(node, path).toEqual(expect.any(Object));
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
          walk(value, `${path}.${key}`);
        }
      }

      walk(root, namespace);
    },
  );
});
