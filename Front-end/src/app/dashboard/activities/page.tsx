"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  DollarSign,
  UserX,
  ArrowLeft,
  RefreshCw,
  Activity,
  Filter,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import * as storage from "@/lib/storage";
import { getRecentActivities } from "@/lib/api/dashboard.service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

type ActivityType = "student" | "payment" | "absence";
type FilterTab = "all" | ActivityType;

interface Activity {
  type: ActivityType;
  message: string;
  time: string | Date;
  icon: string;
  link: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min${diffMins > 1 ? "" : ""}`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return "Hier";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  return then.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function formatAbsoluteTime(date: Date | string): string {
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_CONFIG: Record<
  ActivityType,
  { label: string; icon: React.ReactNode; bg: string; text: string; badgeCls: string }
> = {
  student: {
    label: "Élève",
    icon: <Users className="h-4 w-4" />,
    bg: "bg-blue-100",
    text: "text-blue-700",
    badgeCls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  payment: {
    label: "Paiement",
    icon: <DollarSign className="h-4 w-4" />,
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  absence: {
    label: "Absence",
    icon: <UserX className="h-4 w-4" />,
    bg: "bg-red-100",
    text: "text-red-700",
    badgeCls: "bg-red-50 text-red-700 border-red-200",
  },
};

const FILTER_TABS: { value: FilterTab; label: string; icon?: React.ReactNode }[] = [
  { value: "all", label: "Tout" },
  { value: "student", label: "Élèves", icon: <Users className="h-3.5 w-3.5" /> },
  { value: "payment", label: "Paiements", icon: <DollarSign className="h-3.5 w-3.5" /> },
  { value: "absence", label: "Absences", icon: <UserX className="h-3.5 w-3.5" /> },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ActivitiesPage() {
  const { user } = useAuth();
  const role = (user?.role ?? "").toLowerCase();
  const canSeePayments = ["director", "admin", "supervisor", "accountant", "secretary"].includes(role);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");

  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = storage.getAuthItem("structura_token");
      if (!token) return;
      const data = await getRecentActivities(token, 100);
      setActivities(data ?? []);
    } catch {
      toast.error("Impossible de charger les activités");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Filtrage côté client
  const filtered = activities.filter((a) => {
    if (filter !== "all" && a.type !== filter) return false;
    // Double-vérification : jamais montrer les paiements aux non-autorisés
    if (a.type === "payment" && !canSeePayments) return false;
    return true;
  });

  // Tabs disponibles selon le rôle
  const availableTabs = canSeePayments
    ? FILTER_TABS
    : FILTER_TABS.filter((t) => t.value !== "payment");

  // Compteurs par type
  const counts: Record<FilterTab, number> = {
    all: activities.filter((a) => a.type !== "payment" || canSeePayments).length,
    student: activities.filter((a) => a.type === "student").length,
    payment: canSeePayments ? activities.filter((a) => a.type === "payment").length : 0,
    absence: activities.filter((a) => a.type === "absence").length,
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6 text-muted-foreground" />
              Activités récentes
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Historique des dernières actions dans votre école
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadActivities}
          disabled={isLoading}
          className="gap-2 shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        {availableTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
              filter === tab.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {tab.icon}
            {tab.label}
            {counts[tab.value] > 0 && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  filter === tab.value
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {counts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filter === "all" ? "Toutes les activités" : FILTER_TABS.find((t) => t.value === filter)?.label}
          </CardTitle>
          <CardDescription>
            {isLoading
              ? "Chargement…"
              : filtered.length === 0
              ? "Aucune activité"
              : `${filtered.length} activité${filtered.length > 1 ? "s" : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-0 divide-y divide-border">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-start gap-4 px-6 py-4 animate-pulse">
                  <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune activité pour ce filtre</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((activity, index) => {
                const cfg = TYPE_CONFIG[activity.type] ?? TYPE_CONFIG.student;
                const content = (
                  <div
                    className={cn(
                      "flex items-start gap-4 px-6 py-4 transition-colors",
                      activity.link && "hover:bg-muted/40 cursor-pointer",
                    )}
                  >
                    {/* Icône */}
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                        cfg.bg,
                        cfg.text,
                      )}
                    >
                      {cfg.icon}
                    </div>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-snug">
                        {activity.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={cn("text-xs px-2 py-0.5", cfg.badgeCls)}
                        >
                          {cfg.label}
                        </Badge>
                        <span
                          className="text-xs text-muted-foreground"
                          title={formatAbsoluteTime(activity.time)}
                        >
                          {getRelativeTime(activity.time)}
                        </span>
                      </div>
                    </div>

                    {/* Date complète sur desktop */}
                    <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                      {formatAbsoluteTime(activity.time)}
                    </span>
                  </div>
                );

                return activity.link ? (
                  <Link key={index} href={activity.link}>
                    {content}
                  </Link>
                ) : (
                  <div key={index}>{content}</div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
