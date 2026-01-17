export type TicketStatus = 
  | "open" 
  | "in_progress" 
  | "waiting_response" 
  | "waiting_third_party"
  | "on_hold"
  | "resolved" 
  | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent" | "critical";

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category_id?: string | null;
  tags?: string | null;
  created_by: string;
  assigned_to?: string | null;
  due_date?: string | null;
  first_response_at?: string | null;
  sla_breach: boolean;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  created_by_email?: string | null;
  created_by_full_name?: string | null;
  assigned_to_email?: string | null;
  assigned_to_full_name?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  comments_count: number;
  attachments_count: number;
  internal_notes_count?: number;
}

export interface TicketCreate {
  title: string;
  description: string;
  priority: TicketPriority;
  category_id?: string | null;
  tags?: string | null;
}

export interface TicketUpdate {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: string | null;
  category_id?: string | null;
  due_date?: string | null;
  tags?: string | null;
  sla_breach?: boolean;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at?: string | null;
  user_email?: string | null;
  user_full_name?: string | null;
  user_avatar_url?: string | null;
}

export interface TicketCommentCreate {
  content: string;
}

export interface TicketCommentUpdate {
  content?: string;
}

// === Categories ===

export interface TicketCategory {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  parent_id?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  tickets_count: number;
}

export interface TicketCategoryCreate {
  name: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  parent_id?: string | null;
  sort_order?: number;
}

export interface TicketCategoryUpdate {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

// === History ===

export interface TicketHistory {
  id: string;
  ticket_id: string;
  user_id: string;
  action: string;
  field_name?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  details?: string | null;
  created_at: string;
  user_email?: string | null;
  user_full_name?: string | null;
  user_avatar_url?: string | null;
}

// === Internal Notes ===

export interface TicketInternalNote {
  id: string;
  ticket_id: string;
  user_id: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
  user_full_name?: string | null;
  user_avatar_url?: string | null;
}

export interface TicketInternalNoteCreate {
  content: string;
  is_pinned?: boolean;
}

export interface TicketInternalNoteUpdate {
  content?: string;
  is_pinned?: boolean;
}

// === Statistics ===

export interface TicketStatusStats {
  status: string;
  count: number;
  label: string;
}

export interface TicketPriorityStats {
  priority: string;
  count: number;
  label: string;
}

export interface TicketCategoryStats {
  category_id: string | null;
  category_name: string;
  count: number;
}

export interface TicketAssigneeStats {
  user_id: string | null;
  user_name: string;
  open_count: number;
  in_progress_count: number;
  resolved_count: number;
  total_count: number;
}

export interface TicketStatistics {
  total_tickets: number;
  open_tickets: number;
  in_progress_tickets: number;
  resolved_tickets: number;
  closed_tickets: number;
  avg_resolution_time_hours: number | null;
  avg_first_response_time_hours: number | null;
  sla_breach_count: number;
  by_status: TicketStatusStats[];
  by_priority: TicketPriorityStats[];
  by_category: TicketCategoryStats[];
  by_assignee: TicketAssigneeStats[];
  created_today: number;
  created_this_week: number;
  created_this_month: number;
}

// === Bulk Operations ===

export interface TicketBulkUpdate {
  ticket_ids: string[];
  status?: TicketStatus;
  priority?: TicketPriority;
  assigned_to?: string | null;
  category_id?: string | null;
}

export interface TicketBulkResult {
  updated_count: number;
  failed_count: number;
  failed_ids: string[];
}

// === Filter Types ===

export interface TicketFilters {
  status?: string;
  priority?: string;
  category_id?: string;
  assigned_to_me?: boolean;
  created_by_me?: boolean;
  unassigned?: boolean;
  search?: string;
  created_from?: string;
  created_to?: string;
  due_before?: string;
  sla_breach?: boolean;
  has_attachments?: boolean;
}

