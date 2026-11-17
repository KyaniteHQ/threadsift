import { useCallback } from "react";

export function RadioChoice<Value>({
  id,
  name,
  value,
  label,
  checked,
  busy = false,
  disabled,
  inputValue,
  focusKey,
  pick,
}: Readonly<{
  id: string;
  name: string;
  value: Value;
  label: string;
  checked: boolean;
  busy?: boolean;
  disabled?: boolean;
  inputValue?: string;
  focusKey?: string;
  pick: (value: Value) => void;
}>) {
  const choose = useCallback(() => {
    pick(value);
  }, [pick, value]);

  return (
    <label className="st-b" htmlFor={id}>
      <input
        id={id}
        type="radio"
        className="st-in"
        name={name}
        value={inputValue}
        data-focus-key={focusKey}
        checked={checked}
        disabled={disabled}
        aria-disabled={busy || undefined}
        onChange={choose}
      />
      {label}
    </label>
  );
}
