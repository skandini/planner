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

    // Формируем URL правильно (NOTIFICATION_ENDPOINT уже содержит базовый путь)
    const url = `${NOTIFICATION_ENDPOINT}/${notificationId}`;
    console.log(`[NotificationAPI] Deleting notification: ${notificationId}`, url);
    
    try {
      const response = await authFetch(url, {
        method: "DELETE",
        // Не передаем headers явно, чтобы baseApi мог их правильно обработать
      });
      
      console.log(`[NotificationAPI] Delete response status: ${response.status}`);
      
      // 204 No Content - успешное удаление без тела ответа
      if (response.status === 204 || response.status === 200) {
        return;
      }
      
      // Ошибка
      let errorText = "Неизвестная ошибка";
      try {
        const text = await response.text();
        errorText = text || errorText;
      } catch {
        // Игнорируем ошибку чтения текста
      }
      
      throw new Error(`Не удалось удалить уведомление: ${response.status} ${errorText}`);
    } catch (error) {
      console.error(`[NotificationAPI] Delete error for ${notificationId}:`, error);
      
      // Если это уже Error с понятным сообщением, пробрасываем его
      if (error instanceof Error) {
        // Проверяем, не связана ли ошибка с сетью/CORS
        if (error.message.includes("Failed to fetch") || error.message.includes("fetch")) {
          throw new Error(
            `Не удалось подключиться к серверу. Проверьте, что сервер запущен и доступен.`
          );
        }
        throw error;
      }
      
      throw new Error(`Не удалось удалить уведомление: ${String(error)}`);
    }
  },
};

