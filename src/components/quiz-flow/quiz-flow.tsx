'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnswerFeedback } from '@/components/module/quiz/answer-feedback';
import { AnswerOption, type AnswerOptionState } from '@/components/module/quiz/answer-option';
import { QuizProgress } from '@/components/module/quiz/quiz-progress';
import { QuizResultPanel } from '@/components/module/quiz/quiz-result-panel';
import { SelfGradePanel } from '@/components/module/quiz/self-grade-panel';
import { ShortAnswerField } from '@/components/module/quiz/short-answer-field';
import { XPToast } from '@/components/game/xp-toast';
import { Button } from '@/components/ui/button';
import { finishQuizAndPrepareRetry, gradeShortAnswer, resumeQuizAttempt, startQuizForModule } from '@/lib/learning/quiz-actions';
import { recordQuizAnswer, recordShortAnswerGrade } from '@/lib/learning/actions';
import { QuizSourceLink } from './quiz-source-link';
import { questionOptions, type QuizFlowProps, type QuizQuestionView } from './types';

type Phase = 'loading' | 'question' | 'feedback' | 'grading' | 'selfGrade' | 'result' | 'error';
type Feedback = { correct: boolean; explanation: string; chunkRefs: string[]; correctAnswer?: unknown };
type Result = Awaited<ReturnType<typeof finishQuizAndPrepareRetry>>;
type SuccessResult = Extract<Result, { ok: true }>;

const BLOOM_FALLBACK = {
  remember: 'weak.bloom.remember',
  understand: 'weak.bloom.understand',
  apply: 'weak.bloom.apply',
  analyze: 'weak.bloom.analyze',
  evaluate: 'weak.bloom.evaluate',
  create: 'weak.bloom.create',
} as const;

