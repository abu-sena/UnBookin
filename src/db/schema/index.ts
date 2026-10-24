export * from './enums';
export * from './auth';
export * from './profiles';
export * from './interests';
export * from './sources';
export * from './unbooks';
export * from './quizzes';
export * from './actions';
export * from './game';
export * from './mentor';
export * from './originals';
export * from './billing';
export * from './system';

import { relations } from 'drizzle-orm';
import { accounts, sessions, users } from './auth';
import { profiles } from './profiles';
import { domains, interests, userInterests } from './interests';
import { sourceChunks, sources } from './sources';
import { moduleDomains, moduleProgress, modules, unbooks } from './unbooks';
import { cardStates, quizAttempts, quizQuestions, quizzes, reviewCards } from './quizzes';
import { actionReports, actions } from './actions';
import { mentorMessages, mentorThreads } from './mentor';
import { plans, subscriptions } from './billing';

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles),
  accounts: many(accounts),
  sessions: many(sessions),
  interests: many(userInterests),
  sources: many(sources),
  unbooks: many(unbooks),
  moduleProgress: many(moduleProgress),
  quizAttempts: many(quizAttempts),
  cardStates: many(cardStates),
  actions: many(actions),
  mentorThreads: many(mentorThreads),
  subscriptions: many(subscriptions),
}));
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));
export const interestsRelations = relations(interests, ({ many }) => ({
  domains: many(domains),
  users: many(userInterests),
  unbooks: many(unbooks),
}));
export const domainsRelations = relations(domains, ({ one, many }) => ({
  interest: one(interests, { fields: [domains.interestId], references: [interests.id] }),
  modules: many(moduleDomains),
}));
export const userInterestsRelations = relations(userInterests, ({ one }) => ({
  user: one(users, { fields: [userInterests.userId], references: [users.id] }),
  interest: one(interests, { fields: [userInterests.interestId], references: [interests.id] }),
}));
export const sourcesRelations = relations(sources, ({ one, many }) => ({
  user: one(users, { fields: [sources.userId], references: [users.id] }),
  chunks: many(sourceChunks),
  unbooks: many(unbooks),
}));
export const sourceChunksRelations = relations(sourceChunks, ({ one, many }) => ({
  source: one(sources, { fields: [sourceChunks.sourceId], references: [sources.id] }),
  cards: many(reviewCards),
}));
export const unbooksRelations = relations(unbooks, ({ one, many }) => ({
  user: one(users, { fields: [unbooks.userId], references: [users.id] }),
  source: one(sources, { fields: [unbooks.sourceId], references: [sources.id] }),
  interest: one(interests, { fields: [unbooks.interestId], references: [interests.id] }),
  modules: many(modules),
  mentorThreads: many(mentorThreads),
}));
export const modulesRelations = relations(modules, ({ one, many }) => ({
  unbook: one(unbooks, { fields: [modules.unbookId], references: [unbooks.id] }),
  domains: many(moduleDomains),
  progress: many(moduleProgress),
  quizzes: many(quizzes),
  cards: many(reviewCards),
  actions: many(actions),
}));
export const moduleDomainsRelations = relations(moduleDomains, ({ one }) => ({
  module: one(modules, { fields: [moduleDomains.moduleId], references: [modules.id] }),
  domain: one(domains, { fields: [moduleDomains.domainId], references: [domains.id] }),
}));
export const moduleProgressRelations = relations(moduleProgress, ({ one }) => ({
  user: one(users, { fields: [moduleProgress.userId], references: [users.id] }),
  module: one(modules, { fields: [moduleProgress.moduleId], references: [modules.id] }),
}));
export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  module: one(modules, { fields: [quizzes.moduleId], references: [modules.id] }),
  questions: many(quizQuestions),
  attempts: many(quizAttempts),
}));
export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, { fields: [quizQuestions.quizId], references: [quizzes.id] }),
}));
export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  user: one(users, { fields: [quizAttempts.userId], references: [users.id] }),
  quiz: one(quizzes, { fields: [quizAttempts.quizId], references: [quizzes.id] }),
}));
export const reviewCardsRelations = relations(reviewCards, ({ one, many }) => ({
  module: one(modules, { fields: [reviewCards.moduleId], references: [modules.id] }),
  chunk: one(sourceChunks, { fields: [reviewCards.chunkRef], references: [sourceChunks.id] }),
  states: many(cardStates),
}));
export const cardStatesRelations = relations(cardStates, ({ one }) => ({
  user: one(users, { fields: [cardStates.userId], references: [users.id] }),
  card: one(reviewCards, { fields: [cardStates.cardId], references: [reviewCards.id] }),
}));
export const actionsRelations = relations(actions, ({ one, many }) => ({
  user: one(users, { fields: [actions.userId], references: [users.id] }),
  module: one(modules, { fields: [actions.moduleId], references: [modules.id] }),
  reports: many(actionReports),
}));
export const actionReportsRelations = relations(actionReports, ({ one }) => ({
  action: one(actions, { fields: [actionReports.actionId], references: [actions.id] }),
}));
export const mentorThreadsRelations = relations(mentorThreads, ({ one, many }) => ({
  user: one(users, { fields: [mentorThreads.userId], references: [users.id] }),
  unbook: one(unbooks, { fields: [mentorThreads.unbookId], references: [unbooks.id] }),
  messages: many(mentorMessages),
}));
export const mentorMessagesRelations = relations(mentorMessages, ({ one }) => ({
  thread: one(mentorThreads, { fields: [mentorMessages.threadId], references: [mentorThreads.id] }),
}));
export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));
export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  plan: one(plans, { fields: [subscriptions.planCode], references: [plans.code] }),
}));
