import React from "react";

interface BidwattLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export function BidwattLogo({ size = 28, className = "", ...props }: BidwattLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient
          id="bidwatt-amber-border"
          x1="2"
          y1="2"
          x2="30"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fbbf24" />
          <stop offset="0.5" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient
          id="bidwatt-chip-body"
          x1="5"
          y1="5"
          x2="27"
          y2="27"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1c1917" />
          <stop offset="1" stopColor="#0c0a09" />
        </linearGradient>
        <linearGradient
          id="bidwatt-bolt-grad"
          x1="12"
          y1="6"
          x2="20"
          y2="26"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#fef08a" />
          <stop offset="0.6" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* Outer rounded GPU microchip / power badge */}
      <rect x="2" y="2" width="28" height="28" rx="7" fill="url(#bidwatt-amber-border)" />
      <rect x="3.5" y="3.5" width="25" height="25" rx="5.5" fill="url(#bidwatt-chip-body)" />

      {/* Gold/Amber chip contact pins */}
      <rect x="7" y="1" width="3" height="1.5" rx="0.5" fill="#f59e0b" />
      <rect x="14" y="1" width="4" height="1.5" rx="0.5" fill="#f59e0b" />
      <rect x="22" y="1" width="3" height="1.5" rx="0.5" fill="#f59e0b" />

      <rect x="7" y="29.5" width="3" height="1.5" rx="0.5" fill="#d97706" />
      <rect x="14" y="29.5" width="4" height="1.5" rx="0.5" fill="#d97706" />
      <rect x="22" y="29.5" width="3" height="1.5" rx="0.5" fill="#d97706" />

      {/* Glowing High-voltage compute bolt icon in signature Bidwatt amber */}
      <path
        d="M17.5 5.5L8.5 17H15.5L14.5 26.5L23.5 15H16.5L17.5 5.5Z"
        fill="url(#bidwatt-bolt-grad)"
        stroke="#78350f"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
