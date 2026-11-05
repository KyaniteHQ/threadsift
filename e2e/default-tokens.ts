/* oxlint-disable max-lines-per-function -- page.evaluate serialises this one function, so its helpers must sit inside it */
interface DefaultsInput {
  attribute: string;
  default: string;
  options: string[];
}

interface DefaultsResult {
  violations: string[];
  changingTokens: string[];
}

export function checkDefaults(settings: readonly DefaultsInput[]): Promise<DefaultsResult> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";

    const sheets = [...document.querySelectorAll('link[rel="stylesheet"], style')]
      .map((node) => node.outerHTML)
      .join("");

    frame.srcdoc = `<!doctype html><html><head>${sheets}</head><body></body></html>`;
    frame.addEventListener("load", () => {
      const blank = frame.contentDocument;
      const view = frame.contentWindow;
      const result: DefaultsResult = { violations: [], changingTokens: [] };

      if (blank === null || view === null) {
        resolve({ violations: ["the blank document did not load"], changingTokens: [] });

        return;
      }

      const tokensOf = (attribute: string, id: string | null): Map<string, string> => {
        const probe = blank.createElement("div");

        if (id !== null) {
          probe.setAttribute(attribute, id);
        }

        blank.body.append(probe);
        const style = view.getComputedStyle(probe);
        const names = [...style].filter((name) => name.startsWith("--"));
        const values = new Map(names.map((name) => [name, style.getPropertyValue(name).trim()]));
        probe.remove();

        return values;
      };

      for (const { attribute, default: chosen, options } of settings) {
        const bare = tokensOf(attribute, null);

        for (const id of options) {
          const drawn = tokensOf(attribute, id);
          const names = new Set([...bare.keys(), ...drawn.keys()]);
          const differs = [...names].filter((name) => drawn.get(name) !== bare.get(name));

          if (id === chosen && differs.length > 0) {
            result.violations.push(
              `${attribute}="${id}" is the default but differs from no attribute in ${differs.join(", ")}`,
            );
          }

          if (id !== chosen && differs.length > 0 && !result.changingTokens.includes(attribute)) {
            result.changingTokens.push(attribute);
          }
        }
      }

      frame.remove();
      resolve(result);
    });

    document.body.append(frame);
  });
}
