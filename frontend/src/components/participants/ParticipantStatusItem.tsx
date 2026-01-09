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
  const needsResponse = isCurrentUser && (currentStatus === "needs_action" || currentStatus === "pending" || !currentStatus);

  const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(participant.user_id) : "";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900">
            {participant.full_name || participant.email}
          </p>
          {orgAbbr && (
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-700 flex-shrink-0">
              {orgAbbr}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{participant.email}</p>
      </div>
      {isCurrentUser && onUpdateStatus ? (
        // Текущий пользователь может изменить свой статус
        needsResponse ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleStatusChange("accepted")}
              disabled={isUpdating}
              className="rounded-lg bg-lime-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-lime-400 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Принять"
            >
              ✓ Принять
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange("declined")}
              disabled={isUpdating}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed"
              title="Отклонить"
            >
              ✕ Отклонить
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <select
              value={currentStatus}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isUpdating}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold outline-none transition ${
                statusColors[currentStatus]
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )
      ) : (
        // Для других участников показываем только статус (без возможности изменения)
        <span
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold flex-shrink-0 ${
            statusColors[currentStatus]
          }`}
        >
          {statusLabels[currentStatus]}
        </span>
      )}
    </div>
  );
}
