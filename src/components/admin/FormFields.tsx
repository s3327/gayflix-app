import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { FormState } from "@/lib/title-form";

/*
 * Labelled fields for the admin forms. A field's hint and error are tied
 * to it with aria-describedby, and an error marks it aria-invalid. A
 * field's id is "field-<name>"; pass `id` when a page has several forms
 * with the same fields.
 */

const CONTROL =
  "w-full rounded-md border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted transition-colors focus:border-brand-pink focus-visible:outline-hidden aria-[invalid=true]:border-status-error";

export const BUTTON_PRIMARY =
  "rounded-card bg-brand-pink px-5 py-2.5 text-sm font-bold text-ink-onBrand transition-colors hover:bg-brand-pink-light active:bg-brand-pink-dark disabled:opacity-60";

export const BUTTON_SECONDARY =
  "rounded-card border border-border-strong px-4 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-bg-elevated hover:text-ink-primary";

export const BUTTON_DANGER =
  "rounded-card border border-status-error/40 px-4 py-2 text-sm font-semibold text-status-error transition-colors hover:bg-status-error/10";

type Common = {
  name: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Shown as "(optional)" after the label. */
  optional?: boolean;
  className?: string;
};

function describedBy(id: string, hint: unknown, error: unknown) {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

function Shell({
  id,
  label,
  hint,
  error,
  optional,
  className = "",
  children,
}: Omit<Common, "name"> & { id: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
        {label}
        {optional && <span className="font-normal normal-case tracking-normal text-ink-muted"> (optional)</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-status-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  error,
  optional,
  className,
  id: givenId,
  ...input
}: Common & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = givenId ?? `field-${name}`;
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <input
        id={id}
        name={name}
        required={!optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={CONTROL}
        {...input}
      />
    </Shell>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  error,
  optional,
  className,
  ...textarea
}: Common & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = `field-${name}`;
  return (
    <Shell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        id={id}
        name={name}
        required={!optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={`${CONTROL} min-h-32`}
        {...textarea}
      />
    </Shell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  error,
  className,
  children,
  id: givenId,
  ...select
}: Omit<Common, "optional"> & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = givenId ?? `field-${name}`;
  return (
    <Shell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={CONTROL}
        {...select}
      >
        {children}
      </select>
    </Shell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 rounded-sm border-border-strong accent-brand-pink"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink-primary">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The line next to a form's submit button after it's sent: what
 * happened, or what went wrong.
 */
export function FormMessage({ state }: { state: FormState }) {
  if (state.ok && state.message) {
    return (
      <p role="status" className="text-sm font-medium text-status-success">
        {state.message}
      </p>
    );
  }
  const hasErrors = Object.keys(state.errors ?? {}).length > 0;
  if (!hasErrors && !state.message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-status-error">
      {state.message ?? "Some fields need fixing. They're marked above."}
    </p>
  );
}
