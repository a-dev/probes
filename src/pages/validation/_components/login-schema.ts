// login-schema.ts
// The single source of truth for what "valid" means. Both forms read from it:
// the reward-early form validates the whole object at once (form-level
// `onDynamic`), the naive form validates one field at a time.
import { z } from "zod";

export type LoginValues = {
  email: string;
  password: string;
};

export function buildLoginSchema() {
  return z.object({
    email: z.email("Enter a valid email address"),
    password: z.string().min(1, "Enter your password"),
  });
}

// Adapts Zod's output into the shape a form-level TanStack validator expects:
// `{ fields: { fieldName: message } }`, or `undefined` when everything is valid.
export function toFieldErrors(values: LoginValues) {
  const result = buildLoginSchema().safeParse(values);
  if (result.success) return undefined;

  // Zod 4's treeifyError gives us a nested tree; we pull the first message per field.
  const tree = z.treeifyError(result.error);

  const fields = Object.fromEntries(
    Object.entries(tree.properties ?? {}).flatMap(([fieldName, fieldError]) => {
      const message = fieldError?.errors[0];
      return message ? [[fieldName, message]] : [];
    }),
  );

  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

// Validate a single field, used by the naive (per-field, eager) form.
export function validateField<K extends keyof LoginValues>(
  field: K,
  value: LoginValues[K],
): string | undefined {
  const result = buildLoginSchema().shape[field].safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}
