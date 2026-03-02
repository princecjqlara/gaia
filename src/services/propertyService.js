function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isMissingColumnError(error, columnName) {
  if (!error || !columnName) return false;

  const message = String(error.message || error.details || "");
  if (!message) return false;

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
  const { data, error } = await executePropertyUpsert(supabase, payload);
  if (!error) return data;

  if (!Object.prototype.hasOwnProperty.call(payload || {}, "created_by")) {
    throw error;
  }

  if (!isMissingColumnError(error, "created_by")) {
    throw error;
  }

  const { created_by, ...retryPayload } = payload;
  void created_by;

  const { data: retryData, error: retryError } = await executePropertyUpsert(
    supabase,
    retryPayload,
  );

  if (retryError) throw retryError;
  return retryData;
}
