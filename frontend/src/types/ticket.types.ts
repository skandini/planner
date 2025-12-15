export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "waiting_response" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  created_by: string;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  closed_at?: string | null;
  created_by_email?: string | null;
  created_by_full_name?: string | null;
  assigned_to_email?: string | null;
  assigned_to_full_name?: string | null;
  comments_count: number;
  attachments_count: number;
}

export interface TicketCreate {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
}

export interface TicketUpdate {
  title?: string;
  description?: string;
  status?: "open" | "in_progress" | "waiting_response" | "resolved" | "closed";
  priority?: "low" | "medium" | "high" | "urgent";
  assigned_to?: string | null;
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

