import Link from "next/link";

type SiteLogoProps = {
  logoUrl?: string | null;
  appName?: string | null;
  href?: string;
  variant?: "header" | "auth" | "compact";
  className?: string;
};

export function SiteLogo({ logoUrl, appName = "Harmomus", href = "/", variant = "header", className = "" }: SiteLogoProps) {
  const sizes = {
    header: "h-9 md:h-11 max-w-[170px] md:max-w-[230px]",
    auth: "h-14 md:h-16 max-w-[260px]",
    compact: "h-10 w-10",
  }[variant];

  const content = logoUrl ? (
    <img
      src={logoUrl}
      alt={appName || "Harmomus"}
      className={`${sizes} object-contain object-left`}
      loading="eager"
      decoding="async"
    />
  ) : (
    <span className={`${variant === "auth" ? "text-3xl" : "text-base md:text-xl"} font-semibold tracking-tight text-white`}>
      Harm<span className="bg-gradient-to-r from-cyan-200 to-violet-400 bg-clip-text text-transparent">omus</span>
    </span>
  );

  return (
    <Link href={href} aria-label="Ir para início do Harmomus" className={`inline-flex shrink-0 items-center ${className}`}>
      {content}
    </Link>
  );
}
