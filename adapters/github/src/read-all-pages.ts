const PER_PAGE = 100;

// every item of a paged GitHub list: it asks for full pages until one comes back short
export async function readAllPages<Item>(
  readPage: (page: number, perPage: number) => Promise<readonly Item[]>,
): Promise<Item[]> {
  const items: Item[] = [];

  for (let page = 1; ; page += 1) {
    const batch = await readPage(page, PER_PAGE);

    items.push(...batch);

    if (batch.length < PER_PAGE) {
      return items;
    }
  }
}
