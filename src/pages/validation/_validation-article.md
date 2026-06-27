# Choreography of validation: how to make your auth form seamless and usable

You know, for users the best login is no login at all. But we still need one, and the most popular is the email/password form. And honestly, most of them are a mess. They nag you too early or too late: red errors when you've already typed a perfectly good email - or before you've typed a single character. I've seen it a lot.

Here I want to share one way to make this better - a very opinionated one. I don't want to drift into the "philosophy of UI", so it's a concrete example on a concrete stack: React, TanStack Form, Zod, and e.g. Better Auth on the backend.

## Reward early, punish late

This is the main principle of good validation UX: find the right moment to tell users they messed up. And the right moment to tell them they're back on track.

The most common mistake is being too eager. The form screams "Invalid email!" while you're still typing. That's how the browser's native `<input type="email">` behaves, and how most libs do it too with `onChange`.

I almost always prefer onBlur. It's a fair moment to say: hey, this field has something invalid, please fix it. But the interesting part comes next - what happens while the user is fixing it?

Usually the error just sits there while they retype, and clears only on the next blur, or after they submit. For some libraries that's the default.

Another flavor: some forms show the error only when you click the button. Too late. Especially when the error has nothing to do with the backend and could be caught on the frontend. And it gets worse: you see the error, fix your input, and it stays until you click again. Frustrating, right?
Ok, enough complaining, let's fix it.

## Three independent timelines

What helped me was a mental model: "the error" isn't one thing. It has three separate lives: when it's born, when it's shown to the user, and when it dies. We control each one independently.

## The birth of an error

The naive approach shows a field's error whenever the value is invalid. Too eager, like we said. Validating only on submit is too lazy. `onBlur` is a good compromise, but it has its own catch: the error is born the moment you leave the field, even if you typed nothing. Click in, click out, and you get an error for a field you never filled.

Back to our principle. "Punish late" - don't create an error until the user has actually typed something. "Reward early" - once it's born, kill it the moment they start typing again. It feels right: they're actively fixing things, so let's reward that.

TanStack Form 1.x lets us express exactly this with a single [`onDynamic`](https://tanstack.com/form/latest/docs/framework/react/guides/dynamic-validation) validator and a custom `validationLogic` method. Thanks to the team for it - powerful and flexible.

```ts
// reward-early-validation.ts
// universal dynamic validation logic
import type { ValidationLogicFn } from "@tanstack/react-form";

export const rewardEarlyPunishLate: ValidationLogicFn = ({
  form,
  validators,
  event,
  runValidation,
}) => {
  // If the form is async, we need to use the async version of the dynamic validator
  const dynamicValidator = event.async ? validators?.onDynamicAsync : validators?.onDynamic;

  // Has the field that triggered this event already surfaced an error? Only then do we re-judge on every keystroke (so the fix is rewarded instantly)
  const fieldHasError =
    !!event.fieldName && (form.getFieldMeta(event.fieldName)?.errors.length ?? 0) > 0;

  const shouldValidate =
    event.type === "submit" || event.type === "blur" || (event.type === "change" && fieldHasError);

  // NOTE: runValidation returns the validator array the form actually runs, and the caller consumes that return value — so we must `return` it, even though the type says `=> void`
  return runValidation({
    validators:
      shouldValidate && dynamicValidator ? [{ fn: dynamicValidator, cause: "dynamic" }] : [],
    form,
  });
};
```

And the form:

```ts
// login-form.tsx
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { rewardEarlyPunishLate } from "./reward-early-validation";

function buildLoginSchema() {
  return z.object({
    email: z.email("Enter a valid email address"),
    password: z.string().min(1, "Enter your password"),
  });
}

const form = useForm({
  defaultValues: { email: "", password: "" },
  validationLogic: rewardEarlyPunishLate,
  validators: {
    onDynamic: ({ value }) => toFieldErrors(value), // the single source of error truth
  },
  // ...
});
```

The validator delegates the checking to a helper that adapts Zod's output into the TanStack Form shape:

```ts
function toFieldErrors(values: LoginValues) {
  const result = buildLoginSchema().safeParse(values);
  if (result.success) return undefined;

  // Zod 4's treeifyError gives us a nested tree; we pull the first message per field
  const tree = z.treeifyError(result.error);

  const fields = Object.fromEntries(
    Object.entries(tree.properties ?? {}).flatMap(([fieldName, fieldError]) => {
      const message = fieldError.errors[0];
      return message ? [[fieldName, message]] : [];
    }),
  );

  return Object.keys(fields).length > 0 ? { fields } : undefined;
}
```

Why not two validators: the `onBlur` (to catch a field you focus and leave without typing, no `change` event fires there) and the `onChange` (to clear the error as you fix it)? It works, but with a nasty side effect: TanStack stores errors per trigger (`errorMap.onBlur`, `errorMap.onChange`, …) and flattens them into one `errors` array. Two validators returning the same message produce duplicates, and, worse, an `onChange` returning `undefined` can't clear an `onBlur` error, so field state and the rendered UI disagree.

Routing both blur and change-while-errored through one validator avoids all that. One trigger, one `errorMap` entry, no duplicates. And when the value becomes valid, the error clears immediately instead of just hiding.

Note: typing in field B never starts live-validating it just because field A is invalid, the `fieldHasError` check only applies to the field that triggered the event.

## Show the error

The errors now live in `field.state.meta.errors`. Time to show them with a small hook.

```ts
// use-field-display-errors.ts
export function useFieldDisplayErrors(field: AnyFieldApi) {
  const [editing, setEditing] = useState(false);

  // Show errors only once the user has left the field (isTouched) and is not currently re-editing it. Start typing again → hide until the next blur re-judges

  const errors =
    field.state.meta.isTouched && !editing ? getErrorMessages(field.state.meta.errors) : [];

  return {
    errors,
    invalid: errors.length > 0,
    markEditing: () => setEditing(true), // call from input onChange
    markSettled: () => setEditing(false), // call from input onBlur
  };
}
```

The field component wires the two callbacks into the input's native events:

```tsx
// input-field.tsx
const { errors, invalid, markEditing, markSettled } = useFieldDisplayErrors(field);

<Input
  value={field.state.value}
  onBlur={() => {
    markSettled();
    field.handleBlur();
  }}
  onChange={(e) => {
    markEditing();
    field.handleChange(e.target.value);
  }}
  invalid={invalid}
/>;

{
  invalid &&
    errors.map((msg) => (
      <Field.Error key={msg} match>
        {msg}
      </Field.Error>
    ));
}
```

`isTouched` is doing real work here. Because `onDynamic` is a form-level validator, a blur runs validation for all fields, not just the blurred one. The `isTouched` check keeps the still-unvisited fields quiet until the user actually lands on them.

Yes, there's a trade-off: click into a field, click out empty, and you'll see an error. But hiding errors on empty fields is worse - a required field should tell you it's required.

The `!editing` half is the "calm while you fix it" touch: the message vanishes the instant you start typing and comes back (if still wrong) on the next blur.

`getErrorMessages` just turns each entry (a string or `{ message }`) into display text. No de-duplication - the single-trigger design can't produce duplicates in the first place. (That would bite you with multiple validators emitting the same message, but we don't have those here).

