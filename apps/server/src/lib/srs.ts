/**
 * Spaced Repetition scheduler - SM-2 algorithm, Anki-style 4 grade buttons.
 * (Again / Hard / Good / Easy)
 */
import { WordStatus } from "@prisma/client";

export type Rating = "AGAIN" | "HARD" | "GOOD" | "EASY";

export interface SrsState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  status: WordStatus;
}

export interface SrsResult extends SrsState {
  dueDate: Date;
}

const MIN_EASE = 1.3;
const MASTERED_INTERVAL_DAYS = 21;
const MASTERED_REPETITIONS = 5;

export function scheduleReview(state: SrsState, rating: Rating): SrsResult {
  let { easeFactor, intervalDays, repetitions, lapses, status } = state;

  switch (rating) {
    case "AGAIN": {
      repetitions = 0;
      lapses += 1;
      intervalDays = 1 / 24; // ~1 hour, comes back soon today
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
      status = WordStatus.LEARNING;
      break;
    }
    case "HARD": {
      repetitions += 1;
      intervalDays = Math.max(1, intervalDays * 1.2 || 1);
      easeFactor = Math.max(MIN_EASE, easeFactor - 0.15);
      status = WordStatus.LEARNING;
      break;
    }
    case "GOOD": {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 1;
      else if (repetitions === 2) intervalDays = 6;
      else intervalDays = Math.round(intervalDays * easeFactor);
      status = WordStatus.REVIEW;
      break;
    }
    case "EASY": {
      repetitions += 1;
      if (repetitions === 1) intervalDays = 4;
      else intervalDays = Math.round(intervalDays * easeFactor * 1.3);
      easeFactor = easeFactor + 0.15;
      status = WordStatus.REVIEW;
      break;
    }
  }

  if (repetitions >= MASTERED_REPETITIONS && intervalDays >= MASTERED_INTERVAL_DAYS) {
    status = WordStatus.MASTERED;
  }

  const dueDate = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);

  return { easeFactor, intervalDays, repetitions, lapses, status, dueDate };
}

/** Words that get answered wrong often ("leeches") surface more in review queues. */
export function isLeech(lapses: number): boolean {
  return lapses >= 4;
}
