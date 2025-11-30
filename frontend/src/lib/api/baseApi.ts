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
        
        // Убираем Content-Type для DELETE запросов без тела
        if (init.method === "DELETE" && !init.body) {
          headers.delete("Content-Type");
        }
        
        const url = typeof input === "string" ? input : input.toString();
        console.log(`[API] ${init.method || "GET"} ${url}`);
        
        try {
          const response = await fetch(input, { ...init, headers });
          return response;
        } catch (error) {
          // Обработка сетевых ошибок (CORS, сеть недоступна и т.д.)
          console.error(`[API Error] Failed to fetch: ${url}`, error);
          
          // Проверяем различные типы сетевых ошибок
          if (error instanceof TypeError) {
            if (error.message === "Failed to fetch" || error.message.includes("fetch")) {
              throw new Error(
                `Не удалось подключиться к серверу. Проверьте, что сервер запущен по адресу ${url.split("/api")[0] || url}`
              );
            }
            throw new Error(`Ошибка сети: ${error.message}`);
          }
          
          // Для других типов ошибок
          if (error instanceof Error) {
            throw error;
          }
          
          throw new Error(`Неизвестная ошибка: ${String(error)}`);
        }
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

