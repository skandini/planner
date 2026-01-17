"use client";

import { useState, useEffect, useRef } from "react";
import type { TicketInternalNote, TicketInternalNoteCreate } from "@/types/ticket.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { TICKET_INTERNAL_NOTES_ENDPOINT } from "@/lib/constants";

interface TicketInternalNotesSectionProps {
  ticketId: string | null;
  authFetch: AuthenticatedFetch;
  currentUserId?: string | null;
  apiBaseUrl?: string;
}

export function TicketInternalNotesSection({
  ticketId,
  authFetch,
  currentUserId,
  apiBaseUrl = "",
}: TicketInternalNotesSectionProps) {
  const [notes, setNotes] = useState<TicketInternalNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isStaff, setIsStaff] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadNotes = async () => {
    if (!ticketId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(TICKET_INTERNAL_NOTES_ENDPOINT(ticketId), {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setNotes(data);
        setIsStaff(true);
      } else if (response.status === 403) {
        // Not staff - hide section
        setIsStaff(false);
        setNotes([]);
      } else {
        throw new Error("Не удалось загрузить заметки");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки заметок");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      loadNotes();
    }
  }, [ticketId]);

  const handleSubmit = async () => {
    if (!ticketId || !newNote.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const noteData: TicketInternalNoteCreate = {
        content: newNote.trim(),
        is_pinned: isPinned,
      };

      const response = await authFetch(TICKET_INTERNAL_NOTES_ENDPOINT(ticketId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось добавить заметку");
      }

      setNewNote("");
      setIsPinned(false);
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления заметки");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit();
    }
  };

  const startEdit = (note: TicketInternalNote) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!ticketId || !editContent.trim()) return;

    try {
      const response = await authFetch(`${TICKET_INTERNAL_NOTES_ENDPOINT(ticketId)}/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить заметку");
      }

      setEditingId(null);
      setEditContent("");
      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления заметки");
    }
  };

  const handleTogglePin = async (note: TicketInternalNote) => {
    if (!ticketId) return;

    try {
      const response = await authFetch(`${TICKET_INTERNAL_NOTES_ENDPOINT(ticketId)}/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: !note.is_pinned }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить заметку");
      }

      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления заметки");
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!ticketId || !confirm("Удалить эту заметку?")) return;

    try {
      const response = await authFetch(`${TICKET_INTERNAL_NOTES_ENDPOINT(ticketId)}/${noteId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить заметку");
      }

      await loadNotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления заметки");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} д. назад`;

    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!ticketId || !isStaff) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <span className="text-sm">📌</span>
          Внутренние заметки
        </h3>
        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
          🔒 Не видны пользователю
        </span>
      </div>

      {loading && notes.length === 0 ? (
        <div className="text-center py-3 text-xs text-slate-500">Загрузка...</div>
      ) : error && notes.length === 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {notes.length === 0 ? (
            <div className="text-center py-3 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
              Нет внутренних заметок
            </div>
          ) : (
            notes.map((note) => {
              const isOwnNote = currentUserId === note.user_id;

              return (
                <div
                  key={note.id}
                  className={`rounded-lg border p-3 ${
                    note.is_pinned
                      ? "bg-amber-50 border-amber-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                      {note.user_avatar_url ? (
                        <img
                          src={apiBaseUrl && !note.user_avatar_url.startsWith("http") ? `${apiBaseUrl}${note.user_avatar_url}` : note.user_avatar_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-slate-600">
                          {(note.user_full_name || note.user_email || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-900">
                          {note.user_full_name || note.user_email}
                        </span>
                        {note.is_pinned && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            📌 Закреплено
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {formatDate(note.created_at)}
                        </span>
                      </div>

                      {editingId === note.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            rows={3}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveEdit(note.id)}
                              className="text-xs px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap break-words">
                          {note.content}
                        </p>
                      )}

                      {editingId !== note.id && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleTogglePin(note)}
                            className="text-[10px] text-slate-500 hover:text-amber-600"
                          >
                            {note.is_pinned ? "Открепить" : "Закрепить"}
                          </button>
                          {isOwnNote && (
                            <>
                              <button
                                onClick={() => startEdit(note)}
                                className="text-[10px] text-slate-500 hover:text-slate-700"
                              >
                                Редактировать
                              </button>
                              <button
                                onClick={() => handleDelete(note.id)}
                                className="text-[10px] text-red-500 hover:text-red-700"
                              >
                                Удалить
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Поле ввода новой заметки */}
      <div className="border-t border-slate-200 pt-3">
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Добавить внутреннюю заметку... (Ctrl+Enter для отправки)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            rows={2}
            disabled={submitting}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="rounded border-slate-300"
                disabled={submitting}
              />
              Закрепить заметку
            </label>
            <button
              onClick={handleSubmit}
              disabled={!newNote.trim() || submitting}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "..." : "Добавить заметку"}
            </button>
          </div>
        </div>
        {error && notes.length > 0 && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

