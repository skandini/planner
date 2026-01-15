import { useCallback, useState, useEffect } from "react";
import type { Notification } from "@/types/notification.types";
import { notificationApi } from "@/lib/api/notificationApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { useAuth } from "@/context/AuthContext";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previousUnreadCount, setPreviousUnreadCount] = useState(0);
  const authFetch = useAuthenticatedFetch();
  const { accessToken } = useAuth();
  
  // Звук уведомления
  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.volume = 0.5; // 50% громкости
      audio.play().catch(err => {
        console.log('Could not play notification sound:', err);
      });
    } catch (err) {
      console.error('Error playing notification sound:', err);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setLoading(true);
    try {
      const data = await notificationApi.list(authFetch);
      setNotifications(data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, accessToken]);

  const loadUnreadCount = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    try {
      const count = await notificationApi.getUnreadCount(authFetch);
      
      // Воспроизводим звук если количество непрочитанных увеличилось
      if (count > previousUnreadCount && previousUnreadCount > 0) {
        playNotificationSound();
      }
      
      setPreviousUnreadCount(count);
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  }, [authFetch, accessToken, previousUnreadCount, playNotificationSound]);

  useEffect(() => {
    if (!accessToken) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    
    loadNotifications();
    loadUnreadCount();
    
    // Polling каждые 15 секунд - оптимально для 300 пользователей
    const interval = setInterval(() => {
      if (accessToken) {
        loadNotifications();
        loadUnreadCount();
      }
    }, 15000); // 15 секунд
    
    return () => {
      clearInterval(interval);
    };
  }, [loadNotifications, loadUnreadCount, accessToken]);

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

  const markAllAsRead = useCallback(
    async () => {
      try {
        await notificationApi.markAllAsRead(authFetch);
        await loadNotifications();
        await loadUnreadCount();
      } catch (err) {
        console.error("Failed to mark all notifications as read:", err);
        throw err;
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
        throw err;
      }
    },
    [authFetch, loadNotifications, loadUnreadCount],
  );

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh: loadNotifications,
  };
}
