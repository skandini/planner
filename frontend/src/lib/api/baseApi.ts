import { useAuth } from "@/context/AuthContext";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

export type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function useAuthenticatedFetch(): AuthenticatedFetch {
  const { accessToken, refreshAccessToken, logout } = useAuth();
  const router = useRouter();

  return useCallback(
    async (input, init = {}) => {
      const execute = async (token: string) => {
        const headers = new Headers(init.headers as HeadersInit | undefined);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      };

      if (!accessToken) {
        throw new Error("Необходима авторизация");
      }

      let response = await execute(accessToken);
      if (response.status !== 401) {
        return response;
      }

      const newToken = await refreshAccessToken().catch(() => null);
      if (!newToken) {
        logout();
        router.push("/login");
        throw new Error("Сессия истекла");
      }

      response = await execute(newToken);
      if (response.status === 401) {
        logout();
        router.push("/login");
        throw new Error("Сессия истекла");
      }

      return response;
    },
    [accessToken, refreshAccessToken, logout, router],
  );
}

