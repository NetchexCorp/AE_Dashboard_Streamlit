import { api } from "./client";

export type Role = "admin" | "user";

export interface MeResponse {
  email: string;
  role: Role;
  source: "dev" | "entra";
  flags: {
    soql_writes_enabled: boolean;
    scheduler_tz: string;
  };
  features: {
    riaas: boolean;
  };
}

export function fetchMe(): Promise<MeResponse> {
  return api<MeResponse>("/api/me");
}
