/**
 * Layout — nav sidebar collapse, chat pane open/close/resize, avatar pane resize.
 *
 * Extracted from `web/app.js` layout functions.
 */

import {
  AVATAR_PANE_MAX_WIDTH,
  AVATAR_PANE_MIN_WIDTH,
  AVATAR_PANE_WIDTH_CSS_VARIABLE,
  AVATAR_PANE_WIDTH_STORAGE_KEY,
  CHAT_PANE_MAX_WIDTH,
  CHAT_PANE_MIN_WIDTH,
  CHAT_PANE_STORAGE_KEY,
  CHAT_PANE_WIDTH_CSS_VARIABLE,
  CHAT_PANE_WIDTH_STORAGE_KEY,
  NAV_COLLAPSE_STORAGE_KEY,
} from "../constants.js";

// ---------------------------------------------------------------------------
// DOM element references (passed in from orchestrator)
// ---------------------------------------------------------------------------

export interface LayoutElements {
  shellEl: HTMLElement | null;
  navEl: HTMLElement | null;
  contentEl: HTMLElement | null;
  navCollapseButton: HTMLElement | null;
  chatPaneToggleButton: HTMLElement | null;
  chatPaneCloseButton: HTMLElement | null;
  chatPaneBackdropEl: HTMLElement | null;
  chatPaneResizerEl: HTMLElement | null;
  chatPaneEl: HTMLElement | null;
  avatarPaneEl: HTMLElement | null;
  avatarResizeHandleEl: HTMLElement | null;
  mobileChatPaneMedia: MediaQueryList | null;
}

// ---------------------------------------------------------------------------
// Nav collapse
// ---------------------------------------------------------------------------

export function updateNavCollapseButtonState(
  isCollapsed: boolean,
  navCollapseButton: HTMLElement | null,
): void {
  if (!navCollapseButton) return;
  const collapsed = Boolean(isCollapsed);
  navCollapseButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  navCollapseButton.setAttribute(
    "aria-label",
    collapsed ? "Expand navigation menu" : "Collapse navigation menu",
  );
  (navCollapseButton as HTMLElement & { title: string }).title = collapsed
    ? "Expand sidebar"
    : "Collapse sidebar";
}

