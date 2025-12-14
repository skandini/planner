"use client";

import { useState } from "react";
import type { Notification } from "@/types/notification.types";

interface NotificationCenterProps {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDelete: (notificationId: string) => Promise<void>;
  onEventClick: (eventId: string) => void;
  onUpdateParticipantStatus?: (eventId: string, status: string) => Promise<void>;
  currentUserId?: string;
}

export function NotificationCenter({
  notifications,
  loading,
  unreadCount,
  onClose,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onEventClick,
  onUpdateParticipantStatus,
  currentUserId,
}: NotificationCenterProps) {
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "event_invited":
        return "📨";
      case "event_updated":
        return "✏️";
      case "event_cancelled":
        return "❌";
      case "event_reminder":
        return "⏰";
      default:
        return "🔔";
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "event_invited":
        return "bg-blue-50 border-blue-200";
      case "event_updated":
        return "bg-amber-50 border-amber-200";
      case "event_cancelled":
        return "bg-red-50 border-red-200";
      case "event_reminder":
        return "bg-lime-50 border-lime-200";
      default:
        return "bg-slate-50 border-slate-200";
    }
  };

  const formatDate = (dateString: string) => {
    // Парсим дату как UTC, если она в формате ISO
    const date = new Date(dateString);
    const now = new Date();
    
    // Проверяем, что дата валидна
    if (isNaN(date.getTime())) {
      return "недавно";
    }
    
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "только что";
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'минуту' : diffMins < 5 ? 'минуты' : 'минут'} назад`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'час' : diffHours < 5 ? 'часа' : 'часов'} назад`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'день' : diffDays < 5 ? 'дня' : 'дней'} назад`;
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const handleMarkAsRead = async (notificationId: string) => {
    setProcessingIds((prev) => new Set(prev).add(notificationId));
    try {
      await onMarkAsRead(notificationId);
    } catch (err) {
      console.error("Failed to mark as read:", err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAllAsRead(true);
    try {
      await onMarkAllAsRead();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      const errorMessage = err instanceof Error ? err.message : "Не удалось отметить все уведомления как прочитанные";
      alert(`Ошибка: ${errorMessage}`);
    } finally {
      setMarkingAllAsRead(false);
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!confirm("Вы уверены, что хотите удалить это уведомление?")) {
      return;
    }
    setDeletingId(notificationId);
    try {
      await onDelete(notificationId);
    } catch (err) {
      console.error("Failed to delete:", err);
      const errorMessage = err instanceof Error ? err.message : "Не удалось удалить уведомление";
      alert(`Ошибка: ${errorMessage}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleParticipantStatus = async (eventId: string, status: string) => {
    if (!onUpdateParticipantStatus) return;
    const key = `${eventId}-${status}`;
    setUpdatingStatus((prev) => new Set(prev).add(key));
    try {
      await onUpdateParticipantStatus(eventId, status);
      // Автоматически удаляем уведомление после ответа на приглашение
      const notification = notifications.find((n) => n.event_id === eventId && n.type === "event_invited");
      if (notification) {
        // Сначала отмечаем как прочитанное (если еще не прочитано)
        if (!notification.is_read) {
          await onMarkAsRead(notification.id);
        }
        // Затем удаляем уведомление, так как пользователь уже ответил
        await onDelete(notification.id);
      }
    } catch (err) {
      console.error("Failed to update participant status:", err);
      const errorMessage = err instanceof Error ? err.message : "Не удалось обновить статус";
      alert(`Ошибка: ${errorMessage}`);
    } finally {
      setUpdatingStatus((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur"
      style={{ animation: 'fadeIn 0.2s ease-out forwards' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-[0_20px_80px_rgba(15,23,42,0.35)] flex flex-col"
        style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-6 flex-shrink-0">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Уведомления
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              {unreadCount > 0 ? `${unreadCount} непрочитанных` : "Все прочитано"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={markingAllAsRead}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {markingAllAsRead ? "Обработка..." : "Отметить все прочитанными"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 p-3 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-slate-500">Загружаем уведомления...</p>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-4xl mb-4">🔔</p>
              <p className="text-sm font-semibold text-slate-900">
                Нет уведомлений
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Новые уведомления появятся здесь
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg border p-4 transition ${
                    notification.is_read
                      ? "bg-white border-slate-200"
                      : `${getNotificationColor(notification.type)} font-semibold`
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-[0.65rem] text-slate-400 mt-2">
                            {formatDate(notification.created_at)}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="h-2 w-2 rounded-full bg-lime-500 flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {notification.event_id && notification.type === "event_invited" && onUpdateParticipantStatus && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleParticipantStatus(notification.event_id!, "accepted")}
                              disabled={updatingStatus.has(`${notification.event_id}-accepted`)}
                              className="rounded-lg bg-lime-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {updatingStatus.has(`${notification.event_id}-accepted`) ? "..." : "✓ Принять"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleParticipantStatus(notification.event_id!, "declined")}
                              disabled={updatingStatus.has(`${notification.event_id}-declined`)}
                              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {updatingStatus.has(`${notification.event_id}-declined`) ? "..." : "✕ Отклонить"}
                            </button>
                          </div>
                        )}
                        {notification.event_id && (
                          <button
                            type="button"
                            onClick={() => onEventClick(notification.event_id!)}
                            className="text-xs text-lime-600 hover:text-lime-700 font-semibold"
                          >
                            Открыть событие →
                          </button>
                        )}
                        {!notification.is_read && (
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(notification.id)}
                            disabled={processingIds.has(notification.id)}
                            className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {processingIds.has(notification.id) ? "Обработка..." : "Отметить прочитанным"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(notification.id)}
                          disabled={deletingId === notification.id}
                          className="text-xs text-red-500 hover:text-red-700 ml-auto disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {deletingId === notification.id ? "Удаление..." : "Удалить"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

