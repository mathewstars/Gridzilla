// Every outside address the site points at, in one place (the live domain and the public repo).
export const LINKS = {
  console: "https://gridzilla.victronlab.sk/static/new/index.html#/",
  deck: "https://gridzilla.victronlab.sk/static/new/pitch.html",
  pdf: "https://gridzilla.victronlab.sk/static/new/pitch.pdf",
  board: "https://gridzilla.victronlab.sk/static/board.html",
  repo: "https://github.com/mathewstars/Gridzilla",
  protocol: "https://github.com/mathewstars/Gridzilla/blob/main/protocol/PROTOCOL.md",
  architecture: "https://github.com/mathewstars/Gridzilla/blob/main/docs/architecture.html",
  mail: "mailto:stafurik@gmail.com",
} as const;

/** A file in public/, under the site's base (/static/site/). */
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\//, "")}`;
