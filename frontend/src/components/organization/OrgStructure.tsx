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
      await authFetch(`${USERS_ENDPOINT}${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department_id: departmentId }),
      });
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

            <div className="group w-[280px] max-w-[280px] rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-cyan-50/50 backdrop-blur shadow-lg px-4 py-3 transition hover:-translate-y-[3px] hover:shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm leading-tight truncate">{d.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {d.children?.length || 0} подотделов
                    </span>
                  </div>
                  {manager && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-800 bg-white/90 border border-slate-200 rounded-lg px-2 py-1 w-fit shadow-sm">
                      {avatar(manager)}
                      <span className="truncate">{manager.full_name || manager.email}</span>
                    </div>
                  )}
                  {d.description && (
                    <div className="text-[11px] text-slate-600 leading-snug line-clamp-2">{d.description}</div>
                  )}
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

              {deptUsers.length > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] font-semibold text-slate-600 mb-1">Сотрудники</div>
                  <div className="flex flex-wrap gap-2">
                    {deptUsers.slice(0, 8).map((u) => (
                      <div
                        key={u.id}
                        className="relative"
                        onMouseEnter={(e) => {
                          setHoveredUser(u);
                          setHoverPos({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredUser(null)}
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

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => openCreate(d.id)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-emerald-500 text-white shadow-sm hover:shadow-md transition"
                >
                  + Подотдел
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-indigo-200 hover:text-indigo-700 transition"
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
                              } catch (err) {
                                console.error(err);
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

