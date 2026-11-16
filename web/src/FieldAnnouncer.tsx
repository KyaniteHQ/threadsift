import {
  type ReactNode,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ANNOUNCE_SETTLE_MS, Announcement } from "./Announcement.tsx";
import { useAfter } from "./use-form.ts";

interface Voice {
  readonly said: string;
  readonly next: string | null;
}

interface FieldVoice {
  readonly announce: (text: string) => void;
  readonly retract: (text: string) => void;
}

const SILENT: Voice = { said: "", next: null };

export const FieldVoiceContext = createContext<FieldVoice | null>(null);

export function FieldAnnouncer({ children }: Readonly<{ children: ReactNode }>) {
  const [voice, setVoice] = useState(SILENT);
  const { next } = voice;

  const announce = useCallback((text: string) => {
    setVoice({ said: "", next: text });
  }, []);

  const retract = useCallback((text: string) => {
    setVoice((held) => (held.said === text || held.next === text ? SILENT : held));
  }, []);

  const say = useCallback(() => {
    if (next !== null) setVoice({ said: next, next: null });
  }, [next]);

  useAfter(next !== null, ANNOUNCE_SETTLE_MS, say);

  const api = useMemo(() => ({ announce, retract }), [announce, retract]);

  return (
    <FieldVoiceContext value={api}>
      {children}
      <Announcement text={voice.said} failed={false} />
    </FieldVoiceContext>
  );
}

export function useRequiredVoice(missing: boolean, spoken: string | null) {
  const voice = use(FieldVoiceContext);

  useEffect(() => {
    return () => {
      if (missing && spoken !== null && voice !== null) voice.retract(spoken);
    };
  }, [missing, spoken, voice]);

  return useCallback(
    (empty: boolean) => {
      if (empty && !missing && spoken !== null && voice !== null) voice.announce(spoken);
    },
    [missing, spoken, voice],
  );
}
