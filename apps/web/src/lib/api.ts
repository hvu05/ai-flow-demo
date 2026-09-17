export const apiOrigin = (import.meta.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:4100').replace(/\/$/, '');
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: options.signal ?? AbortSignal.timeout(15000) });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(body && typeof body === 'object' && 'message' in body ? String(body.message) : 'Không thực hiện được yêu cầu.');
  return body as T;
}
