"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, BookOpen } from "lucide-react";
import { getAcademicYears, type AcademicYear } from "@/lib/api/academic-years.service";
import * as storage from "@/lib/storage";

interface YearSelectorProps {
  value: string;          // nom de l'année ex: "2025-2026"
  onChange: (year: string, yearObj: AcademicYear) => void;
  className?: string;
}

export function YearSelector({ value, onChange, className }: YearSelectorProps) {
  const [years, setYears] = useState<AcademicYear[]>([]);

  useEffect(() => {
    const token = storage.getAuthItem("structura_token");
    if (!token) return;
    getAcademicYears(token).then(setYears).catch(() => {});
  }, []);

  if (years.length <= 1) return null; // Pas de sélecteur si 1 seule année

  return (
    <Select value={value} onValueChange={(v) => {
      const y = years.find((yr) => yr.name === v);
      if (y) onChange(v, y);
    }}>
      <SelectTrigger className={`h-8 text-sm border-dashed ${className ?? ""}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y.id} value={y.name}>
            <span className="flex items-center gap-1.5">
              {y.isArchived
                ? <Archive className="h-3.5 w-3.5 text-gray-400" />
                : <BookOpen className="h-3.5 w-3.5 text-blue-500" />}
              {y.name}
              {y.isCurrent && <span className="text-xs text-blue-600 font-medium ml-1">(en cours)</span>}
              {y.isArchived && <span className="text-xs text-gray-400 ml-1">(archivée)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
