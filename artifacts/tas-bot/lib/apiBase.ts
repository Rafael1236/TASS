export function getApiBase(): string {
  // eslint-disable-next-line dot-notation
  const domain: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (!domain) return "/api";
  return `https://${domain}/api`;
}
