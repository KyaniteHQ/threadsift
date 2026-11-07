export interface Page {
  readonly name: string;
  readonly url: string;
  readonly under: boolean;
  readonly sentence: string | null;
  readonly measuredBytes: number;
}

export const EXAMPLE: Page = {
  name: "example.com",
  url: "https://example.com/",
  under: true,
  sentence: null,
  measuredBytes: 577,
};

export const BREAD: Page = {
  name: "Bread",
  url: "https://en.wikipedia.org/wiki/Bread",
  under: true,
  sentence: "food product made from water",
  measuredBytes: 619_663,
};

export const BIRD: Page = {
  name: "Bird vocalization",
  url: "https://en.wikipedia.org/w/index.php?title=Bird_vocalization&oldid=1380253618",
  under: true,
  sentence: "are the sounds produced by birds that are melodious to the human ear.",
  measuredBytes: 866_784,
};

export const BEER: Page = {
  name: "Beer",
  url: "https://en.wikipedia.org/w/index.php?title=Beer&oldid=1382690225",
  under: true,
  sentence: "Beer is one of the oldest and most widely consumed alcoholic drinks in the world",
  measuredBytes: 903_288,
};

export const TALE_OF_TWO_CITIES: Page = {
  name: "A Tale of Two Cities",
  url: "https://www.gutenberg.org/files/98/98-h/98-h.htm",
  under: false,
  sentence: null,
  measuredBytes: 944_391,
};

export const UNRESOLVABLE = "https://threadsift-demo.invalid/";

export const SLOW_PAGE = "https://httpbin.org/drip?duration=10&numbytes=5&code=200";

export const CLOSED_REASONS: readonly string[] = ["timeout", "network", "gave-up"];