/** E5-01: one question per screen, immediate feedback, pass and "Hampir!" screens. */
export function QuizFlow(props: QuizFlowProps) {
  const t = useTranslations('quizFlow');
  const router = useRouter();
  const [questions, setQuestions] = useState<QuizQuestionView[]>(props.questions);
  const [index, setIndex] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [choice, setChoice] = useState<number[] | number | null>(null);
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [selfGrade, setSelfGrade] = useState<{ modelAnswer: string; rubric: string[] } | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);
  const [xpAmount, setXpAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);

  const current = questions[index];
  const isLast = index === questions.length - 1;

  useEffect(() => {
    let active = true;
    void (async () => {
      const resumed = await resumeQuizAttempt({ quizId: props.quizId });
      if (!active) return;
      if (!resumed.ok || resumed.questions.length === 0) {
        setPhase('error');
        return;
      }
      setQuestions(resumed.questions);
      setAttemptId(resumed.attemptId);
      const first = resumed.questions.findIndex(
        (question) => !resumed.answeredQuestionIds.includes(question.id),
      );
      setIndex(first >= 0 ? first : 0);
      setPhase('question');
    })();
    return () => {
      active = false;
    };
  }, [props.quizId]);

  function resetAnswer() {
    setChoice(null);
    setText('');
    setFeedback(null);
    setSelfGrade(null);
  }

  function selectOption(optionIndex: number) {
    if (phase !== 'question' || busy || !current) return;
    if (current.type === 'multi_select') {
      setChoice((previous) => {
        const indexes = Array.isArray(previous) ? previous : [];
        return indexes.includes(optionIndex)
          ? indexes.filter((item) => item !== optionIndex)
          : [...indexes, optionIndex];
      });
      return;
    }
    setChoice(optionIndex);
  }

  const canCheck = current
    ? current.type === 'short_answer'
      ? text.trim().length > 0
      : current.type === 'multi_select'
        ? Array.isArray(choice) && choice.length > 0
        : typeof choice === 'number'
    : false;

  async function checkAnswer() {
    if (!current || !attemptId || !canCheck || busy) return;
    setBusy(true);
    if (current.type === 'short_answer') {
      const stored = await recordQuizAnswer({ attemptId, questionId: current.id, answer: text.trim() });
      if (!stored.ok) {
        setPhase('error');
        setBusy(false);
        return;
      }
      setSelfGrade({ modelAnswer: stored.modelAnswer ?? '', rubric: stored.rubric ?? [] });
      setPhase('grading');
      const graded = await gradeShortAnswer({ attemptId, questionId: current.id });
      if (graded.ok) {
        setFeedback({ correct: graded.correct, explanation: graded.feedback, chunkRefs: [] });
        setPhase('feedback');
      } else {
        setPhase('selfGrade');
      }
      setBusy(false);
      return;
    }

    const answer = current.type === 'multi_select'
      ? { indexes: Array.isArray(choice) ? choice : [] }
      : { index: typeof choice === 'number' ? choice : -1 };
    const graded = await recordQuizAnswer({ attemptId, questionId: current.id, answer });
    if (!graded.ok) {
      setPhase('error');
    } else {
      setFeedback({
        correct: graded.correct ?? false,
        explanation: graded.explanation ?? '',
        chunkRefs: graded.chunkRefs ?? [],
        correctAnswer: graded.correctAnswer,
      });
      setPhase('feedback');
    }
    setBusy(false);
  }

  async function submitSelfGrade(correct: boolean) {
    if (!current || !attemptId || busy) return;
    setBusy(true);
    const graded = await recordShortAnswerGrade({
      attemptId,
      questionId: current.id,
      grade: { selfGraded: true, correct },
    });
    if (!graded.ok) {
      setPhase('error');
    } else {
      setFeedback({
        correct,
        explanation: correct ? t('feedback.selfGradedCorrect') : t('feedback.selfGradedIncorrect'),
        chunkRefs: [],
      });
      setPhase('feedback');
    }
    setBusy(false);
  }

  function nextQuestion() {
    if (isLast) {
      void finish();
      return;
    }
    setIndex((value) => value + 1);
    resetAnswer();
    setPhase('question');
  }

  async function finish() {
    if (!attemptId || busy) return;
    setBusy(true);
    const finished = await finishQuizAndPrepareRetry({ attemptId });
    if (!finished.ok) {
      setPhase('error');
      setBusy(false);
      return;
    }
    setResult(finished);
    setXpAmount(finished.passed && finished.xpAwarded ? (finished.scorePct === 100 ? 40 : 30) : 0);
    setPhase('result');
    setBusy(false);
  }

  async function startRetry() {
    if (retrying) return;
    setRetrying(true);
    setRetryError(false);
    const next = await startQuizForModule({ moduleId: props.moduleId });
    if (!next.ok || next.questions.length === 0) {
      setRetryError(true);
      setRetrying(false);
      return;
    }
    setQuestions(next.questions);
    setAttemptId(next.attemptId);
    setIndex(0);
    setResult(null);
    setXpAmount(0);
    resetAnswer();
    setPhase('question');
    setRetrying(false);
  }

  function weakLabels(): string[] {
    if (!result) return [];
    const chunks = new Set(result.weakConcepts.chunkIds);
    const names = props.concepts
      .filter((concept) => concept.chunkRefs.some((chunkId) => chunks.has(chunkId)))
      .map((concept) => concept.concept);
    const unique = [...new Set(names)].slice(0, 6);
    if (unique.length) return unique;
    const blooms = result.weakConcepts.bloomLevels
      .map((level) => BLOOM_FALLBACK[level as keyof typeof BLOOM_FALLBACK])
      .filter((key): key is (typeof BLOOM_FALLBACK)[keyof typeof BLOOM_FALLBACK] => Boolean(key))
      .map((key) => t(key));
    return blooms.length ? [...new Set(blooms)] : [t('weak.generic')];
  }

  function optionState(optionIndex: number): AnswerOptionState {
    const selected = Array.isArray(choice) ? choice.includes(optionIndex) : choice === optionIndex;
    if (phase !== 'feedback' || !feedback) return selected ? 'selected' : 'default';
    const correct = feedback.correctAnswer;
    if (typeof correct === 'number') {
      if (correct === optionIndex) return 'correct';
      return selected ? 'incorrect' : 'default';
    }
    const correctIndexes = Array.isArray(correct)
      ? correct.filter((value): value is number => typeof value === 'number')
      : [];
    if (correctIndexes.includes(optionIndex)) return selected ? 'correct' : 'default';
    return selected ? 'incorrect' : 'default';
  }

  const moduleHref = `/unbook/${props.unbookId}/module/${props.moduleId}`;
  const nextHref = props.nextModule
    ? `/unbook/${props.unbookId}/module/${props.nextModule.moduleId}`
    : null;

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col gap-6">
      <div className="flex items-center gap-3">
        <QuizProgress
          current={phase === 'result' ? questions.length : index + 1}
          total={questions.length}
          className="flex-1"
        />
        <Button asChild variant="ghost" size="icon" aria-label={t('header.exit')}>
          <Link href={moduleHref}>
            <XIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {phase === 'loading' ? (
        <p role="status" aria-live="polite" className="text-body text-text-muted">
          {t('loading.title')}
        </p>
      ) : null}

      {phase === 'error' ? (
        <section role="alert" className="flex flex-col gap-3">
          <p className="text-body">{t('error.message')}</p>
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            {t('error.retry')}
          </Button>
        </section>
      ) : null}

      {current && phase !== 'result' && phase !== 'error' ? (
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-h2">{current.prompt}</h2>
            <p className="text-small text-text-muted">
              {current.type === 'short_answer'
                ? t('question.shortAnswerHint')
                : current.type === 'multi_select'
                  ? t('question.multiHint')
                  : t('question.selectHint')}
            </p>
          </div>

          {current.type === 'short_answer' ? (
            <ShortAnswerField
              value={text}
              onValueChange={setText}
              disabled={phase !== 'question' || busy}
            />
          ) : (
            <div className="flex flex-col gap-2" role="group" aria-label={current.prompt}>
              {questionOptions(current.options).map((label, optionIndex) => (
                <AnswerOption
                  key={`${current.id}-${optionIndex}`}
                  index={optionIndex}
                  label={label}
                  multi={current.type === 'multi_select'}
                  disabled={phase !== 'question' || busy}
                  state={optionState(optionIndex)}
                  onSelect={() => selectOption(optionIndex)}
                />
              ))}
            </div>
          )}

          {phase === 'grading' ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-1">
              <p className="text-small font-semibold">{t('question.grading')}</p>
              <p className="text-caption text-text-muted">{t('question.gradingHint')}</p>
            </div>
          ) : null}

          {phase === 'feedback' && feedback ? (
            <AnswerFeedback
              correct={feedback.correct}
              explanation={feedback.explanation}
              sourceSlot={
                feedback.chunkRefs[0] ? (
                  <QuizSourceLink
                    key={feedback.chunkRefs[0]}
                    moduleId={props.moduleId}
                    chunkId={feedback.chunkRefs[0]}
                  />
                ) : undefined
              }
            />
          ) : null}

          {phase === 'selfGrade' && selfGrade ? (
            <SelfGradePanel
              modelAnswer={selfGrade.modelAnswer}
              disabled={busy}
              onGrade={(correct) => void submitSelfGrade(correct)}
            />
          ) : null}

          {phase === 'question' || phase === 'feedback' ? (
            <div className="mt-auto flex flex-col gap-2 pt-6">
              <Button
                type="button"
                onClick={phase === 'question' ? () => void checkAnswer() : nextQuestion}
                disabled={phase === 'question' ? !canCheck || busy : busy}
              >
                {phase === 'question'
                  ? t('question.check')
                  : isLast
                    ? t('question.seeResult')
                    : t('question.next')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'result' && result ? (
        <div className="flex flex-col gap-4">
          <QuizResultPanel
            passed={result.passed}
            score={result.scorePct}
            weakConcepts={result.passed ? [] : weakLabels()}
            xpSlot={xpAmount > 0 ? <XPToast amount={xpAmount} /> : undefined}
            onRelearn={() => router.push(`${moduleHref}?layer=practitioner`)}
            onRetry={() => void startRetry()}
          />
          {!result.passed && result.retryVersionQueued ? (
            <p role="status" className="text-small text-text-muted">
              {t('result.retryQueued')}
            </p>
          ) : null}
          {retrying ? (
            <p role="status" aria-live="polite" className="text-small text-text-muted">
              {t('result.retryPreparing')}
            </p>
          ) : null}
          {retryError ? (
            <p role="alert" className="text-small text-danger">
              {t('result.retryError')}
            </p>
          ) : null}
          {result.passed ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button asChild variant="outline">
                <Link href={moduleHref}>{t('result.backToModule')}</Link>
              </Button>
              {nextHref ? (
                <Button asChild>
                  <Link href={nextHref}>{t('result.nextModule')}</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
