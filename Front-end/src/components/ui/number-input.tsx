"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Input numérique avec formatage automatique des espaces (style GNF).
 * - Affiche : "1 000 000" pendant la saisie
 * - Retourne via onChange : la valeur numérique brute (ex: 1000000)
 * - Compatible avec les formulaires React (value / onChange)
 */

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value?: number | string | null;
  onChange?: (value: number | null) => void;
  allowDecimals?: boolean;
}

function formatDisplay(raw: string, allowDecimals: boolean): string {
  // Séparer partie entière et décimale
  const [intPart, decPart] = raw.split(allowDecimals ? "." : "\x00");
  // Ajouter les espaces tous les 3 chiffres (depuis la droite)
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F"); // espace fine insécable
  return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
}

function stripFormatting(display: string): string {
  // Retirer les espaces (normaux, fins, insécables)
  return display.replace(/[\s\u00A0\u202F]/g, "");
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, allowDecimals = false, placeholder, ...props }, ref) => {
    // État interne : la chaîne affichée
    const [display, setDisplay] = React.useState<string>(() => {
      if (value === null || value === undefined || value === "") return "";
      const n = parseFloat(String(value));
      return isNaN(n) ? "" : formatDisplay(String(Math.round(n)), allowDecimals);
    });

    // Sync si value change depuis l'extérieur
    React.useEffect(() => {
      if (value === null || value === undefined || value === "") {
        setDisplay("");
        return;
      }
      const n = parseFloat(String(value));
      if (!isNaN(n)) {
        const raw = allowDecimals ? String(n) : String(Math.round(n));
        setDisplay(formatDisplay(raw, allowDecimals));
      }
    }, [value, allowDecimals]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = stripFormatting(e.target.value);
      // N'autoriser que chiffres et point (si décimales)
      const valid = allowDecimals ? /^\d*\.?\d*$/.test(raw) : /^\d*$/.test(raw);
      if (!valid && raw !== "") return;

      if (raw === "") {
        setDisplay("");
        onChange?.(null);
        return;
      }

      setDisplay(formatDisplay(raw, allowDecimals));
      const num = parseFloat(raw);
      onChange?.(isNaN(num) ? null : num);
    };

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
      />
    );
  },
);

NumberInput.displayName = "NumberInput";
