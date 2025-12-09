import type { CalendarMember } from "./calendar.types";

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  organization_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
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


