export const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
export function canReactToMessage(timestamp: string | Date): boolean {
  return Date.now() - new Date(timestamp).getTime() < 30 * 24 * 60 * 60 * 1000;
}
