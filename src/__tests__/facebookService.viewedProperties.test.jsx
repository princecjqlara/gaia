import { facebookService } from "../services/facebookService";
import { getSupabaseClient } from "../services/supabase";

jest.mock("../services/supabase", () => ({
  getSupabaseClient: jest.fn(),
}));

const buildSupabaseMock = ({ data, error = null }) => {
  const range = jest.fn().mockResolvedValue({ data, error });
  const order = jest.fn(() => ({ range }));
  const or = jest.fn(() => ({ order }));
  const select = jest.fn(() => ({ or }));
  const from = jest.fn(() => ({ select }));
  return { from, select, or, order, range };
};

describe("facebookService.getViewedProperties", () => {
  test("returns normalized items and hasMore", async () => {
    const viewsData = [
      {
        property_id: "p1",
        created_at: "2026-02-13T10:00:00.000Z",
        gallery_viewed: true,
        properties: {
          id: "p1",
          title: "Modern Zen Villa",
          price: "35000000",
          images: ["https://example.com/p1.jpg"],
          address: "Alfonso, Cavite",
          bedrooms: 3,
          bathrooms: 2,
        },
      },
    ];

    const supabaseMock = buildSupabaseMock({ data: viewsData });
    getSupabaseClient.mockReturnValue({ from: supabaseMock.from });

    const result = await facebookService.getViewedProperties(
      "pid-1",
      "John Doe",
      { page: 1, pageSize: 1 },
    );

    expect(supabaseMock.from).toHaveBeenCalledWith("property_views");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "p1",
      title: "Modern Zen Villa",
      price: "35000000",
      image: "https://example.com/p1.jpg",
      bedrooms: 3,
      bathrooms: 2,
      viewedAt: "2026-02-13T10:00:00.000Z",
      viewedGallery: true,
    });
    expect(result.hasMore).toBe(true);
  });

  test("returns empty when no identifiers", async () => {
    const result = await facebookService.getViewedProperties("", "", {
      page: 1,
      pageSize: 10,
    });
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
