import type { Room } from "@/types/room.types";
import type { EventRecord } from "@/types/event.types";
import type { AuthenticatedFetch } from "./baseApi";
import { ROOM_ENDPOINT } from "@/lib/constants";

export const roomApi = {
  async list(authFetch: AuthenticatedFetch): Promise<Room[]> {
    const response = await authFetch(ROOM_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Не удалось загрузить переговорки: ${response.status}`);
    }
    return response.json();
  },

  async getAvailability(
    authFetch: AuthenticatedFetch,
    roomId: string,
    from: string,
    to: string,
  ): Promise<EventRecord[]> {
    const url = new URL(`${ROOM_ENDPOINT}${roomId}/availability`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    const response = await authFetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    return response.json();
  },
};

