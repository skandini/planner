export type CalendarRole = "owner" | "editor" | "viewer";

export type Calendar = {
  id: string;
  name: string;
  description: string | null;
  timezone: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  current_user_role: CalendarRole | null;
};

export type CalendarMember = {
  calendar_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  added_at: string;
};

export type CalendarDraft = {
  name: string;
  description: string;
  timezone: string;
  color: string;
};

