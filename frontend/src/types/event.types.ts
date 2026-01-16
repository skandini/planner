import type { EventParticipant } from "./user.types";
import type { RecurrenceRule } from "./common.types";

export type EventAttachment = {
  id: string;
  event_id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  content_type: string;
  uploaded_by: string;
  created_at: string;
};

export type GroupParticipantInput = {
  group_type: "department" | "organization";
  group_id: string;
};

export type EventGroupParticipant = {
  id: string;
  event_id: string;
  group_type: "department" | "organization";
  group_id: string;
  added_by: string;
  created_at: string;
  group_name: string;
  member_count: number;
  added_by_name: string;
};

export type EventRecord = {
  id: string;
  calendar_id: string;
  room_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  timezone: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  status: string;
  created_at: string;
  updated_at: string;
  participants?: EventParticipant[];
  group_participants?: EventGroupParticipant[] | null;
  recurrence_rule?: RecurrenceRule | null;
  recurrence_parent_id?: string | null;
  attachments?: EventAttachment[];
  department_color?: string | null;
  room_online_meeting_url?: string | null;
  comments_count?: number; // Количество комментариев к событию
};

export type ConflictEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  room_id: string | null;
};

export type ConflictEntry = {
  type: "room" | "participant";
  resource_id: string | null;
  resource_label: string;
  slot_start: string;
  slot_end: string;
  events: ConflictEvent[];
};

export type EventDraft = {
  title: string;
  description: string;
  location: string;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  participant_ids: string[];
  group_participants?: GroupParticipantInput[];
  recurrence_enabled: boolean;
  recurrence_frequency: "daily" | "weekly" | "monthly";
  recurrence_interval: number;
  recurrence_count?: number;
  recurrence_until: string;
};

