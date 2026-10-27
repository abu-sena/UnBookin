import type { CardsResult, ModuleResult, OutlineResult, QuizResult, TaggingResult } from './schemas';

export function validateOutline(result: OutlineResult, sectionIds: readonly string[]): string[] {
  const ids = result.modules.flatMap((module) => module.sectionIds);
  const allowed = new Set(sectionIds);
  const issues: string[] = [];
  if (ids.some((id) => !allowed.has(id))) issues.push('Unknown section reference');
  if (sectionIds.some((id) => ids.filter((used) => used === id).length !== 1)) {
    issues.push('Sections must be used exactly once');
  }
  if (ids.length !== sectionIds.length || ids.some((id, index) => id !== sectionIds[index])) {
    issues.push('Sections must preserve source order');
  }
  return issues;
}

export interface PageRange { pageFrom: number; pageTo: number }

export function validateModule(
  result: ModuleResult,
  allowedChunkIds: readonly string[],
  pageRange: PageRange,
): string[] {
  const issues: string[] = [];
  const allowed = new Set(allowedChunkIds);
  const { layers, conceptMap, keyQuote } = result.content;
  if (layers.practitioner.some((concept) => concept.chunkRefs.length === 0)) {
    issues.push('Practitioner concepts require chunk references');
  }
  if (layers.practitioner.some((concept) => concept.chunkRefs.some((id) => !allowed.has(id)))) {
    issues.push('Unknown module chunk reference');
  }
  const ids = new Set(conceptMap.nodes.map((node) => node.id));
  if (ids.size !== conceptMap.nodes.length) issues.push('Concept node IDs must be unique');
  if (conceptMap.nodes.filter((node) => node.kind === 'core').length !== 1) {
    issues.push('Concept map requires exactly one core node');
  }
  if (conceptMap.nodes.length > 20) issues.push('Concept map exceeds node limit');
  if (conceptMap.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))) {
    issues.push('Concept edge endpoint does not exist');
  }
  if (keyQuote && (keyQuote.page < pageRange.pageFrom || keyQuote.page > pageRange.pageTo)) {
    issues.push('Quote page outside module range');
  }
  return issues;
}

const normalized = (value: string) => value.trim().normalize('NFKC').toLocaleLowerCase('id');

export function validateQuiz(result: QuizResult, allowedChunkIds: readonly string[]): string[] {
  const issues: string[] = [];
  const allowed = new Set(allowedChunkIds);
  const { questions } = result;
  if (questions.some((question) => question.chunkRefs.some((id) => !allowed.has(id)))) {
    issues.push('Unknown quiz chunk reference');
  }
  if (questions.some((question) => {
    if (question.type === 'short_answer') return false;
    const indexes = question.type === 'multi_select' ? question.correct : [question.correct];
    return indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= question.options.length);
  })) issues.push('Answer index outside option range');
  const low = questions.filter((q) => ['remember', 'understand'].includes(q.bloomLevel)).length;
  const middle = questions.filter((q) => ['apply', 'analyze'].includes(q.bloomLevel)).length;
  const high = questions.filter((q) => ['evaluate', 'create'].includes(q.bloomLevel)).length;
  if (low < 1 || low > Math.ceil(0.4 * questions.length)) issues.push('Invalid lower Bloom mix');
  if (middle < 2) issues.push('Insufficient middle Bloom questions');
  if (high < 1) issues.push('Insufficient higher Bloom questions');
  if (new Set(questions.map((q) => normalized(q.prompt))).size !== questions.length) {
    issues.push('Duplicate question prompts');
  }
  return issues;
}

export function validateCards(result: CardsResult, allowedChunkIds: readonly string[]): string[] {
  const issues: string[] = [];
  const allowed = new Set(allowedChunkIds);
  if (result.cards.some((card) => !allowed.has(card.chunkRef))) issues.push('Unknown card chunk reference');
  if (new Set(result.cards.map((card) => normalized(card.front))).size !== result.cards.length) {
    issues.push('Duplicate card fronts');
  }
  return issues;
}

export interface TaggingContext {
  moduleCount: number;
  allowedInterestSlugs: readonly string[];
  allowedDomainSlugsByInterest: Readonly<Record<string, readonly string[]>>;
}

export function validateTagging(result: TaggingResult, context: TaggingContext): string[] {
  const issues: string[] = [];
  if (!context.allowedInterestSlugs.includes(result.interestSlug)) issues.push('Unknown interest slug');
  const indexes = result.modules.map((module) => module.moduleIndex);
  if (indexes.length !== context.moduleCount || new Set(indexes).size !== context.moduleCount ||
    indexes.some((index) => !Number.isInteger(index) || index < 0 || index >= context.moduleCount)) {
    issues.push('Each module index must occur exactly once');
  }
  const domains = Object.hasOwn(context.allowedDomainSlugsByInterest, result.interestSlug)
    ? context.allowedDomainSlugsByInterest[result.interestSlug] : [];
  const allowed = new Set(domains ?? []);
  if (result.modules.some((module) => module.domains.some((domain) => !allowed.has(domain.domainSlug)))) {
    issues.push('Domain does not belong to interest');
  }
  if (result.interestSlug === 'general' && result.modules.some((module) => module.domains.length > 0)) {
    issues.push('General interest cannot have domains');
  }
  if (result.interestSlug !== 'general' && result.modules.some((module) => module.domains.length === 0)) {
    issues.push('Non-general modules require domains');
  }
  return issues;
}
