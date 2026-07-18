/**
 * App-wide toast wrapper: every toast renders in-app (sonner) as before,
 * and ALSO fires a native OS notification when the window isn't focused —
 * results reach you in your editor without spamming Notification Center
 * while you're looking at Relay.
 */
import { toast as sonner, type ExternalToast } from "sonner";
import { appUnfocused, nativeNotify } from "./notify";

type Message = Parameters<typeof sonner>[0];

function forwardNative(message: Message): void {
  if (typeof message === "string" && appUnfocused()) {
    void nativeNotify("Relay", message);
  }
}

function base(message: Message, opts?: ExternalToast): string | number {
  forwardNative(message);
  return sonner(message, opts);
}

export const toast = Object.assign(base, {
  success(message: Message, opts?: ExternalToast) {
    forwardNative(message);
    return sonner.success(message, opts);
  },
  error(message: Message, opts?: ExternalToast) {
    forwardNative(message);
    return sonner.error(message, opts);
  },
  warning(message: Message, opts?: ExternalToast) {
    forwardNative(message);
    return sonner.warning(message, opts);
  },
  info(message: Message, opts?: ExternalToast) {
    forwardNative(message);
    return sonner.info(message, opts);
  },
  // Transient/visual-only kinds pass straight through (no native mirror).
  loading: sonner.loading.bind(sonner),
  custom: sonner.custom.bind(sonner),
  dismiss: sonner.dismiss.bind(sonner),
  promise: sonner.promise.bind(sonner),
});
