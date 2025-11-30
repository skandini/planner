import type { Notification } from "@/types/notification.types";
import type { AuthenticatedFetch } from "./baseApi";
import { NOTIFICATION_ENDPOINT } from "@/lib/constants";

export const notificationApi = {
  async list(authFetch: AuthenticatedFetch): Promise<Notification[]> {
    const response = await authFetch(`${NOTIFICATION_ENDPOINT}/`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Не удалось загрузить уведомления");
    }
    return response.json();
  },

  async getUnreadCount(authFetch: AuthenticatedFetch): Promise<number> {
    const response = await authFetch(`${NOTIFICATION_ENDPOINT}/unread-count`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return 0;
    }
    const data = await response.json();
    return data.count || 0;
  },

  async markAsRead(authFetch: AuthenticatedFetch, notificationId: string): Promise<void> {
    const response = await authFetch(
      `${NOTIFICATION_ENDPOINT}/${notificationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
      },
    );
    if (!response.ok) {
      throw new Error("Не удалось отметить уведомление как прочитанное");
    }
  },

  async markAllAsRead(authFetch: AuthenticatedFetch): Promise<void> {
    const response = await authFetch(`${NOTIFICATION_ENDPOINT}/mark-all-read`, {
      method: "PATCH",
    });
    if (!response.ok) {
      throw new Error("Не удалось отметить все уведомления как прочитанные");
    }
  },

  async delete(authFetch: AuthenticatedFetch, notificationId: string): Promise<void> {
    // Убеждаемся, что notificationId не пустой
    if (!notificationId || notificationId.trim() === "") {
      throw new Error("ID уведомления не может быть пустым");
    }

    // Используем PATCH для мягкого удаления вместо DELETE (избегаем CORS проблем)
    const url = `${NOTIFICATION_ENDPOINT}/${notificationId}`;
    console.log(`[NotificationAPI] Soft deleting notification: ${notificationId}`, url);
    
    try {
      const response = await authFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_deleted: true }),
      });
      
      console.log(`[NotificationAPI] Soft delete response status: ${response.status}`);
      
      if (!response.ok) {
        let errorText = "Неизвестная ошибка";
        try {
          const text = await response.text();
          errorText = text || errorText;
        } catch {
          // Игнорируем ошибку чтения текста
        }
        throw new Error(`Не удалось удалить уведомление: ${response.status} ${errorText}`);
      }
      
      // PATCH возвращает обновленное уведомление
      await response.json();
    } catch (error) {
      console.error(`[NotificationAPI] Delete error for ${notificationId}:`, error);
      
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error(`Не удалось удалить уведомление: ${String(error)}`);
    }
  },
};

