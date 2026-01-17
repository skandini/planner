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
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case "event_updated":
        return (
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case "event_cancelled":
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case "event_reminder":
        return (
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        );
    }
  };

  const getNotificationBorderColor = (type: string) => {
    switch (type) {
      case "event_invited":
        return "border-l-blue-400";
      case "event_updated":
        return "border-l-amber-400";
      case "event_cancelled":
        return "border-l-red-400";
      case "event_reminder":
        return "border-l-indigo-400";
      default:
        return "border-l-slate-300";
    }
  };

  const formatDate = (dateString: string) => {
    // Парсим дату - сервер возвращает UTC время
    // Если нет 'Z' в конце, добавляем его для правильного парсинга
    const isoString = dateString.includes('Z') ? dateString : `${dateString}Z`;
    const date = new Date(isoString);
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

  const handleDelete = async (notificationId: string, skipConfirmation = false) => {
    if (!skipConfirmation && !confirm("Вы уверены, что хотите удалить это уведомление?")) {
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
      // После успешного ответа на приглашение - автоматически удаляем это уведомление
      const notification = notifications.find((n) => n.event_id === eventId && n.type === "event_invited");
      if (notification) {
        // Удаляем уведомление без подтверждения, так как пользователь уже дал ответ
        await handleDelete(notification.id, true);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 flex-shrink-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Уведомления
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {unreadCount > 0 ? `${unreadCount} новых` : "Все прочитано"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                disabled={markingAllAsRead}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {markingAllAsRead ? "..." : "Прочитать все"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Закрыть"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 bg-slate-50">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                Загрузка...
              </div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-slate-100 p-6 mb-4">
                <svg className="w-12 h-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
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
                  className={`rounded-lg border-l-4 ${getNotificationBorderColor(notification.type)} bg-white border border-slate-200 p-3.5 transition hover:shadow-sm ${
                    !notification.is_read ? "ring-1 ring-indigo-100" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${notification.is_read ? "font-medium text-slate-900" : "font-semibold text-slate-900"}`}>
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {notification.message}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="h-2 w-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5 ring-2 ring-indigo-100" />
                        )}
                      </div>
                      <p className="text-[0.65rem] text-slate-400 mb-2.5">
                        {formatDate(notification.created_at)}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {notification.event_id && notification.type === "event_invited" && onUpdateParticipantStatus && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleParticipantStatus(notification.event_id!, "accepted")}
                              disabled={updatingStatus.has(`${notification.event_id}-accepted`)}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                            >
                              {updatingStatus.has(`${notification.event_id}-accepted`) ? "..." : "✓ Принять"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleParticipantStatus(notification.event_id!, "declined")}
                              disabled={updatingStatus.has(`${notification.event_id}-declined`)}
                              className="rounded-lg bg-slate-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                            >
                              {updatingStatus.has(`${notification.event_id}-declined`) ? "..." : "✕ Отклонить"}
                            </button>
                          </div>
                        )}
                        {notification.event_id && (
                          <button
                            type="button"
                            onClick={() => onEventClick(notification.event_id!)}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium hover:underline"
                          >
                            Открыть →
                          </button>
                        )}
                        {!notification.is_read && (
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(notification.id)}
                            disabled={processingIds.has(notification.id)}
                            className="text-xs text-slate-500 hover:text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed hover:underline"
                          >
                            {processingIds.has(notification.id) ? "..." : "Прочитано"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(notification.id)}
                          disabled={deletingId === notification.id}
                          className="text-xs text-slate-400 hover:text-red-600 ml-auto disabled:opacity-60 disabled:cursor-not-allowed hover:underline"
                        >
                          {deletingId === notification.id ? "..." : "Удалить"}
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

