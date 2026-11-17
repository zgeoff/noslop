export function toPage<Item>(request: Request, items: readonly Item[]): Item[] {
  const search = new URL(request.url).searchParams;

  const page = Number(search.get('page') ?? '1');
  const perPage = Number(search.get('per_page') ?? '30');

  return items.slice((page - 1) * perPage, page * perPage);
}
