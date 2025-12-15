"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import type { TicketComment, TicketCommentCreate } from "@/types/ticket.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import type { UserProfile } from "@/types/user.types";
import { TICKET_COMMENTS_ENDPOINT } from "@/lib/constants";

interface TicketCommentsSectionProps {
  ticketId: string | null;
  authFetch: AuthenticatedFetch;
  currentUserId?: string | null;
  users?: UserProfile[];
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl?: string;
}

export function TicketCommentsSection({
  ticketId,
  authFetch,
  currentUserId,
  users = [],
  getUserOrganizationAbbreviation,
  organizations = [],
  apiBaseUrl = "",
}: TicketCommentsSectionProps) {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [hoveredUser, setHoveredUser] = useState<UserProfile | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [allDepartments, setAllDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Загружаем все отделы для tooltip
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const { DEPARTMENTS_ENDPOINT } = await import("@/lib/constants");
        const response = await authFetch(DEPARTMENTS_ENDPOINT);
        if (response.ok) {
          const data = await response.json();
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
    if (ticketId) {
      loadDepartments();
    }
  }, [ticketId, authFetch]);

  const scrollToBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadComments = async () => {
    if (!ticketId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(TICKET_COMMENTS_ENDPOINT(ticketId), {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить комментарии");
      }

      const data = await response.json();
      setComments(data);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки комментариев");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      loadComments();
    } else {
      setComments([]);
    }
  }, [ticketId]);

  const handleSubmit = async (e?: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLTextAreaElement> | FormEvent) => {
    if (e) {
      e.preventDefault();
      if ('stopPropagation' in e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
    }
    if (!ticketId || !newComment.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const commentData: TicketCommentCreate = {
        content: newComment.trim(),
      };

      const response = await authFetch(TICKET_COMMENTS_ENDPOINT(ticketId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commentData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || errorData.error || "Не удалось добавить комментарий";
        throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
      }

      setNewComment("");
      await loadComments();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("Error adding comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSubmit(e);
    }
  };

  const startEdit = (comment: TicketComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!ticketId || !editContent.trim()) return;

    try {
      const response = await authFetch(`${TICKET_COMMENTS_ENDPOINT(ticketId)}/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить комментарий");
      }

      setEditingId(null);
      setEditContent("");
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления комментария");
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!ticketId || !confirm("Удалить этот комментарий?")) return;

    try {
      const response = await authFetch(`${TICKET_COMMENTS_ENDPOINT(ticketId)}/${commentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить комментарий");
      }

      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления комментария");
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
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "минуту" : minutes < 5 ? "минуты" : "минут"} назад`;
    if (hours < 24) return `${hours} ${hours === 1 ? "час" : hours < 5 ? "часа" : "часов"} назад`;
    if (days < 7) return `${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"} назад`;

    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!ticketId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Комментарии</h3>
        {comments.length > 0 && (
          <span className="text-xs text-slate-500">{comments.length}</span>
        )}
      </div>

      {loading && comments.length === 0 ? (
        <div className="text-center py-4 text-sm text-slate-500">Загрузка комментариев...</div>
      ) : error && comments.length === 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {comments.length === 0 ? (
            <div className="text-center py-4 text-xs text-slate-400">Нет комментариев</div>
          ) : (
            comments.map((comment) => {
              const user = users.find(u => u.id === comment.user_id);
              const isOwnComment = currentUserId === comment.user_id;

              return (
                <div key={comment.id} className="flex gap-2 p-2 rounded-lg hover:bg-slate-50 transition">
                  <div
                    className="relative w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-white shadow flex-shrink-0 cursor-pointer"
                    onMouseEnter={(e) => {
                      if (user) {
                        setHoveredUser(user);
                        setHoverPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (user) {
                        setHoverPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseLeave={() => setHoveredUser(null)}
                  >
                    {comment.user_avatar_url ? (
                      <img
                        src={apiBaseUrl && !comment.user_avatar_url.startsWith('http') ? `${apiBaseUrl}${comment.user_avatar_url}` : comment.user_avatar_url}
                        alt={comment.user_full_name || comment.user_email || ""}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                          if (fallback) {
                            fallback.style.display = "flex";
                          }
                        }}
                      />
                    ) : null}
                    <div className={`w-full h-full flex items-center justify-center text-slate-600 font-semibold text-xs ${comment.user_avatar_url ? "hidden" : ""}`}>
                      {(comment.user_full_name || comment.user_email || "?").charAt(0).toUpperCase()}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {comment.user_full_name || comment.user_email}
                      </span>
                      {getUserOrganizationAbbreviation && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">
                          {getUserOrganizationAbbreviation(comment.user_id)}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                    {editingId === comment.id ? (
                      <div className="mt-1 space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(comment.id)}
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
                      <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>
                    )}
                    {isOwnComment && editingId !== comment.id && (
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => startEdit(comment)}
                          className="text-[10px] text-slate-500 hover:text-slate-700"
                        >
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDelete(comment.id)}
                          className="text-[10px] text-red-500 hover:text-red-700"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={commentsEndRef} />
        </div>
      )}

      {/* Поле ввода нового комментария */}
      <div className="border-t border-slate-200 pt-3">
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Написать комментарий... (Ctrl+Enter для отправки)"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            rows={2}
            disabled={submitting}
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "..." : "Отправить"}
          </button>
        </div>
        {error && comments.length > 0 && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Tooltip с информацией о пользователе */}
      {hoveredUser && (() => {
        const userDeptIds = hoveredUser.department_ids || (hoveredUser.department_id ? [hoveredUser.department_id] : []);
        const userDepts = userDeptIds
          .map(deptId => allDepartments.find(d => d.id === deptId))
          .filter(Boolean) as Array<{ id: string; name: string }>;
        
        const userOrgIds = hoveredUser.organization_ids || (hoveredUser.organization_id ? [hoveredUser.organization_id] : []);
        const userOrgs = userOrgIds
          .map(orgId => organizations.find(o => o.id === orgId))
          .filter(Boolean);
        
        return (
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl px-4 py-3 w-72 pointer-events-none"
            style={{ left: hoverPos.x + 12, top: hoverPos.y + 12 }}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border border-white shadow flex-shrink-0">
                {hoveredUser.avatar_url ? (
                  <img
                    src={apiBaseUrl && !hoveredUser.avatar_url.startsWith('http') ? `${apiBaseUrl}${hoveredUser.avatar_url}` : hoveredUser.avatar_url}
                    alt={hoveredUser.full_name || hoveredUser.email}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 font-semibold">
                    {(hoveredUser.full_name || hoveredUser.email).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{hoveredUser.full_name || hoveredUser.email}</div>
                {hoveredUser.position && (
                  <div className="text-xs text-slate-600 truncate mt-0.5">{hoveredUser.position}</div>
                )}
                {hoveredUser.email && (
                  <div className="text-xs text-slate-500 truncate mt-0.5">{hoveredUser.email}</div>
                )}
                
                {userDepts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Отделы</div>
                    <div className="flex flex-wrap gap-1">
                      {userDepts.map(dept => (
                        <span key={dept.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {dept.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {userOrgs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-1">Организации</div>
                    <div className="flex flex-wrap gap-1">
                      {userOrgs.map(org => (
                        <span key={org.id} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          🏢 {org.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

