import {
  isMissingColumnError,
  upsertPropertyWithCreatedByFallback,
} from "../services/propertyService";

function createSupabaseMock(results) {
  const payloads = [];

  const upsert = jest.fn((payload) => {
    payloads.push(payload);
    const next = results.shift() || { data: null, error: null };

    return {
      select: () => ({
        single: async () => next,
      }),
    };
  });

  return {
    payloads,
    upsert,
    client: {
      from: jest.fn(() => ({ upsert })),
    },
  };
}

describe("propertyService", () => {
  test("detects missing created_by column schema errors", () => {
    expect(
      isMissingColumnError(
        { message: "Could not find the 'created_by' column of 'properties' in the schema cache" },
        "created_by",
      ),
    ).toBe(true);

    expect(
      isMissingColumnError(
        { message: "duplicate key value violates unique constraint" },
        "created_by",
      ),
    ).toBe(false);
  });

  test("retries property upsert without created_by when schema is missing the column", async () => {
    const { client, upsert, payloads } = createSupabaseMock([
      {
        data: null,
        error: {
          message: "Could not find the 'created_by' column of 'properties' in the schema cache",
        },
      },
      {
        data: { id: "p_1", title: "Sample" },
        error: null,
      },
    ]);

    const result = await upsertPropertyWithCreatedByFallback(client, {
      id: undefined,
      title: "Sample",
      created_by: "user_1",
    });

    expect(result.id).toBe("p_1");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(payloads[0].created_by).toBe("user_1");
    expect(payloads[1].created_by).toBeUndefined();
  });

  test("throws original error when failure is unrelated to created_by", async () => {
    const { client, upsert } = createSupabaseMock([
      {
        data: null,
        error: {
          message: "row level security policy violation",
        },
      },
    ]);

    await expect(
      upsertPropertyWithCreatedByFallback(client, {
        title: "Sample",
        created_by: "user_1",
      }),
    ).rejects.toMatchObject({ message: "row level security policy violation" });

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  test("retries property upsert without primary_media_type when schema is missing the column", async () => {
    const { client, upsert, payloads } = createSupabaseMock([
      {
        data: null,
        error: {
          message: "Could not find the 'primary_media_type' column of 'properties' in the schema cache",
        },
      },
      {
        data: { id: "p_2", title: "Sample 2" },
        error: null,
      },
    ]);

    const result = await upsertPropertyWithCreatedByFallback(client, {
      id: undefined,
      title: "Sample 2",
      primary_media_type: "image",
      created_by: "user_1",
    });

    expect(result.id).toBe("p_2");
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(payloads[0].primary_media_type).toBe("image");
    expect(payloads[1].primary_media_type).toBeUndefined();
    expect(payloads[1].created_by).toBe("user_1");
  });

  test("retries multiple times when more than one optional column is missing", async () => {
    const { client, upsert, payloads } = createSupabaseMock([
      {
        data: null,
        error: {
          message: "Could not find the 'primary_media_type' column of 'properties' in the schema cache",
        },
      },
      {
        data: null,
        error: {
          message: "Could not find the 'created_by' column of 'properties' in the schema cache",
        },
      },
      {
        data: { id: "p_3", title: "Sample 3" },
        error: null,
      },
    ]);

    const result = await upsertPropertyWithCreatedByFallback(client, {
      title: "Sample 3",
      primary_media_type: "video",
      created_by: "user_1",
    });

    expect(result.id).toBe("p_3");
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(payloads[1].primary_media_type).toBeUndefined();
    expect(payloads[1].created_by).toBe("user_1");
    expect(payloads[2].created_by).toBeUndefined();
  });
});
