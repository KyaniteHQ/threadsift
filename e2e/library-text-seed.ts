import type { FreshScreen } from "./fresh-screen.ts";
import { post, postUrl, run } from "./thread-fixtures.ts";
import { AUTHORED_DIGEST, comment, savedThread, threadJson } from "./threads.ts";

export const LONG_TOPIC =
  "A long Topic name about the history of reading rooms and their quiet lamps";

export const LONG_TAGS = [
  "A long Tag name about marginal notes in borrowed books",
  "Another long Tag name about bookbinding workshops",
  "A third long Tag name about night shelving",
] as const;

const FOREIGN_BODY = [
  "Кеширование в браузере: *курсивом* выделены важные места, а _это_ тоже наклонное.",
  "> Цитата, которую читают медленно: şişli çocuğun öğrettiği ğüzel ıspanak.",
  "İstanbul'da çağrışım yapan *İğneli ışık* ve **kalın Ş harfi**.",
].join("\n\n");

export async function seedForeignText(screen: FreshScreen): Promise<number> {
  const id = `f${run}`;

  const { item } = await savedThread(screen.context.request, {
    url: postUrl(id),
    content: threadJson(post(id, FOREIGN_BODY), [
      comment("f1", "автор_один", "Спасибо, это *полезно*: ışıklı çözüm işe yaradı."),
    ]),
    digest: {
      ...AUTHORED_DIGEST,
      title: "Кеширование и İstanbul'da ışık",
      topic: "Çağrışım и чтение",
      tags: ["Заметки", "Şiir"],
      summary: "Краткое изложение: *курсив* и şişli çözüm.",
      keyPoints: ["Первая мысль, İkinci düşünce."],
      keptComments: ["t1_f1"],
    },
  });

  return item.id;
}

export async function seedLongCatalog(screen: FreshScreen): Promise<void> {
  const id = `l${run}`;

  await savedThread(screen.context.request, {
    url: postUrl(id),
    content: threadJson(post(id, "A post body."), []),
    digest: { ...AUTHORED_DIGEST, topic: LONG_TOPIC, tags: LONG_TAGS, keptComments: [] },
  });
}
