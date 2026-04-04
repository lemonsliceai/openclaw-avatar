/**
 * Picture-in-Picture (PiP) — document PiP and video element PiP modes.
 *
 * Extracted from `web/app.js` PiP-related functions.
 */

import {
  AVATAR_PIP_DEFAULT_ASPECT_RATIO,
  AVATAR_PIP_HORIZONTAL_PADDING,
  AVATAR_PIP_MAX_VIDEO_HEIGHT,
  AVATAR_PIP_TOOLBAR_HEIGHT,
  AVATAR_PIP_VERTICAL_PADDING,
} from "../constants.js";
import { state } from "../state.js";
import { isVideoElement } from "./room.js";

// ---------------------------------------------------------------------------
// Feature detection
// ---------------------------------------------------------------------------

export function hasDocumentPictureInPictureSupport(): boolean {
  return (
    typeof window !== "undefined" &&
    "documentPictureInPicture" in window &&
    typeof (window as Record<string, unknown>).documentPictureInPicture === "object"
  );
}

export function canUseStandardPictureInPicture(videoElement: HTMLVideoElement | null): boolean {
  if (!videoElement) return false;
  return (
    typeof document.exitPictureInPicture === "function" &&
    typeof videoElement.requestPictureInPicture === "function"
  );
}

export function canUseWebkitPictureInPicture(videoElement: HTMLVideoElement | null): boolean {
  if (!videoElement) return false;
  return (
    typeof (videoElement as unknown as Record<string, unknown>).webkitSetPresentationMode ===
    "function"
  );
}

export function hasPictureInPictureBrowserSupport(): boolean {
  return (
    hasDocumentPictureInPictureSupport() || typeof document.exitPictureInPicture === "function"
  );
}

export function hasAvatarPictureInPictureSupport(videoElement: HTMLVideoElement | null): boolean {
  if (hasDocumentPictureInPictureSupport()) return true;
  if (!videoElement) return false;
  return canUseStandardPictureInPicture(videoElement) || canUseWebkitPictureInPicture(videoElement);
}

// ---------------------------------------------------------------------------
// PiP state queries
// ---------------------------------------------------------------------------

export function isAvatarDocumentPictureInPictureActive(): boolean {
  return state.avatarPip.documentPictureInPictureWindow !== null;
}

export function isAvatarVideoPictureInPictureActive(
  videoElement: HTMLVideoElement | null = state.avatarPip.pictureInPictureVideo,
): boolean {
  if (!videoElement) return false;
  return document.pictureInPictureElement === videoElement;
}

export function isAvatarPictureInPictureActive(
  videoElement: HTMLVideoElement | null = state.avatarPip.pictureInPictureVideo,
): boolean {
  return (
    isAvatarDocumentPictureInPictureActive() || isAvatarVideoPictureInPictureActive(videoElement)
  );
}

// ---------------------------------------------------------------------------
// PiP video binding
// ---------------------------------------------------------------------------

export function bindAvatarPictureInPictureVideo(videoElement: HTMLVideoElement): void {
  if (state.avatarPip.pictureInPictureVideo === videoElement) return;
  state.avatarPip.pictureInPictureVideo = videoElement;
}

export function unbindAvatarPictureInPictureVideo(
  videoElement: HTMLVideoElement | null = state.avatarPip.pictureInPictureVideo,
): void {
  if (!videoElement) return;
  if (state.avatarPip.pictureInPictureVideo === videoElement) {
    state.avatarPip.pictureInPictureVideo = null;
  }
}

// ---------------------------------------------------------------------------
// PiP window sizing
// ---------------------------------------------------------------------------

export function getAvatarVideoAspectRatio(videoElement: HTMLVideoElement | null = null): number {
  if (
    videoElement &&
    isVideoElement(videoElement) &&
    Number.isFinite(videoElement.videoWidth) &&
    Number.isFinite(videoElement.videoHeight) &&
    videoElement.videoWidth > 0 &&
    videoElement.videoHeight > 0
  ) {
    return videoElement.videoWidth / videoElement.videoHeight;
  }
  return AVATAR_PIP_DEFAULT_ASPECT_RATIO;
}

export function getAvatarPictureInPictureWindowSize(
  options: { aspectRatio?: number; includeToolbar?: boolean; maxVideoHeight?: number } = {},
): { width: number; height: number } {
  const aspectRatio = options.aspectRatio ?? AVATAR_PIP_DEFAULT_ASPECT_RATIO;
  const includeToolbar = options.includeToolbar !== false;
  const maxVideoHeight = options.maxVideoHeight ?? AVATAR_PIP_MAX_VIDEO_HEIGHT;

  const screenWidth = window.screen?.availWidth ?? window.innerWidth;
  const screenHeight = window.screen?.availHeight ?? window.innerHeight;

  const maxWidth = screenWidth - AVATAR_PIP_HORIZONTAL_PADDING * 2;
  const maxHeight =
    screenHeight -
    AVATAR_PIP_VERTICAL_PADDING * 2 -
    (includeToolbar ? AVATAR_PIP_TOOLBAR_HEIGHT : 0);

  let videoWidth = Math.min(maxWidth, maxVideoHeight * aspectRatio);
  let videoHeight = videoWidth / aspectRatio;

  if (videoHeight > maxHeight) {
    videoHeight = maxHeight;
    videoWidth = videoHeight * aspectRatio;
  }

  const width = Math.round(videoWidth);
  const height = Math.round(videoHeight + (includeToolbar ? AVATAR_PIP_TOOLBAR_HEIGHT : 0));

  return { width, height };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function cleanupAvatarDocumentPictureInPicture(): void {
  if (state.avatarPip.documentPictureInPictureCleanup) {
    state.avatarPip.documentPictureInPictureCleanup();
  }
  state.avatarPip.documentPictureInPictureWindow = null;
  state.avatarPip.documentPictureInPictureCleanup = null;
  state.avatarPip.documentPictureInPictureElements = null;
}
