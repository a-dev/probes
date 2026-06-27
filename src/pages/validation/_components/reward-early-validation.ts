// Universal dynamic validation logic: decide *when* an error is allowed to exist.
import type { ValidationLogicFn } from "@tanstack/react-form";

export const rewardEarlyPunishLate: ValidationLogicFn = ({
  form,
  validators,
  event,
  runValidation,
}) => {
  // If the form is async, we need the async version of the dynamic validator.
  const dynamicValidator = event.async ? validators?.onDynamicAsync : validators?.onDynamic;

  // Has the field that triggered this event already surfaced an error? Only then
  // do we re-judge on every keystroke (so the fix is rewarded instantly).
  const fieldHasError =
    !!event.fieldName && (form.getFieldMeta(event.fieldName)?.errors.length ?? 0) > 0;

  const shouldValidate =
    event.type === "submit" || event.type === "blur" || (event.type === "change" && fieldHasError);

  // NOTE: runValidation returns the validator array the form actually runs, and
  // the caller consumes that return value — so we must `return` it, even though
  // the type says `=> void`.
  return runValidation({
    validators:
      shouldValidate && dynamicValidator ? [{ fn: dynamicValidator, cause: "dynamic" }] : [],
    form,
  });
};
