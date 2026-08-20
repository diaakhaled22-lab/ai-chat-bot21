export type DynamicAiModel = {
  id: string;
  label: string;
  free: boolean;
};

export type AiModelCatalogResponse = {
  providers: Record<string, DynamicAiModel[]>;
  syncedAt: string | null;
};

export function mergeDynamicModels<T extends { value: string; label: string; free: boolean }>(
  staticModels: readonly T[],
  dynamicModels: DynamicAiModel[] | undefined,
): T[] {
  const merged = new Map<string, T>();
  staticModels.forEach((model) => merged.set(model.value, model));
  dynamicModels?.forEach((model) => {
    if (!merged.has(model.id)) {
      merged.set(model.id, {
        value: model.id,
        label: model.label,
        free: model.free,
      } as T);
    }
  });
  return [...merged.values()].sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}