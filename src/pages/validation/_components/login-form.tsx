// The reward-early / punish-late form: three independent timelines composed.
import { InputField } from "./input-field";
import { useLogin } from "./use-login";

export function RewardEarlyLoginForm() {
  const { form, formError, signedIn } = useLogin();

  if (signedIn) {
    // Unreachable in this demo (the mock server always rejects), kept for shape.
    return <p className="form-success">Signed in 🎉</p>;
  }

  return (
    <form
      className="login-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      {formError && (
        <p className="form-banner" role="alert">
          {formError.message}
        </p>
      )}

      <form.Field name="email">
        {(field) => (
          <InputField
            field={field}
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <InputField
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
