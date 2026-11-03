/**
 * Autoscroll only while the reader is already near the bottom (PRD E10-01).
 * Measured from the scroll container so streaming never yanks the view back.
 */
export function shouldAutoScroll(
  metrics: { scrollTop: number; scrollHeight: number; clientHeight: number },
  threshold = 80,
): boolean {
  const distance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distance <= threshold;
}
