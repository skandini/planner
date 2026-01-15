"use client";

import type { UserProfile } from "@/types/user.types";
import type { DepartmentWithChildren } from "@/types/department.types";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface UserTooltipProps {
  user: UserProfile;
  departments: DepartmentWithChildren[];
  organizations: Organization[];
  position: { x: number; y: number };
  apiBaseUrl?: string;
}

/**
 * Универсальный тултип для отображения информации о пользователе
 * Показывает: имя, должность, отделы, организации (включая унаследованные)
 */
export function UserTooltip({ user, departments, organizations, position, apiBaseUrl }: UserTooltipProps) {
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

  // Get all departments user belongs to
  const userDeptIds = user.department_ids || (user.department_id ? [user.department_id] : []);
  const userDepts = userDeptIds
    .map(deptId => findDeptRecursive(deptId, departments))
    .filter(Boolean) as DepartmentWithChildren[];

  // Get all organizations user belongs to (direct)
  const userOrgIds = user.organization_ids || (user.organization_id ? [user.organization_id] : []);
  const userOrgs = userOrgIds
    .map(orgId => organizations.find(o => o.id === orgId))
    .filter(Boolean) as Organization[];

  // Get organizations from root departments (legal entities)
  const rootDeptOrgs = userDepts
    .filter(dept => !dept.parent_id && dept.organization_id)
    .map(dept => organizations.find(o => o.id === dept.organization_id))
    .filter(Boolean) as Organization[];

  // Combine and deduplicate
  const allOrgIds = new Set([
    ...userOrgs.map(o => o.id),
    ...rootDeptOrgs.map(o => o.id)
  ]);
  const allOrgs = Array.from(allOrgIds)
    .map(id => organizations.find(o => o.id === id))
    .filter(Boolean) as Organization[];

  return (
    <div
      className="fixed z-[100] bg-white border border-slate-200 rounded-xl shadow-2xl px-4 py-3 w-80 pointer-events-none"
      style={{ 
        left: position.x + 12, 
        top: position.y + 12,
        animation: 'fadeIn 0.15s ease-out'
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-md flex-shrink-0">
          {user.avatar_url ? (
            <img
              src={apiBaseUrl ? `${apiBaseUrl}${user.avatar_url}` : user.avatar_url}
              alt={user.full_name || user.email}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 font-semibold text-lg">
              {(user.full_name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Name */}
          <div className="text-sm font-semibold text-slate-900 truncate">
            {user.full_name || user.email}
          </div>

          {/* Position */}
          {user.position && (
            <div className="text-xs text-slate-600 truncate mt-0.5 font-medium">
              📋 {user.position}
            </div>
          )}

          {/* Email */}
          {user.email && user.full_name && (
            <div className="text-xs text-slate-500 truncate mt-0.5">
              ✉️ {user.email}
            </div>
          )}

          {/* Departments */}
          {userDepts.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Отделы
              </div>
              <div className="flex flex-wrap gap-1">
                {userDepts.map(dept => (
                  <span 
                    key={dept.id} 
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    🏢 {dept.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Organizations */}
          {allOrgs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200">
              <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">
                Организации (Юрлица)
              </div>
              <div className="flex flex-wrap gap-1">
                {allOrgs.map(org => {
                  const isFromRootDept = rootDeptOrgs.some(ro => ro.id === org.id);
                  return (
                    <span 
                      key={org.id} 
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isFromRootDept 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-300" 
                          : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      }`}
                      title={isFromRootDept ? "Юридическое лицо (из корневого отдела)" : "Прямое назначение"}
                    >
                      {isFromRootDept ? "🏛️" : "🏢"} {org.name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Role badge */}
          {user.role && (
            <div className="mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                user.role === "admin" ? "bg-purple-100 text-purple-700 border border-purple-200" :
                user.role === "it" ? "bg-blue-100 text-blue-700 border border-blue-200" :
                "bg-slate-100 text-slate-700 border border-slate-200"
              }`}>
                {user.role === "admin" ? "👑 Администратор" :
                 user.role === "it" ? "💻 ИТ" :
                 "👤 Сотрудник"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

