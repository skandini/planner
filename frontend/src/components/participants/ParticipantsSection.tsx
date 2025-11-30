"use client";

import { useMemo, useState } from "react";
import type { EventDraft } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { UserProfile } from "@/types/user.types";

interface ParticipantsSectionProps {
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  calendarMembers: CalendarMember[];
  membersLoading: boolean;
  readOnly: boolean;
  onEnsureMembership: (userId: string) => Promise<void>;
}

export function ParticipantsSection({
  form,
  setForm,
  users,
  usersLoading,
  usersError,
  calendarMembers,
  membersLoading,
  readOnly,
  onEnsureMembership,
}: ParticipantsSectionProps) {
  const selectedCount = form.participant_ids.length;
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const membershipMap = useMemo(() => {
    const map = new Map<string, CalendarMember>();
    calendarMembers.forEach((member) => {
      map.set(member.user_id, member);
    });
    return map;
  }, [calendarMembers]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const nameA = a.full_name || a.email;
      const nameB = b.full_name || b.email;
      return nameA.localeCompare(nameB, "ru");
    });
  }, [users]);

  const toggleParticipant = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      participant_ids: prev.participant_ids.includes(userId)
        ? prev.participant_ids.filter((id) => id !== userId)
        : [...prev.participant_ids, userId],
    }));
  };

  const handleToggle = async (userId: string) => {
    if (readOnly) return;
    const alreadySelected = form.participant_ids.includes(userId);
    if (!alreadySelected) {
      try {
        await onEnsureMembership(userId);
        setMembershipError(null);
      } catch (err) {
        setMembershipError(
          err instanceof Error
            ? err.message
            : "Не удалось выдать доступ пользователю",
        );
        return;
      }
    }
    toggleParticipant(userId);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            Участники
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Команда события
          </p>
        </div>
        {selectedCount > 0 && (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
            {selectedCount}
          </span>
        )}
      </div>

      {usersLoading || membersLoading ? (
        <p className="mt-3 text-xs text-slate-500">Загружаем пользователей…</p>
      ) : sortedUsers.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Пользователи ещё не добавлены.
        </p>
      ) : (
        <>
          {(usersError || membershipError) && (
            <p className="mt-3 text-xs text-red-600">
              {membershipError || usersError}
            </p>
          )}
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {sortedUsers.map((user) => {
              const membership = membershipMap.get(user.id);
              const isSelected = form.participant_ids.includes(user.id);
              const badge =
                membership?.role === "owner"
                  ? "Владелец"
                  : membership?.role === "editor"
                    ? "Редактор"
                    : membership?.role === "viewer"
                      ? "Наблюдатель"
                      : "Нет доступа";
              return (
                <div
                  key={user.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    isSelected
                      ? "border-lime-500 bg-lime-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={readOnly}
                    onChange={() => handleToggle(user.id)}
                    className="h-4 w-4 rounded border-lime-500 text-lime-500 focus:ring-lime-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {user.full_name || user.email}
                    </p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[0.65rem] ${
                      membership
                        ? "border border-slate-200 text-slate-500"
                        : "border border-amber-200 bg-amber-50 text-amber-600"
                    }`}
                  >
                    {badge}
                  </span>
                </div>
              );
            })}
          </div>

          {selectedCount === 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Отметьте участников, чтобы видеть их занятость ниже.
            </p>
          )}
        </>
      )}
    </div>
  );
}

