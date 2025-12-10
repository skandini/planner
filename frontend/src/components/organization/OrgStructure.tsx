import { useCallback, useEffect, useState } from "react";
import type { DepartmentDraft, DepartmentWithChildren } from "@/types/department.types";
import type { AuthenticatedFetch } from "@/types/common.types";
import type { UserProfile } from "@/types/user.types";
import { DEPARTMENTS_ENDPOINT, USERS_ENDPOINT } from "@/lib/constants";

/**
 * Вертикальная древовидная оргструктура с компактными карточками.
 * Поддержка: создание/редактирование/удаление, менеджер и сотрудники.
 */

interface OrgStructureProps {
  authFetch: AuthenticatedFetch;
  users: UserProfile[];
  organizations: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl: string;
}

export function OrgStructure({ authFetch, users, organizations, apiBaseUrl }: OrgStructureProps) {
  const [departments, setDepartments] = useState<DepartmentWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentWithChildren | null>(null);
  const [hoveredUser, setHoveredUser] = useState<UserProfile | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggedUser, setDraggedUser] = useState<UserProfile | null>(null);
  const [dragOverDept, setDragOverDept] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<DepartmentDraft>({
    name: "",
    description: "",
    organization_id: null,
    parent_id: null,
    manager_id: null,
  });

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await authFetch(`${DEPARTMENTS_ENDPOINT}?_t=${Date.now()}`);
      if (!resp.ok) throw new Error("Не удалось загрузить отделы");
      const data: DepartmentWithChildren[] = await resp.json();
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки отделов");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  // Загружаем текущего пользователя
  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const resp = await authFetch(`${USERS_ENDPOINT}me`);
        if (resp.ok) {
          const user = await resp.json();
          setCurrentUser(user);
        }
      } catch (err) {
        console.error("Ошибка загрузки текущего пользователя:", err);
      }
    };
    loadCurrentUser();
  }, [authFetch]);

  const flatten = (depts: DepartmentWithChildren[]) => {
    const res: DepartmentWithChildren[] = [];
    const walk = (arr: DepartmentWithChildren[]) => {
      arr.forEach((d) => {
        res.push(d);
        if (d.children) walk(d.children);
      });
    };
    walk(depts);
    return res;
  };
  const flat = flatten(departments);

  const openCreate = (parentId: string | null = null) => {
    setEditing(null);
    setFormData({
      name: "",
      description: "",
      organization_id: null,
      parent_id: parentId,
      manager_id: null,
    });
    setIsModalOpen(true);
  };

  const openEdit = (dept: DepartmentWithChildren) => {
    setEditing(dept);
    setFormData({
      name: dept.name,
      description: dept.description || "",
      organization_id: dept.organization_id || null,
      parent_id: dept.parent_id || null,
      manager_id: dept.manager_id || null,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    const payload: any = {
      name: formData.name,
      description: formData.description || null,
      organization_id: formData.organization_id || null,
      parent_id: formData.parent_id || null,
      manager_id: formData.manager_id || null,
    };
    try {
      if (editing) {
        const resp = await authFetch(`${DEPARTMENTS_ENDPOINT}/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.detail || "Не удалось обновить отдел");
        }
      } else {
        const resp = await authFetch(DEPARTMENTS_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          throw new Error(errData.detail || "Не удалось создать отдел");
        }
      }
      setIsModalOpen(false);
      setEditing(null);
      await loadDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения отдела");
    }
  };

  const updateUserDepartment = useCallback(
    async (userId: string, departmentId: string | null) => {
      const resp = await authFetch(`${USERS_ENDPOINT}${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: departmentId }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Не удалось обновить сотрудника");
      }
    },
    [authFetch]
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить отдел?")) return;
    try {
      const resp = await authFetch(`${DEPARTMENTS_ENDPOINT}/${id}`, { method: "DELETE" });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Не удалось удалить отдел");
      }
      await loadDepartments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления отдела");
    }
  };

  const renderTree = (nodes: DepartmentWithChildren[], depth = 0) => (
    <ul className="space-y-6 pl-0">
      {nodes.map((d) => {
        const manager = d.manager_id ? users.find((u) => u.id === d.manager_id) : null;
        const deptUsers = users.filter((u) => u.department_id === d.id && u.id !== manager?.id);
        const org = d.organization_id ? organizations.find((o) => o.id === d.organization_id) : null;
        const avatar = (u?: UserProfile) => (
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-200 via-white to-cyan-200 opacity-80" />
            <div className="absolute inset-[2px] rounded-full bg-white shadow" />
            <div className="relative w-full h-full rounded-full overflow-hidden border border-white shadow">
              {u?.avatar_url ? (
                <img
                  src={`${apiBaseUrl}${u.avatar_url}`}
                  alt={u.full_name || u.email}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[12px] font-semibold text-slate-700 bg-slate-100">
                  {u ? (u.full_name || u.email).charAt(0).toUpperCase() : "?"}
                </div>
              )}
            </div>
          </div>
        );

        const isRoot = depth === 0;

        return (
          <li key={d.id} className="relative flex flex-col items-center">
            {/* Вертикальная линия от родителя к карточке */}
            {!isRoot && (
              <div className="absolute -top-6 h-6 w-px bg-gradient-to-b from-slate-200 to-slate-300" />
            )}

            <div
              className={`group w-[320px] max-w-[320px] rounded-3xl border border-slate-200/70 bg-white/90 backdrop-blur shadow-xl px-4 py-4 transition hover:-translate-y-[4px] hover:shadow-2xl ${
                dragOverDept === d.id ? "ring-4 ring-indigo-400 ring-offset-2 bg-indigo-50/50" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedUser && draggedUser.department_id !== d.id) {
                  setDragOverDept(d.id);
                }
              }}
              onDragLeave={() => setDragOverDept(null)}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (draggedUser && draggedUser.department_id !== d.id) {
                  try {
                    await updateUserDepartment(draggedUser.id, d.id);
                    await loadDepartments();
                    // Обновляем страницу для обновления проп users
                    setTimeout(() => window.location.reload(), 500);
                    setDraggedUser(null);
                    setDragOverDept(null);
                  } catch (err) {
                    console.error("Ошибка перемещения сотрудника:", err);
                    setError(err instanceof Error ? err.message : "Не удалось переместить сотрудника");
                    setDraggedUser(null);
                    setDragOverDept(null);
                  }
                }
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-gradient-to-br from-indigo-100 to-cyan-100 text-slate-700 shadow-inner">
                      🏢
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 text-sm leading-tight truncate">{d.name}</div>
                      {org && (
                        <div className="text-[11px] text-slate-500 truncate">Орг: {org.name}</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => openEdit(d)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition"
                    title="Редактировать"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-white/80 border border-slate-200 text-red-600 hover:border-red-200 hover:text-red-700 transition"
                    title="Удалить"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Manager */}
              {manager && (
                <div
                  className={`mt-3 flex items-center gap-3 p-2 rounded-xl bg-slate-50/80 border border-slate-100 ${
                    draggedUser?.id === manager.id ? "opacity-50" : ""
                  }`}
                >
                  <div
                    className="cursor-move"
                    draggable
                    onDragStart={() => setDraggedUser(manager)}
                    onDragEnd={() => {
                      setDraggedUser(null);
                      setDragOverDept(null);
                    }}
                  >
                    {avatar(manager)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{manager.full_name || manager.email}</div>
                    <div className="text-[11px] text-slate-600 truncate">{manager.position || "Руководитель"}</div>
                  </div>
                  <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    Руководитель
                  </span>
                </div>
              )}

              {/* Description */}
              {d.description && (
                <div className="mt-2 text-[11px] text-slate-600 leading-snug line-clamp-2">
                  {d.description}
                </div>
              )}

              {/* Stats */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 6h14M5 18h7" />
                  </svg>
                  {d.children?.length || 0} подотделов
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-700 shadow-sm">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14c-4 0-6 2-6 4v1h12v-1c0-2-2-4-6-4z" />
                  </svg>
                  {deptUsers.length + (manager ? 1 : 0)} сотрудников
                </span>
              </div>

              {/* Participants */}
              {deptUsers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-slate-600 mb-2">Сотрудники</div>
                  <div className="flex flex-wrap gap-2">
                    {deptUsers.slice(0, 8).map((u) => (
                      <div
                        key={u.id}
                        className={`relative cursor-move transition-opacity ${
                          draggedUser?.id === u.id ? "opacity-50" : "opacity-100"
                        }`}
                        draggable
                        onDragStart={() => setDraggedUser(u)}
                        onDragEnd={() => {
                          setDraggedUser(null);
                          setDragOverDept(null);
                        }}
                        onMouseEnter={(e) => {
                          if (!draggedUser) {
                            setHoveredUser(u);
                            setHoverPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onMouseMove={(e) => {
                          if (!draggedUser) {
                            setHoverPos({ x: e.clientX, y: e.clientY });
                          }
                        }}
                        onMouseLeave={() => {
                          if (!draggedUser) {
                            setHoveredUser(null);
                          }
                        }}
                      >
                        {avatar(u)}
                      </div>
                    ))}
                    {deptUsers.length > 8 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600">
                        +{deptUsers.length - 8}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Subordinates - отдельный блок для подчиненных текущего пользователя */}
              {currentUser && manager && manager.id === currentUser.id && (() => {
                const subordinates = users.filter(u => u.manager_id === currentUser.id);
                if (subordinates.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="text-[10px] font-semibold text-emerald-700 mb-2">Мои подчиненные</div>
                    <div className="flex flex-wrap gap-2">
                      {subordinates.slice(0, 8).map((u) => (
                        <div
                          key={u.id}
                          className={`relative cursor-move transition-opacity ${
                            draggedUser?.id === u.id ? "opacity-50" : "opacity-100"
                          }`}
                          draggable
                          onDragStart={() => setDraggedUser(u)}
                          onDragEnd={() => {
                            setDraggedUser(null);
                            setDragOverDept(null);
                          }}
                          onMouseEnter={(e) => {
                            if (!draggedUser) {
                              setHoveredUser(u);
                              setHoverPos({ x: e.clientX, y: e.clientY });
                            }
                          }}
                          onMouseMove={(e) => {
                            if (!draggedUser) {
                              setHoverPos({ x: e.clientX, y: e.clientY });
                            }
                          }}
                          onMouseLeave={() => {
                            if (!draggedUser) {
                              setHoveredUser(null);
                            }
                          }}
                        >
                          {avatar(u)}
                        </div>
                      ))}
                      {subordinates.length > 8 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700">
                          +{subordinates.length - 8}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => openCreate(d.id)}
                  className="text-[11px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 text-white shadow-sm hover:shadow-md transition"
                >
                  + Подотдел
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="text-[11px] px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition"
                >
                  Редактировать
                </button>
              </div>
            </div>

            {d.children && d.children.length > 0 && (
              <div className="mt-4 flex flex-col items-center">
                {/* Вертикальная линия от карточки к горизонтальной линии детей */}
                <div className="w-px h-4 bg-slate-200/70" />
                <div className="relative flex flex-row gap-6">
                  {/* Горизонтальная линия соединяет детей */}
                  <div className="absolute left-0 right-0 top-5 h-px bg-slate-200/70" />
                  {d.children.map((child) => (
                    <div key={child.id} className="relative flex flex-col items-center">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-5 bg-slate-200/70" />
                      {renderTree([child], depth + 1)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold">Оргструктура</h2>
        <button
          onClick={() => openCreate(null)}
          className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm"
        >
          Добавить корневой отдел
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500">Загрузка...</div>
      ) : departments.length === 0 ? (
        <div className="text-sm text-slate-500">Нет отделов. Добавьте первый отдел.</div>
      ) : (
        renderTree(departments)
      )}

        {hoveredUser && (
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl px-4 py-3 w-64 pointer-events-none"
            style={{ left: hoverPos.x + 12, top: hoverPos.y + 12 }}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border border-white shadow">
                {hoveredUser.avatar_url ? (
                  <img
                    src={`${apiBaseUrl}${hoveredUser.avatar_url}`}
                    alt={hoveredUser.full_name || hoveredUser.email}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 font-semibold">
                    {(hoveredUser.full_name || hoveredUser.email).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">{hoveredUser.full_name || hoveredUser.email}</div>
                {hoveredUser.position && (
                  <div className="text-xs text-slate-600 truncate">{hoveredUser.position}</div>
                )}
                {hoveredUser.email && (
                  <div className="text-xs text-slate-500 truncate">{hoveredUser.email}</div>
                )}
              </div>
            </div>
          </div>
        )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold">
              {editing ? "Редактировать отдел" : "Создать отдел"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Название</label>
                <input
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Название отдела"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Описание</label>
                <textarea
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Описание"
                />
              </div>
              {editing && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Сотрудники (назначить в отдел)</label>
                  <div className="max-h-52 overflow-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50/70">
                    {users.map((u) => {
                      const isChecked = u.department_id === editing.id;
                      return (
                      <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={async () => {
                            try {
                              await updateUserDepartment(u.id, isChecked ? null : editing.id);
                              await loadDepartments();
                              // Обновляем страницу для обновления проп users
                              setTimeout(() => window.location.reload(), 500);
                            } catch (err) {
                              console.error(err);
                              setError(err instanceof Error ? err.message : "Не удалось обновить сотрудника");
                            }
                          }}
                        />
                        <span className="truncate">{u.full_name || u.email}</span>
                      </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Организация</label>
                <select
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={formData.organization_id || ""}
                  onChange={(e) => setFormData({ ...formData, organization_id: e.target.value || null })}
                >
                  <option value="">Не выбрано</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Родительский отдел</label>
                <select
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={formData.parent_id || ""}
                  onChange={(e) => setFormData({ ...formData, parent_id: e.target.value || null })}
                >
                  <option value="">Корневой</option>
                  {flat.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Руководитель</label>
                <select
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={formData.manager_id || ""}
                  onChange={(e) => setFormData({ ...formData, manager_id: e.target.value || null })}
                >
                  <option value="">Не выбран</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Сотрудники (назначить в отдел)</label>
                <div className="max-h-48 overflow-auto border border-slate-200 rounded-lg p-2 space-y-1">
                  {users.map((u) => {
                    const assigned = u.department_id === formData.parent_id || u.department_id === editing?.id;
                    const isChecked = formData.parent_id === u.department_id || (editing && u.department_id === editing.id);
                    return (
                      <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            // Назначаем выбранного пользователя в текущий отдел
                            // (простая реализация через вызов API обновления пользователя)
                          }}
                          disabled={assigned}
                        />
                        <span>{u.full_name || u.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setIsModalOpen(false); setEditing(null); }}
                className="px-3 py-2 text-sm rounded border border-slate-200 text-slate-700"
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                disabled={!formData.name.trim()}
              >
                {editing ? "Сохранить" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

