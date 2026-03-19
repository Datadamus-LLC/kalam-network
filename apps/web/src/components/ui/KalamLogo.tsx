interface KalamLogoProps {
  className?: string;
  color?: string;
}

export function KalamLogo({ className, color = '#f0d060' }: KalamLogoProps) {
  return (
    <svg
      viewBox="0 0 51 43"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Kalam"
    >
      <path
        d="M10.7116 42.8433H21.5383V24.5925L36.077 42.8433H50.1516L31.1276 21.4992L31.1955 21.4219H10.7116V42.8433Z"
        fill={color}
      />
      <path
        d="M25.2108 0L10.8267 18.1733V0H0V21.4213H20.4839L39.2853 0H25.2108Z"
        fill={color}
      />
    </svg>
  );
}
