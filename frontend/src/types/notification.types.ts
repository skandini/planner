export type Notification = {
  id: string;
  user_id: string;
  event_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  is_deleted: boolean;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
};

