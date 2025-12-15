export interface EventComment {
  id: string;
  event_id: string;
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

export interface EventCommentCreate {
  content: string;
  // event_id передается в URL, user_id берется из токена
}

export interface EventCommentUpdate {
  content?: string;
}

