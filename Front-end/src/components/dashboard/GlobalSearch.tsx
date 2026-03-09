"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Users, BookOpen, X, ArrowRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

interface SearchResult {
  id: string;
  type: "student" | "class";
  title: string;
  subtitle: string;
  url: string;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const { getValidToken } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus + reset à l'ouverture
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setIsLoading(false);
    }
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const token = await getValidToken();
      if (!token) {
        setResults([]);
        return;
      }
      const res = await fetch(
        `${API_BASE_URL}/dashboard/search?q=${encodeURIComponent(q.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(data.results ?? []);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [getValidToken]);

  // Debounce 300 ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    debounceRef.current = setTimeout(() => doSearch(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Navigation clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
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

  const getTypeLabel = (type: SearchResult["type"]) =>
    type === "student" ? "Élève" : "Classe";

  const getTypeColor = (type: SearchResult["type"]) =>
    type === "student"
      ? "bg-blue-500/10 text-blue-700 border-blue-200"
      : "bg-violet-500/10 text-violet-700 border-violet-200";

  const getTypeIcon = (type: SearchResult["type"]) =>
    type === "student"
      ? <Users className="h-4 w-4" />
      : <BookOpen className="h-4 w-4" />;

  const showEmpty = query.trim().length < 2;
  const showNoResults = !isLoading && !showEmpty && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-white border-gray-200">
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>

        {/* Champ de recherche */}
        <div className="flex items-center border-b border-gray-200 px-4 py-3 bg-gray-50/50">
          {isLoading
            ? <Loader2 className="h-5 w-5 text-muted-foreground mr-3 animate-spin" />
            : <Search className="h-5 w-5 text-muted-foreground mr-3" />
          }
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher des élèves, classes..."
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

        {/* Résultats */}
        <ScrollArea className="max-h-100">
          {showEmpty ? (
            <div className="py-12 text-center bg-white">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Tapez au moins 2 caractères pour rechercher
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Recherchez des élèves, classes…
              </p>
            </div>
          ) : showNoResults ? (
            <div className="py-12 text-center bg-white">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                Aucun résultat pour &quot;{query}&quot;
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Essayez avec d&apos;autres mots-clés
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
                    index === selectedIndex && "bg-blue-50",
                  )}
                >
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700">
                    {getTypeIcon(result.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate text-gray-900">
                        {result.title}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn("text-xs shrink-0", getTypeColor(result.type))}
                      >
                        {getTypeLabel(result.type)}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-600 truncate">
                      {result.subtitle}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
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
