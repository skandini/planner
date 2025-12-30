import type { UserProfile } from "@/types/user.types";
import type { AuthenticatedFetch } from "./baseApi";
import type { PaginatedResponse, PaginationParams } from "@/types/pagination.types";
import { USERS_ENDPOINT } from "@/lib/constants";

export const userApi = {
  async list(
    authFetch: AuthenticatedFetch,
    pagination?: PaginationParams
  ): Promise<UserProfile[] | PaginatedResponse<UserProfile>> {
    const url = new URL(USERS_ENDPOINT);
    if (pagination) {
      url.searchParams.set("page", pagination.page.toString());
      url.searchParams.set("page_size", pagination.page_size.toString());
    }
    const response = await authFetch(url.toString(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Не удалось загрузить пользователей");
    }
    return response.json();
  },
};

