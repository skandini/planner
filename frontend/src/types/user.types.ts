import type { CalendarMember } from "./calendar.types";

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  department_id: string | null;  // Legacy - for backward compatibility
  manager_id: string | null;
  organization_id: string | null;  // Legacy - for backward compatibility
  avatar_url: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
  access_org_structure?: boolean;
  access_tickets?: boolean;
  access_availability_slots?: boolean;
  show_local_time?: boolean;  // Добавить это свойство
  show_moscow_time?: boolean;  // Добавить это свойство
  // Many-to-many relationships
  department_ids?: string[];  // All departments user belongs to
  organization_ids?: string[];  // All organizations user belongs to
  // День рождения
  birthday?: string | null;  // Date in YYYY-MM-DD format
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


