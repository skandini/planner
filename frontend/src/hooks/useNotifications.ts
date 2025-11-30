import { useCallback, useState, useEffect } from "react";
import type { Notification } from "@/types/notification.types";
import { notificationApi } from "@/lib/api/notificationApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const authFetch = useAuthenticatedFetch();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await notificationApi.list(authFetch);
      setNotifications(data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const count = await notificationApi.getUnreadCount(authFetch);
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  }, [authFetch]);

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
    const interval = setInterval(() => {
      loadNotifications();
      loadUnreadCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications, loadUnreadCount]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await notificationApi.markAsRead(authFetch, notificationId);
        await loadNotifications();
        await loadUnreadCount();
      } catch (err) {
        console.error("Failed to mark notification as read:", err);
      }
    },
    [authFetch, loadNotifications, loadUnreadCount],
  );

  const deleteNotification = useCallback(
    async (notificationId: string) => {
      try {
        await notificationApi.delete(authFetch, notificationId);
        await loadNotifications();
        await loadUnreadCount();
      } catch (err) {
        console.error("Failed to delete notification:", err);
      }
    },
    [authFetch, loadNotifications, loadUnreadCount],
  );

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    deleteNotification,
    refresh: loadNotifications,
  };
}