export function setNavCollapsed(
  isCollapsed: boolean,
  els: Pick<LayoutElements, "shellEl" | "navEl" | "navCollapseButton">,
  options: { persist?: boolean } = {},
): void {
  const collapsed = Boolean(isCollapsed);
  const shouldPersist = options.persist !== false;
  els.shellEl?.classList.toggle("shell--nav-collapsed", collapsed);
  els.navEl?.classList.toggle("nav--collapsed", collapsed);
  updateNavCollapseButtonState(collapsed, els.navCollapseButton);
  if (!shouldPersist) return;
  try {
    localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

export function initNavCollapseToggle(
  els: Pick<LayoutElements, "shellEl" | "navEl" | "navCollapseButton">,
): void {
  if (!els.navCollapseButton) return;
  let storedCollapsed = false;
  try {
    storedCollapsed = localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    storedCollapsed = false;
  }
  setNavCollapsed(storedCollapsed, els, { persist: false });
  els.navCollapseButton.addEventListener("click", () => {
    const isCollapsed =
      els.shellEl?.classList.contains("shell--nav-collapsed") ||
      els.navEl?.classList.contains("nav--collapsed");
    setNavCollapsed(!isCollapsed, els);
  });
}

// ---------------------------------------------------------------------------
// Chat pane
// ---------------------------------------------------------------------------

export function isMobileChatPane(mobileChatPaneMedia: MediaQueryList | null): boolean {
  return Boolean(mobileChatPaneMedia?.matches);
}

export function getChatPaneWidthBounds(contentEl: HTMLElement | null): {
  min: number;
  max: number;
} {
  const layoutWidth = contentEl?.getBoundingClientRect().width ?? window.innerWidth;
  const maxWidth = Math.max(
    CHAT_PANE_MIN_WIDTH,
    Math.min(CHAT_PANE_MAX_WIDTH, Math.floor(layoutWidth - 320)),
  );
  return { min: CHAT_PANE_MIN_WIDTH, max: maxWidth };
}

export function applyChatPaneWidth(
  nextWidth: number,
  shellEl: HTMLElement | null,
  contentEl: HTMLElement | null,
  options: { persist?: boolean } = {},
): void {
  if (!shellEl || !Number.isFinite(nextWidth)) return;
  const shouldPersist = options.persist !== false;
  const { min, max } = getChatPaneWidthBounds(contentEl);
  const clamped = Math.min(max, Math.max(min, Math.round(nextWidth)));
  shellEl.style.setProperty(CHAT_PANE_WIDTH_CSS_VARIABLE, `${clamped}px`);
  if (!shouldPersist) return;
  try {
    localStorage.setItem(CHAT_PANE_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore.
  }
}

export function setChatPaneOpen(
  isOpen: boolean,
  els: Pick<
    LayoutElements,
    | "shellEl"
    | "chatPaneEl"
    | "chatPaneBackdropEl"
    | "chatPaneResizerEl"
    | "chatPaneToggleButton"
    | "mobileChatPaneMedia"
  >,
  options: { persist?: boolean } = {},
): void {
  const shouldPersist = options.persist !== false;
  const isMobile = isMobileChatPane(els.mobileChatPaneMedia);
  els.shellEl?.classList.toggle("shell--chat-pane-open", isOpen);
  els.shellEl?.classList.toggle("shell--chat-pane-closed", !isOpen);

  if (els.chatPaneEl) {
    els.chatPaneEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
    (els.chatPaneEl as HTMLElement).hidden = isMobile && !isOpen;
    if ("inert" in els.chatPaneEl) {
      (els.chatPaneEl as HTMLElement & { inert: boolean }).inert = !isOpen;
    }
  }
  if (els.chatPaneBackdropEl) {
    (els.chatPaneBackdropEl as HTMLElement).hidden = !isMobile || !isOpen;
  }
  if (els.chatPaneResizerEl) {
    (els.chatPaneResizerEl as HTMLElement).hidden = isMobile || !isOpen;
  }
  if (els.chatPaneToggleButton) {
    els.chatPaneToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    els.chatPaneToggleButton.setAttribute(
      "title",
      isOpen ? "Hide text chat panel" : "Show text chat panel",
    );
  }
  if (shouldPersist) {
    try {
      localStorage.setItem(CHAT_PANE_STORAGE_KEY, isOpen ? "1" : "0");
    } catch {
      // Ignore.
    }
  }
}

export function resolveInitialChatPaneOpen(mobileChatPaneMedia: MediaQueryList | null): {
  isOpen: boolean;
  storedWidth: number;
} {
  let isOpen = !isMobileChatPane(mobileChatPaneMedia);
  let storedWidth = 360;
  try {
    const stored = localStorage.getItem(CHAT_PANE_STORAGE_KEY);
    if (stored === "0") isOpen = false;
    else if (stored === "1") isOpen = true;
    const parsedWidth = Number(localStorage.getItem(CHAT_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) storedWidth = parsedWidth;
  } catch {
    storedWidth = 360;
  }
  return { isOpen, storedWidth };
}

// ---------------------------------------------------------------------------
// Avatar pane
// ---------------------------------------------------------------------------

export function getAvatarPaneWidthBounds(
  avatarPaneEl: HTMLElement | null,
  contentEl: HTMLElement | null,
): { min: number; max: number } {
  const availableWidth =
    avatarPaneEl?.parentElement?.getBoundingClientRect().width ??
    contentEl?.getBoundingClientRect().width ??
    window.innerWidth;
  const maxWidth = Math.max(
    AVATAR_PANE_MIN_WIDTH,
    Math.min(AVATAR_PANE_MAX_WIDTH, Math.floor(availableWidth)),
  );
  return { min: AVATAR_PANE_MIN_WIDTH, max: maxWidth };
}

export function applyAvatarPaneWidth(
  nextWidth: number,
  shellEl: HTMLElement | null,
  avatarPaneEl: HTMLElement | null,
  contentEl: HTMLElement | null,
  options: { persist?: boolean } = {},
): void {
  if (!shellEl || !Number.isFinite(nextWidth)) return;
  const shouldPersist = options.persist !== false;
  const { min, max } = getAvatarPaneWidthBounds(avatarPaneEl, contentEl);
  const clamped = Math.min(max, Math.max(min, Math.round(nextWidth)));
  shellEl.style.setProperty(AVATAR_PANE_WIDTH_CSS_VARIABLE, `${clamped}px`);
  if (!shouldPersist) return;
  try {
    localStorage.setItem(AVATAR_PANE_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore.
  }
}

export function getCurrentAvatarPaneWidth(
  avatarPaneEl: HTMLElement | null,
  shellEl: HTMLElement | null,
): number {
  const measuredWidth = avatarPaneEl?.hidden ? 0 : avatarPaneEl?.getBoundingClientRect().width;
  if (Number.isFinite(measuredWidth) && (measuredWidth ?? 0) > 0) return measuredWidth!;
  const storedWidth = parseInt(
    shellEl?.style.getPropertyValue(AVATAR_PANE_WIDTH_CSS_VARIABLE) || "760",
    10,
  );
  if (Number.isFinite(storedWidth) && storedWidth > 0) return storedWidth;
  return 760;
}

export function initAvatarPaneResize(
  els: Pick<
    LayoutElements,
    "shellEl" | "avatarPaneEl" | "avatarResizeHandleEl" | "contentEl" | "mobileChatPaneMedia"
  >,
): void {
  let storedWidth = 760;
  try {
    const parsed = Number(localStorage.getItem(AVATAR_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(parsed) && parsed > 0) storedWidth = parsed;
  } catch {
    storedWidth = 760;
  }
  applyAvatarPaneWidth(storedWidth, els.shellEl, els.avatarPaneEl, els.contentEl, {
    persist: false,
  });

  if (!els.avatarResizeHandleEl || !els.avatarPaneEl) return;

  els.avatarResizeHandleEl.addEventListener("pointerdown", (event: Event) => {
    const pointerEvent = event as PointerEvent;
    if (isMobileChatPane(els.mobileChatPaneMedia)) return;
    pointerEvent.preventDefault();
    const startX = pointerEvent.clientX;
    const startWidth = els.avatarPaneEl!.getBoundingClientRect().width;
    els.shellEl?.classList.add("shell--avatar-resizing");

    const onPointerMove = (moveEvent: Event) => {
      const deltaX = (moveEvent as PointerEvent).clientX - startX;
      applyAvatarPaneWidth(startWidth + deltaX, els.shellEl, els.avatarPaneEl, els.contentEl);
    };
    const onPointerUp = () => {
      els.shellEl?.classList.remove("shell--avatar-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  window.addEventListener("resize", () => {
    applyAvatarPaneWidth(
      getCurrentAvatarPaneWidth(els.avatarPaneEl, els.shellEl),
      els.shellEl,
      els.avatarPaneEl,
      els.contentEl,
      { persist: false },
    );
  });
}
