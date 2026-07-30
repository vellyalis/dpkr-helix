import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
  returnFocus?: HTMLElement | null,
): void {
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  onCloseRef.current = onClose;
  returnFocusRef.current = returnFocus;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const focusables = container ? overlayFocusableElements(container) : [];
    focusables[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const currentFocusables = overlayFocusableElements(container);
      if (currentFocusables.length === 0) return;
      const first = currentFocusables[0];
      const last = currentFocusables.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("keydown", handleKeyDown);
    return () => {
      removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [active, containerRef]);
}

export function useCompactLayout(): boolean {
  const query = "(max-width: 759px)";
  const [compact, setCompact] = useState(
    () => typeof matchMedia === "function" && matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia(query);
    const update = (): void => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function overlayFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hidden);
}
