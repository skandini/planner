"use client";

import { useMemo, useEffect, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import type { Room } from "@/types/room.types";
import { parseUTC, formatDate } from "@/lib/utils/dateUtils";

interface UpcomingEventsProps {
  events: EventRecord[];
  currentUserEmail?: string;
  onEventClick: (event: EventRecord) => void;
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  apiBaseUrl?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  rooms?: Room[];
}

export function UpcomingEvents({
  events,
  currentUserEmail,
  onEventClick,
  users = [],
  apiBaseUrl = "http://localhost:8000",
  getUserOrganizationAbbreviation,
  rooms = [],
}: UpcomingEventsProps) {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  
  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventStart = parseUTC(event.starts_at);
        const eventEnd = parseUTC(event.ends_at);
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
      .slice(0, 8);
  }, [events, now]);

  const getEventStatus = (event: EventRecord) => {
    if (!currentUserEmail || !event.participants) {
      return null;
    }
    const participant = event.participants.find((p) => p.email === currentUserEmail);
    return participant?.response_status;
  };

  const getRoomName = (roomId: string | null) => {
    if (!roomId) return null;
    const room = rooms.find((r) => r.id === roomId);
    return room?.name || null;
  };

  const formatTime = (dateString: string) => {
    const date = parseUTC(dateString);
    return date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDateLabel = (dateString: string) => {
    const date = parseUTC(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) {
      return "Сегодня";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Завтра";
    } else {
      return formatDate(date, "dd MMM");
    }
  };

  const groupEventsByDate = useMemo(() => {
    const groups: Record<string, EventRecord[]> = {};
    upcomingEvents.forEach((event) => {
      const dateKey = parseUTC(event.starts_at).toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });
    return groups;
  }, [upcomingEvents]);

  if (upcomingEvents.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50/30 to-white shadow-sm p-3">
        <h3 className="text-xs font-semibold text-slate-700 mb-1">Ближайшие события</h3>
        <p className="text-xs text-slate-500">Нет предстоящих событий</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200/60 bg-gradient-to-br from-white via-slate-50/30 to-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700">Ближайшие события</h3>
          <span className="text-[0.65rem] text-slate-500 font-medium">{upcomingEvents.length}</span>
        </div>
      </div>
      
      <div className="max-h-[400px] overflow-y-auto">
        <div className="p-2 space-y-2">
          {Object.entries(groupEventsByDate).map(([dateKey, dayEvents]) => {
            const firstEvent = dayEvents[0];
            const dateLabel = getDateLabel(firstEvent.starts_at);
            const isToday = parseUTC(firstEvent.starts_at).toDateString() === now.toDateString();
            
            return (
              <div key={dateKey} className="space-y-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-0.5 h-3 rounded-full ${isToday ? 'bg-gradient-to-b from-blue-500 to-blue-400' : 'bg-slate-300'}`}></div>
                  <h4 className={`text-xs font-semibold ${isToday ? 'text-blue-600' : 'text-slate-600'}`}>
                    {dateLabel}
                  </h4>
                </div>
                
                <div className="space-y-1 ml-2">
                  {dayEvents.map((event) => {
                    const status = getEventStatus(event);
                    const isAccepted = status === "accepted";
                    const start = parseUTC(event.starts_at);
                    const end = parseUTC(event.ends_at);
                    const isLive = start <= now && end >= now;
                    const isStartingSoon = start.getTime() - now.getTime() < 30 * 60 * 1000 && start > now;
                    const roomName = getRoomName(event.room_id);

                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onEventClick(event)}
                        className="w-full text-left transition-all hover:scale-[1.01] rounded"
                      >
                        <div className={`rounded border-l-2 p-1.5 transition-all ${
                          isLive
                            ? "bg-gradient-to-r from-red-50 to-red-50/50 border-red-500 shadow-sm"
                            : isStartingSoon
                              ? "bg-gradient-to-r from-amber-50 to-amber-50/50 border-amber-400 shadow-sm"
                              : isAccepted
                                ? "bg-gradient-to-r from-lime-50 to-lime-50/50 border-lime-500"
                                : "bg-white border-slate-300"
                        }`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className="text-xs font-medium text-slate-700 flex-shrink-0">
                                {formatTime(event.starts_at)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h5 className="text-xs font-medium text-slate-900 truncate">
                                  {event.title}
                                </h5>
                                {roomName && (
                                  <span className="text-[0.65rem] text-slate-600 truncate">
                                    {roomName}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex-shrink-0 flex items-center gap-1">
                              {isLive && (
                                <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-red-500 to-red-600 text-white text-[0.65rem] font-semibold shadow-sm">
                                  LIVE
                                </span>
                              )}
                              {!isLive && isStartingSoon && (
                                <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[0.65rem] font-semibold shadow-sm">
                                  Скоро
                                </span>
                              )}
                              {!isLive && !isStartingSoon && (
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  status === "needs_action" || status === "pending" || !status
                                    ? "bg-slate-400"
                                    : isAccepted
                                      ? "bg-lime-500"
                                      : "bg-slate-300"
                                }`}></div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
