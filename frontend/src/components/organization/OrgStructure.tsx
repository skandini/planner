import { useCallback, useEffect, useState } from "react";
import type { DepartmentDraft, DepartmentWithChildren } from "@/types/department.types";
import type { AuthenticatedFetch } from "@/types/common.types";
import type { UserProfile } from "@/types/user.types";
import { DEPARTMENTS_ENDPOINT, USERS_ENDPOINT } from "@/lib/constants";
import { UserProfileCard } from "@/components/profile/UserProfileCard";
import { UserTooltip } from "@/components/common/UserTooltip";
import { useTheme } from "@/context/ThemeContext";

/**
 * Вертикальная древовидная оргструктура с компактными карточками.
 * Поддержка: создание/редактирование/удаление, менеджер и сотрудники.
 */

interface OrgStructureProps {
  authFetch: AuthenticatedFetch;
  users: UserProfile[];
  organizations: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl: string;
  onClose?: () => void;
  onUsersUpdate?: () => void;
  onOrganizationsUpdate?: () => void;
}

export function OrgStructure({ authFetch, users, organizations, apiBaseUrl, onClose, onUsersUpdate, onOrganizationsUpdate }: OrgStructureProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [initialFormData, setInitialFormData] = useState<DepartmentDraft | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>(""); // "" = all organizations
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"structure" | "employees">("structure");

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await authFetch(`${DEPARTMENTS_ENDPOINT}?_t=${Date.now()}`);
      if (!resp.ok) {
        let errorMessage = "Не удалось загрузить отделы";
        try {
          const errData = await resp.json();
          errorMessage = errData.detail || errData.message || errorMessage;
        } catch (e) {
          errorMessage = `Ошибка ${resp.status}: ${resp.statusText}`;
        }
        throw new Error(errorMessage);
      }
      const data: DepartmentWithChildren[] = await resp.json();
      setDepartments(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ошибка загрузки отделов";
      setError(errorMessage);
      console.error("Ошибка загрузки отделов:", err);
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
    const newFormData = {
      name: "",
      description: "",
      organization_id: null,
      parent_id: parentId,
      manager_id: null,
    };
    setFormData(newFormData);
    setInitialFormData(newFormData);
    setIsModalOpen(true);
    setShowCloseConfirm(false);
  };

  const openEdit = (dept: DepartmentWithChildren) => {
    setEditing(dept);
    const newFormData = {
      name: dept.name,
      description: dept.description || "",
      organization_id: dept.organization_id || null,
      parent_id: dept.parent_id || null,
      manager_id: dept.manager_id || null,
    };
    setFormData(newFormData);
    setInitialFormData(newFormData);
    setIsModalOpen(true);
    setShowCloseConfirm(false);
  };
  
  const hasUnsavedChanges = () => {
    if (!initialFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialFormData);
  };
  
  const handleClose = () => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      setIsModalOpen(false);
      setEditing(null);
      setFormData({
        name: "",
        description: "",
        organization_id: null,
        parent_id: null,
        manager_id: null,
      });
      setInitialFormData(null);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError("Название отдела обязательно");
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    const payload: any = {
      name: formData.name.trim(),
      description: formData.description?.trim() || null,
      organization_id: formData.organization_id || null,
      parent_id: formData.parent_id || null,
      manager_id: formData.manager_id || null,
    };
    
    try {
      if (editing) {
        // Remove trailing slash if present to avoid double slashes
        const baseUrl = DEPARTMENTS_ENDPOINT.endsWith('/') 
          ? DEPARTMENTS_ENDPOINT.slice(0, -1) 
          : DEPARTMENTS_ENDPOINT;
        const url = `${baseUrl}/${editing.id}`;
        console.log('Updating department:', url, 'ID:', editing.id, 'Payload:', payload);
        
        const resp = await authFetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        
        console.log('Update response status:', resp.status, resp.statusText);
        
        if (!resp.ok) {
          const errData = await resp.json().catch(() => ({}));
          console.error('Update error:', errData);
          throw new Error(errData.detail || `Не удалось обновить отдел: ${resp.status} ${resp.statusText}`);
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
      setFormData({
        name: "",
        description: "",
        organization_id: null,
        parent_id: null,
        manager_id: null,
      });
      setInitialFormData(null);
      await loadDepartments();
      if (onOrganizationsUpdate) {
        onOrganizationsUpdate(); // Перезагружаем организации после создания/редактирования отдела
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ошибка сохранения отдела";
      setError(errorMessage);
      console.error("Ошибка сохранения отдела:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateUserDepartment = useCallback(
    async (userId: string, departmentId: string | null, add: boolean = true) => {
      try {
        // Get current user from props instead of API call
        const user = users.find(u => u.id === userId);
        if (!user) {
          throw new Error("Пользователь не найден");
        }
        
        // Get current department_ids (support both old and new format)
        const currentDeptIds = user.department_ids || (user.department_id ? [user.department_id] : []);
        
        let newDeptIds: string[];
        if (add && departmentId) {
          // Add department if not already present
          newDeptIds = [...new Set([...currentDeptIds, departmentId])];
        } else if (!add && departmentId) {
          // Remove department
          newDeptIds = currentDeptIds.filter(id => id !== departmentId);
        } else {
          // Remove all departments
          newDeptIds = [];
        }
        
        const resp = await authFetch(`${USERS_ENDPOINT}${userId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            department_ids: newDeptIds,
            // Keep legacy field for backward compatibility
            department_id: newDeptIds.length > 0 ? newDeptIds[0] : null,
          }),
        });
        if (!resp.ok) {
          let errorMessage = "Не удалось обновить сотрудника";
          try {
            const errData = await resp.json();
            errorMessage = errData.detail || errData.message || JSON.stringify(errData);
          } catch (e) {
            errorMessage = `Ошибка ${resp.status}: ${resp.statusText}`;
          }
          throw new Error(errorMessage);
        }
      } catch (err) {
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(String(err));
      }
    },
    [authFetch, users]
  );

  const handleDelete = async (id: string) => {
    const dept = flatten(departments).find(d => d.id === id);
    const deptUsers = users.filter(u => u.department_id === id);
    const hasChildren = dept?.children && dept.children.length > 0;
    
    let confirmMessage = "Удалить отдел?";
    if (hasChildren || deptUsers.length > 0) {
      confirmMessage = `Удалить отдел "${dept?.name || ''}"?\n\n`;
      if (hasChildren) {
        confirmMessage += `⚠️ В отделе есть подотделы, они также будут удалены.\n`;
      }
      if (deptUsers.length > 0) {
        confirmMessage += `⚠️ В отделе ${deptUsers.length} сотрудников. Они будут удалены из отдела.\n`;
      }
      confirmMessage += `\nЭто действие нельзя отменить.`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    try {
      // Формируем URL правильно - убираем завершающий слэш если есть
      const baseUrl = DEPARTMENTS_ENDPOINT.endsWith('/') 
        ? DEPARTMENTS_ENDPOINT.slice(0, -1) 
        : DEPARTMENTS_ENDPOINT;
      const url = `${baseUrl}/${id}`;
      console.log('Deleting department:', url, 'ID:', id, 'Type:', typeof id);
      
      const resp = await authFetch(url, { method: "DELETE" });
      console.log('Delete response status:', resp.status, resp.statusText);
      
      if (!resp.ok) {
        let errorMsg = `Ошибка ${resp.status}: ${resp.statusText}`;
        try {
          const errData = await resp.json();
          errorMsg = errData.detail || errData.message || errorMsg;
          console.error('Delete department error details:', errData);
        } catch (e) {
          // Если не удалось распарсить JSON, используем статус
          console.error('Failed to parse error response:', e);
        }
        console.error('Delete department error:', errorMsg, 'Response:', resp);
        throw new Error(errorMsg);
      }
      
      console.log('Department deleted successfully');
      await loadDepartments();
      if (onUsersUpdate) {
        onUsersUpdate();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Ошибка удаления отдела";
      setError(errorMsg);
      console.error("Ошибка удаления отдела:", err);
      alert(`Не удалось удалить отдел: ${errorMsg}`);
    }
  };
  
  const handleRemoveUserFromDepartment = async (userId: string, departmentId: string, userName: string) => {
    if (!confirm(`Удалить ${userName} из отдела?`)) return;
    try {
      await updateUserDepartment(userId, departmentId, false);
      await loadDepartments();
      if (onUsersUpdate) {
        onUsersUpdate();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Ошибка удаления сотрудника из отдела";
      setError(errorMsg);
      console.error("Ошибка удаления сотрудника из отдела:", err);
      alert(`Не удалось удалить сотрудника: ${errorMsg}`);
    }
  };

  // Filter departments and users based on search query
  const filterTree = (nodes: DepartmentWithChildren[]): DepartmentWithChildren[] => {
    if (!searchQuery.trim()) return nodes;
    
    const query = searchQuery.toLowerCase();
    const filtered: DepartmentWithChildren[] = [];
    
    for (const node of nodes) {
      const matchesDept = node.name.toLowerCase().includes(query) ||
                         (node.description && node.description.toLowerCase().includes(query));
      
      const deptUsers = users.filter(u => u.department_id === node.id);
      const matchesUsers = deptUsers.some(u => 
        (u.full_name && u.full_name.toLowerCase().includes(query)) ||
        u.email.toLowerCase().includes(query) ||
        (u.position && u.position.toLowerCase().includes(query))
      );
      
      const filteredChildren = filterTree(node.children);
      const hasMatchingChildren = filteredChildren.length > 0;
      
      if (matchesDept || matchesUsers || hasMatchingChildren) {
        filtered.push({
          ...node,
          children: filteredChildren,
        });
      }
    }
    
    return filtered;
  };

  // Find matching users for search
  const getMatchingUsers = (): UserProfile[] => {
    if (!searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    return users.filter(u => 
      (u.full_name && u.full_name.toLowerCase().includes(query)) ||
      u.email.toLowerCase().includes(query) ||
      (u.position && u.position.toLowerCase().includes(query))
    );
  };

  const renderTree = (nodes: DepartmentWithChildren[], depth = 0, parentOrg: { id: string; name: string; slug: string } | null = null) => (
    <ul className="space-y-6 pl-0">
      {nodes.map((d, index) => {
        const manager = d.manager_id ? users.find((u) => u.id === d.manager_id) : null;
        // Get users who belong to this department (support both old and new format)
        const deptUsers = users.filter((u) => {
          if (u.id === manager?.id) return false;
          // Check new many-to-many format
          if (u.department_ids && u.department_ids.includes(d.id)) return true;
          // Check legacy format for backward compatibility
          if (u.department_id === d.id) return true;
          return false;
        });
        // Определяем организацию: либо своя, либо унаследованная от родителя
        const org = d.organization_id 
          ? organizations.find((o) => o.id === d.organization_id) 
          : parentOrg;
        const isRoot = depth === 0;
        const inheritedOrg = !d.organization_id && parentOrg; // Унаследованная организация
        
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

        return (
          <li 
            key={d.id} 
            className="relative flex flex-col items-center opacity-0"
            style={{ 
              animation: `fadeInUp 0.5s ease-out ${index * 0.1}s forwards`
            }}
          >

            <div
              className={`dept-card group w-[320px] max-w-[320px] rounded-3xl border ${
                isRoot && org 
                  ? "border-emerald-300/70 bg-gradient-to-br from-emerald-50/30 via-white/90 to-white/90" 
                  : inheritedOrg
                    ? "border-indigo-200/70 bg-gradient-to-br from-indigo-50/20 via-white/90 to-white/90"
                    : "border-slate-200/70 bg-white/90"
              } backdrop-blur shadow-xl px-4 py-4 transition hover:-translate-y-[4px] hover:shadow-2xl relative ${
                dragOverDept === d.id ? "ring-4 ring-indigo-400 ring-offset-2 bg-indigo-50/50" : ""
              }`}
              style={{
                borderLeftWidth: inheritedOrg ? '4px' : isRoot && org ? '4px' : '1px',
                borderLeftColor: inheritedOrg ? '#818cf8' : isRoot && org ? '#34d399' : undefined,
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const userDeptIds = draggedUser.department_ids || (draggedUser.department_id ? [draggedUser.department_id] : []);
                if (draggedUser && !userDeptIds.includes(d.id)) {
                  setDragOverDept(d.id);
                }
              }}
              onDragLeave={() => setDragOverDept(null)}
              onDrop={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Check if user already belongs to this department
                const userDeptIds = draggedUser.department_ids || (draggedUser.department_id ? [draggedUser.department_id] : []);
                if (draggedUser && !userDeptIds.includes(d.id)) {
                  try {
                    await updateUserDepartment(draggedUser.id, d.id, true);
                    await loadDepartments();
                    // Обновляем users через колбэк вместо перезагрузки страницы
                    if (onUsersUpdate) {
                      onUsersUpdate();
                    }
                    setDraggedUser(null);
                    setDragOverDept(null);
                  } catch (err) {
                    console.error("Ошибка перемещения сотрудника:", err);
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    setError(errorMessage);
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
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-2xl shadow-inner ${
                      isRoot 
                        ? "bg-gradient-to-br from-emerald-100 via-green-100 to-teal-100 ring-2 ring-emerald-300 ring-offset-1" 
                        : "bg-gradient-to-br from-indigo-100 to-cyan-100"
                    } text-slate-700`}>
                      {isRoot ? "🏛️" : "🏢"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-slate-900 text-sm leading-tight truncate">{d.name}</div>
                        {isRoot && org && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300 whitespace-nowrap">
                            Юрлицо
                          </span>
                        )}
                        {!isRoot && inheritedOrg && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 whitespace-nowrap" title={`Входит в организацию "${inheritedOrg.name}"`}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                            {inheritedOrg.name}
                          </span>
                        )}
                      </div>
                      {org && !inheritedOrg && (
                        <div className={`text-[11px] truncate ${isRoot ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
                          {isRoot ? "Юридическое лицо: " : "Орг: "}{org.name}
                        </div>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedUser(manager);
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
                        className={`relative group cursor-move transition-opacity ${
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
                        onClick={(e) => {
                          if (!draggedUser) {
                            e.stopPropagation();
                            setSelectedUser(u);
                          }
                        }}
                      >
                        {avatar(u)}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveUserFromDepartment(u.id, d.id, u.full_name || u.email);
                          }}
                          className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center hover:bg-red-600 shadow-sm z-10"
                          title="Удалить из отдела"
                        >
                          ✕
                        </button>
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
              <div className="flex items-center gap-2 mt-3 flex-wrap">
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
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-[11px] px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 transition"
                  title="Удалить отдел"
                >
                  Удалить
                </button>
              </div>
            </div>

            {d.children && d.children.length > 0 && (() => {
              // Цвета линий в зависимости от темы
              const lineColor = isDark ? '#6b7280' : '#94a3b8';
              const lineColorEnd = isDark ? '#4b5563' : '#64748b';
              const dotColor = isDark ? '#fcd535' : '#64748b';
              const glowColor = isDark ? 'rgba(252, 213, 53, 0.3)' : 'rgba(100, 116, 139, 0.3)';
              
              return (
                <div className="mt-4 flex flex-col items-center relative">
                  {/* SVG линии-коннекторы */}
                  <svg 
                    className="absolute pointer-events-none transition-colors duration-300" 
                    style={{ 
                      top: 0, 
                      left: '50%', 
                      transform: 'translateX(-50%)',
                      width: d.children.length > 1 ? `${(d.children.length - 1) * 360 + 40}px` : '40px',
                      height: '60px',
                      overflow: 'visible'
                    }}
                  >
                    <defs>
                      <linearGradient id={`tree-gradient-${d.id}-${isDark}`} x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={lineColorEnd} stopOpacity="0.7" />
                      </linearGradient>
                      <filter id={`tree-glow-${d.id}-${isDark}`} x="-100%" y="-100%" width="300%" height="300%">
                        <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor={glowColor} />
                      </filter>
                    </defs>
                    
                    {/* Вертикальная линия вниз от родителя */}
                    <line 
                      x1="50%" 
                      y1="0" 
                      x2="50%" 
                      y2={d.children.length > 1 ? "30" : "60"}
                      stroke={`url(#tree-gradient-${d.id}-${isDark})`}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      filter={`url(#tree-glow-${d.id}-${isDark})`}
                    />
                    
                    {/* Точка соединения сверху */}
                    <circle 
                      cx="50%" 
                      cy="0" 
                      r="5" 
                      fill={dotColor}
                      filter={`url(#tree-glow-${d.id}-${isDark})`}
                      style={{ 
                        transition: 'fill 0.3s ease',
                        filter: isDark ? `drop-shadow(0 0 4px ${glowColor})` : undefined
                      }}
                    />
                    
                    {/* Горизонтальная линия если несколько детей */}
                    {d.children.length > 1 && (
                      <>
                        <line 
                          x1="20" 
                          y1="30" 
                          x2={`calc(100% - 20px)`}
                          y2="30"
                          stroke={lineColor}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          filter={`url(#tree-glow-${d.id}-${isDark})`}
                        />
                        
                        {/* Вертикальные линии к каждому ребенку */}
                        {d.children.map((_, idx) => {
                          const xPos = (idx * 360) + 20;
                          return (
                            <g key={idx}>
                              <line 
                                x1={xPos} 
                                y1="30" 
                                x2={xPos} 
                                y2="60"
                                stroke={`url(#tree-gradient-${d.id}-${isDark})`}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                filter={`url(#tree-glow-${d.id}-${isDark})`}
                              />
                              <circle 
                                cx={xPos} 
                                cy="60" 
                                r="4" 
                                fill={dotColor}
                                filter={`url(#tree-glow-${d.id}-${isDark})`}
                                style={{ 
                                  transition: 'fill 0.3s ease',
                                  filter: isDark ? `drop-shadow(0 0 3px ${glowColor})` : undefined
                                }}
                              />
                            </g>
                          );
                        })}
                      </>
                    )}
                    
                    {/* Точка внизу если один ребенок */}
                    {d.children.length === 1 && (
                      <circle 
                        cx="50%" 
                        cy="60" 
                        r="4" 
                        fill={dotColor}
                        filter={`url(#tree-glow-${d.id}-${isDark})`}
                        style={{ 
                          transition: 'fill 0.3s ease',
                          filter: isDark ? `drop-shadow(0 0 3px ${glowColor})` : undefined
                        }}
                      />
                    )}
                  </svg>
                  
                  {/* Контейнер для дочерних отделов */}
                  <div 
                    className="relative flex flex-row gap-8"
                    style={{ marginTop: '60px' }}
                  >
                    {d.children.map((child) => (
                      <div key={child.id} className="relative flex flex-col items-center">
                        {renderTree([child], depth + 1, org || parentOrg)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </li>
        );
      })}
    </ul>
  );

  // Zoom handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.3, Math.min(3, zoom * delta));
    setZoom(newZoom);
  }, [zoom]);

  const handleZoomIn = () => setZoom(prev => Math.min(3, prev * 1.2));
  const handleZoomOut = () => setZoom(prev => Math.max(0.3, prev / 1.2));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start panning if clicking on the canvas background, not on cards or buttons
    const target = e.target as HTMLElement;
    if (e.button === 0 && 
        target.closest('.org-canvas') && 
        !target.closest('.dept-card') && 
        !target.closest('button') &&
        !target.closest('input') &&
        !target.closest('select') &&
        !target.closest('textarea')) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false);
    if (isPanning) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isPanning]);

  const matchingUsers = getMatchingUsers();
  const filteredDepartments = filterTree(departments);
  const hasSearchResults = searchQuery.trim() && (filteredDepartments.length > 0 || matchingUsers.length > 0);

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col z-50" style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-lg font-bold">Оргструктура</h2>
          <button
            onClick={() => openCreate(null)}
            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700 shadow-sm"
          >
            Добавить корневой отдел
          </button>
          
          {/* Search */}
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Поиск по отделам, сотрудникам, должностям..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="px-2 py-1 text-slate-500 hover:text-slate-700 text-sm"
              title="Очистить поиск"
            >
              ✕
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-2 border-r border-slate-200 pr-2">
            <button
              onClick={handleZoomOut}
              className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold"
              title="Уменьшить"
            >
              −
            </button>
            <span className="px-3 py-1.5 text-sm font-semibold text-slate-700 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold"
              title="Увеличить"
            >
              +
            </button>
            <button
              onClick={handleResetZoom}
              className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm flex items-center gap-1"
              title="Сбросить масштаб"
            >
              <span className="text-base">🔍</span>
              <span className="text-xs">100%</span>
            </button>
          </div>
          
          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-semibold"
              title="Закрыть"
            >
              ✕ Закрыть
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 border-b border-slate-200 bg-white flex-shrink-0">
        <button
          onClick={() => setActiveTab("structure")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "structure"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Структура
        </button>
        <button
          onClick={() => setActiveTab("employees")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "employees"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Сотрудники ({users.length})
        </button>
      </div>

      {/* Canvas area */}
      <div 
        className="flex-1 overflow-hidden relative org-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ 
          cursor: isPanning ? 'grabbing' : 'grab',
          backgroundColor: 'rgb(248 250 252)'
        }}
      >
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm shadow-lg">
            {error}
          </div>
        )}

        {activeTab === "employees" ? (
          <div className="absolute inset-0 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h3 className="text-lg font-semibold text-slate-900">Список сотрудников</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedOrgFilter}
                    onChange={(e) => setSelectedOrgFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Все организации</option>
                    {organizations.map(org => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Поиск по имени, email, должности..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {users
                  .filter((user) => {
                    // Search filter
                    if (searchQuery.trim()) {
                      const query = searchQuery.toLowerCase();
                      const matchesSearch = (
                        user.full_name?.toLowerCase().includes(query) ||
                        user.email.toLowerCase().includes(query) ||
                        user.position?.toLowerCase().includes(query)
                      );
                      if (!matchesSearch) return false;
                    }
                    
                    // Organization filter
                    if (selectedOrgFilter) {
                      const flatten = (depts: DepartmentWithChildren[]): DepartmentWithChildren[] => {
                        const result: DepartmentWithChildren[] = [];
                        depts.forEach(d => {
                          result.push(d);
                          if (d.children) result.push(...flatten(d.children));
                        });
                        return result;
                      };
                      const flatDepts = flatten(departments);
                      const userDeptIds = user.department_ids || (user.department_id ? [user.department_id] : []);
                      const userDepts = userDeptIds
                        .map(deptId => flatDepts.find(d => d.id === deptId))
                        .filter(Boolean);
                      
                      const userOrgIds = user.organization_ids || (user.organization_id ? [user.organization_id] : []);
                      
                      // Find root department for each user's department
                      const findRootDeptFilter = (dept: DepartmentWithChildren): DepartmentWithChildren | null => {
                        if (!dept.parent_id) return dept;
                        const parent = flatDepts.find(d => d.id === dept.parent_id);
                        return parent ? findRootDeptFilter(parent) : dept;
                      };
                      
                      const rootDeptOrgIds = userDepts
                        .map(dept => findRootDeptFilter(dept))
                        .filter(Boolean)
                        .filter(rootDept => rootDept.organization_id)
                        .map(rootDept => rootDept.organization_id);
                      
                      const allUserOrgIds = [...userOrgIds, ...rootDeptOrgIds];
                      
                      if (!allUserOrgIds.includes(selectedOrgFilter)) return false;
                    }
                    
                    return true;
                  })
                  .map((user) => {
                    // Helper to flatten departments
                    const flatten = (depts: DepartmentWithChildren[]): DepartmentWithChildren[] => {
                      const result: DepartmentWithChildren[] = [];
                      depts.forEach(d => {
                        result.push(d);
                        if (d.children) result.push(...flatten(d.children));
                      });
                      return result;
                    };
                    const flatDepts = flatten(departments);
                    
                    const userDeptIds = user.department_ids || (user.department_id ? [user.department_id] : []);
                    const userDepts = userDeptIds
                      .map(deptId => flatDepts.find(d => d.id === deptId))
                      .filter(Boolean);
                    
                    // Get all organizations user belongs to (direct)
                    const userOrgIds = user.organization_ids || (user.organization_id ? [user.organization_id] : []);
                    const userOrgs = userOrgIds
                      .map(orgId => organizations.find(o => o.id === orgId))
                      .filter(Boolean);
                    
                    // Get organizations from root departments (legal entities)
                    // For each department, find its root department
                    const findRootDept = (dept: DepartmentWithChildren): DepartmentWithChildren | null => {
                      if (!dept.parent_id) return dept; // Already root
                      const parent = flatDepts.find(d => d.id === dept.parent_id);
                      return parent ? findRootDept(parent) : dept;
                    };
                    
                    const rootDeptOrgs = userDepts
                      .map(dept => findRootDept(dept))
                      .filter(Boolean)
                      .filter(rootDept => rootDept.organization_id)
                      .map(rootDept => organizations.find(o => o.id === rootDept.organization_id))
                      .filter(Boolean);
                    
                    // Combine and deduplicate
                    const allOrgIds = new Set([
                      ...userOrgs.map(o => o.id),
                      ...rootDeptOrgs.map(o => o.id)
                    ]);
                    const allOrgs = Array.from(allOrgIds)
                      .map(id => organizations.find(o => o.id === id))
                      .filter(Boolean);
                    
                    return (
                      <div
                        key={user.id}
                        className="bg-white rounded-md border border-slate-200 p-2 hover:shadow-md transition cursor-pointer"
                        onClick={() => setSelectedUser(user)}
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-white shadow flex-shrink-0">
                            {user.avatar_url ? (
                              <img
                                src={apiBaseUrl && !user.avatar_url.startsWith('http') ? `${apiBaseUrl}${user.avatar_url}` : user.avatar_url}
                                alt={user.full_name || user.email}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                  const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                  if (fallback) fallback.style.display = "flex";
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center text-slate-600 font-semibold ${user.avatar_url ? "hidden" : ""}`}>
                              {(user.full_name || user.email).charAt(0).toUpperCase()}
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-0.5">
                              <h4 className="text-xs font-semibold text-slate-900 truncate">
                                {user.full_name || user.email}
                              </h4>
                              <span className={`px-1 py-0 rounded text-[9px] font-medium flex-shrink-0 ${
                                user.role === "admin" ? "bg-purple-100 text-purple-700" :
                                user.role === "it" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-700"
                              }`}>
                                {user.role === "admin" ? "A" :
                                 user.role === "it" ? "IT" :
                                 "S"}
                              </span>
                            </div>
                            
                            {user.position && (
                              <p className="text-[10px] text-slate-600 mb-1 truncate">{user.position}</p>
                            )}
                            
                            <div className="space-y-1">
                              {/* Организация - Юридическое лицо - ВСЕ */}
                              <div className="text-[10px] text-emerald-700 font-semibold">
                                {allOrgs.length > 0 ? (
                                  <>
                                    {allOrgs.map((org, idx) => (
                                      <div key={org.id}>
                                        Юридическое лицо: {org.name}
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <div>Юридическое лицо: Не указано</div>
                                )}
                              </div>
                              
                              {/* Отдел - ВСЕ */}
                              {userDepts.length > 0 && (
                                <div className="text-[10px] text-slate-600">
                                  {userDepts.map((dept, idx) => (
                                    <div key={dept.id}>
                                      Отдел: {dept.name}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
              
              {users.filter((user) => {
                if (!searchQuery.trim()) return true;
                const query = searchQuery.toLowerCase();
                return (
                  user.full_name?.toLowerCase().includes(query) ||
                  user.email.toLowerCase().includes(query) ||
                  user.position?.toLowerCase().includes(query)
                );
              }).length === 0 && (
                <div className="text-center py-8 text-slate-500">
                  {searchQuery ? "Сотрудники не найдены" : "Нет сотрудников"}
                </div>
              )}
            </div>
          </div>
        ) : loading ? (
          <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="text-sm text-slate-500">Загрузка...</div>
            </div>
          </div>
        ) : departments.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300">
            <div className="text-sm text-slate-500">Нет отделов. Добавьте первый отдел.</div>
          </div>
        ) : (
          <>
            <div
              className="absolute inset-0 transition-transform duration-200 ease-out"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                zIndex: 1
              }}
            >
              <div className="p-8">
              {/* Show matching users if search is active */}
              {searchQuery.trim() && matchingUsers.length > 0 && (
                <div className="mb-8 transition-all duration-300">
                  <h3 className="text-sm font-semibold text-slate-700 mb-4">Найденные сотрудники:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {matchingUsers.map((user, userIndex) => {
                      // Helper to find department recursively
                      const findDeptRecursive = (deptId: string, depts: DepartmentWithChildren[]): DepartmentWithChildren | null => {
                        for (const d of depts) {
                          if (d.id === deptId) return d;
                          if (d.children) {
                            const found = findDeptRecursive(deptId, d.children);
                            if (found) return found;
                          }
                        }
                        return null;
                      };
                      
                      // Get all departments user belongs to (support both old and new format)
                      const userDeptIds = user.department_ids || (user.department_id ? [user.department_id] : []);
                      const userDepts = userDeptIds
                        .map(deptId => findDeptRecursive(deptId, departments))
                        .filter(Boolean);
                      
                      // Get all organizations user belongs to (direct)
                      const userOrgIds = user.organization_ids || (user.organization_id ? [user.organization_id] : []);
                      const userOrgs = userOrgIds
                        .map(orgId => organizations.find(o => o.id === orgId))
                        .filter(Boolean);
                      
                      // Get organizations from root departments (legal entities)
                      const rootDeptOrgs = userDepts
                        .filter(dept => !dept.parent_id && dept.organization_id)
                        .map(dept => organizations.find(o => o.id === dept.organization_id))
                        .filter(Boolean);
                      
                      // Combine and deduplicate
                      const allOrgIds = new Set([
                        ...userOrgs.map(o => o.id),
                        ...rootDeptOrgs.map(o => o.id)
                      ]);
                      const allOrgs = Array.from(allOrgIds)
                        .map(id => organizations.find(o => o.id === id))
                        .filter(Boolean);
                      
                      return (
                        <div
                          key={user.id}
                          className="dept-card rounded-xl border border-slate-200 bg-white/90 backdrop-blur shadow-lg px-4 py-3 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 opacity-0 cursor-pointer"
                          style={{ 
                            animation: `fadeInUp 0.4s ease-out ${userIndex * 0.05}s forwards`
                          }}
                          onClick={() => setSelectedUser(user)}
                          onMouseEnter={(e) => {
                            setHoveredUser(user);
                            setHoverPos({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseMove={(e) => {
                            if (hoveredUser?.id === user.id) {
                              setHoverPos({ x: e.clientX, y: e.clientY });
                            }
                          }}
                          onMouseLeave={() => setHoveredUser(null)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 flex-shrink-0">
                              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sky-200 via-white to-cyan-200 opacity-80" />
                              <div className="absolute inset-[2px] rounded-full bg-white shadow" />
                              <div className="relative w-full h-full rounded-full overflow-hidden border border-white shadow">
                                {user.avatar_url ? (
                                  <img
                                    src={`${apiBaseUrl}${user.avatar_url}`}
                                    alt={user.full_name || user.email}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-sm font-semibold text-slate-700 bg-slate-100">
                                    {(user.full_name || user.email).charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-slate-900 text-sm truncate">
                                {user.full_name || user.email}
                              </div>
                              {user.position && (
                                <div className="text-xs text-slate-600 truncate">{user.position}</div>
                              )}
                              {userDepts.length > 0 && (
                                <div className="text-xs text-slate-500 truncate">
                                  Отделы: {userDepts.map(d => d.name).join(", ")}
                                </div>
                              )}
                              {allOrgs.length > 0 && (
                                <div className="text-xs text-emerald-600 truncate font-medium">
                                  Юрлица: {allOrgs.map(o => o.name).join(", ")}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Departments tree */}
              {filteredDepartments.length > 0 && (
                <div className="transition-all duration-500">
                  {renderTree(filteredDepartments, 0, null)}
                </div>
              )}
              
              {searchQuery.trim() && !hasSearchResults && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-300">
                  <div className="text-sm text-slate-500 bg-white/90 px-4 py-2 rounded-lg shadow">
                    Ничего не найдено по запросу "{searchQuery}"
                  </div>
                </div>
              )}
            </div>
            </div>
          </>
        )}
      </div>

        {hoveredUser && (
          <UserTooltip
            user={hoveredUser}
            departments={departments}
            organizations={organizations}
            position={hoverPos}
            apiBaseUrl={apiBaseUrl}
          />
        )}

      {/* Диалог подтверждения закрытия */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Вы уверены?</h3>
            <p className="text-sm text-slate-600 mb-6">
              Все несохраненные изменения будут потеряны. Вы действительно хотите закрыть модальное окно?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  setIsModalOpen(false);
                  setEditing(null);
                  setFormData({
                    name: "",
                    description: "",
                    organization_id: null,
                    parent_id: null,
                    manager_id: null,
                  });
                  setInitialFormData(null);
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания/редактирования отдела */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          style={{ animation: 'fadeIn 0.2s ease-out forwards' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClose();
            }
          }}
        >
          <div 
            className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
            style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50">
              <div className="px-6 py-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 shadow-lg shadow-indigo-500/30">
                      <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">
                        {editing ? "Редактировать отдел" : "Новый отдел"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {editing ? "Измените данные отдела" : "Заполните информацию об отделе"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
                    aria-label="Закрыть"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {/* Кнопки действий - перемещены вверх */}
                <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!formData.name.trim() || isSaving}
                    className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving
                      ? editing
                        ? "Сохраняем…"
                        : "Создаём…"
                      : editing
                        ? "Сохранить"
                        : "Создать"}
                  </button>
                </div>
              </div>
            </div>

            {/* Контент */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 280px)" }}>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
                className="p-6 space-y-5"
              >
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <div className="flex items-center gap-2">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                {/* Основная информация */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Основная информация</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Название отдела <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Например: Отдел разработки"
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Описание
                    </label>
                    <textarea
                      rows={3}
                      value={formData.description || ""}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Краткое описание отдела, его функций и задач..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Структура */}
                <div className="space-y-4 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Структура</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Организация
                      </label>
                      <select
                        value={formData.organization_id || ""}
                        onChange={(e) => setFormData({ ...formData, organization_id: e.target.value || null })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      >
                        <option value="">Не выбрано</option>
                        {organizations.length === 0 ? (
                          <option disabled>Загрузка организаций...</option>
                        ) : (
                          organizations.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))
                        )}
                      </select>
                      {organizations.length === 0 && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Организации не загружены. Отдел можно создать без организации.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Родительский отдел
                      </label>
                      <select
                        value={formData.parent_id || ""}
                        onChange={(e) => setFormData({ ...formData, parent_id: e.target.value || null })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      >
                        <option value="">Корневой отдел</option>
                        {flat.filter(d => !editing || d.id !== editing.id).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Руководство */}
                <div className="space-y-4 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Руководство</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Руководитель отдела
                    </label>
                    <select
                      value={formData.manager_id || ""}
                      onChange={(e) => setFormData({ ...formData, manager_id: e.target.value || null })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    >
                      <option value="">Не выбран</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email} {u.position ? `(${u.position})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Сотрудники (только при редактировании) */}
                {editing && (
                  <div className="space-y-4 border-t border-slate-200 pt-5">
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Сотрудники отдела</h3>
                    <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                      {users.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">Нет доступных сотрудников</p>
                      ) : (
                        users.map((u) => {
                          // Check if user belongs to this department (support both old and new format)
                          const userDeptIds = u.department_ids || (u.department_id ? [u.department_id] : []);
                          const isChecked = userDeptIds.includes(editing.id);
                          
                          // Get user's organizations for display
                          const userOrgIds = u.organization_ids || (u.organization_id ? [u.organization_id] : []);
                          const userOrgs = userOrgIds
                            .map(orgId => organizations.find(o => o.id === orgId))
                            .filter(Boolean);
                          
                          return (
                            <label 
                              key={u.id} 
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={async () => {
                                  try {
                                    await updateUserDepartment(u.id, editing.id, !isChecked);
                                    await loadDepartments();
                                    if (onUsersUpdate) {
                                      onUsersUpdate();
                                    }
                                  } catch (err) {
                                    console.error("Ошибка обновления сотрудника:", err);
                                    const errorMessage = err instanceof Error ? err.message : String(err);
                                    setError(errorMessage);
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                              />
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {u.avatar_url ? (
                                  <img
                                    src={`${apiBaseUrl}${u.avatar_url}`}
                                    alt={u.full_name || u.email}
                                    className="w-8 h-8 rounded-full object-cover border border-slate-200"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-xs font-semibold text-white">
                                    {(u.full_name || u.email).charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-900 truncate">
                                    {u.full_name || u.email}
                                  </div>
                                  {u.position && (
                                    <div className="text-xs text-slate-500 truncate">{u.position}</div>
                                  )}
                                  {userOrgs.length > 0 && (
                                    <div className="text-xs text-indigo-600 truncate">
                                      {userOrgs.map(o => o.name).join(", ")}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Карточка профиля пользователя */}
      {selectedUser && (
        <UserProfileCard
          user={selectedUser}
          departments={departments}
          organizations={organizations}
          apiBaseUrl={apiBaseUrl}
          onClose={() => setSelectedUser(null)}
          onUpdate={() => {
            if (onUsersUpdate) {
              onUsersUpdate();
            }
            loadDepartments();
          }}
          authFetch={authFetch}
        />
      )}
    </div>
  );
}

