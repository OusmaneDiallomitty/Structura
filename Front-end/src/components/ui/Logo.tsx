"use client";

interface LogoProps {
  /** 'dark' = icône bleue + texte sombre (fond clair) | 'white' = tout blanc (fond sombre) */
  variant?: "dark" | "white";
  /** Taille du logo */
  size?: "sm" | "md" | "lg";
  /** Afficher le slogan sous le nom */
  showTagline?: boolean;
  /** Icône seule sans texte */
  iconOnly?: boolean;
  className?: string;
}

export function Logo({
  variant = "dark",
  size = "md",
  showTagline = false,
  iconOnly = false,
  className = "",
}: LogoProps) {
  const iconColor  = variant === "white" ? "#ffffff" : "#2563EB";
  const textColor  = variant === "white" ? "#ffffff" : "#0F172A";
  const tagColor   = variant === "white" ? "rgba(255,255,255,0.70)" : "#38BDF8";

  const iconW  = size === "sm" ? 34 : size === "lg" ? 56 : 44;
  const fontSize = size === "sm" ? "1rem" : size === "lg" ? "1.6rem" : "1.25rem";
  const tagSize  = size === "sm" ? "0.6rem" : "0.68rem";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Icône : 4 carrés décalés — fidèle au logo Namecheap */}
      <svg
        width={iconW}
        height={Math.round(iconW * 51 / 59)}
        viewBox="0 0 59 51"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Rangée du bas (gauche) */}
        <rect x="0"  y="27" width="22" height="22" rx="2.5" stroke={iconColor} strokeWidth="3" />
        <rect x="26" y="27" width="22" height="22" rx="2.5" stroke={iconColor} strokeWidth="3" />
        {/* Rangée du haut (décalée à droite) */}
        <rect x="11" y="2"  width="22" height="22" rx="2.5" stroke={iconColor} strokeWidth="3" />
        <rect x="37" y="2"  width="22" height="22" rx="2.5" stroke={iconColor} strokeWidth="3" />
      </svg>

      {!iconOnly && (
        <div className="flex flex-col justify-center">
          <span
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              color: textColor,
              fontSize,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.01em",
            }}
          >
            Structura
          </span>
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
      )}
    </div>
  );
}
