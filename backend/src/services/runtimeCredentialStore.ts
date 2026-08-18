/**
 * Credentials injected by the Tauri runtime. This intentionally has no disk
 * backing: durable desktop secrets live in Windows Credential Manager, while
 * the backend retains them only for the life of its loopback process.
 */
class RuntimeCredentialStore {
  private readonly credentials = new Map<string, string>();

  set(profileId: string, secret: string): void { this.credentials.set(profileId, secret); }
  get(profileId: string | undefined): string | undefined { return profileId ? this.credentials.get(profileId) : undefined; }
  has(profileId: string): boolean { return this.credentials.has(profileId); }
  delete(profileId: string): void { this.credentials.delete(profileId); }
}

export const runtimeCredentialStore = new RuntimeCredentialStore();
