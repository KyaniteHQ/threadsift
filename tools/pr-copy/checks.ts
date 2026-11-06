import { loginCheck } from "./check-login.ts";
import { inOrder, requireIdleCopy } from "./check-measure.ts";
import { writeReport } from "./check-report.ts";
import { type CheckOptions, type Run, withRun } from "./check-run.ts";
import { BODIES, ORDER } from "./check-scenarios.ts";
import { type ScenarioResult, conclude } from "./check-types.ts";
import { type Copy, logIn } from "./copy-client.ts";
import { requiredEnv } from "./env.ts";

async function runScenarios(
  run: Readonly<Run>,
  options: Readonly<CheckOptions>,
): Promise<ScenarioResult[]> {
  let copy: Copy | undefined;
  const results: ScenarioResult[] = [];

  if (options.scenarios.includes("login")) {
    results.push(
      await conclude("login", async (findings) => {
        copy = await loginCheck(run, findings);
      }),
    );
  }

  const signedIn =
    copy ?? (await logIn({ url: run.url, retryUntil: 0 }, requiredEnv("DEMO_OWNER_PASSWORD")));

  await requireIdleCopy(run, signedIn);

  const selected = ORDER.filter((name) => options.scenarios.includes(name));

  return [
    ...results,
    ...(await inOrder(selected, (scenario) =>
      conclude(scenario, (findings) => BODIES[scenario](run, signedIn, findings)),
    )),
  ];
}

export function runChecks(options: Readonly<CheckOptions>, out: string): Promise<boolean> {
  return withRun(options, async (run) => {
    const results = await runScenarios(run, options);
    writeReport(out, run, results);

    return results.every((result) => result.verdict === "pass");
  });
}
