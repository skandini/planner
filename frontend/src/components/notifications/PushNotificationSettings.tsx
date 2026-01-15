"use client";

import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushNotificationSettings() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setError(null);
    setSuccess(null);
    
    try {
      await subscribe();
      setSuccess("✅ Уведомления включены! Вы будете получать push-уведомления даже при закрытом браузере.");
    } catch (err) {
      setError("❌ Не удалось включить уведомления. " + (err as Error).message);
    }
  };

  const handleUnsubscribe = async () => {
    setError(null);
    setSuccess(null);
    
    try {
      await unsubscribe();
      setSuccess("Уведомления отключены.");
    } catch (err) {
      setError("Не удалось отключить уведомления. " + (err as Error).message);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">ℹ️</div>
          <div>
            <h3 className="font-medium text-gray-900">
              Push-уведомления не поддерживаются
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Ваш браузер не поддерживает push-уведомления.
              Попробуйте использовать Chrome, Firefox или Edge.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900">
                🔔 Push-уведомления
              </h3>
              {isSubscribed && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Включено
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Получайте уведомления о встречах даже при закрытом браузере
            </p>
            
            {permission === "denied" && (
              <div className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                ⚠️ Вы заблокировали уведомления. Разрешите их в настройках браузера.
              </div>
            )}
          </div>
          
          <div>
            {isSubscribed ? (
              <button
                onClick={handleUnsubscribe}
                disabled={isLoading}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoading ? "Загрузка..." : "Отключить"}
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={isLoading || permission === "denied"}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? "Загрузка..." : "Включить"}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <div className="text-lg">💡</div>
          <div className="text-sm text-blue-900">
            <p className="font-medium">Как это работает?</p>
            <ul className="mt-2 space-y-1 text-blue-800">
              <li>• Уведомления приходят в браузер (как в мобильном приложении)</li>
              <li>• Работает даже при закрытой вкладке календаря</li>
              <li>• Нажатие на уведомление открывает календарь</li>
              <li>• Полностью безопасно и конфиденциально</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

