/**
 * Prep kit ("Scan, dig, jot"): one living set of interview cue cards per job,
 * plus quick notes ("jots") captured during a call and organised afterwards.
 */

/** One cue card: short cues to scan, longer detail to dig into. */
export interface PrepKitSection {
  id: string;
  title: string;
  /** 1-4 short lines shown at a glance. */
  cues: string[];
  /** Longer detail (Markdown), shown when the card is expanded. */
  detail: string;
}

/** A question to ask the interviewer. */
export interface PrepKitQuestion {
  id: string;
  text: string;
  /** Fuller wording or what to listen for (Markdown). */
  detail: string;
  answered: boolean;
  /** What was learned, filled in by wrap-up. */
  answer: string;
}

export interface PrepKit {
  jobId: string;
  sections: PrepKitSection[];
  questions: PrepKitQuestion[];
  createdAt: string;
  updatedAt: string;
}

/** The editable part of a kit. */
export type PrepKitContent = Pick<PrepKit, "sections" | "questions">;

/** A note typed during a call; untagged unless a card was open. */
export interface JobJot {
  id: string;
  jobId: string;
  text: string;
  /** Title of the card that was open when it was typed, if any. A hint only. */
  sectionHint: string | null;
  createdAt: string;
  /** Set once a wrap-up has organised it into a note. */
  wrappedUpAt: string | null;
}

export interface PrepKitResponse {
  kit: PrepKit | null;
  /** Jots not yet wrapped up, oldest first. */
  jots: JobJot[];
}

/** What wrap-up proposes; nothing is saved until the user applies it. */
export interface PrepKitWrapUpProposal {
  noteTitle: string;
  /** The organised call notes (Markdown). */
  noteContent: string;
  /** The kit with wrap-up's changes merged in. */
  kit: PrepKitContent;
  /** Titles of the cards wrap-up changed or added, for the review screen. */
  changedSections: string[];
  /** Question ids wrap-up marked as answered. */
  answeredQuestionIds: string[];
  jotIds: string[];
}

export interface PrepKitWrapUpApplyInput {
  noteTitle: string;
  noteContent: string;
  kit: PrepKitContent;
  jotIds: string[];
}
