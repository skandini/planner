import { useCallback, useState, useEffect } from "react";
import type { Notification } from "@/types/notification.types";
import { notificationApi } from "@/lib/api/notificationApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { useAuth } from "@/context/AuthContext";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const authFetch = useAuthenticatedFetch();
  const { accessToken } = useAuth();

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
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  }, [authFetch, accessToken]);

  // Функция для воспроизведения звукового сигнала
  const playNotificationSound = useCallback(() => {
    try {
      // Используем Web Audio API для создания звукового сигнала
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // Частота 800 Гц
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1); // Плавное нарастание
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3); // Плавное затухание
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3); // Длительность 300мс
      
      oscillator.onended = () => {
        audioContext.close();
      };
    } catch (err) {
      // Игнорируем ошибки, если браузер не поддерживает Web Audio API
      console.debug("Audio notification not available:", err);
    }
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    
    let previousUnreadCount = 0;
    let previousNotificationIds = new Set<string>();
    
    const checkAndPlaySound = () => {
      // Проверяем, появились ли новые непрочитанные уведомления
      if (unreadCount > previousUnreadCount) {
        playNotificationSound();
      }
      
      // Проверяем, появились ли новые уведомления по ID
      const currentNotificationIds = new Set(notifications.map(n => n.id));
      const newNotifications = notifications.filter(n => !previousNotificationIds.has(n.id) && !n.is_read);
      if (newNotifications.length > 0) {
        playNotificationSound();
      }
      
      previousUnreadCount = unreadCount;
      previousNotificationIds = currentNotificationIds;
    };
    
    loadNotifications();
    loadUnreadCount();
    
    // Проверяем новые уведомления после загрузки
    const checkTimeout = setTimeout(() => {
      checkAndPlaySound();
    }, 500);
    
    // Polling каждые 15 секунд - оптимально для 300 пользователей
    const interval = setInterval(() => {
      if (accessToken) {
        loadNotifications();
        loadUnreadCount();
        // Проверяем новые уведомления после обновления
        setTimeout(() => {
          checkAndPlaySound();
        }, 500);
      }
    }, 15000); // 15 секунд вместо 30
    
    return () => {
      clearInterval(interval);
      clearTimeout(checkTimeout);
    };
  }, [loadNotifications, loadUnreadCount, accessToken, notifications, unreadCount, playNotificationSound]);

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
