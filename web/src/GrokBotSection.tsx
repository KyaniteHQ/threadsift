import { useCallback, type SubmitEvent } from "react";

import { GROK_BOT_KEY_MAX, type GrokBotView } from "../../src/core/grok-bot-contract.ts";
import { Alert } from "./Alert.tsx";
import { FormField } from "./FormField.tsx";
import { GROK_BOT_TEXT, KEY_STATES } from "./grok-bot-text.ts";
import { type Loaded, LoadedSection } from "./LoadedSection.tsx";
import { SettingsActions } from "./SettingsActions.tsx";
import type { FieldState } from "./use-form.ts";
import { useGrokBotForm } from "./use-grok-bot-form.ts";

const ADDRESS_KIND = {
  name: "webhookUrl",
  type: "url",
  autoComplete: "off",
  required: true,
  mono: true,
  placeholder: GROK_BOT_TEXT.addressPlaceholder,
} as const;

const KEY_KIND = {
  name: "key",
  type: "password",
  autoComplete: "off",
  maxLength: GROK_BOT_KEY_MAX,
} as const;

const KEY_REQUIRED_KIND = { ...KEY_KIND, required: true } as const;

const KEY_SAVED_KIND = { ...KEY_KIND, placeholder: GROK_BOT_TEXT.keySavedPlaceholder } as const;

function GrokBotFields({
  view,
  address,
  keyField,
  keyRequired,
}: Readonly<{
  view: GrokBotView;
  address: FieldState;
  keyField: FieldState;
  keyRequired: boolean;
}>) {
  const addressChanged = view.key === "usable" && keyRequired;

  return (
    <>
      <FormField
        field={address}
        label={GROK_BOT_TEXT.addressLabel}
        kind={ADDRESS_KIND}
        help={GROK_BOT_TEXT.addressHelp}
      />
      <FormField
        field={keyField}
        label={GROK_BOT_TEXT.keyLabel}
        kind={keyRequired ? KEY_REQUIRED_KIND : KEY_SAVED_KIND}
        help={addressChanged ? GROK_BOT_TEXT.keyNewAddress : GROK_BOT_TEXT.keyHelp}
      />
      <p>{KEY_STATES[view.key]}</p>
    </>
  );
}

function GrokBotForm({
  view,
  changed,
}: Readonly<{ view: GrokBotView; changed: (view: GrokBotView) => void }>) {
  const form = useGrokBotForm(view, changed);
  const { submit } = form;

  const onSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit();
    },
    [submit],
  );

  return (
    <>
      <form
        method="post"
        action="/api/settings/grok-bot"
        className="stack ai-form"
        onSubmit={onSubmit}
        aria-busy={form.busy}
        noValidate
      >
        <GrokBotFields
          view={view}
          address={form.address}
          keyField={form.key}
          keyRequired={form.keyRequired}
        />
        <SettingsActions busy={form.busy} current={form.action} buttons={form.buttons} />
        <p className="fld-help">{GROK_BOT_TEXT.testCost}</p>
      </form>
      <output>{form.result?.kind === "ok" ? form.result.text : null}</output>
      <Alert text={form.result?.kind === "error" ? form.result.text : null} />
    </>
  );
}

const grokBotForm = (view: GrokBotView, changed: (view: GrokBotView) => void) => (
  <>
    <p className="fld-help">{GROK_BOT_TEXT.tokenPointer}</p>
    <GrokBotForm view={view} changed={changed} />
  </>
);

export function GrokBotSection({ initial }: Readonly<{ initial: Loaded<GrokBotView> }>) {
  return (
    <LoadedSection
      id="grok-bot"
      title={GROK_BOT_TEXT.sectionTitle}
      intro={GROK_BOT_TEXT.intro}
      loadFailed={GROK_BOT_TEXT.loadFailed}
      initial={initial}
      form={grokBotForm}
    />
  );
}
