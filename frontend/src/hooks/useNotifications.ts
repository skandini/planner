import { useCallback, useState, useEffect, useRef } from "react";
import type { Notification } from "@/types/notification.types";
import { notificationApi } from "@/lib/api/notificationApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "./useWebSocket";

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

  // WebSocket для real-time уведомлений
  const { isConnected: wsConnected, connectionState } = useWebSocket({
    onMessage: (message) => {
      if (message.type === "notification" && message.data) {
        console.log("[Notifications] WebSocket message received:", message.data);
        
        // Добавляем новое уведомление в список
        const newNotification = message.data.notification;
        setNotifications((prev) => [newNotification, ...prev]);
        setUnreadCount((prev) => prev + 1);
        
        // Воспроизводим звук
        playNotificationSound();
      }
    },
    onConnect: () => {
      console.log("[Notifications] WebSocket connected - real-time notifications enabled");
      // Загружаем актуальные уведомления при подключении
      loadNotifications();
      loadUnreadCount();
      
      // Останавливаем polling если WebSocket подключен
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    },
    onDisconnect: () => {
      console.log("[Notifications] WebSocket disconnected - falling back to polling");
      // Fallback на polling если WebSocket отключился
      startPolling();
    },
  });

  // Функция для запуска polling (fallback)
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current || !accessToken) {
      return;
    }

    console.log("[Notifications] Starting polling fallback (60 sec interval)");
    
    pollingIntervalRef.current = setInterval(() => {
      if (accessToken && !wsConnected) {
        loadNotifications();
        loadUnreadCount();
      }
    }, 60000); // 60 секунд когда WebSocket недоступен (реже чем раньше)
  }, [accessToken, wsConnected, loadNotifications, loadUnreadCount]);

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
    
    // Если WebSocket не подключен, запускаем polling
    if (!wsConnected) {
      startPolling();
    }
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [accessToken, wsConnected, startPolling, loadNotifications, loadUnreadCount]);

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
    wsConnected,
    connectionState,
  };
}
