import type { UserProfile } from "@/types/user.types";
import type { AuthenticatedFetch } from "./baseApi";
import { USERS_ENDPOINT } from "@/lib/constants";

export const userApi = {
  async list(authFetch: AuthenticatedFetch): Promise<UserProfile[]> {
    const response = await authFetch(USERS_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить пользователей");
    }
    return response.json();
  },
};

