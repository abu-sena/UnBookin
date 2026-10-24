import type { NewBadge, NewInterest, NewMissionTemplate, NewPlan } from './schema';
import type { PlanLimits } from '../lib/billing/plan-limits';

export const interestSeeds = [
  {
    slug: 'leadership-management',
    name: 'Kepemimpinan dan Manajemen',
    description: 'Kembangkan kemampuan memimpin dan mengelola organisasi.',
    icon: 'users',
    colorToken: 'primary',
    sortOrder: 0,
  },
  {
    slug: 'personal-development-productivity',
    name: 'Pengembangan Diri dan Produktivitas',
    description: 'Bangun kebiasaan dan kemampuan belajar yang berkelanjutan.',
    icon: 'sprout',
    colorToken: 'primary',
    sortOrder: 1,
  },
  {
    slug: 'islamic-studies',
    name: 'Studi Islam',
    description: 'Perdalam pemahaman dan pengamalan ilmu Islam.',
    icon: 'book-open',
    colorToken: 'primary',
    sortOrder: 2,
  },
  {
    slug: 'general',
    name: 'Umum',
    description: 'Jelajahi pengetahuan lintas minat.',
    icon: 'compass',
    colorToken: 'text-muted',
    sortOrder: 3,
  },
] satisfies NewInterest[];

export const domainSeeds = [
  { interestSlug: 'leadership-management', slug: 'strategic-thinking', name: 'Berpikir Strategis' },
  {
    interestSlug: 'leadership-management',
    slug: 'execution-performance',
    name: 'Eksekusi dan Kinerja',
  },
  { interestSlug: 'leadership-management', slug: 'leading-teams', name: 'Memimpin Tim' },
  { interestSlug: 'leadership-management', slug: 'change-management', name: 'Manajemen Perubahan' },
  {
    interestSlug: 'leadership-management',
    slug: 'organizational-culture',
    name: 'Budaya Organisasi',
  },
  { interestSlug: 'leadership-management', slug: 'decision-making', name: 'Pengambilan Keputusan' },
  {
    interestSlug: 'leadership-management',
    slug: 'leadership-communication',
    name: 'Komunikasi Pemimpin',
  },
  { interestSlug: 'personal-development-productivity', slug: 'habits', name: 'Kebiasaan' },
  {
    interestSlug: 'personal-development-productivity',
    slug: 'focus-time',
    name: 'Fokus dan Waktu',
  },
  {
    interestSlug: 'personal-development-productivity',
    slug: 'learning-how-to-learn',
    name: 'Cara Belajar',
  },
  { interestSlug: 'personal-development-productivity', slug: 'wellbeing', name: 'Kesejahteraan' },
  { interestSlug: 'personal-development-productivity', slug: 'creativity', name: 'Kreativitas' },
  { interestSlug: 'islamic-studies', slug: 'aqidah', name: 'Akidah' },
  { interestSlug: 'islamic-studies', slug: 'fiqh', name: 'Fikih' },
  { interestSlug: 'islamic-studies', slug: 'ethics-etiquette', name: 'Akhlak dan Adab' },
  { interestSlug: 'islamic-studies', slug: 'sirah-history', name: 'Sirah dan Sejarah' },
  {
    interestSlug: 'islamic-studies',
    slug: 'tafsir-quranic-sciences',
    name: 'Tafsir dan Ulumul Quran',
  },
  { interestSlug: 'islamic-studies', slug: 'hadith', name: 'Hadis' },
];

const freeLimits: PlanLimits = {
  unbooksPerMonth: 2,
  unbooksFairUse: 2,
  maxPagesPerSource: 60,
  maxFileMb: 20,
  mentorMessagesPerMonth: 20,
  originalsAccess: 'sample',
  modelTier: 'economy',
};
const proLimits: PlanLimits = {
  unbooksPerMonth: 8,
  unbooksFairUse: 8,
  maxPagesPerSource: 500,
  maxFileMb: 100,
  mentorMessagesPerMonth: 300,
  originalsAccess: 'full',
  modelTier: 'main',
};
const byokLimits: PlanLimits = {
  unbooksPerMonth: null,
  unbooksFairUse: 50,
  maxPagesPerSource: 800,
  maxFileMb: 100,
  mentorMessagesPerMonth: null,
  originalsAccess: 'full',
  modelTier: 'byok',
};

export const planSeeds = [
  { code: 'free', name: 'Gratis', priceIdr: 0, interval: 'month', limits: freeLimits },
  {
    code: 'pro_monthly',
    name: 'Pro Bulanan',
    priceIdr: 59000,
    interval: 'month',
    limits: proLimits,
  },
  {
    code: 'pro_yearly',
    name: 'Pro Tahunan',
    priceIdr: 449000,
    interval: 'year',
    limits: proLimits,
  },
  {
    code: 'byok_monthly',
    name: 'Pro BYOK Bulanan',
    priceIdr: 29000,
    interval: 'month',
    limits: byokLimits,
  },
  {
    code: 'byok_yearly',
    name: 'Pro BYOK Tahunan',
    priceIdr: 249000,
    interval: 'year',
    limits: byokLimits,
  },
] satisfies NewPlan[];

