"use client";

import { useState } from "react";
import type { Notification } from "@/types/notification.types";

interface InvitationsPanelProps {
  invitations: Notification[];
  loading: boolean;
  onClose: () => void;
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onDelete: (notificationId: string) => Promise<void>;
  onEventClick: (eventId: string) => void;
  onUpdateParticipantStatus?: (eventId: string, status: string) => Promise<void>;
}

export function InvitationsPanel({
  invitations,
  loading,
  onClose,
  onMarkAsRead,
  onDelete,
  onEventClick,
  onUpdateParticipantStatus,
}: InvitationsPanelProps) {
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    const isoString = dateString.includes('Z') ? dateString : `${dateString}Z`;
    const date = new Date(isoString);
    const now = new Date();
    
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

  const handleDelete = async (notificationId: string, skipConfirmation = false) => {
    if (!skipConfirmation && !confirm("Вы уверены, что хотите удалить это приглашение?")) {
      return;
    }
    setDeletingId(notificationId);
    try {
      await onDelete(notificationId);
    } catch (err) {
      console.error("Failed to delete:", err);
      const errorMessage = err instanceof Error ? err.message : "Не удалось удалить";
      alert(`Ошибка: ${errorMessage}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleParticipantStatus = async (eventId: string, status: string, notificationId: string) => {
    if (!onUpdateParticipantStatus) return;
    const key = `${eventId}-${status}`;
    setUpdatingStatus((prev) => new Set(prev).add(key));
    try {
      await onUpdateParticipantStatus(eventId, status);
      // После успешного ответа - автоматически удаляем приглашение
      await handleDelete(notificationId, true);
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

  const unreadCount = invitations.filter(i => !i.is_read).length;

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
        className="w-full max-w-xl max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col dark:bg-[#0b0e11] dark:border-slate-700/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#2b3139] px-5 py-4 flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-[#181a20] dark:to-[#1e2329]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/30">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Приглашения
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {unreadCount > 0 ? `${unreadCount} новых` : "Нет новых приглашений"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600"
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 bg-slate-50 dark:bg-[#0b0e11]/50">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
                Загрузка...
              </div>
            </div>
          ) : invitations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-6 mb-4">
                <svg className="w-12 h-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                Нет приглашений
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Новые приглашения на встречи появятся здесь
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className={`rounded-xl border bg-white dark:bg-[#181a20] border-slate-200 dark:border-[#2b3139] p-4 transition hover:shadow-md dark:hover:bg-[#1e2329] ${
                    !invitation.is_read ? "ring-2 ring-blue-200 dark:ring-amber-500/40" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`flex-shrink-0 p-2 rounded-lg ${
                      !invitation.is_read 
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" 
                        : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                    }`}>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className={`text-sm ${
                          !invitation.is_read 
                            ? "font-bold text-slate-900 dark:text-white" 
                            : "font-medium text-slate-700 dark:text-slate-300"
                        }`}>
                          {invitation.title}
                        </p>
                        {!invitation.is_read && (
                          <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-blue-500 text-[0.6rem] font-bold text-white">
                            НОВОЕ
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
                        {invitation.message}
                      </p>
                      <p className="text-[0.65rem] text-slate-400 mb-3">
                        {formatDate(invitation.created_at)}
                      </p>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {invitation.event_id && onUpdateParticipantStatus && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleParticipantStatus(invitation.event_id!, "accepted", invitation.id)}
                              disabled={updatingStatus.has(`${invitation.event_id}-accepted`)}
                              className="rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2 text-xs font-semibold text-white transition hover:from-emerald-600 hover:to-green-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                            >
                              {updatingStatus.has(`${invitation.event_id}-accepted`) ? (
                                <span className="flex items-center gap-1">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                </span>
                              ) : (
                                "✓ Принять"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleParticipantStatus(invitation.event_id!, "declined", invitation.id)}
                              disabled={updatingStatus.has(`${invitation.event_id}-declined`)}
                              className="rounded-lg bg-gradient-to-r from-slate-500 to-slate-600 px-4 py-2 text-xs font-semibold text-white transition hover:from-slate-600 hover:to-slate-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                            >
                              {updatingStatus.has(`${invitation.event_id}-declined`) ? (
                                <span className="flex items-center gap-1">
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                </span>
                              ) : (
                                "✕ Отклонить"
                              )}
                            </button>
                          </>
                        )}
                        {invitation.event_id && (
                          <button
                            type="button"
                            onClick={() => onEventClick(invitation.event_id!)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium hover:underline"
                          >
                            Подробнее →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(invitation.id)}
                          disabled={deletingId === invitation.id}
                          className="text-xs text-slate-400 hover:text-red-500 ml-auto disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {deletingId === invitation.id ? "..." : "Удалить"}
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

