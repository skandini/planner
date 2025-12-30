"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { API_BASE_URL, DEPARTMENTS_ENDPOINT, USERS_ENDPOINT } from "@/lib/constants";
import type { UserProfile } from "@/types/user.types";

interface RoomManagementProps {
  authFetch: AuthenticatedFetch;
}

interface Room {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  location: string | null;
  equipment: string | null;
  online_meeting_url: string | null;
  is_active: boolean;
  organization_id: string | null;
}

interface RoomAccess {
  id: string;
  room_id: string;
  user_id: string | null;
  department_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Department {
  id: string;
  name: string;
}

export function RoomManagement({ authFetch }: RoomManagementProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomAccesses, setRoomAccesses] = useState<Record<string, RoomAccess[]>>({});
  const [showAccessModal, setShowAccessModal] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [roomForm, setRoomForm] = useState({
    name: "",
    description: "",
    capacity: 1,
    location: "",
    equipment: "",
    online_meeting_url: "",
    is_active: true,
  });

  const [accessForm, setAccessForm] = useState({
    user_id: "",
    department_id: "",
  });

  const loadRooms = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/rooms/`);
      if (!res.ok) throw new Error("Не удалось загрузить переговорки");
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки переговорок");
    }
  }, [authFetch]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await authFetch(USERS_ENDPOINT);
      if (!res.ok) return;
      const data = await res.json();
      // API возвращает PaginatedResponse, нужно извлечь items
      const usersList = Array.isArray(data) ? data : (data.items || []);
      setUsers(usersList);
    } catch (err) {
      console.error("Failed to load users:", err);
      setUsers([]); // Устанавливаем пустой массив при ошибке
    }
  }, [authFetch]);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await authFetch(DEPARTMENTS_ENDPOINT);
      if (!res.ok) return;
      const data = await res.json();
      const flatten = (depts: any[]): Department[] => {
        const result: Department[] = [];
        depts.forEach((d) => {
          result.push({ id: d.id, name: d.name });
          if (d.children?.length) result.push(...flatten(d.children));
        });
        return result;
      };
      setDepartments(flatten(data));
    } catch (err) {
      console.error("Failed to load departments:", err);
    }
  }, [authFetch]);

  const loadRoomAccesses = useCallback(async (roomId: string) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/rooms/${roomId}/access`);
      if (!res.ok) return;
      const data = await res.json();
      setRoomAccesses((prev) => ({ ...prev, [roomId]: data }));
    } catch (err) {
      console.error("Failed to load room access:", err);
    }
  }, [authFetch]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadRooms(), loadUsers(), loadDepartments()]);
      setLoading(false);
    };
    init();
  }, [loadRooms, loadUsers, loadDepartments]);

  useEffect(() => {
    if (showAccessModal) {
      loadRoomAccesses(showAccessModal);
    }
  }, [showAccessModal, loadRoomAccesses]);

  const handleCreateRoom = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...roomForm,
        description: roomForm.description || null,
        location: roomForm.location || null,
        equipment: roomForm.equipment || null,
      };
      const res = await authFetch(`${API_BASE_URL}/rooms/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось создать переговорку");
      }
      await loadRooms();
      setCreatingRoom(false);
      setRoomForm({
        name: "",
        description: "",
        capacity: 1,
        location: "",
        equipment: "",
        online_meeting_url: "",
        is_active: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания переговорки");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRoom = async () => {
    if (!editingRoom) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...roomForm,
        description: roomForm.description || null,
        location: roomForm.location || null,
        equipment: roomForm.equipment || null,
        online_meeting_url: roomForm.online_meeting_url || null,
      };
      const res = await authFetch(`${API_BASE_URL}/rooms/${editingRoom.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось обновить переговорку");
      }
      await loadRooms();
      setEditingRoom(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления переговорки");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm("Вы уверены, что хотите удалить эту переговорку?")) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/rooms/${roomId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Не удалось удалить переговорку");
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления переговорки");
    }
  };

  const handleGrantAccess = async () => {
    if (!showAccessModal) return;
    if (!accessForm.user_id && !accessForm.department_id) {
      setError("Выберите пользователя или отдел");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {};
      if (accessForm.user_id) payload.user_id = accessForm.user_id;
      if (accessForm.department_id) payload.department_id = accessForm.department_id;

      const res = await authFetch(`${API_BASE_URL}/rooms/${showAccessModal}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось выдать доступ");
      }
      await loadRoomAccesses(showAccessModal);
      setAccessForm({ user_id: "", department_id: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка выдачи доступа");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAccess = async (roomId: string, accessId: string) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/rooms/${roomId}/access/${accessId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Не удалось отозвать доступ");
      await loadRoomAccesses(roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отзыва доступа");
    }
  };

  const openEditRoom = (room: Room) => {
    setEditingRoom(room);
    setRoomForm({
      name: room.name,
      description: room.description || "",
      capacity: room.capacity,
      location: room.location || "",
      equipment: room.equipment || "",
      online_meeting_url: room.online_meeting_url || "",
      is_active: room.is_active,
    });
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-500">Загрузка...</div>;
  }

  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Управление переговорками</h2>
          <p className="text-sm text-slate-600">Создание, редактирование и управление доступом</p>
        </div>
        <button
          onClick={() => {
            setCreatingRoom(true);
            setRoomForm({
              name: "",
              description: "",
              capacity: 1,
              location: "",
              equipment: "",
              online_meeting_url: "",
              is_active: true,
            });
          }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + Создать переговорку
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Список переговорок */}
      <div className="space-y-4">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold text-slate-900">{room.name}</h3>
                  {!room.is_active && (
                    <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded">
                      Неактивна
                    </span>
                  )}
                </div>
                {room.description && (
                  <p className="text-sm text-slate-600 mb-2">{room.description}</p>
                )}
                <div className="flex gap-4 text-sm text-slate-500">
                  {room.location && <span>📍 {room.location}</span>}
                  <span>👥 Вместимость: {room.capacity}</span>
                  {room.equipment && <span>🔧 {room.equipment}</span>}
                </div>
                <div className="mt-3">
                  <button
                    onClick={() => setShowAccessModal(room.id)}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Управление доступом ({roomAccesses[room.id]?.length || 0})
                  </button>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => openEditRoom(room)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => handleDeleteRoom(room.id)}
                  className="px-3 py-1.5 text-sm border border-red-200 rounded-lg text-red-700 hover:bg-red-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Модальное окно создания/редактирования переговорки */}
      {(creatingRoom || editingRoom) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                {creatingRoom ? "Создать переговорку" : "Редактировать переговорку"}
              </h3>
              <button
                onClick={() => {
                  setCreatingRoom(false);
                  setEditingRoom(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Название *
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
                  placeholder="Конференц-зал А"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Описание
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={roomForm.description}
                  onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })}
                  rows={3}
                  placeholder="Описание переговорки"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Вместимость *
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={roomForm.capacity}
                  onChange={(e) =>
                    setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) || 1 })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Расположение
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={roomForm.location}
                  onChange={(e) => setRoomForm({ ...roomForm, location: e.target.value })}
                  placeholder="Этаж 3, офис 301"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Оборудование
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={roomForm.equipment}
                  onChange={(e) => setRoomForm({ ...roomForm, equipment: e.target.value })}
                  placeholder="Проектор, доска, видеоконференция"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ссылка на онлайн встречу
                </label>
                <input
                  type="url"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={roomForm.online_meeting_url}
                  onChange={(e) => setRoomForm({ ...roomForm, online_meeting_url: e.target.value })}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx или https://zoom.us/j/xxxxx"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Ссылка будет доступна в событиях, использующих эту переговорку
                </p>
              </div>

              <div>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={roomForm.is_active}
                    onChange={(e) => setRoomForm({ ...roomForm, is_active: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">Активна</span>
                </label>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={creatingRoom ? handleCreateRoom : handleUpdateRoom}
                  disabled={saving || !roomForm.name}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? "Сохранение..." : creatingRoom ? "Создать" : "Сохранить"}
                </button>
                <button
                  onClick={() => {
                    setCreatingRoom(false);
                    setEditingRoom(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно управления доступом */}
      {showAccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Управление доступом к переговорке
              </h3>
              <button
                onClick={() => {
                  setShowAccessModal(null);
                  setAccessForm({ user_id: "", department_id: "" });
                }}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Выдать доступ пользователю
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={accessForm.user_id}
                  onChange={(e) =>
                    setAccessForm({ user_id: e.target.value, department_id: "" })
                  }
                >
                  <option value="">Выберите пользователя</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-center text-slate-400 text-sm">или</div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Выдать доступ отделу
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={accessForm.department_id}
                  onChange={(e) =>
                    setAccessForm({ user_id: "", department_id: e.target.value })
                  }
                >
                  <option value="">Выберите отдел</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGrantAccess}
                disabled={saving || (!accessForm.user_id && !accessForm.department_id)}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Выдача доступа..." : "Выдать доступ"}
              </button>

              <div className="border-t border-slate-200 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">
                  Текущие доступы:
                </h4>
                {roomAccesses[showAccessModal]?.length === 0 ? (
                  <p className="text-sm text-slate-500">Нет выданных доступов</p>
                ) : (
                  <div className="space-y-2">
                    {roomAccesses[showAccessModal]?.map((access) => {
                      const user = access.user_id
                        ? users.find((u) => u.id === access.user_id)
                        : null;
                      const department = access.department_id
                        ? departments.find((d) => d.id === access.department_id)
                        : null;

                      return (
                        <div
                          key={access.id}
                          className="flex items-center justify-between p-2 bg-slate-50 rounded-lg"
                        >
                          <span className="text-sm text-slate-700">
                            {user
                              ? `👤 ${user.full_name || user.email}`
                              : department
                                ? `🏢 ${department.name}`
                                : "Неизвестно"}
                          </span>
                          <button
                            onClick={() => handleRevokeAccess(showAccessModal, access.id)}
                            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            Отозвать
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

