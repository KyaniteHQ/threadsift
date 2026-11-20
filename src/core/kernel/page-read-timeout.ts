export class PageReadTimeout extends Error {
  constructor() {
    super("the page was not read before the deadline");
  }
}
