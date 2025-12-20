import type { EventRecord } from "./event.types";

export type ViewMode = "day" | "week" | "month" | "org" | "support" | "admin" | "availability-slots";

export type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  count?: number;
  until?: string;
};

export type TimelineRowData = {
  id: string;
  label: string;
  meta?: string | null;
  avatarUrl?: string | null;
  availability: EventRecord[];
  loading: boolean;
  type: "room" | "participant";
  hasConflict?: boolean;
};

export type PendingMoveContext = {
  event: EventRecord;
  newStart: Date;
  newEnd: Date;
};

export type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;


