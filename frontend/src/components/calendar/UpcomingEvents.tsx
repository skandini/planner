"use client";

import { useMemo } from "react";
import type { EventRecord } from "@/types/event.types";
import { parseUTC, formatDate } from "@/lib/utils/dateUtils";

interface UpcomingEventsProps {
  events: EventRecord[];
  currentUserEmail?: string;
  onEventClick: (event: EventRecord) => void;
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  apiBaseUrl?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
}

export function UpcomingEvents({
  events,
  currentUserEmail,
  onEventClick,
  users = [],
  apiBaseUrl = "http://localhost:8000",
  getUserOrganizationAbbreviation,
}: UpcomingEventsProps) {
  const now = new Date();
  
  // Фильтруем события: только будущие и сегодняшние, которые еще не закончились
  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventStart = parseUTC(event.starts_at);
        const eventEnd = parseUTC(event.ends_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Показываем события, которые:
        // 1. Начинаются сегодня или позже
        // 2. Еще не закончились (если сегодня)
        const isToday = eventStart.toDateString() === now.toDateString();
        const isFuture = eventStart > now;
        const isTodayAndNotEnded = isToday && eventEnd > now;
        
        return isFuture || isTodayAndNotEnded;
      })
      .sort((a, b) => {
        const startA = parseUTC(a.starts_at);
        const startB = parseUTC(b.starts_at);
        return startA.getTime() - startB.getTime();
      })
      .slice(0, 10); // Показываем только ближайшие 10 событий
  }, [events, now]);

  const getEventStatus = (event: EventRecord) => {
    if (!currentUserEmail || !event.participants) {
      return null;
    }
    const participant = event.participants.find((p) => p.email === currentUserEmail);
    return participant?.response_status;
  };

  const formatEventTime = (event: EventRecord) => {
    const start = parseUTC(event.starts_at);
    const end = parseUTC(event.ends_at);
    
    if (event.all_day) {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (start.toDateString() === today.toDateString()) {
        return "Сегодня, весь день";
      } else if (start.toDateString() === tomorrow.toDateString()) {
        return "Завтра, весь день";
      } else {
        return formatDate(start, "dd.MM.yyyy");
      }
    }
    
    const timeStr = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(start);
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (start.toDateString() === today.toDateString()) {
      return `Сегодня, ${timeStr}`;
    } else if (start.toDateString() === tomorrow.toDateString()) {
      return `Завтра, ${timeStr}`;
    } else {
      return `${formatDate(start, "dd.MM")}, ${timeStr}`;
    }
  };

  if (upcomingEvents.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">
          Ближайшие события
        </h3>
        <p className="text-sm text-slate-500">Нет предстоящих событий</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">
          Ближайшие события
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {upcomingEvents.length} {upcomingEvents.length === 1 ? "событие" : "событий"}
        </p>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        <div className="divide-y divide-slate-100">
          {upcomingEvents.map((event) => {
            const status = getEventStatus(event);
            const isAccepted = status === "accepted";
            const isPending = status === "needs_action" || status === "pending" || !status;
            const start = parseUTC(event.starts_at);
            const isToday = start.toDateString() === now.toDateString();
            const isStartingSoon = isToday && start.getTime() - now.getTime() < 30 * 60 * 1000; // 30 минут

            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onEventClick(event)}
                className={`w-full text-left transition hover:bg-slate-50 ${
                  isStartingSoon ? "bg-amber-50" : ""
                }`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={`h-2 w-2 rounded-full flex-shrink-0 ${
                            isPending
                              ? "bg-slate-400"
                              : isAccepted
                                ? "bg-lime-500"
                                : "bg-slate-300"
                          }`}
                        />
                        <h4
                          className={`text-sm font-medium truncate ${
                            isPending
                              ? "text-slate-700"
                              : isAccepted
                                ? "text-slate-900"
                                : "text-slate-600"
                          }`}
                        >
                          {event.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        {formatEventTime(event)}
                      </p>
                      {event.room_id && (
                        <p className="text-xs font-medium text-slate-600">
                          🏢 {event.room_id}
                        </p>
                      )}
                      {event.participants && event.participants.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex -space-x-1.5">
                            {event.participants.slice(0, 5).map((participant) => {
                              const user = users.find((u) => u.id === participant.user_id || u.email === participant.email);
                              const avatarUrl = user?.avatar_url;
                              const displayName = participant.full_name || participant.email.split("@")[0];
                              const initials = displayName.charAt(0).toUpperCase();
                              const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(participant.user_id) : "";
                              
                              return (
                                <div
                                  key={participant.user_id || participant.email}
                                  className="relative group"
                                  title={`${displayName}${orgAbbr ? ` (${orgAbbr})` : ''}`}
                                >
                                  {avatarUrl ? (
                                    <img
                                      src={avatarUrl.startsWith('http') ? avatarUrl : `${apiBaseUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`}
                                      alt={displayName}
                                      className="w-6 h-6 rounded-full object-cover border-2 border-white shadow-sm"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                        if (fallback) fallback.classList.remove('hidden');
                                      }}
                                    />
                                  ) : null}
                                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center border-2 border-white shadow-sm ${avatarUrl ? 'hidden' : ''}`}>
                                    <span className="text-[0.55rem] font-semibold text-white">
                                      {initials}
                                    </span>
                                  </div>
                                  {/* Статус участника (цветная точка) */}
                                  <div
                                    className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${
                                      participant.response_status === "accepted"
                                        ? "bg-lime-500"
                                        : participant.response_status === "declined"
                                        ? "bg-red-500"
                                        : "bg-amber-500"
                                    }`}
                                  />
                                </div>
                              );
                            })}
                            {event.participants.length > 5 && (
                              <div className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center">
                                <span className="text-[0.55rem] font-semibold text-slate-600">
                                  +{event.participants.length - 5}
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">
                            {event.participants.length}{" "}
                            {event.participants.length === 1
                              ? "участник"
                              : event.participants.length < 5
                                ? "участника"
                                : "участников"}
                          </span>
                        </div>
                      )}
                    </div>
                    {isStartingSoon && (
                      <div className="flex-shrink-0">
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Скоро
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

