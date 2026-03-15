'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Check, X, AlertCircle, Info, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  type AppNotification,
} from '@/lib/api/notifications.service';
import * as storage from '@/lib/storage';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from '@/hooks/use-push-notifications';

const POLL_INTERVAL = 60_000; // 60 secondes

function getIcon(type: string) {
  switch (type) {
    case 'LOGIN_APPROVAL':      return <AlertCircle className="h-4 w-4 text-amber-600" />;
    case 'PAYMENT_OVERDUE':     return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'MEMBER_PENDING':      return <Info className="h-4 w-4 text-blue-600" />;
    case 'ATTENDANCE':          return <Clock className="h-4 w-4 text-orange-600" />;
    case 'SUBSCRIPTION_EXPIRY': return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'TRIMESTER_LOCKED':    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case 'PAYMENT_RECEIVED':    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'NEW_STUDENT':         return <Info className="h-4 w-4 text-violet-600" />;
    default:                    return <Info className="h-4 w-4 text-blue-600" />;
  }
}

function getTimeAgo(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)    return "À l'instant";
  if (seconds < 3600)  return `Il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)} h`;
  return `Il y a ${Math.floor(seconds / 86400)} j`;
}

export function NotificationCenter() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Activer les push notifications
  usePushNotifications(!!user);

  const fetchNotifications = useCallback(async () => {
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(token),
        getUnreadCount(token),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch { /* silencieux */ }
  }, []);

  // Polling toutes les 60s
  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, fetchNotifications]);

  // Charger quand on ouvre le popover
  const handleOpen = useCallback(async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setLoading(true);
      await fetchNotifications();
      setLoading(false);
    }
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string) => {
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    await markAsRead(token, id).catch(() => {});
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleMarkAllAsRead = async () => {
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    await markAllAsRead(token).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const token = storage.getAuthItem('structura_token');
    if (!token) return;
    const wasUnread = notifications.find((n) => n.id === id)?.read === false;
    await deleteNotification(token, id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.read) await handleMarkAsRead(n.id);
    if (n.url) window.location.href = n.url;
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold">Notifications</h3>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`
                : 'Aucune nouvelle notification'}
            </p>
          </div>
          <div className="flex gap-1 items-center">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchNotifications} title="Actualiser">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead} className="text-xs">
                <Check className="h-3 w-3 mr-1" /> Tout lire
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'p-4 hover:bg-muted/50 transition-colors cursor-pointer group',
                    !n.read && 'bg-primary/5',
                  )}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex gap-3">
                    <div className="mt-0.5">{getIcon(n.type)}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-none">{n.title}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          onClick={(e) => handleDelete(e, n.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {getTimeAgo(n.createdAt)}
                        {!n.read && (
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">Nouveau</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <>
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full text-xs text-destructive hover:text-destructive"
                onClick={async () => {
                  const token = storage.getAuthItem('structura_token');
                  if (!token) return;
                  const read = notifications.filter((n) => n.read);
                  await Promise.all(read.map((n) => deleteNotification(token, n.id).catch(() => {})));
                  setNotifications((prev) => prev.filter((n) => !n.read));
                }}
              >
                <X className="h-3 w-3 mr-1" /> Effacer les lues
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
