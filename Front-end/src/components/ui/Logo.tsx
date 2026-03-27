"use client";

interface LogoProps {
  /** 'dark' = logo couleur (fond clair) | 'white' = logo blanc (fond sombre) */
  variant?: "dark" | "white";
  /** Taille du logo */
  size?: "sm" | "md" | "lg";
  /** Afficher le slogan sous le nom */
  showTagline?: boolean;
  /** Icône seule sans texte */
  iconOnly?: boolean;
  className?: string;
}

const HEIGHTS: Record<string, number> = { sm: 32, md: 40, lg: 52 };

export function Logo({
  variant = "dark",
  size = "md",
  showTagline = false,
  iconOnly = false,
  className = "",
}: LogoProps) {
  const h = HEIGHTS[size];
  const tagColor = variant === "white" ? "rgba(255,255,255,0.70)" : "#38BDF8";
  const tagSize  = size === "sm" ? "0.6rem" : "0.68rem";

  // Icône carrée seule (favicon / sidebar réduite)
  if (iconOnly) {
    return (
      <img
        src="/logo-icon.svg"
        alt="Structura"
        style={{ height: h, width: h, borderRadius: 8 }}
        className={className}
      />
    );
  }

  // Logo complet : utilise logo-white.svg sur fond sombre, logo-black.svg sur fond clair
  const src = variant === "white" ? "/logo-white.svg" : "/logo-black.svg";

  return (
    <div className={`flex flex-col justify-center ${className}`}>
      <img
        src={src}
        alt="Structura"
        style={{ height: h, width: "auto", display: "block" }}
      />
      {showTagline && (
        <span
          style={{
            color: tagColor,
            fontSize: tagSize,
            marginTop: 3,
            letterSpacing: "0.02em",
          }}
        >
          Un outil. Toutes vos organisations.
        </span>
      )}
    </div>
  );
}
