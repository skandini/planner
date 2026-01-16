"use client";

import { useState } from "react";
import type { EventParticipant } from "@/types/user.types";

interface ParticipantStatusItemProps {
  participant: EventParticipant;
  eventId: string;
  onUpdateStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  canManage: boolean;
  isCurrentUser?: boolean;
  currentUserEmail?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  apiBaseUrl?: string;
  isRecurring?: boolean;
  onUpdateStatusSeries?: (eventId: string, userId: string, status: string, applyTo: "this" | "all") => Promise<void>;
}

export function ParticipantStatusItem({
  participant,
  eventId,
  onUpdateStatus,
  canManage,
  isCurrentUser = false,
  currentUserEmail,
  getUserOrganizationAbbreviation,
  apiBaseUrl = "http://localhost:8000",
  isRecurring = false,
  onUpdateStatusSeries,
}: ParticipantStatusItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const statusLabels: Record<string, string> = {
    accepted: "Принял",
    declined: "Отклонил",
    needs_action: "Нет ответа",
  };

  const statusColors: Record<string, string> = {
    accepted: "bg-lime-100 text-lime-700 border-lime-300",
    declined: "bg-red-100 text-red-700 border-red-300",
    needs_action: "bg-slate-100 text-slate-600 border-slate-300",
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "accepted":
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        );
      case "declined":
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case "needs_action":
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (isUpdating) return;
    
    // Если это повторяемое событие, показываем диалог выбора
    if (isRecurring && onUpdateStatusSeries) {
      setPendingStatus(newStatus);
      setShowRecurringDialog(true);
      return;
    }
    
    // Обычное событие - просто обновляем
    if (!onUpdateStatus) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(eventId, participant.user_id, newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleRecurringChoice = async (applyTo: "this" | "all") => {
    if (!pendingStatus || !onUpdateStatusSeries || isUpdating) return;
    setShowRecurringDialog(false);
    setIsUpdating(true);
    try {
      await onUpdateStatusSeries(eventId, participant.user_id, pendingStatus, applyTo);
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setIsUpdating(false);
      setPendingStatus(null);
    }
  };

  const currentStatus = participant.response_status || "needs_action";
  
  // Только текущий пользователь может изменить свой статус
  // Для других участников статус только для чтения
  const canEditStatus = isCurrentUser && onUpdateStatus;
  const needsResponse = isCurrentUser && (currentStatus === "needs_action" || currentStatus === "pending" || !currentStatus);

  const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(participant.user_id) : "";

  // Получаем URL аватара
  const getAvatarUrl = () => {
    if (!participant.avatar_url) return null;
    if (participant.avatar_url.startsWith("http")) return participant.avatar_url;
    const base = apiBaseUrl.replace(/\/$/, "");
    const path = participant.avatar_url.startsWith("/") ? participant.avatar_url : `/${participant.avatar_url}`;
    return `${base}${path}`;
  };

  const avatarUrl = getAvatarUrl();
  const initials = (participant.full_name || participant.email)[0].toUpperCase();

  return (
    <>
      {/* Диалог для повторяемых событий */}
      {showRecurringDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowRecurringDialog(false)}>
          <div className="bg-white rounded-lg p-6 shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Повторяющееся событие</h3>
            <p className="text-sm text-slate-600 mb-6">
              Это событие повторяется. Применить изменение статуса к:
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleRecurringChoice("this")}
                className="w-full px-4 py-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition"
              >
                Только этому событию
              </button>
              <button
                onClick={() => handleRecurringChoice("all")}
                className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition"
              >
                Всем событиям серии
              </button>
              <button
                onClick={() => {
                  setShowRecurringDialog(false);
                  setPendingStatus(null);
                }}
                className="w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:shadow-md hover:border-slate-300">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Аватар */}
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={participant.full_name || participant.email}
            className="h-10 w-10 rounded-full object-cover border-2 border-slate-200 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-sm font-semibold text-white border-2 border-slate-200 flex-shrink-0">
            {initials}
          </div>
        )}

        {/* Информация об участнике */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {participant.full_name || participant.email}
            </p>
            {orgAbbr && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-700 flex-shrink-0">
                {orgAbbr}
              </span>
            )}
          </div>
          {participant.full_name && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{participant.email}</p>
          )}
        </div>
      </div>

      {/* Статус и действия */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {canEditStatus ? (
          needsResponse ? (
            // Если нет ответа - показываем кнопки "Принять/Отклонить"
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange("accepted")}
                disabled={isUpdating}
                className="flex items-center gap-1.5 rounded-lg bg-lime-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-lime-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                title="Принять"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
                <span>Принять</span>
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("declined")}
                disabled={isUpdating}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                title="Отклонить"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Отклонить</span>
              </button>
            </div>
          ) : (
            // Если уже есть ответ - показываем select для изменения
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isUpdating}
              className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-xs font-semibold outline-none transition cursor-pointer ${
                statusColors[currentStatus]
              } disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-sm`}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )
        ) : (
          // Для других участников - только отображение статуса (read-only)
          <div className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-semibold ${
            statusColors[currentStatus]
          }`}>
            {getStatusIcon(currentStatus)}
            <span>{statusLabels[currentStatus]}</span>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

