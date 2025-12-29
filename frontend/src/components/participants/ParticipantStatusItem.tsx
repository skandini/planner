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
}

export function ParticipantStatusItem({
  participant,
  eventId,
  onUpdateStatus,
  canManage,
  isCurrentUser = false,
  currentUserEmail,
  getUserOrganizationAbbreviation,
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

  const handleStatusChange = async (newStatus: string) => {
    if (!onUpdateStatus || isUpdating) return;
    
    // Дополнительная проверка: только текущий пользователь может менять статус
    if (!isCurrentUser) {
      console.error("Попытка изменить статус другого участника заблокирована");
      return;
    }
    
    setIsUpdating(true);
    try {
      await onUpdateStatus(eventId, participant.user_id, newStatus);
    } catch (err) {
      console.error("Failed to update status:", err);
      // Показываем ошибку пользователю через alert или можно передать callback для отображения ошибки
      if (err instanceof Error) {
        alert(err.message || "Не удалось обновить статус");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const currentStatus = participant.response_status || "needs_action";
  // Только текущий пользователь может менять свой статус
  const canChangeStatus = isCurrentUser && onUpdateStatus;
  const needsResponse = isCurrentUser && (currentStatus === "needs_action" || currentStatus === "pending" || !currentStatus);

  const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(participant.user_id) : "";

  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg border p-2 transition-all ${
      isCurrentUser 
        ? "border-lime-200/60 bg-gradient-to-r from-lime-50/50 to-white hover:border-lime-300 hover:shadow-sm" 
        : "border-slate-200/60 bg-white/60 hover:bg-white hover:border-slate-300"
    }`}>
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`text-[0.7rem] font-semibold truncate ${
              isCurrentUser ? "text-slate-800" : "text-slate-700"
            }`}>
              {participant.full_name || participant.email}
            </p>
            {orgAbbr && (
              <span className="inline-block rounded-full bg-slate-100 px-1 py-0.5 text-[0.55rem] font-semibold text-slate-600 flex-shrink-0">
                {orgAbbr}
              </span>
            )}
            {isCurrentUser && (
              <span className="inline-block rounded-full bg-lime-100 px-1.5 py-0.5 text-[0.55rem] font-semibold text-lime-700 flex-shrink-0">
                Вы
              </span>
            )}
          </div>
        </div>
      </div>
      {/* Только текущий пользователь может менять свой статус */}
      {canChangeStatus ? (
        needsResponse ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleStatusChange("accepted")}
              disabled={isUpdating}
              className="group relative rounded-md bg-gradient-to-r from-lime-500 to-lime-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm shadow-lime-500/30 transition-all hover:from-lime-600 hover:to-lime-700 hover:shadow-md hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              title="Принять"
            >
              {isUpdating ? (
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              ) : (
                "✓ Принять"
              )}
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange("declined")}
              disabled={isUpdating}
              className="group relative rounded-md bg-gradient-to-r from-red-500 to-red-600 px-2.5 py-1 text-[0.7rem] font-semibold text-white shadow-sm shadow-red-500/30 transition-all hover:from-red-600 hover:to-red-700 hover:shadow-md hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
              title="Отклонить"
            >
              {isUpdating ? (
                <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              ) : (
                "✕ Отклонить"
              )}
            </button>
          </div>
        ) : (
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={isUpdating}
            className={`rounded-md border px-2 py-1 text-[0.65rem] font-semibold outline-none transition flex-shrink-0 cursor-pointer ${
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
        <span
          className={`rounded-md border px-2 py-1 text-[0.65rem] font-semibold flex-shrink-0 ${
            statusColors[currentStatus]
          }`}
        >
          {statusLabels[currentStatus]}
        </span>
      )}
    </div>
  );
}

