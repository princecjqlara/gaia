export const normalizeHighlightMedia = (media = []) => {
  const normalizedMedia = Array.isArray(media) ? media : media == null ? [] : [media];

  const normalized = normalizedMedia
    .map((item) => {
      if (typeof item === 'string') {
        return { url: item.trim(), type: 'image' };
      }

      if (!item || typeof item !== 'object') return null;

      const url = (item.url ?? item.src ?? item.path ?? '').trim();
      const rawType = item.type ?? item.media_type ?? '';
      const type = typeof rawType === 'string' ? rawType.toLowerCase() : '';
      const normalizedItem = { url, type };

      if (item.position != null) {
        normalizedItem.position = item.position;
      }

      return normalizedItem;
    })
    .filter((item) => (item && typeof item.url === 'string' ? item.url.length > 0 : false));

  return normalized
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(({ position, ...rest }) => rest);
};

export const normalizeHighlights = (highlights = []) => {
  if (!Array.isArray(highlights)) return [];

  let nextIndex = 1;

  return highlights.reduce((accumulator, section) => {
    if (!section || typeof section !== 'object') return accumulator;

    const rawTitle = typeof section.title === 'string' ? section.title.trim() : '';
    const media = normalizeHighlightMedia(section.media);

    if (!rawTitle && media.length === 0) return accumulator;

    const trimmedId = typeof section.id === 'string' ? section.id.trim() : '';
    const id = trimmedId.length > 0 ? trimmedId : `highlight-${nextIndex}`;
    const title = rawTitle || `Highlight ${nextIndex}`;

    accumulator.push({ ...section, id, title, media });
    nextIndex += 1;

    return accumulator;
  }, []);
};
