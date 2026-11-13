import { GROK_BOT_KEY_MAX, type GrokBotView } from "../../src/core/grok-bot-contract.ts";
import { FormField } from "./FormField.tsx";
import { GROK_BOT_TEXT, KEY_STATES } from "./grok-bot-text.ts";
import type { SectionSpec } from "./LoadedSection.tsx";
import { SettingsActions, SettingsForm, SettingsResult } from "./SettingsForm.tsx";
import type { FieldState } from "./use-form.ts";
import { useGrokBotForm } from "./use-grok-bot-form.ts";
import { runningAction } from "./use-settings-action.ts";

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

  return (
    <>
      <SettingsForm
        action="/api/settings/grok-bot"
        busy={form.busy}
        submit={form.submit}
        noValidate
      >
        <GrokBotFields
          view={view}
          address={form.address}
          keyField={form.key}
          keyRequired={form.keyRequired}
        />
        <SettingsActions running={runningAction(form.flow)} buttons={form.buttons} />
        <p className="fld-help">{GROK_BOT_TEXT.testCost}</p>
      </SettingsForm>
      <SettingsResult outcome={form.result} />
    </>
  );
}

const grokBotForm = (view: GrokBotView, changed: (view: GrokBotView) => void) => (
  <>
    <p className="fld-help">{GROK_BOT_TEXT.xLinks}</p>
    <p className="fld-help">{GROK_BOT_TEXT.tokenPointer}</p>
    <GrokBotForm view={view} changed={changed} />
  </>
);

export const GROK_BOT_SECTION: SectionSpec<GrokBotView> = {
  id: "grok-bot",
  title: GROK_BOT_TEXT.sectionTitle,
  intro: GROK_BOT_TEXT.intro,
  loadFailed: GROK_BOT_TEXT.loadFailed,
  form: grokBotForm,
};
