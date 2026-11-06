import { FIELDS, RESET, SETUP } from "./access-text.ts";
import { Alert } from "./Alert.tsx";
import { AuthShell } from "./AuthShell.tsx";
import { FormField } from "./FormField.tsx";
import { PasswordField, UsernameHint } from "./PasswordField.tsx";
import { ResetInstructions } from "./ResetInstructions.tsx";
import { useInternalLink } from "./routing.ts";
import { SwapButton } from "./SwapButton.tsx";
import { useFocusOnMount } from "./use-form.ts";
import { useReset } from "./use-reset.ts";

const CODE_INPUT = {
  name: "reset-code",
  type: "text",
  autoComplete: "one-time-code",
  mono: true,
} as const;

export function ResetScreen({ done, back }: Readonly<{ done: () => void; back: () => void }>) {
  const { code, password, confirm, lock, visibility, alert, busy, onSubmit } = useReset(done);
  const { shown, toggle } = visibility;
  const follow = useInternalLink(back);
  useFocusOnMount(code.ref);

  return (
    <AuthShell>
      <form className="stack" method="post" onSubmit={onSubmit}>
        <h1 className="auth-title">{RESET.heading}</h1>
        <ResetInstructions />
        <UsernameHint />
        <FormField field={code} label={RESET.codeLabel} kind={CODE_INPUT} />
        <PasswordField
          field={password}
          label={FIELDS.password}
          name="password"
          autoComplete="new-password"
          help={SETUP.passwordHelp}
          shown={shown}
          toggle={toggle}
        />
        <PasswordField
          field={confirm}
          label={FIELDS.confirmPassword}
          name="confirm-password"
          autoComplete="new-password"
          shown={shown}
        />
        <Alert text={lock.message ?? alert} />
        <SwapButton
          label={RESET.button}
          busyLabel={RESET.resetting}
          busy={busy}
          blocked={lock.locked}
        />
        <a className="btn btn-plain btn-flush" href="/" onClick={follow}>
          {RESET.back}
        </a>
      </form>
    </AuthShell>
  );
}
