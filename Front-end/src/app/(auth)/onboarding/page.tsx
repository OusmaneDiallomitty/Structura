"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export default function OnboardingPage() {
  const router = useRouter();
  const [organizationType, setOrganizationType] = useState<string | null>(null);

  useEffect(() => {
    // L'onboarding se fait maintenant via modal dans le dashboard
    router.push("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg mx-auto animate-pulse">
          <Building2 className="h-9 w-9 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <p className="text-muted-foreground">
          Préparation de votre espace...
        </p>
      </div>
    </div>
  );
}
