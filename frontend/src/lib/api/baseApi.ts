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
        
        // Для DELETE запросов без тела не устанавливаем Content-Type
        // Это важно для CORS preflight запросов
        if (init.method === "DELETE" && !init.body) {
          // Не добавляем Content-Type для DELETE без тела
          if (headers.has("Content-Type")) {
            headers.delete("Content-Type");
          }
        }
        
        const url = typeof input === "string" ? input : input.toString();
        console.log(`[API] ${init.method || "GET"} ${url}`, {
          method: init.method,
          hasBody: !!init.body,
          headers: Object.fromEntries(headers.entries()),
        });
        
        try {
          const fetchOptions: RequestInit = {
            ...init,
            headers,
            // Явно указываем mode для CORS
            mode: "cors",
            // Для DELETE запросов не используем credentials, чтобы избежать preflight
            credentials: init.method === "DELETE" ? "omit" : "include",
          };
          
          const response = await fetch(input, fetchOptions);
          console.log(`[API] Response for ${init.method || "GET"} ${url}:`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
          });
          
          return response;
        } catch (error) {
          // Обработка сетевых ошибок (CORS, сеть недоступна и т.д.)
          console.error(`[API Error] Failed to fetch: ${url}`, {
            error,
            method: init.method,
            errorType: error?.constructor?.name,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          
          // Проверяем различные типы сетевых ошибок
          if (error instanceof TypeError) {
            if (error.message === "Failed to fetch" || error.message.includes("fetch")) {
              // Проверяем, может быть это CORS проблема
              const isCorsError = error.message.includes("CORS") || 
                                 error.message.includes("cross-origin");
              
              if (isCorsError) {
                throw new Error(
                  `Ошибка CORS при запросе к ${url}. Проверьте настройки CORS на сервере.`
                );
              }
              
              throw new Error(
                `Не удалось подключиться к серверу. Проверьте, что сервер запущен и доступен. URL: ${url}`
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