export const badgeSeeds = [
  {
    slug: 'first-step',
    name: 'Langkah Pertama',
    description: 'Selesaikan Unbook pertama.',
    icon: 'footprints',
    tier: 'bronze',
    rule: { kind: 'count', metric: 'unbooks_completed', gte: 1 },
  },
  {
    slug: 'diligent-reader',
    name: 'Pembaca Tekun',
    description: 'Baca 10 modul.',
    icon: 'book-open',
    tier: 'silver',
    rule: { kind: 'count', metric: 'modules_read', gte: 10 },
  },
  {
    slug: 'perfect',
    name: 'Sempurna',
    description: 'Raih nilai kuis 100%.',
    icon: 'check-check',
    tier: 'gold',
    rule: { kind: 'quiz_perfect' },
  },
  {
    slug: 'practitioner',
    name: 'Praktisi',
    description: 'Verifikasi aksi pertama.',
    icon: 'hammer',
    tier: 'bronze',
    rule: { kind: 'count', metric: 'actions_verified', gte: 1 },
  },
  {
    slug: 'consistent-7',
    name: 'Konsisten 7',
    description: 'Belajar 7 hari berturut-turut.',
    icon: 'flame',
    tier: 'silver',
    rule: { kind: 'streak', gte: 7 },
  },
  {
    slug: 'consistent-30',
    name: 'Konsisten 30',
    description: 'Belajar 30 hari berturut-turut.',
    icon: 'flame',
    tier: 'gold',
    rule: { kind: 'streak', gte: 30 },
  },
  {
    slug: 'master-reviewer',
    name: 'Pengingat Ulung',
    description: 'Review 100 kartu.',
    icon: 'brain',
    tier: 'silver',
    rule: { kind: 'count', metric: 'cards_reviewed', gte: 100 },
  },
  {
    slug: 'explorer',
    name: 'Penjelajah',
    description: 'Ikuti 3 minat.',
    icon: 'compass',
    tier: 'bronze',
    rule: { kind: 'count', metric: 'interests_joined', gte: 3 },
  },
  {
    slug: 'self-mentor',
    name: 'Murabbi Diri',
    description: 'Verifikasi 10 aksi.',
    icon: 'sprout',
    tier: 'gold',
    rule: { kind: 'count', metric: 'actions_verified', gte: 10 },
  },
  {
    slug: 'avid-learner',
    name: 'Pembelajar Gigih',
    description: 'Selesaikan 5 Unbook.',
    icon: 'library',
    tier: 'silver',
    rule: { kind: 'count', metric: 'unbooks_completed', gte: 5 },
  },
  {
    slug: 'knowledge-seeker',
    name: 'Pencari Ilmu',
    description: 'Baca 50 modul.',
    icon: 'graduation-cap',
    tier: 'gold',
    rule: { kind: 'count', metric: 'modules_read', gte: 50 },
  },
  {
    slug: 'review-starter',
    name: 'Mulai Mengingat',
    description: 'Review 10 kartu.',
    icon: 'repeat',
    tier: 'bronze',
    rule: { kind: 'count', metric: 'cards_reviewed', gte: 10 },
  },
] satisfies NewBadge[];

export const missionSeeds = [
  { slug: 'learn-3', title: 'Baca 3 modul', type: 'learn', target: 3, xpReward: 30 },
  { slug: 'learn-5', title: 'Baca 5 modul', type: 'learn', target: 5, xpReward: 45 },
  { slug: 'learn-7', title: 'Baca 7 modul', type: 'learn', target: 7, xpReward: 60 },
  { slug: 'review-2', title: 'Selesaikan 2 sesi review', type: 'review', target: 2, xpReward: 30 },
  { slug: 'review-4', title: 'Selesaikan 4 sesi review', type: 'review', target: 4, xpReward: 45 },
  { slug: 'review-6', title: 'Selesaikan 6 sesi review', type: 'review', target: 6, xpReward: 60 },
  { slug: 'apply-1', title: 'Laporkan 1 aksi', type: 'apply', target: 1, xpReward: 30 },
  { slug: 'apply-2', title: 'Laporkan 2 aksi', type: 'apply', target: 2, xpReward: 45 },
  { slug: 'apply-3', title: 'Laporkan 3 aksi', type: 'apply', target: 3, xpReward: 60 },
] satisfies NewMissionTemplate[];
