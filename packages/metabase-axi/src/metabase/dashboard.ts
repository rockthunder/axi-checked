import type { MetabaseClient } from "./client.js";
import { normalizeList } from "./server.js";

export interface DashCard {
  id?: number;
  card_id?: number | null;
  card?: { name?: string; display?: string } | null;
  dashboard_tab_id?: number | null;
}

export interface DashParameter {
  name?: string;
  slug?: string;
  type?: string;
}

export interface DashTab {
  id: number;
  name: string;
}

export interface Dashboard {
  id: number;
  name: string;
  description?: string | null;
  collection_id?: number | null;
  collection?: { name?: string } | null;
  dashcards?: DashCard[];
  ordered_cards?: DashCard[];
  parameters?: DashParameter[];
  tabs?: DashTab[];
  updated_at?: string;
}

export async function listDashboards(client: MetabaseClient): Promise<Dashboard[]> {
  return normalizeList<Dashboard>(await client.get("/api/dashboard"));
}

export async function getDashboard(client: MetabaseClient, id: number): Promise<Dashboard> {
  return client.get<Dashboard>(`/api/dashboard/${id}`);
}

/** Dashcards live under `dashcards` (newer) or `ordered_cards` (older) across versions. */
export function dashcardsOf(dash: Dashboard): DashCard[] {
  return dash.dashcards ?? dash.ordered_cards ?? [];
}
