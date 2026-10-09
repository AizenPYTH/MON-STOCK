/** Jetons de design de l'application mobile (contrastes ≥ 4.5:1 sur fond clair). */
export const colors = {
  background: "#F5F6F8",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF0F3",
  border: "#D9DDE3",
  text: "#111827",
  textMuted: "#4B5563",
  textSubtle: "#6B7280",
  primary: "#1E40AF",
  primaryPressed: "#1E3A8A",
  onPrimary: "#FFFFFF",
  success: "#166534",
  successBg: "#DCFCE7",
  warning: "#92400E",
  warningBg: "#FEF3C7",
  danger: "#B91C1C",
  dangerBg: "#FEE2E2",
  info: "#1E40AF",
  infoBg: "#DBEAFE",
  neutralBg: "#E5E7EB",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const font = {
  small: 13,
  body: 15,
  bodyLarge: 17,
  title: 20,
  headline: 26,
} as const;

/** Zone tactile minimale recommandée (iOS 44 pt, Android 48 dp). */
export const MIN_TOUCH = 48;

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.textMuted, bg: colors.neutralBg },
  success: { fg: colors.success, bg: colors.successBg },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  info: { fg: colors.info, bg: colors.infoBg },
};
