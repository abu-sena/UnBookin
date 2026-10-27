'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { XPToast } from '@/components/game/xp-toast';
import { SourceRef } from '@/components/module/source-ref';
import { AnswerFeedback } from '@/components/module/quiz/answer-feedback';
import { AnswerOption } from '@/components/module/quiz/answer-option';
import { QuizProgress } from '@/components/module/quiz/quiz-progress';
import { QuizResultPanel } from '@/components/module/quiz/quiz-result-panel';
import { SelfGradePanel } from '@/components/module/quiz/self-grade-panel';
import { ShortAnswerField } from '@/components/module/quiz/short-answer-field';
import { sampleWeakConcepts } from './learning-fixtures';

const question =
  'Tim kamu menolak perubahan. Langkah pertama yang paling tepat menurut modul ini?';

export function LearningQuizShowcase() {
  const t = useTranslations('module.showcase');
  const [answer, setAnswer] = useState('Saya akan menetapkan pemilik keputusan dan agenda rapat.');

  return (
    <>
      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('quizProgress')}</h3>
        <QuizProgress current={3} total={8} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('answerOptions')}</h3>
        <p className="text-body">{question}</p>
        <p className="text-caption text-text-muted">{t('singleChoice')}</p>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('singleChoice')}>
          <AnswerOption index={0} label="Menyusun sistem kerja dan pemilik keputusan" state="correct" disabled />
          <AnswerOption index={1} label="Menunggu arahan atasan" state="incorrect" disabled />
          <AnswerOption index={2} label="Mengganti seluruh anggota tim" state="selected" disabled />
          <AnswerOption index={3} label="Menunda perubahan sampai tenang" state="default" disabled />
        </div>
        <p className="text-caption text-text-muted">{t('multiChoice')}</p>
        <div className="flex flex-col gap-2" role="group" aria-label={t('multiChoice')}>
          <AnswerOption index={0} label="Menulis agenda bersama" state="correct" multi disabled />
          <AnswerOption index={1} label="Menetapkan pemilik keputusan" state="selected" multi disabled />
          <AnswerOption index={2} label="Menyimpan semua keputusan di kepala" state="incorrect" multi disabled />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('answerFeedback')}</h3>
        <AnswerFeedback
          correct
          explanation="Tepat. Sistem kerja yang jelas membuat tim bergerak tanpa menunggu satu orang."
          sourceSlot={<SourceRef page={42} excerpt={{ status: 'ready', excerpt: 'Level 5 leaders build enduring greatness through a systematic approach.', pageFrom: 42 }} />}
        />
        <AnswerFeedback
          correct={false}
          explanation="Menunggu arahan atasan membuat tim tetap bergantung pada satu orang. Mulailah dari kejelasan peran dan keputusan."
          sourceSlot={<SourceRef page={44} excerpt={{ status: 'ready', excerpt: 'Disiplin muncul saat aturan sederhana dijalankan konsisten.', pageFrom: 44 }} />}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('shortAnswer')}</h3>
        <ShortAnswerField value={answer} onValueChange={setAnswer} maxLength={280} />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('selfGrade')}</h3>
        <SelfGradePanel
          modelAnswer="Tetapkan pemilik agenda dan pemilik keputusan, lalu bagikan catatan keputusan ke seluruh tim."
          onGrade={() => undefined}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('passedResult')}</h3>
        <QuizResultPanel
          passed
          score={90}
          xpSlot={<XPToast amount={30} />}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-h3">{t('failedResult')}</h3>
        <QuizResultPanel
          passed={false}
          score={60}
          weakConcepts={sampleWeakConcepts}
          onRelearn={() => undefined}
          onRetry={() => undefined}
        />
      </div>
    </>
  );
}
