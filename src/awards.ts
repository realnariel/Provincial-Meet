import type { AppData } from './App'
import type { EventAward, Medal, MeetEvent } from './types'

export const MEDALS: Medal[] = ['Gold', 'Silver', 'Bronze']

export function eventAwards(data: AppData, event: MeetEvent, medal?: Medal): EventAward[] {
  return data.awards
    .filter(award => award.event_id === event.id && (!medal || award.medal === medal))
    .sort((a, b) => MEDALS.indexOf(a.medal) - MEDALS.indexOf(b.medal) || a.sort_order - b.sort_order)
}

export function awardTeamNames(data: AppData, event: MeetEvent, medal: Medal, acronym = false): string {
  const names = eventAwards(data, event, medal).map(award => {
    const team = data.teams.find(item => item.id === award.team_id)
    return team ? (acronym ? team.acronym : team.name) : 'Unknown team'
  })
  return names.length ? names.join(', ') : '—'
}
