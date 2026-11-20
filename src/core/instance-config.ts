export interface InstanceConfig {
  readonly setupCode: string | undefined;
  readonly resetCode: string | undefined;
  readonly publicOrigin: string | null;
}
