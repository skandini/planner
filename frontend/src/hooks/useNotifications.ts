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

  // Отдельный useEffect для воспроизведения звука при новых уведомлениях
  useEffect(() => {
    if (!accessToken || notifications.length === 0) {
      return;
    }
    
    // Проверяем, есть ли новые непрочитанные уведомления
    const newUnreadNotifications = notifications.filter(n => !n.is_read);
    if (newUnreadNotifications.length > 0) {
      // Воспроизводим звук только если есть новые непрочитанные уведомления
      // Используем небольшой таймаут, чтобы избежать множественных воспроизведений
      const soundTimeout = setTimeout(() => {
        playNotificationSound();
      }, 300);
      
      return () => clearTimeout(soundTimeout);
    }
  }, [notifications, accessToken, playNotificationSound]);

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
