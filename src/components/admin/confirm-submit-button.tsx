"use client";

interface ConfirmSubmitButtonProps {
  children: React.ReactNode;
  message: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}

export function ConfirmSubmitButton({ children, message, className, formAction }: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
