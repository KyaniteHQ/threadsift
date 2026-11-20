import { isRedditOrXLink, statusIdOf } from "../../../core/contract/links.ts";
import { isXImageUrl } from "../../../core/contract/x-images.ts";
import type { ClaimedJob, JobPorts } from "../../../core/kernel/job-outcome.ts";
import { scanMarkdown } from "../../../core/kernel/markdown-images.ts";
import { type ImageRules, type MediaRowValue, prepareMedia } from "./article-images.ts";
import type { Concluded, Content } from "./details.ts";

const X_ORIGIN = "https://x.com/";

const ARTICLE_IMAGE_RULES: ImageRules = { stopAt: isRedditOrXLink, unsaved: null };

const X_PHOTO_RULES: ImageRules = {
  stopAt: (address) => !isXImageUrl(address),
  unsaved: "A photo was not saved.",
};

interface StoredMedia {
  readonly fetched: Concluded;
  readonly rows: readonly MediaRowValue[];
  readonly written: readonly string[];
}

type Found = Extract<Concluded, { status: "ok" }>;

interface PostTextPlan {
  readonly postText: string;
  readonly rows: readonly MediaRowValue[];
  readonly written: readonly string[];
}

const nothing = (fetched: Concluded): StoredMedia => ({ fetched, rows: [], written: [] });

function withContent(
  fetched: Readonly<Found>,
  content: Readonly<Content>,
  { rows, written }: Readonly<PostTextPlan>,
): StoredMedia {
  return { fetched: { ...fetched, found: { ...fetched.found, content } }, rows, written };
}

async function storeThreadMedia(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Found>,
  content: Readonly<Extract<Content, { kind: "thread" }>>,
  deadline: AbortSignal,
): Promise<StoredMedia> {
  const { postText } = content.thread;

  if (postText === null || statusIdOf(job.address) === null) return nothing(fetched);

  const images = scanMarkdown(postText, false).images.filter(({ destination }) =>
    isXImageUrl(destination),
  );

  if (images.length === 0) return nothing(fetched);

  const plan = await prepareMedia(
    ports,
    job.imagePrefix,
    { postText, videos: [], images, url: X_ORIGIN, rules: X_PHOTO_RULES },
    deadline,
  );

  return withContent(
    fetched,
    { ...content, thread: { ...content.thread, postText: plan.postText } },
    plan,
  );
}

export async function storeMedia(
  ports: JobPorts,
  job: Readonly<ClaimedJob>,
  fetched: Readonly<Concluded>,
  deadline: AbortSignal,
): Promise<StoredMedia> {
  const content = fetched.status === "ok" ? fetched.found.content : null;

  if (fetched.status !== "ok" || content === null) return nothing(fetched);

  if (content.kind === "thread") return storeThreadMedia(ports, job, fetched, content, deadline);

  if (content.kind !== "article" && content.kind !== "page") return nothing(fetched);

  const plan = await prepareMedia(
    ports,
    job.imagePrefix,
    { ...content, rules: ARTICLE_IMAGE_RULES },
    deadline,
  );

  return withContent(fetched, { ...content, postText: plan.postText }, plan);
}
