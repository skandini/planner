import type { CalendarMember } from "./calendar.types";

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
};

export type EventParticipant = {
  user_id: string;
  email: string;
  full_name: string | null;
  response_status: string;
};

export type ParticipantProfile = {
  user_id: string;
  label: string;
  email: string;
  membership?: CalendarMember;
};

