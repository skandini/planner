"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import type { EventComment, EventCommentCreate } from "@/types/comment.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import type { UserProfile } from "@/types/user.types";
import { EVENT_COMMENTS_ENDPOINT } from "@/lib/constants";

interface CommentsSectionProps {
  eventId: string | null;
  authFetch: AuthenticatedFetch;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  users?: UserProfile[];
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl?: string;
}

export function CommentsSection({
  eventId,
  authFetch,
  currentUserId,
  currentUserEmail,
  users = [],
  getUserOrganizationAbbreviation,
  organizations = [],
  apiBaseUrl = "",
}: CommentsSectionProps) {
  const [comments, setComments] = useState<EventComment[]>([]);
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
    if (eventId) {
      loadDepartments();
    }
  }, [eventId, authFetch]);

  // Автоматическая прокрутка к последнему комментарию
  const scrollToBottom = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Загрузка комментариев
  const loadComments = async () => {
    if (!eventId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(EVENT_COMMENTS_ENDPOINT(eventId), {
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
      console.error("Error loading comments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      loadComments();
    } else {
      setComments([]);
    }
  }, [eventId]);

  // Отправка нового комментария
  const handleSubmit = async (e?: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLTextAreaElement> | FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
      if ('stopPropagation' in e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
    }
    if (!eventId || !newComment.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const commentData: EventCommentCreate = {
        content: newComment.trim(),
      };

      let response: Response;
      try {
        response = await authFetch(EVENT_COMMENTS_ENDPOINT(eventId), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(commentData),
        });
      } catch (fetchError) {
        // Ошибка сети или авторизации
        let errorMessage = "Не удалось отправить комментарий";
        if (fetchError instanceof Error) {
          errorMessage = fetchError.message;
        } else if (typeof fetchError === 'string') {
          errorMessage = fetchError;
        }
        throw new Error(errorMessage);
      }

      if (!response.ok) {
        let errorMessage = "Не удалось добавить комментарий";
        try {
          const errorData = await response.json();
          console.log("Error response data:", errorData);
          
          // FastAPI возвращает ошибки валидации в формате {detail: [...]} или {detail: "string"}
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData && typeof errorData === 'object') {
            if (Array.isArray(errorData.detail)) {
              // Ошибки валидации Pydantic
              const validationErrors = errorData.detail.map((err: any) => {
                const field = err.loc ? err.loc.join('.') : 'unknown';
                const msg = err.msg || 'validation error';
                return `${field}: ${msg}`;
              }).join(', ');
              errorMessage = `Ошибка валидации: ${validationErrors}`;
            } else if (errorData.detail) {
              errorMessage = errorData.detail;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            } else {
              errorMessage = JSON.stringify(errorData);
            }
          }
        } catch (parseError) {
          // Если не удалось распарсить JSON, используем статус код
          errorMessage = `Ошибка ${response.status}: ${response.statusText || 'Неизвестная ошибка'}`;
        }
        throw new Error(errorMessage);
      }

      const createdComment = await response.json();
      setComments((prev) => [...prev, createdComment]);
      setNewComment("");
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      let errorMessage = "Ошибка добавления комментария";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else {
        // Для любых других типов ошибок
        try {
          errorMessage = String(err);
        } catch {
          errorMessage = "Произошла неизвестная ошибка";
        }
      }
      setError(errorMessage);
      console.error("Error adding comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Удаление комментария
  const handleDelete = async (commentId: string) => {
    if (!eventId || submitting) return;

    if (!confirm("Вы уверены, что хотите удалить этот комментарий?")) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await authFetch(`${EVENT_COMMENTS_ENDPOINT(eventId)}/${commentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить комментарий");
      }

      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления комментария");
    } finally {
      setSubmitting(false);
    }
  };

  // Начало редактирования
  const startEdit = (comment: EventComment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  // Отмена редактирования
  const cancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  // Сохранение изменений
  const handleSaveEdit = async (commentId: string) => {
    if (!eventId || !editContent.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await authFetch(`${EVENT_COMMENTS_ENDPOINT(eventId)}/${commentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить комментарий");
      }

      const updatedComment = await response.json();
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? updatedComment : c))
      );
      setEditingId(null);
      setEditContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления комментария");
    } finally {
      setSubmitting(false);
    }
  };

  // Форматирование даты - показываем локальное время
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    // Проверяем, сегодня ли это
    const isToday = date.toDateString() === now.toDateString();
    
    // Проверяем, вчера ли это
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    // Форматируем время
    const timeStr = date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    
    if (isToday) {
      return `Сегодня в ${timeStr}`;
    } else if (isYesterday) {
      return `Вчера в ${timeStr}`;
    } else {
      // Показываем полную дату
      return date.toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      }) + ` в ${timeStr}`;
    }
  };

  // Автоматическое изменение высоты textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newComment]);

  if (!eventId) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Комментарии
          {comments.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({comments.length})
            </span>
          )}
        </h3>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Список комментариев */}
      <div className="mb-4 max-h-96 overflow-y-auto space-y-4 pr-2">
        {loading && comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Загрузка комментариев...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">
            Пока нет комментариев. Будьте первым!
          </div>
        ) : (
          comments.map((comment) => {
            const isOwnComment = comment.user_id === currentUserId || comment.user_email === currentUserEmail;
            const isEditing = editingId === comment.id;
            const userProfile = users.find(u => u.id === comment.user_id || u.email === comment.user_email);
            const orgAbbr = getUserOrganizationAbbreviation ? getUserOrganizationAbbreviation(comment.user_id) : "";

            return (
              <div
                key={comment.id}
                className="group rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/30 p-4 transition-all hover:border-lime-300 hover:shadow-md hover:shadow-lime-100"
              >
                <div className="flex items-start gap-3">
                  {/* Аватар с tooltip */}
                  <div 
                    className="flex-shrink-0 relative"
                    onMouseEnter={(e) => {
                      if (userProfile) {
                        setHoveredUser(userProfile);
                        setHoverPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (userProfile) {
                        setHoverPos({ x: e.clientX, y: e.clientY });
                      }
                    }}
                    onMouseLeave={() => {
                      setHoveredUser(null);
                    }}
                  >
                    {comment.user_avatar_url ? (
                      <img
                        src={apiBaseUrl && !comment.user_avatar_url.startsWith('http') ? `${apiBaseUrl}${comment.user_avatar_url}` : comment.user_avatar_url}
                        alt={comment.user_full_name || comment.user_email || "User"}
                        className="h-12 w-12 rounded-full object-cover border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-110"
                        onError={(e) => {
                          // Если изображение не загрузилось, заменяем на инициал
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.parentElement?.querySelector('.avatar-fallback') as HTMLElement;
                          if (fallback) {
                            fallback.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className={`avatar-fallback flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-lime-600 text-sm font-semibold text-white shadow-md cursor-pointer transition-transform hover:scale-110 ${comment.user_avatar_url ? 'hidden' : ''}`}
                    >
                      {(comment.user_full_name || comment.user_email || "U")[0].toUpperCase()}
                    </div>
                  </div>

                  {/* Содержимое комментария */}
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 cursor-pointer hover:text-lime-600 transition-colors">
                          {comment.user_full_name || comment.user_email || "Неизвестный пользователь"}
                        </span>
                        {orgAbbr && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-lime-100 text-lime-800 border border-lime-200">
                            {orgAbbr}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(comment.id)}
                            disabled={submitting || !editContent.trim()}
                            className="rounded-lg bg-lime-500 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={submitting}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                        {comment.content}
                      </p>
                    )}

                    {/* Кнопки действий (только для своих комментариев) */}
                    {isOwnComment && !isEditing && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => startEdit(comment)}
                          className="text-xs font-medium text-slate-600 hover:text-lime-600 hover:bg-lime-50 px-2 py-1 rounded transition-all"
                        >
                          ✏️ Редактировать
                        </button>
                        <button
                          onClick={() => handleDelete(comment.id)}
                          disabled={submitting}
                          className="text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🗑️ Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={commentsEndRef} />
      </div>

      {/* Форма добавления комментария (используем div вместо form, т.к. уже внутри формы события) */}
      <div className="border-t border-slate-200 pt-4">
        <div className="flex gap-3">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Напишите комментарий..."
            className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 transition-all focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20"
            rows={2}
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit(e);
              }
            }}
          />
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSubmit(e);
            }}
            disabled={submitting || !newComment.trim()}
            className="self-end rounded-lg bg-lime-500 px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
          >
            {submitting ? "Отправка..." : "Отправить"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Нажмите Ctrl+Enter для отправки
        </p>
      </div>

      {/* Tooltip с информацией о пользователе (как в оргструктуре) */}
      {hoveredUser && (() => {
        // Get all departments user belongs to
        const userDeptIds = hoveredUser.department_ids || (hoveredUser.department_id ? [hoveredUser.department_id] : []);
        const userDepts = userDeptIds
          .map(deptId => allDepartments.find(d => d.id === deptId))
          .filter(Boolean) as Array<{ id: string; name: string }>;
        
        // Get all organizations user belongs to
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
                    src={apiBaseUrl ? `${apiBaseUrl}${hoveredUser.avatar_url}` : hoveredUser.avatar_url}
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
                      {userOrgs.map(org => org && (
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

