import { useCallback, useEffect, useState } from "react";
import { useAuthenticatedFetch } from "@/lib/api/baseApi";
import { useAuth } from "@/context/AuthContext";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

interface PushSubscriptionState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    permission: "default",
  });
  
  const authFetch = useAuthenticatedFetch();
  const { accessToken } = useAuth();

  // Check if Push API is supported
  useEffect(() => {
    const isSupported = 
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    
    setState((prev) => ({
      ...prev,
      isSupported,
      permission: isSupported ? Notification.permission : "denied",
      isLoading: false,
    }));
  }, []);

  // Check current subscription status
  const checkSubscription = useCallback(async () => {
    if (!state.isSupported || !accessToken) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      setState((prev) => ({
        ...prev,
        isSubscribed: !!subscription,
        permission: Notification.permission,
      }));
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  }, [state.isSupported, accessToken]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Request permission and subscribe
  const subscribe = useCallback(async () => {
    if (!state.isSupported || !accessToken) {
      throw new Error("Push notifications not supported");
    }

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      
      if (permission !== "granted") {
        setState((prev) => ({
          ...prev,
          permission,
          isLoading: false,
        }));
        throw new Error("Notification permission denied");
      }

      // Register service worker
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
      }

      // Get VAPID public key from backend
      const vapidResponse = await authFetch(`${API_BASE}/push/vapid-public-key`);
      if (!vapidResponse.ok) {
        throw new Error("Failed to get VAPID public key");
      }
      const { publicKey } = await vapidResponse.json();

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to backend
      const subscribeResponse = await authFetch(`${API_BASE}/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: arrayBufferToBase64(subscription.getKey("p256dh")!),
          auth: arrayBufferToBase64(subscription.getKey("auth")!),
        }),
      });

      if (!subscribeResponse.ok) {
        throw new Error("Failed to save subscription");
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        permission: "granted",
        isLoading: false,
      }));

      return subscription;
    } catch (error) {
      console.error("Error subscribing to push:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [state.isSupported, accessToken, authFetch]);

  // Unsubscribe
  const unsubscribe = useCallback(async () => {
    if (!state.isSupported || !accessToken) {
      throw new Error("Push notifications not supported");
    }

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setState((prev) => ({ ...prev, isSubscribed: false, isLoading: false }));
        return;
      }

      // Unsubscribe from push manager
      await subscription.unsubscribe();

      // Remove subscription from backend
      const endpoint = encodeURIComponent(subscription.endpoint);
      await authFetch(`${API_BASE}/push/unsubscribe?endpoint=${endpoint}`, {
        method: "DELETE",
      });

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Error unsubscribing from push:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [state.isSupported, accessToken, authFetch]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    checkSubscription,
  };
}

// Helper functions
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

