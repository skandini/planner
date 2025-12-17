"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ADMIN_NOTIFICATIONS_ENDPOINT } from "@/lib/constants";
import type { AdminNotification } from "@/types/admin-notification.types";

interface AdminNotificationsProps {
  authFetch: AuthenticatedFetch;
}

export function AdminNotifications({ authFetch }: AdminNotificationsProps) {
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  // Храним ID закрытых уведомлений в ref, чтобы они не появлялись снова
  const dismissedIdsRef = useRef<Set<string>>(new Set());

  const loadNotifications = useCallback(async () => {
    try {
      const response = await authFetch(ADMIN_NOTIFICATIONS_ENDPOINT);
      if (response.ok) {
        const data = await response.json();
        // Фильтруем скрытые уведомления и те, что уже закрыты локально
        const filtered = data.filter(
          (n: AdminNotification) => !n.is_dismissed && !dismissedIdsRef.current.has(n.id)
        );
        setNotifications(filtered);
      } else {
        console.error("Failed to load notifications:", response.status, response.statusText);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadNotifications();
    // Обновляем каждые 30 секунд
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const handleDismiss = useCallback(async (notificationId: string) => {
    // Сразу добавляем в список закрытых, чтобы не появлялось снова
    dismissedIdsRef.current.add(notificationId);
    
    // Добавляем в список удаляемых для анимации
    setDismissingIds((prev) => new Set(prev).add(notificationId));
    
    // Сразу удаляем из списка отображаемых
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    
    // Небольшая задержка для анимации исчезновения, затем отправляем на сервер
    setTimeout(async () => {
      try {
        // Убираем trailing slash из endpoint и добавляем путь
        const endpoint = ADMIN_NOTIFICATIONS_ENDPOINT.endsWith('/') 
          ? ADMIN_NOTIFICATIONS_ENDPOINT.slice(0, -1) 
          : ADMIN_NOTIFICATIONS_ENDPOINT;
        const url = `${endpoint}/${notificationId}/dismiss`;
        console.log("[DEBUG] Dismissing notification:", url);
        const response = await authFetch(url, { method: "POST" });
        if (!response.ok) {
          console.error("Failed to dismiss notification on server:", response.status, response.statusText);
          // Если не удалось закрыть на сервере, можно вернуть в список
          // Но мы оставляем его закрытым локально
        } else {
          console.log("[DEBUG] Notification dismissed successfully");
        }
        // Убираем из списка анимируемых
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      } catch (err) {
        console.error("Failed to dismiss notification:", err);
        // Убираем из списка анимируемых даже при ошибке
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      }
    }, 300);
  }, [authFetch]);

  if (loading) {
    return null;
  }

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none">
      {notifications.map((notification, index) => {
        const isDismissing = dismissingIds.has(notification.id);
        return (
          <div
            key={notification.id}
            className={`
              pointer-events-auto
              bg-white rounded-xl shadow-2xl border border-slate-200/50
              backdrop-blur-sm
              transform transition-all duration-300 ease-out
              ${isDismissing ? 'opacity-0 scale-95 translate-x-full' : 'opacity-100 scale-100 translate-x-0'}
              hover:shadow-3xl hover:scale-[1.02]
              overflow-hidden
            `}
            style={{
              animationDelay: `${index * 50}ms`,
            }}
          >
            {/* Градиентная полоска слева */}
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 via-orange-400 to-amber-500" />
            
            <div className="pl-4 pr-3 py-4">
              <div className="flex items-start gap-3">
                {/* Иконка */}
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                
                {/* Контент */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-900 mb-1.5 leading-tight">
                    {notification.title}
                  </h4>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {notification.message}
                  </p>
                  
                  {/* Время создания */}
                  {notification.created_at && (
                    <div className="mt-2 text-xs text-slate-400">
                      {new Date(notification.created_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                  
                  {/* Кнопка "Ознакомился" */}
                  <button
                    onClick={() => handleDismiss(notification.id)}
                    className="mt-3 px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                  >
                    Ознакомился
                  </button>
                </div>
                
                {/* Кнопка закрытия */}
                <button
                  onClick={() => handleDismiss(notification.id)}
                  className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                  title="Закрыть"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
