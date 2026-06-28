export function isComposingKeyboardEvent(event: unknown): boolean {
  if (!event || typeof event !== "object" || !("isComposing" in event)) return false;
  return (event as { isComposing?: unknown }).isComposing === true;
}
