"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { Room } from "@/types/room.types";
import type { UserProfile, ParticipantProfile } from "@/types/user.types";
import type { TimelineRowData } from "@/types/common.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { EnhancedTimeline } from "@/components/availability/EnhancedTimeline";
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
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl?: string;
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
  getUserOrganizationAbbreviation,
  organizations = [],
  apiBaseUrl = "",
}: ResourcePanelProps) {
  const [participantAvailability, setParticipantAvailability] = useState<
    Record<string, EventRecord[]>
  >({});
  const [participantAvailabilityLoading, setParticipantAvailabilityLoading] =
    useState(false);
  const [participantAvailabilityError, setParticipantAvailabilityError] =
    useState<string | null>(null);
  const [allDepartments, setAllDepartments] = useState<Array<{ id: string; name: string }>>([]);

  // Загружаем все отделы для tooltip
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const { DEPARTMENTS_ENDPOINT } = await import("@/lib/constants");
        const response = await authFetch(DEPARTMENTS_ENDPOINT);
        if (response.ok) {
          const data = await response.json();
          // Flatten departments tree
          const flatten = (depts: any[]): Array<{ id: string; name: string }> => {
            const result: Array<{ id: string; name: string }> = [];
            depts.forEach(dept => {
              result.push({ id: dept.id, name: dept.name });
              if (dept.children && dept.children.length > 0) {
                result.push(...flatten(dept.children));
              }
            });
            return result;
          };
          setAllDepartments(flatten(data));
        }
      } catch (err) {
        console.error("Failed to load departments:", err);
      }
    };
    loadDepartments();
  }, [authFetch]);

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
    // Проверяем условия для загрузки доступности
    if (!selectedCalendarId || !authFetch) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    // Если нет выбранных участников, не загружаем доступность
    if (selectedParticipantProfiles.length === 0) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    // Загружаем доступность для всего дня, чтобы видеть всю занятость
    // Используем дату из starts_at или selectedDate
    let targetDate: Date;
    if (form.starts_at) {
      const dateStr = form.starts_at.split("T")[0];
      targetDate = new Date(dateStr + "T00:00:00");
    } else {
      targetDate = new Date(selectedDate);
      targetDate.setHours(0, 0, 0, 0);
    }
    
    // Загружаем доступность для всего дня (00:00 - 23:59:59)
    const rangeStart = new Date(targetDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(targetDate);
    rangeEnd.setHours(23, 59, 59, 999);

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
              console.log(`[Availability] Fetching for ${participant.label} (${participant.user_id})`);
              console.log(`[Availability] URL: ${url}`);
              const response = await authFetch(url, { cache: "no-store" });
              
              console.log(`[Availability] Response status: ${response.status} for ${participant.label}`);
              
              if (!response.ok) {
                // Если ошибка, логируем и возвращаем пустой список
                const errorText = await response.text().catch(() => "");
                console.warn(
                  `[Availability] Failed to load for ${participant.label}:\n` +
                  `  Status: ${response.status}\n` +
                  `  Error: ${errorText}\n` +
                  `  URL: ${url}`
                );
                return [participant.user_id, []] as const;
              }
              
              const data: EventRecord[] = await response.json();
              console.log(`[Availability] Loaded ${data.length} events for ${participant.label} (${participant.user_id})`);
              if (data.length > 0) {
                console.log(`[Availability] Events for ${participant.label}:`, data.map(e => ({
                  title: e.title,
                  starts_at: e.starts_at,
                  ends_at: e.ends_at,
                })));
              }
              return [participant.user_id, data] as const;
            } catch (err) {
              // Логируем ошибки при загрузке доступности
              const errorMessage = err instanceof Error ? err.message : String(err);
              
              console.error(
                `[Availability] Error for ${participant.label} (${participant.user_id}):\n` +
                `  Error: ${errorMessage}\n` +
                `  Type: ${err instanceof Error ? err.constructor.name : typeof err}\n` +
                `  URL: ${url}\n` +
                `  Full error:`, err
              );
              
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
        avatarUrl: null,
        availability: roomAvailability,
        loading: loadingAvailability,
        type: "room",
      });
    }
    selectedParticipantProfiles.forEach((participant) => {
      const profile = users.find((u) => u.id === participant.user_id);
      rows.push({
        id: `participant-${participant.user_id}`,
        label: participant.label,
        meta: participant.email,
        avatarUrl: profile?.avatar_url ?? null,
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
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/30 p-6 text-slate-900 shadow-sm">
      <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-lime-400 to-lime-600 text-white shadow-md">
            📅
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Ресурсы</h3>
            <p className="text-xs text-slate-500">Переговорки и участники</p>
          </div>
        </div>
        {form.room_id && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 border border-blue-200">
            <span className="text-sm">🏢</span>
            <span className="text-xs font-semibold text-blue-700">
              {selectedRoom?.name ?? "Переговорка"}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-md">
            🏢
          </div>
          <p className="text-sm font-semibold text-slate-900">Переговорка</p>
        </div>
        {roomsLoading ? (
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 text-sm text-slate-500 flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-lime-500"></div>
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
            className="w-full rounded-xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 hover:border-slate-300"
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

      <EnhancedTimeline
        rows={timelineRows}
        referenceDate={selectedDate}
        selectedStart={form.starts_at}
        selectedEnd={form.ends_at}
        isAllDay={isAllDay}
        errorMessage={participantAvailabilityError}
        conflictMap={conflictMap}
        getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
        users={users}
        organizations={organizations}
        departments={allDepartments}
        apiBaseUrl={apiBaseUrl}
      />

      <ConflictSummary
        conflicts={conflicts}
        loading={conflictsLoading}
        error={conflictsError}
      />
    </div>
  );
}

