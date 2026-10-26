/** Shared library types (safe to import from client components). */

export const UNBOOK_STATUSES = ['queued', 'outlining', 'generating', 'ready', 'failed'] as const;

export type UnbookStatus = (typeof UNBOOK_STATUSES)[number];

export type LibraryStatusFilter = '' | UnbookStatus;

export type LibraryFilters = {
  /** Trimmed, bounded title search. Empty means no title filter. */
  q: string;
  /** Interest slug from the user's own unbooks. Empty means all interests. */
  interest: string;
  /** Empty means all statuses. */
  status: LibraryStatusFilter;
};

export type LibraryItem = {
  id: string;
  title: string;
  author: string | null;
  interestName: string;
  interestSlug: string;
  status: UnbookStatus;
  /** Modules whose progress row is `read`, scoped to the signed-in user. */
  modulesRead: number;
  /** Real module count from the `modules` table. */
  moduleCount: number;
};

export type LibraryInterestOption = {
  slug: string;
  name: string;
};

export type LibraryData = {
  items: LibraryItem[];
  interests: LibraryInterestOption[];
  filters: LibraryFilters;
  /** True when the user owns at least one Unbook, even if filters hide them. */
  hasAnyUnbooks: boolean;
};
