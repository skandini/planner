export interface AdminNotification {
  id: string;
  title: string;
  message: string;
  created_by: string;
  created_at: string;
  target_user_ids: string[];
  target_department_ids: string[];
  display_duration_hours: number;
  expires_at: string | null;
  is_active: boolean;
  is_dismissed: boolean;
}

export interface AdminNotificationCreate {
  title: string;
  message: string;
  target_user_ids: string[];
  target_department_ids: string[];
  display_duration_hours: number;
}

