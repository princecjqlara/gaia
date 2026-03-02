function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getErrorMessage(error) {
  return String(error?.message || error?.details || "");
}

function extractMissingColumnName(error) {
  const message = getErrorMessage(error);
  if (!message) return null;

  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]([^'"]+)['"] does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function isMissingColumnError(error, columnName) {
  if (!error || !columnName) return false;

  const message = getErrorMessage(error);
  if (!message) return false;

  const parsedColumn = extractMissingColumnName(error);
  if (parsedColumn) {
    return parsedColumn.toLowerCase() === String(columnName).toLowerCase();
  }

  const escapedColumn = escapeRegex(columnName);
  const patterns = [
    new RegExp(`Could not find the ['\"]${escapedColumn}['\"] column`, "i"),
    new RegExp(`column ['\"]${escapedColumn}['\"] does not exist`, "i"),
    new RegExp(`schema cache.*${escapedColumn}`, "i"),
  ];

  return patterns.some((pattern) => pattern.test(message));
}

async function executePropertyUpsert(supabase, payload) {
  return supabase
    .from("properties")
    .upsert(payload)
    .select()
    .single();
}

export async function upsertPropertyWithCreatedByFallback(supabase, payload) {
  let nextPayload = { ...(payload || {}) };
  const removedColumns = new Set();
  const maxRetries = Math.max(Object.keys(nextPayload).length, 1);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const { data, error } = await executePropertyUpsert(supabase, nextPayload);
    if (!error) return data;

    const missingColumn = extractMissingColumnName(error);
    if (!missingColumn) {
      throw error;
    }

    if (!Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      throw error;
    }

    if (removedColumns.has(missingColumn)) {
      throw error;
    }

    removedColumns.add(missingColumn);
    const { [missingColumn]: omittedColumn, ...retryPayload } = nextPayload;
    void omittedColumn;
    nextPayload = retryPayload;
  }

  throw new Error("Property upsert fallback exceeded retry limit");
}
