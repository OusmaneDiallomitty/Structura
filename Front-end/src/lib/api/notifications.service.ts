const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function hdrs(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur');
  return res.json();
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  url?: string;
  read: boolean;
  createdAt: string;
}

export async function getVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API}/notifications/vapid-public-key`);
  const data = await res.json();
  return data.publicKey;
}

export async function subscribePush(
  token: string,
  subscription: PushSubscriptionJSON,
): Promise<void> {
  const keys = subscription.keys as { p256dh: string; auth: string };
  await handle<void>(
    await fetch(`${API}/notifications/subscribe`, {
      method: 'POST',
      headers: hdrs(token),
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }),
    }),
  );
}

export async function unsubscribePush(token: string, endpoint: string): Promise<void> {
  await fetch(`${API}/notifications/unsubscribe`, {
    method: 'POST',
    headers: hdrs(token),
    body: JSON.stringify({ endpoint }),
  });
}

export async function getNotifications(token: string, limit = 30): Promise<AppNotification[]> {
  return handle<AppNotification[]>(
    await fetch(`${API}/notifications?limit=${limit}`, { headers: hdrs(token) }),
  );
}

export async function getUnreadCount(token: string): Promise<number> {
  const data = await handle<{ count: number }>(
    await fetch(`${API}/notifications/unread-count`, { headers: hdrs(token) }),
  );
  return data.count;
}

export async function markAsRead(token: string, id: string): Promise<void> {
  await fetch(`${API}/notifications/${id}/read`, { method: 'PATCH', headers: hdrs(token) });
}

export async function markAllAsRead(token: string): Promise<void> {
  await fetch(`${API}/notifications/mark-all-read`, { method: 'PATCH', headers: hdrs(token) });
}

export async function deleteNotification(token: string, id: string): Promise<void> {
  await fetch(`${API}/notifications/${id}`, { method: 'DELETE', headers: hdrs(token) });
}
