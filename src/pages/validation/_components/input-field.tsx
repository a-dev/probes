// input-field.tsx
// Wires the display hook into a field's native input events.
import type { AnyFieldApi } from "@tanstack/react-form";
import { useFieldDisplayErrors } from "./use-field-display-errors";

type InputFieldProps = {
  field: AnyFieldApi;
  label: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
};

export function InputField({
  field,
  label,
  type = "text",
  autoComplete,
  placeholder,
}: InputFieldProps) {
  const { errors, invalid, markEditing, markSettled } = useFieldDisplayErrors(field);
  const errorId = `${field.name}-error`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={field.name}>
        {label}
      </label>
      <input
        id={field.name}
        name={field.name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="field-input"
        value={field.state.value}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onBlur={() => {
          markSettled();
          field.handleBlur();
        }}
        onChange={(e) => {
          markEditing();
          field.handleChange(e.target.value);
        }}
      />
      {invalid && (
        <ul className="field-errors" id={errorId}>
          {errors.map((msg) => (
            <li key={msg} className="field-error">
              {msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
