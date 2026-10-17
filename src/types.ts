export type Division = 'Elementary' | 'Secondary' | 'Paragames'
export type EventStatus = 'Pending' | 'Completed'

export interface Team {
  id: number
  name: string
  acronym: string
}

export interface MeetEvent {
  id: number
  title: string
  sport_name: string | null
  sport_category: string | null
  event_category: string | null
  division: Division
  status: EventStatus
  coordinatorid: number | null
  goldteamid: number | null
  silverteamid: number | null
  bronzeteamid: number | null
  gold_winner_name: string | null
  silver_winner_name: string | null
  bronze_winner_name: string | null
  createdat: string
  updatedat: string | null
  last_updated_by: string | null
}

export interface Coordinator {
  id: number
  username: string
  fullname: string
  is_admin: boolean
  auth_user_id: string
  must_change_password: boolean
}

export interface Qualifier {
  id: string
  event_id: number
  participant_name: string
  role: string | null
  team: string | null
  specific_district: string | null
  school: string | null
  gender: string | null
  tshirt_size: string | null
  updated_by: string | null
  updated_at: string
}

export interface MedalRow {
  teamid: number
  division: Division
  gold: number
  silver: number
  bronze: number
}

export type DivisionFilter = Division | 'Overall'

export const DIVISIONS: Division[] = ['Secondary', 'Elementary', 'Paragames']
export const SPORTS_CATEGORIES = ['Boys', 'Girls', 'Mixed']

export function winnerNames(value: string | null): string[] {
  const seen = new Set<string>()
  return (value ?? '').split(/\r?\n/).map(name => name.trim().replace(/\s+/g, ' '))
    .filter(name => {
      const key = name.toLowerCase()
      if (!name || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function compareMedals(a: { gold: number; silver: number; bronze: number }, b: { gold: number; silver: number; bronze: number }) {
  return b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
}
