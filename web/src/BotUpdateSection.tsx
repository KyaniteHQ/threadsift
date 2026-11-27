import type { BotUpdateView } from "../../src/core/contract/bot-install-contract.ts";
import type { GrokBotView } from "../../src/core/contract/grok-bot-contract.ts";
import { Alert } from "./Alert.tsx";
import { saveBotUpdate } from "./bot-update-api.ts";
import { BOT_UPDATE_TEXT, botStateText } from "./bot-update-text.ts";
import { GROK_BOT_SECTION } from "./GrokBotSection.tsx";
import { LoadedSection, type SectionSpec } from "./LoadedSection.tsx";
import { RadioChoice } from "./RadioChoice.tsx";
import type { Loaded } from "./settings-load-types.ts";
import { useSaveOnPick } from "./use-save-on-pick.ts";

const LABEL_ID = "bot-install-label";

const HELP_ID = "bot-install-help";

const CHOICES = [
  { autoInstall: true, id: "bot-install-on", label: BOT_UPDATE_TEXT.installOn },
  { autoInstall: false, id: "bot-install-off", label: BOT_UPDATE_TEXT.installOff },
] as const;

function InstallChoice({
  view,
  changed,
}: Readonly<{ view: BotUpdateView; changed: (view: BotUpdateView) => void }>) {
  const form = useSaveOnPick(saveBotUpdate, changed, BOT_UPDATE_TEXT.saveFailed);

  return (
    <div className="stack" aria-busy={form.busy}>
      <span id={LABEL_ID} className="label">
        {BOT_UPDATE_TEXT.installLabel}
      </span>
      <div
        role="radiogroup"
        className="st-seg"
        aria-labelledby={LABEL_ID}
        aria-describedby={HELP_ID}
      >
        {CHOICES.map(({ autoInstall, id, label }) => (
          <RadioChoice
            key={id}
            id={id}
            name={LABEL_ID}
            value={autoInstall}
            label={label}
            checked={view.autoInstall === autoInstall}
            busy={form.busy}
            pick={form.pick}
          />
        ))}
      </div>
      <p id={HELP_ID} className="fld-help">
        {view.autoInstall ? BOT_UPDATE_TEXT.helpOn : BOT_UPDATE_TEXT.helpOff}
      </p>
      <output>{form.busy ? BOT_UPDATE_TEXT.saving : null}</output>
      <Alert text={form.error} />
    </div>
  );
}

function BotUpdateRows({
  view,
  changed,
}: Readonly<{ view: BotUpdateView; changed: (view: BotUpdateView) => void }>) {
  const { bot } = view;

  return (
    <>
      <p>
        {BOT_UPDATE_TEXT.versionLabel}:{" "}
        {bot.state === "unreported" ? BOT_UPDATE_TEXT.unreported : bot.version}
      </p>
      <p>
        {BOT_UPDATE_TEXT.expectedLabel}: {view.expected}
      </p>
      <p>{botStateText(bot, view.autoInstall)}</p>
      <InstallChoice view={view} changed={changed} />
    </>
  );
}

const BOT_UPDATE_SECTION: SectionSpec<BotUpdateView> = {
  id: "threadsift-bot",
  title: BOT_UPDATE_TEXT.sectionTitle,
  intro: BOT_UPDATE_TEXT.intro,
  loadFailed: BOT_UPDATE_TEXT.loadFailed,
  Form: BotUpdateRows,
};

export function BotSections({
  grokBot,
  botUpdate,
  after,
}: Readonly<{
  grokBot: Loaded<GrokBotView>;
  botUpdate: Loaded<BotUpdateView>;
  after: (view: GrokBotView) => void;
}>) {
  return (
    <>
      <LoadedSection {...GROK_BOT_SECTION} initial={grokBot} after={after} />
      <LoadedSection {...BOT_UPDATE_SECTION} initial={botUpdate} />
    </>
  );
}
