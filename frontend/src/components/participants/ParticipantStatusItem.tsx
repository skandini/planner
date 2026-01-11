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
}: ParticipantStatusItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);
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

  const statusIcons: Record<string, string> = {
    accepted: "✓",
    declined: "✕",
    needs_action: "○",
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!onUpdateStatus || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(eventId, participant.user_id, newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setIsUpdating(false);
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
                <span>✓</span>
                <span>Принять</span>
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange("declined")}
                disabled={isUpdating}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                title="Отклонить"
              >
                <span>✕</span>
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
                  {statusIcons[value]} {label}
                </option>
              ))}
            </select>
          )
        ) : (
          // Для других участников - только отображение статуса (read-only)
          <div className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-xs font-semibold ${
            statusColors[currentStatus]
          }`}>
            <span>{statusIcons[currentStatus]}</span>
            <span>{statusLabels[currentStatus]}</span>
          </div>
        )}
      </div>
    </div>
  );
}

