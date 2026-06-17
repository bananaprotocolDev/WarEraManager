const TOKEN_KEY = "warera.apiToken";
const USER_KEY = "warera.userId";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(key);
}
function write(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  if (value === null) window.sessionStorage.removeItem(key);
  else window.sessionStorage.setItem(key, value);
}

export const getToken = (): string | null => read(TOKEN_KEY);
export const setToken = (t: string): void => write(TOKEN_KEY, t);
export const clearToken = (): void => write(TOKEN_KEY, null);

export const getUserId = (): string | null => read(USER_KEY);
export const setUserId = (id: string): void => write(USER_KEY, id);
export const clearUserId = (): void => write(USER_KEY, null);
