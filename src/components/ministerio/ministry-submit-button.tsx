"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

type MinistrySubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
};

export function MinistrySubmitButton({ children, pendingText = "Salvando...", className = "", disabled = false, type = "submit", onClick }: MinistrySubmitButtonProps) {
  const { pending } = useFormStatus();
  const [instantPending, setInstantPending] = useState(false);
  const isPending = pending || instantPending;
  const isDisabled = disabled || isPending;

  useEffect(() => {
    if (pending) return;
    if (!instantPending) return;
    const timer = window.setTimeout(() => setInstantPending(false), 1200);
    return () => window.clearTimeout(timer);
  }, [instantPending, pending]);

  function triggerInstantFeedback() {
    if (!disabled) setInstantPending(true);
  }

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={isPending}
      onPointerDown={triggerInstantFeedback}
      onClick={(event) => {
        triggerInstantFeedback();
        onClick?.(event);
      }}
      className={`${className} active:scale-[0.985] disabled:cursor-wait disabled:opacity-80 data-[pending=true]:scale-[0.99]`}
      data-pending={isPending ? "true" : "false"}
    >
      {isPending ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {pendingText}
        </span>
      ) : children}
    </button>
  );
}
