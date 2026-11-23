/** Grow a textarea to fit its content, stopping at a sensible maximum height. */
export function fitTextarea(element: HTMLTextAreaElement | null, maxHeight = 240): void {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
}
