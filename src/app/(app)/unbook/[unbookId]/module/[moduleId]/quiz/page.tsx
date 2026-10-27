import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { QuizFlow } from '@/components/quiz-flow/quiz-flow';
import { PageHeader } from '@/components/ui-kit/page-header';
import { ModuleContent } from '@/lib/engine/module-content';
import { requireUser } from '@/lib/auth/session';
import { LearningError } from '@/lib/learning/errors';
import {
  getModuleForReading,
  getQuizForAttempt,
  getUnbookPath,
} from '@/lib/learning/queries';

type QuizPageProps = {
  // Next.js 16: `params` is async.
  params: Promise<{ unbookId: string; moduleId: string }>;
};

export default async function QuizPage({ params }: QuizPageProps) {
  const { unbookId, moduleId } = await params;
  const user = await requireUser(`/unbook/${unbookId}/module/${moduleId}/quiz`);

  let moduleView: Awaited<ReturnType<typeof getModuleForReading>>;
  let quiz: Awaited<ReturnType<typeof getQuizForAttempt>>;
  let path: Awaited<ReturnType<typeof getUnbookPath>>;
  try {
    moduleView = await getModuleForReading({ userId: user.id }, { moduleId });
    if (moduleView.unbookId !== unbookId || !moduleView.quizId) notFound();
    quiz = await getQuizForAttempt({ userId: user.id }, { quizId: moduleView.quizId });
    path = await getUnbookPath({ userId: user.id }, { unbookId });
  } catch (error) {
    if (error instanceof LearningError) notFound();
    throw error;
  }

  const t = await getTranslations('quizFlow');
  const content = ModuleContent.safeParse(moduleView.content);
  const concepts = content.success
    ? content.data.layers.practitioner.map((concept) => ({
        concept: concept.concept,
        chunkRefs: concept.chunkRefs,
      }))
    : [];
  const currentIndex = path.modules.findIndex((node) => node.moduleId === moduleId);
  const next = currentIndex >= 0 ? path.modules[currentIndex + 1] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.description', { title: moduleView.title })}
      />
      <QuizFlow
        unbookId={unbookId}
        moduleId={moduleId}
        moduleTitle={moduleView.title}
        quizId={quiz.quizId}
        questions={quiz.questions.map((question) => ({
          id: question.id,
          type: question.type,
          prompt: question.prompt,
          options: question.options,
        }))}
        concepts={concepts}
        nextModule={next ? { moduleId: next.moduleId, title: next.title } : null}
      />
    </div>
  );
}
