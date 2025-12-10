import { useCallback, useEffect, useState } from "react";
import type { DepartmentDraft, DepartmentWithChildren } from "@/types/department.types";
import type { AuthenticatedFetch } from "@/types/common.types";
import type { UserProfile } from "@/types/user.types";
import { DEPARTMENTS_ENDPOINT } from "@/lib/constants";

/**
 * Простая оргструктура (базовая версия) с аккуратным визуалом.
 * Без панорамирования и зума. Полное дерево, неограниченная вложенность.
 */

interface OrgStructureProps {
  authFetch: AuthenticatedFetch;
  users: UserProfile[];
  organizations: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl: string;
}

export function OrgStructure({ authFetch, organizations }: OrgStructureProps) {
  const [departments, setDepartments] = useState<DepartmentWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<DepartmentWithChildren | null>(null);
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

  const renderTree = (nodes: DepartmentWithChildren[]) => (
    <ul className="space-y-3 pl-4 border-l border-slate-200/60">
      {nodes.map((d) => (
        <li key={d.id} className="relative">
          <div className="group rounded-2xl border border-slate-200/70 bg-white/80 backdrop-blur shadow-sm px-4 py-3 transition hover:shadow-md">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900">{d.name}</span>
              {d.manager_name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {d.manager_name}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Подотделов: {d.children?.length || 0}
              </span>
            </div>
            {d.description && <div className="text-xs text-slate-600 mt-1">{d.description}</div>}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => openCreate(d.id)}
                className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
              >
                + подотдел
              </button>
              <button
                onClick={() => openEdit(d)}
                className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition"
              >
                Редактировать
              </button>
              <button
                onClick={() => handleDelete(d.id)}
                className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition"
              >
                Удалить
              </button>
            </div>
          </div>
          {d.children && d.children.length > 0 && (
            <div className="mt-3">
              <div className="absolute left-[-1px] top-0 h-full border-l border-slate-200/60" />
              <div className="ml-4">{renderTree(d.children)}</div>
            </div>
          )}
        </li>
      ))}
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
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

