import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
});

let attached = false;

/** Call once near the app root (see App.tsx) to attach the Clerk session token to every request. */
export function useAttachAuthToken(getToken: () => Promise<string | null>) {
  if (attached) return;
  attached = true;
  api.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}
