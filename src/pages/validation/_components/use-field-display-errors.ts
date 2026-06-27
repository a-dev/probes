// Decide *whether to show* an error that already exists in field state.
import { useState } from "react";
import type { AnyFieldApi } from "@tanstack/react-form";

export function useFieldDisplayErrors(field: AnyFieldApi) {
  const [editing, setEditing] = useState(false);

  // Show errors only once the user has left the field (isTouched) and is not
  // currently re-editing it. Start typing again -> hide until the next blur
  // re-judges.
  const errors =
    field.state.meta.isTouched && !editing ? getErrorMessages(field.state.meta.errors) : [];

  return {
    errors,
    invalid: errors.length > 0,
    markEditing: () => setEditing(true), // call from input onChange
    markSettled: () => setEditing(false), // call from input onBlur
  };
}

// Turn each entry (a string or `{ message }`) into display text. No
// de-duplication needed: the single-trigger design can't produce duplicates.
export function getErrorMessages(errors: unknown[]): string[] {
  return errors.flatMap((error) => {
    if (!error) return [];
    if (typeof error === "string") return [error];
    if (typeof error === "object" && "message" in error && typeof error.message === "string") {
      return [error.message];
    }
    return [];
  });
}
