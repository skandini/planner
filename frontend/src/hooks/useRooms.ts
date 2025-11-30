import { useCallback, useState, useEffect } from "react";
import type { Room } from "@/types/room.types";
import type { EventRecord } from "@/types/event.types";
import { roomApi } from "@/lib/api/roomApi";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const authFetch = useAuthenticatedFetch();

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomApi.list(authFetch);
      setRooms(data);
    } catch (err) {
      console.error("Failed to load rooms:", err);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const getRoomAvailability = useCallback(
    async (roomId: string, from: string, to: string): Promise<EventRecord[]> => {
      try {
        return await roomApi.getAvailability(authFetch, roomId, from, to);
      } catch (err) {
        console.error("Failed to get room availability:", err);
        return [];
      }
    },
    [authFetch],
  );

  return {
    rooms,
    loading,
    getRoomAvailability,
    refresh: loadRooms,
  };
}