## The death of an error

Some things you can only check on the server. In our example the error comes from Better Auth. It's a verdict on one specific (email, password) pair. So the moment the user edits either field, it's stale, and we remove it.

```ts
// use-login.ts
const [formError, setFormError] = useState<LoginError | null>(null);

const form = useForm({
  // ...
  listeners: {
    // The banner reflects a verdict on a credential combination. The moment the user edits either field, that verdict is stale — so clear it
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
      // I prefer not to show raw error messages from Better Auth or other auth libraries, because they can be too technical or expose too much information. Instead, we classify the error into a user-friendly message by the error code or status. For example, 400/401 errors should stay deliberately ambiguous so we never reveal which field was wrong
      setFormError(classifyLoginError(error, email));
      return;
    }
    await onNavigate(resolveSafeRedirect(redirectTarget));
  },
});
```

Same refrain as everywhere: the instant they type, the verdict is gone. Reward the fix.

## Finale

Let's weigh the trade-offs.

Starting with cons:
The first one is about implementation. `validationLogic` doesn't feel fully baked yet - it still has [todos about types](https://github.com/TanStack/form/blob/main/packages/form-core/src/ValidationLogic.ts). It'll surely get polished, which also means the API can still change.

There's a small, intentional gap between state and screen. The `!editing` check hides the message while the user types, even though the error is still sitting in `field.state.meta.errors`. Deliberate, calmer UX, but anything reading error state directly during that window sees something the user doesn't.

A server error can vanish before it's even read, if a hurried user starts typing before the banner renders. Trade-off again: rewarding the fix is good, but a message that flashes and disappears is just confusing. Fix: add a short delay before clearing it.

Every run calls `buildLoginSchema().safeParse(...)`, rebuilding the schema each time. On purpose, but still. Trivial for a login form; for something bigger, you might want to cache it.

Only the first error per field shows up. It's a UX choice. Want all of them? Make `toFieldErrors` return every message.

And now pros:

It feels good. Really good. No nagging, no frustration, no confusion. The user is rewarded for fixing their input, and errors show up exactly when they're useful and vanish the moment they're not.

Clear separation of concerns. "When does an error exist?" (validationLogic), "should we show it now?" (display hook), "is the server verdict still true?" (listener). Three small, separately testable decisions. I like that.

A single `onDynamic` trigger means no duplicate messages and no drift between field state and screen. And it's reusable, the same `validationLogic` and display hook can drive any form.

Overall, I picked a very specific stack and solved it there, and as you can see, the cons are mostly about implementation, the pros mostly about UX. The idea ports to other stacks and libraries, though, and I hope it helps you make your auth forms (and not only auth forms) better.
