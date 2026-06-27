// Owns the third timeline: the *death* of a server error.
import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { authClient, classifyLoginError, type LoginError } from "./mock-auth";
import { rewardEarlyPunishLate } from "./reward-early-validation";
import { toFieldErrors, type LoginValues } from "./login-schema";

export function useLogin() {
  const [formError, setFormError] = useState<LoginError | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const form = useForm({
    defaultValues: { email: "", password: "" } as LoginValues,
    validationLogic: rewardEarlyPunishLate,
    validators: {
      onDynamic: ({ value }) => toFieldErrors(value), // the single source of error truth
    },
    listeners: {
      // The banner reflects a verdict on a credential combination. The moment
      // the user edits either field, that verdict is stale -> clear it.
      onChange: () => setFormError(null),
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const email = value.email.trim();
      const { error } = await authClient.signIn.email({
        email,
        password: value.password,
        rememberMe: true,
      });

      if (error) {
        // Never show raw library messages; classify into a friendly, ambiguous one.
        setFormError(classifyLoginError(error, email));
        return;
      }

      setSignedIn(true);
    },
  });

  return { form, formError, signedIn };
}
