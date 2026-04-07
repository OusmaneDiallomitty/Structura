"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Store, GraduationCap, ArrowRightLeft, ChevronDown, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const MODULE_ICON = { COMMERCE: Store, SCHOOL: GraduationCap } as const;
const MODULE_LABEL = { COMMERCE: "Commerce", SCHOOL: "École" } as const;
const MODULE_COLOR = { COMMERCE: "text-orange-600", SCHOOL: "text-blue-600" } as const;

export function AccountSwitcher() {
  const { user, linkedAccounts, switchToAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  if (!linkedAccounts.length) return null;

  const handleSwitch = async (targetTenantId: string) => {
    if (switching) return;
    setSwitching(targetTenantId);
    setOpen(false);
    try {
      await switchToAccount(targetTenantId);
    } catch {
      toast.error("Impossible de basculer vers ce compte");
    } finally {
      setSwitching(null);
    }
  };

  const moduleType = (user?.moduleType ?? "SCHOOL") as keyof typeof MODULE_ICON;
  const CurrentIcon = MODULE_ICON[moduleType] ?? GraduationCap;
  const currentColor = MODULE_COLOR[moduleType] ?? "text-blue-600";

  return (
    <div className="relative px-3 pb-2">
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all",
          "bg-muted/60 hover:bg-muted border border-transparent hover:border-border",
          open && "bg-muted border-border"
        )}
      >
        <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-left text-muted-foreground truncate">Changer de compte</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-3 right-3 mb-2 z-50 bg-white dark:bg-gray-950 border rounded-xl shadow-xl overflow-hidden">

            {/* Compte actuel */}
            <div className="px-3 py-2.5 flex items-center gap-2.5 border-b bg-muted/30">
              <div className={cn("p-1.5 rounded-lg bg-white dark:bg-gray-800 border shrink-0")}>
                <CurrentIcon className={cn("h-3.5 w-3.5", currentColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{user?.schoolName}</p>
                <p className={cn("text-[11px]", currentColor)}>{MODULE_LABEL[moduleType]} — actif</p>
              </div>
              <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            </div>

            <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
              Basculer vers
            </p>

            {linkedAccounts.map(account => {
              const mt = account.moduleType as keyof typeof MODULE_ICON;
              const Icon = MODULE_ICON[mt] ?? GraduationCap;
              const color = MODULE_COLOR[mt] ?? "text-blue-600";
              const isLoading = switching === account.tenantId;

              return (
                <button
                  key={account.tenantId}
                  onClick={() => handleSwitch(account.tenantId)}
                  disabled={!!switching}
                  className="w-full px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted/50 transition-colors disabled:opacity-60"
                >
                  <div className="p-1.5 rounded-lg bg-white dark:bg-gray-800 border shrink-0">
                    {isLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      : <Icon className={cn("h-3.5 w-3.5", color)} />
                    }
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-semibold truncate">{account.tenantName}</p>
                    <p className={cn("text-[11px]", color)}>{MODULE_LABEL[mt]}</p>
                  </div>
                  {!isLoading && <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
