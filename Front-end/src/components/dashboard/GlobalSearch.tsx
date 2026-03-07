"use client";

import { useState, useEffect, useRef } from "react";
import { Search, FileText, Users, DollarSign, BookOpen, Calendar, X, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "student" | "payment" | "class" | "grade" | "attendance";
  title: string;
  subtitle: string;
  url: string;
  icon: React.ReactNode;
}

// Mock data - À remplacer par vraie recherche
const mockResults: SearchResult[] = [
  {
    id: "1",
    type: "student",
    title: "Fatou Camara",
    subtitle: "1ère année A • STR2024001",
    url: "/dashboard/students?id=1",
    icon: <Users className="h-4 w-4" />,
  },
  {
    id: "2",
    type: "payment",
    title: "Paiement de 150,000 GNF",
    subtitle: "Fatou Camara • 23 Jan 2026",
    url: "/dashboard/payments?id=1",
    icon: <DollarSign className="h-4 w-4" />,
  },
  {
    id: "3",
    type: "class",
    title: "1ère année A",
    subtitle: "25 élèves • Salle 101",
    url: "/dashboard/classes?id=1",
    icon: <BookOpen className="h-4 w-4" />,
  },
  {
    id: "4",
    type: "grade",
    title: "Notes de Mathématiques",
    subtitle: "1ère année A • Trimestre 1",
    url: "/dashboard/grades?class=1",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    id: "5",
    type: "attendance",
    title: "Présences du 23 Jan 2026",
    subtitle: "1ère année A • 23/25 présents",
    url: "/dashboard/attendance?date=2026-01-23",
    icon: <Calendar className="h-4 w-4" />,
  },
];

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Search logic
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    // Simulate search - À remplacer par vraie API
    const filtered = mockResults.filter(
      (result) =>
        result.title.toLowerCase().includes(query.toLowerCase()) ||
        result.subtitle.toLowerCase().includes(query.toLowerCase())
    );

    setResults(filtered);
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, results, selectedIndex]);

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false);
    window.location.href = result.url;
  };

  const getTypeLabel = (type: SearchResult["type"]) => {
    switch (type) {
      case "student":
        return "Élève";
      case "payment":
        return "Paiement";
      case "class":
        return "Classe";
      case "grade":
        return "Note";
      case "attendance":
        return "Présence";
    }
  };

  const getTypeColor = (type: SearchResult["type"]) => {
    switch (type) {
      case "student":
        return "bg-blue-500/10 text-blue-700 border-blue-200";
      case "payment":
        return "bg-emerald-500/10 text-emerald-700 border-emerald-200";
      case "class":
        return "bg-violet-500/10 text-violet-700 border-violet-200";
      case "grade":
        return "bg-amber-500/10 text-amber-700 border-amber-200";
      case "attendance":
        return "bg-pink-500/10 text-pink-700 border-pink-200";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-white border-gray-200">
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        {/* Search Input */}
        <div className="flex items-center border-b border-gray-200 px-4 py-3 bg-gray-50/50">
          <Search className="h-5 w-5 text-muted-foreground mr-3" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher des élèves, paiements, classes..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base bg-transparent text-gray-900 placeholder:text-gray-500"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="ml-2 p-1 hover:bg-muted rounded-sm transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[400px]">
          {query.trim().length < 2 ? (
            <div className="py-12 text-center bg-white">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Tapez au moins 2 caractères pour rechercher
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Recherchez des élèves, paiements, classes, notes...
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center bg-white">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Aucun résultat pour "{query}"
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Essayez avec d'autres mots-clés
              </p>
            </div>
          ) : (
            <div className="py-2 bg-white">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  onClick={() => handleSelect(result)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0",
                    index === selectedIndex && "bg-blue-50"
                  )}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
                    {result.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate text-gray-900">
                        {result.title}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", getTypeColor(result.type))}
                      >
                        {getTypeLabel(result.type)}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600 truncate">
                      {result.subtitle}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50/50 px-4 py-2 flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↓</kbd>
              <span>Naviguer</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">↵</kbd>
              <span>Sélectionner</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd>
              <span>Fermer</span>
            </div>
          </div>
          <div>
            {results.length > 0 && `${results.length} résultat${results.length > 1 ? "s" : ""}`}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
