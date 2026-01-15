import { useCallback, useState, useEffect, useRef } from "react";
import type { Notification } from "@/types/notification.types";
import { notificationApi } from "@/lib/api/notificationApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { useAuth } from "@/context/AuthContext";
// WebSocket temporarily disabled - using reliable HTTP polling
// import { useWebSocket } from "./useWebSocket";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previousUnreadCount, setPreviousUnreadCount] = useState(0);
  const authFetch = useAuthenticatedFetch();
  const { accessToken } = useAuth();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // WebSocket disabled - using reliable HTTP polling only
  // const { isConnected: wsConnected, connectionState } = useWebSocket({
  //   ...
  // });

  // Simple HTTP polling every 15 seconds - reliable and battle-tested
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current || !accessToken) {
      return;
    }

    console.log("[Notifications] Starting HTTP polling (15 sec interval)");
    
    pollingIntervalRef.current = setInterval(() => {
      if (accessToken) {
        loadNotifications();
        loadUnreadCount();
      }
    }, 15000); // 15 секунд - быстрая доставка уведомлений
  }, [accessToken, loadNotifications, loadUnreadCount]);

  useEffect(() => {
    if (!accessToken) {
      setNotifications([]);
      setUnreadCount(0);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }
    
    // Начальная загрузка
    loadNotifications();
    loadUnreadCount();
    
    // Запускаем HTTP polling
    startPolling();
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [accessToken, startPolling, loadNotifications, loadUnreadCount]);

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
