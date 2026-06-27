// The baseline the article argues against. Two deliberate "bad" behaviors:
//   1. Per-field `onChange` validation -> errors fire on every keystroke, even
//      before you've finished typing, and linger while you fix them.
//   2. The server banner is never cleared on edit -> a stale verdict sits there
//      while you retype.
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import { authClient, classifyLoginError, type LoginError } from "./mock-auth";
import { validateField, type LoginValues } from "./login-schema";
import { getErrorMessages } from "./use-field-display-errors";

export function NaiveLoginForm() {
  const [formError, setFormError] = useState<LoginError | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" } as LoginValues,
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signIn.email({
        email: value.email.trim(),
        password: value.password,
        rememberMe: true,
      });

      // Note: NOT cleared on change anywhere — the stale verdict lingers while
      // the user retypes, and only updates on the next submit.
      if (error) setFormError(classifyLoginError(error, value.email));
    },
  });

  return (
    <form
      className="login-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      {formError && (
        <p className="form-banner" role="alert">
          {formError.message}
        </p>
      )}

      <form.Field
        name="email"
        validators={{ onChange: ({ value }) => validateField("email", value) }}
      >
        {(field) => (
          <NaiveField
            field={field}
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        )}
      </form.Field>

      <form.Field
        name="password"
        validators={{ onChange: ({ value }) => validateField("password", value) }}
      >
        {(field) => (
          <NaiveField
            field={field}
            label="Password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" className="submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}

type NaiveFieldProps = {
  field: AnyFieldApi;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
};

// No display gating: whatever is in field state is shown immediately, the
// moment it exists. That's the eagerness we're contrasting against.
function NaiveField({ field, label, type = "text", autoComplete, placeholder }: NaiveFieldProps) {
  const messages = getErrorMessages(field.state.meta.errors);
  const invalid = messages.length > 0;
  const errorId = `naive-${field.name}-error`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={`naive-${field.name}`}>
        {label}
      </label>
      <input
        id={`naive-${field.name}`}
        name={field.name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="field-input"
        value={field.state.value}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onBlur={() => field.handleBlur()}
        onChange={(e) => field.handleChange(e.target.value)}
      />
      {invalid && (
        <ul className="field-errors" id={errorId}>
          {messages.map((msg) => (
            <li key={msg} className="field-error">
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
