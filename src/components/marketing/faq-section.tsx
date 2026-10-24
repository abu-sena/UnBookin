import { getTranslations } from 'next-intl/server';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

/** Literal keys so next-intl's type-checked `t()` accepts them. */
const FAQ_ITEMS = [
  { question: 'faq.q1', answer: 'faq.a1' },
  { question: 'faq.q2', answer: 'faq.a2' },
  { question: 'faq.q3', answer: 'faq.a3' },
  { question: 'faq.q4', answer: 'faq.a4' },
  { question: 'faq.q5', answer: 'faq.a5' },
  { question: 'faq.q6', answer: 'faq.a6' },
] as const;

/** FAQ with the shadcn Accordion (E0-01 AC2). Items compose on the server. */
export async function FaqSection() {
  const t = await getTranslations('landing');

  return (
    <section aria-labelledby="faq-title" className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[640px] px-4 sm:px-6 lg:px-8">
        <h2 id="faq-title" className="text-h2">
          {t('faq.title')}
        </h2>
        <Accordion type="single" collapsible className="mt-4 sm:mt-6">
          {FAQ_ITEMS.map(({ question, answer }) => (
            <AccordionItem key={question} value={question}>
              <AccordionTrigger className="text-body font-medium">{t(question)}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-body">
                {t(answer)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
