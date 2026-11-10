/* The AI stack used to be /markets?view=stack, beside a watchlist. It is the whole Markets page now, so an old link
   drops the view and keeps the rest, such as ?symbol=. */
export function canonicalMarketsPath(path: string) {
  const hashAt = path.indexOf("#");
  const beforeHash = hashAt === -1 ? path : path.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  if (queryAt === -1 || beforeHash.slice(0, queryAt).replace(/(.)\/+$/, "$1") !== "/markets") return path;
  const params = new URLSearchParams(beforeHash.slice(queryAt));
  if (!params.has("view")) return path;
  params.delete("view");
  const search = params.toString();
  return `${beforeHash.slice(0, queryAt)}${search ? `?${search}` : ""}${hashAt === -1 ? "" : path.slice(hashAt)}`;
}
