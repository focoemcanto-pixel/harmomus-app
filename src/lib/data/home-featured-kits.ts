import { getAdminSettings, saveAdminSettings } from "@/lib/data/admin-settings";

export type HomeFeaturedKit = {
  id: string;
  kit_id: string;
  order_index: number;
  active: boolean;
};

function normalizeKitIds(kitIds: string[], limit = 5) {
  return Array.from(new Set(kitIds.map((id) => id.trim()).filter(Boolean))).slice(0, limit);
}

export async function getPublicHomeFeaturedKitIds(limit = 5): Promise<string[]> {
  const settings = await getAdminSettings();
  return normalizeKitIds(settings.home.featuredKitIds ?? [], limit);
}

export async function getAdminHomeFeaturedKits(): Promise<HomeFeaturedKit[]> {
  const settings = await getAdminSettings();
  return normalizeKitIds(settings.home.featuredKitIds ?? [], 5).map((kitId, index) => ({
    id: `${index + 1}-${kitId}`,
    kit_id: kitId,
    order_index: index + 1,
    active: true,
  }));
}

export async function replaceHomeFeaturedKits(kitIds: string[]) {
  const settings = await getAdminSettings();
  const uniqueKitIds = normalizeKitIds(kitIds, 5);
  await saveAdminSettings({
    ...settings,
    home: {
      ...settings.home,
      featuredKitIds: uniqueKitIds,
    },
  });
}
