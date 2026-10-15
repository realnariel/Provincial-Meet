import { requireSupabase } from "./supabase";
import type {
  Coordinator,
  MedalRow,
  MeetEvent,
  Qualifier,
  Team,
} from "./types";

const PAGE_SIZE = 1000;

async function readAll<T>(
  table: string,
  columns = "*",
  order = "id",
): Promise<T[]> {
  const db = requireSupabase();
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order(order)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function loadPublicData() {
  const [teams, events, tallies] = await Promise.all([
    readAll<Team>("prov_teams"),
    readAll<MeetEvent>("prov_events"),
    readAll<MedalRow>("prov_medal_tallies", "*", "teamid"),
  ]);
  return { teams, events, tallies };
}

export async function loadCoordinators(): Promise<Coordinator[]> {
  return readAll<Coordinator>(
    "prov_coordinators",
    "id,username,fullname,is_admin,auth_user_id,must_change_password",
  );
}

export async function loadQualifiers(): Promise<Qualifier[]> {
  return readAll<Qualifier>("prov_qualifiers");
}

export async function saveEvent(
  event: Partial<MeetEvent> & Pick<MeetEvent, "title" | "division">,
) {
  const db = requireSupabase();
  const payload = {
    title: event.title.trim(),
    sport_name: event.sport_name?.trim() || null,
    sport_category: event.sport_category?.trim() || null,
    event_category: event.event_category?.trim() || null,
    division: event.division,
    coordinatorid: event.coordinatorid ?? null,
    status: event.status ?? "Pending",
  };
  const query = event.id
    ? db.from("prov_events").update(payload).eq("id", event.id)
    : db.from("prov_events").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function removeEvent(id: number) {
  const { error } = await requireSupabase()
    .from("prov_events")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function saveResult(
  event: MeetEvent,
  result: Pick<
    MeetEvent,
    | "goldteamid"
    | "silverteamid"
    | "bronzeteamid"
    | "gold_winner_name"
    | "silver_winner_name"
    | "bronze_winner_name"
    | "status"
  >,
  _username: string,
) {
  const ids = [
    result.goldteamid,
    result.silverteamid,
    result.bronzeteamid,
  ].filter((id): id is number => id !== null);
  if (new Set(ids).size !== ids.length)
    throw new Error(
      "A team cannot receive more than one medal in the same event.",
    );
  const { error } = await requireSupabase().rpc("prov_publish_result", {
    p_event_id: event.id,
    p_gold_team_id: result.goldteamid,
    p_silver_team_id: result.silverteamid,
    p_bronze_team_id: result.bronzeteamid,
    p_gold_winner_name: result.gold_winner_name,
    p_silver_winner_name: result.silver_winner_name,
    p_bronze_winner_name: result.bronze_winner_name,
  });
  if (error) throw error;
}

export async function clearResult(id: number) {
  const { error } = await requireSupabase().rpc("prov_clear_result", {
    p_event_id: id,
  });
  if (error) throw error;
}

export async function saveQualifier(
  qualifier: Partial<Qualifier> &
    Pick<Qualifier, "event_id" | "participant_name">,
) {
  const db = requireSupabase();
  const { data: userData } = await db.auth.getUser();
  const payload = {
    event_id: qualifier.event_id,
    participant_name: qualifier.participant_name.trim(),
    role: qualifier.role || "Athlete",
    team: qualifier.team || null,
    specific_district: qualifier.specific_district || null,
    school: qualifier.school || null,
    gender: qualifier.gender || null,
    tshirt_size: qualifier.tshirt_size || null,
    updated_by: userData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  };
  const query = qualifier.id
    ? db.from("prov_qualifiers").update(payload).eq("id", qualifier.id)
    : db.from("prov_qualifiers").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function removeQualifier(id: string) {
  const { error } = await requireSupabase()
    .from("prov_qualifiers")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function bulkAddQualifiers(
  eventId: number,
  names: string[],
  fields: Pick<
    Qualifier,
    "role" | "team" | "specific_district" | "school" | "gender" | "tshirt_size"
  >,
) {
  const db = requireSupabase();
  const { data: userData } = await db.auth.getUser();
  const cleaned = [
    ...new Map(
      names
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  ];
  if (!cleaned.length) throw new Error("Enter at least one participant name.");
  const { error } = await db.from("prov_qualifiers").insert(
    cleaned.map((participant_name) => ({
      event_id: eventId,
      participant_name,
      ...fields,
      updated_by: userData.user?.id ?? null,
    })),
  );
  if (error) throw error;
}

export async function bulkDeleteQualifiers(ids: string[]) {
  if (!ids.length) return;
  const { error } = await requireSupabase()
    .from("prov_qualifiers")
    .delete()
    .in("id", ids);
  if (error) throw error;
}
