let loading: Promise<typeof import("./PostText.tsx")> | null = null;

export function postTextModule(): Promise<typeof import("./PostText.tsx")> {
  loading ??= import("./PostText.tsx");

  return loading;
}
