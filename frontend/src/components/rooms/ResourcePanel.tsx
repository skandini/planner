"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { Room } from "@/types/room.types";
import type { UserProfile, ParticipantProfile } from "@/types/user.types";
import type { TimelineRowData } from "@/types/common.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ParticipantsSection } from "@/components/participants/ParticipantsSection";
import { UnifiedAvailabilityTimeline } from "@/components/availability/UnifiedAvailabilityTimeline";
import { ConflictSummary } from "@/components/availability/ConflictSummary";
import { inputToDate } from "@/lib/utils/dateUtils";
import { CALENDAR_ENDPOINT } from "@/lib/constants";

interface ResourcePanelProps {
  rooms: Room[];
  roomsLoading: boolean;
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  selectedRoom: Room | null;
  selectedDate: Date;
  roomAvailability: EventRecord[];
  loadingAvailability: boolean;
  readOnly: boolean;
  members: CalendarMember[];
  membersLoading: boolean;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  authFetch: AuthenticatedFetch;
  selectedCalendarId: string | null;
  isAllDay: boolean;
  onRefreshMembers: () => Promise<void> | void;
  conflicts: ConflictEntry[];
  conflictsLoading: boolean;
  conflictsError: string | null;
}

export function ResourcePanel({
  rooms,
  roomsLoading,
  form,
  setForm,
  selectedRoom,
  selectedDate,
  roomAvailability,
  loadingAvailability,
  readOnly,
  members,
  membersLoading,
  users,
  usersLoading,
  usersError,
  authFetch,
  selectedCalendarId,
  isAllDay,
  onRefreshMembers,
  conflicts,
  conflictsLoading,
  conflictsError,
}: ResourcePanelProps) {
  const [participantAvailability, setParticipantAvailability] = useState<
    Record<string, EventRecord[]>
  >({});
  const [participantAvailabilityLoading, setParticipantAvailabilityLoading] =
    useState(false);
  const [participantAvailabilityError, setParticipantAvailabilityError] =
    useState<string | null>(null);

  const membershipMap = useMemo(() => {
    const map = new Map<string, CalendarMember>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);

  const selectedParticipantProfiles = useMemo(() => {
    return form.participant_ids
      .map<ParticipantProfile | null>((userId) => {
        const profile = users.find((user) => user.id === userId);
        if (!profile) {
          return null;
        }
        return {
          user_id: userId,
          label: profile.full_name || profile.email,
          email: profile.email,
          membership: membershipMap.get(userId),
        };
      })
      .filter((item): item is ParticipantProfile => item !== null);
  }, [form.participant_ids, users, membershipMap]);

  const accessibleParticipants = useMemo(
    () =>
      selectedParticipantProfiles.filter((participant) =>
        membershipMap.has(participant.user_id),
      ),
    [selectedParticipantProfiles, membershipMap],
  );

  const ensureMembership = useCallback(
    async (userId: string) => {
      if (!selectedCalendarId) {
        throw new Error("Сначала выберите календарь");
      }
      if (membershipMap.has(userId)) {
        return;
      }
      const response = await authFetch(
        `${CALENDAR_ENDPOINT}${selectedCalendarId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role: "viewer" }),
        },
      );
      if (!response.ok) {
        let detail = "Не удалось выдать доступ пользователю";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string") {
            detail = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      await onRefreshMembers();
    },
    [authFetch, membershipMap, onRefreshMembers, selectedCalendarId],
  );

  useEffect(() => {
    if (!selectedCalendarId || !form.starts_at || !form.ends_at) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    const rangeStart = inputToDate(form.starts_at, { allDay: form.all_day });
    const rangeEnd = inputToDate(form.ends_at, {
      allDay: form.all_day,
      endOfDay: true,
    });
    if (!rangeStart || !rangeEnd) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    // Не требуем автоматического добавления в календарь
    // Участники могут быть добавлены в события без членства в календаре
    // Загружаем доступность для всех выбранных участников
    // Если участник не в календаре, его доступность просто не будет показана
    
    if (selectedParticipantProfiles.length === 0) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    let cancelled = false;
    const fetchAvailability = async () => {
      setParticipantAvailabilityLoading(true);
      setParticipantAvailabilityError(null);
      try {
        // Загружаем доступность для всех выбранных участников
        // Backend позволяет проверять доступность любого пользователя, независимо от доступа к календарю
        if (!selectedCalendarId) {
          console.warn("Cannot fetch availability: no calendar selected");
          setParticipantAvailability({});
          setParticipantAvailabilityLoading(false);
          return;
        }
        
        console.log(`Fetching availability for ${selectedParticipantProfiles.length} participants`);
        const entries = await Promise.allSettled(
          selectedParticipantProfiles.map(async (participant) => {
            const url = `${CALENDAR_ENDPOINT}${selectedCalendarId}/members/${participant.user_id}/availability?from=${encodeURIComponent(rangeStart.toISOString())}&to=${encodeURIComponent(rangeEnd.toISOString())}`;
            try {
              console.log(`Fetching availability for participant ${participant.label} (${participant.user_id})`);
              const response = await authFetch(url, { cache: "no-store" });
              if (!response.ok) {
                // Если ошибка, логируем и возвращаем пустой список
                const errorText = await response.text().catch(() => "");
                console.warn(`Failed to load availability for user ${participant.user_id} (${participant.label}):`, response.status, errorText);
                return [participant.user_id, []] as const;
              }
              const data: EventRecord[] = await response.json();
              console.log(`Loaded ${data.length} events for participant ${participant.label} (${participant.user_id})`);
              return [participant.user_id, data] as const;
            } catch (err) {
              // Логируем ошибки при загрузке доступности
              const errorMessage = err instanceof Error ? err.message : String(err);
              console.error(`Error loading availability for user ${participant.user_id} (${participant.label}):`, errorMessage, err);
              // Возвращаем пустой список, но не прерываем загрузку для других участников
              return [participant.user_id, []] as const;
            }
          }),
        );
        
        // Обрабатываем результаты Promise.allSettled
        const processedEntries: Array<[string, EventRecord[]]> = entries.map((result, index) => {
          if (result.status === "fulfilled") {
            return result.value;
          } else {
            // Если промис был отклонен, логируем и возвращаем пустой список
            const participant = selectedParticipantProfiles[index];
            console.error(`Promise rejected for participant ${participant?.label || 'unknown'}:`, result.reason);
            if (participant) {
              return [participant.user_id, []] as const;
            }
            return ["", []] as const;
          }
        }).filter((entry): entry is [string, EventRecord[]] => entry[0] !== "");

        if (!cancelled) {
          setParticipantAvailability(Object.fromEntries(processedEntries));
        }
      } catch {
        if (!cancelled) {
          setParticipantAvailabilityError(
            "Не удалось загрузить занятость участников",
          );
        }
      } finally {
        if (!cancelled) {
          setParticipantAvailabilityLoading(false);
        }
      }
    };

    fetchAvailability();
    return () => {
      cancelled = true;
    };
  }, [
    authFetch,
    form.all_day,
    form.ends_at,
    form.starts_at,
    selectedCalendarId,
    selectedParticipantProfiles,
  ]);

  const timelineRows = useMemo(() => {
    const rows: TimelineRowData[] = [];
    if (selectedRoom) {
      rows.push({
        id: `room-${selectedRoom.id}`,
        label: selectedRoom.name,
        meta: selectedRoom.location,
        availability: roomAvailability,
        loading: loadingAvailability,
        type: "room",
      });
    }
    selectedParticipantProfiles.forEach((participant) => {
      rows.push({
        id: `participant-${participant.user_id}`,
        label: participant.label,
        meta: participant.email,
        availability: participantAvailability[participant.user_id] ?? [],
        loading: participantAvailabilityLoading,
        type: "participant",
      });
    });
    if (rows.length === 0) {
      rows.push({
        id: "placeholder",
        label: "Временная сетка",
        meta: "Выберите ресурсы",
        availability: [],
        loading: false,
        type: "participant",
      });
    }
    return rows;
  }, [
    loadingAvailability,
    participantAvailability,
    participantAvailabilityLoading,
    roomAvailability,
    selectedParticipantProfiles,
    selectedRoom,
    membershipMap,
  ]);

  const conflictMap = useMemo(() => {
    const map = new Map<string, Array<{ start: Date; end: Date }>>();
    conflicts.forEach((conflict) => {
      if (!conflict.resource_id) {
        return;
      }
      const key =
        conflict.type === "room"
          ? `room-${conflict.resource_id}`
          : `participant-${conflict.resource_id}`;
      const entry = map.get(key) ?? [];
      entry.push({
        start: new Date(conflict.slot_start),
        end: new Date(conflict.slot_end),
      });
      map.set(key, entry);
    });
    return map;
  }, [conflicts]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
            Ресурсы
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            Переговорки и участники
          </h3>
        </div>
        {form.room_id && (
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
            {selectedRoom?.name ?? "Переговорка"}
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium text-slate-700">Переговорка</p>
        {roomsLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
            Загружаем переговорки…
          </div>
        ) : (
          <select
            value={form.room_id || ""}
            disabled={readOnly}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                room_id: e.target.value || null,
              }))
            }
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-lime-500"
          >
            <option value="" className="bg-white text-slate-900">
              Без переговорки
            </option>
            {rooms.length === 0 ? (
              <option disabled className="bg-white text-slate-400">
                Нет доступных переговорок
              </option>
            ) : (
              rooms.map((room) => (
                <option
                  key={room.id}
                  value={room.id}
                  className="bg-white text-slate-900"
                >
                  {room.name}
                  {room.capacity > 1 ? ` (до ${room.capacity} чел.)` : ""}
                  {room.location ? ` — ${room.location}` : ""}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      <ParticipantsSection
        form={form}
        setForm={setForm}
        users={users}
        usersLoading={usersLoading}
        usersError={usersError}
        calendarMembers={members}
        membersLoading={membersLoading}
        onEnsureMembership={ensureMembership}
        readOnly={readOnly}
      />

      <UnifiedAvailabilityTimeline
        rows={timelineRows}
        referenceDate={selectedDate}
        selectedStart={form.starts_at}
        selectedEnd={form.ends_at}
        isAllDay={isAllDay}
        errorMessage={participantAvailabilityError}
        conflictMap={conflictMap}
      />

      <ConflictSummary
        conflicts={conflicts}
        loading={conflictsLoading}
        error={conflictsError}
      />
    </div>
  );
}

