export type SocialLink = {
  label: string;
  href: string;
  shortLabel: string;
};

export type HeroStat = {
  label: string;
  value: string;
  detail: string;
};

export interface SignalBoardItem {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "neutral" | "caution";
}

export interface NavLinkItem {
  id: string;
  label: string;
  href: string;
  sectionId: string;
}

export interface SceneSection {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  bullets: string[];
  tags: string[];
  route: string;
  position: [number, number, number];
  cameraPosition: [number, number, number];
  accent: string;
}

export interface ExperienceEntry {
  slug: string;
  role: string;
  company: string;
  timeframe: string;
  location: string;
  problemSpace: string;
  scope: string;
  systemsThemes: string[];
  impact: string;
  missionReadout: SignalBoardItem[];
}

export interface ProjectEvidence {
  label: string;
  value: string;
}

export interface PreviewCard {
  title: string;
  subtitle: string;
  note: string;
}

export interface ProjectDrawerSection {
  id: string;
  label: string;
  title: string;
  summary: string;
  bullets: string[];
}

export interface ProjectEntry {
  slug: string;
  title: string;
  category: string;
  focusArea: string;
  archetype: "mission-schematic" | "mars-lab" | "console-analytics" | "network-map";
  thesis: string;
  description: string;
  missionReadout: SignalBoardItem[];
  stack: string[];
  comparisonChips: string[];
  artifacts: string[];
  evidence: ProjectEvidence[];
  previewCards: PreviewCard[];
  drawerSections: ProjectDrawerSection[];
  whatThisProves: string;
  href?: string;
  accent: string;
  visualMode: "orbit" | "signal" | "grid" | "spectrum" | "score";
}

export interface WritingEntry {
  slug: string;
  title: string;
  date: string;
  readTime: string;
  summary: string;
  content: string[];
}

export interface BookEntry {
  slug: string;
  title: string;
  author: string;
  href: string;
  cover: string;
  note: string;
  tags: string[];
}

export interface ProfileContent {
  name: string;
  shortName: string;
  title: string;
  location: string;
  heroSummary: string;
  heroBullets: string[];
  avatarUrl: string;
  resumeHref: string;
  socials: SocialLink[];
  heroStats: HeroStat[];
  missionReadout: SignalBoardItem[];
  navLinks: NavLinkItem[];
  sceneSections: SceneSection[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  writing: WritingEntry[];
  books: BookEntry[];
}
