const API_URL = import.meta.env.VITE_API_URL as string;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const hasBody = options.body !== undefined;
  const isForm = options.body instanceof FormData;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    // For FormData we must NOT set Content-Type: the browser generates
    // "multipart/form-data; boundary=..." itself, and a hand-written header lacks the boundary.
    headers: hasBody && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: !hasBody
      ? undefined
      : isForm
        ? (options.body as FormData)
        : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'Request failed');
  }
  return data as T;
}