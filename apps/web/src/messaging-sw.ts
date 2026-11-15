/// <reference lib="webworker" />
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
const firebase = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
});
const messaging = getMessaging(firebase);
// Notification payloads are displayed by FCM. Do not duplicate them here.
onBackgroundMessage(messaging, () => {});
