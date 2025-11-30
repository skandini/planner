"use client";

import { useState } from "react";
import type { EventParticipant } from "@/types/user.types";

interface ParticipantStatusItemProps {
  participant: EventParticipant;
  eventId: string;
  onUpdateStatus?: (eventId: string, userId: string, status: string) => Promise<void>;
  canManage: boolean;
}

export function ParticipantStatusItem({
  participant,
  eventId,
  onUpdateStatus,
  canManage,
}: ParticipantStatusItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const statusLabels: Record<string, string> = {
    accepted: "Принял",
    declined: "Отклонил",
    tentative: "Возможно",
    needs_action: "Нет ответа",
  };

  const statusColors: Record<string, string> = {
    accepted: "bg-lime-100 text-lime-700 border-lime-300",
    declined: "bg-red-100 text-red-700 border-red-300",
    tentative: "bg-amber-100 text-amber-700 border-amber-300",
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

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">
          {participant.full_name || participant.email}
        </p>
        <p className="text-xs text-slate-500 truncate">{participant.email}</p>
      </div>
      {canManage ? (
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
      ) : (
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

