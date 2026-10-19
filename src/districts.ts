import type { Team } from './types'

// District names: DepEd Bohol RMS, https://rms.depedbohol.org/reports
// CD grouping: DepEd Bohol, https://www.depedbohol.org/?page_id=26167
// Keep school districts (including North/South and I/II/III), not just municipalities.
export const DISTRICTS_BY_CD = {
  'CD 1': [
    'Alburquerque', 'Antequera', 'Baclayon', 'Balilihan', 'Calape',
    'Catigbian', 'Corella', 'Cortes', 'Dauis', 'Loon North', 'Loon South',
    'Maribojoc', 'Panglao', 'Sikatuna', 'Tubigon East', 'Tubigon West',
  ],
  'CD 2': [
    'Bien Unido', 'Buenavista I', 'Buenavista II', 'Clarin', 'Dagohoy',
    'Danao', 'Getafe I', 'Getafe II', 'Inabanga North', 'Inabanga South',
    'Pres. Carlos P. Garcia CPG', 'Sagbayan', 'San Isidro', 'San Miguel',
    'Talibon I', 'Talibon II', 'Trinidad I', 'Trinidad II',
    'Ubay I', 'Ubay II', 'Ubay III',
  ],
  'CD 3': [
    'Alicia', 'Anda', 'Batuan', 'Bilar', 'Candijay', 'Carmen I',
    'Carmen II', 'Carmen III', 'Dimiao', 'Duero', 'Garcia Hernandez',
    'Guindulman', 'Jagna', 'Lila', 'Loay', 'Loboc', 'Mabini', 'Pilar',
    'Sevilla', 'Sierra Bullones', 'Valencia',
  ],
} as const

export function districtsForTeam(teamName: string | null | undefined, teams: Team[]): readonly string[] | null {
  const team = teams.find(item => item.name === teamName || item.acronym === teamName)
  const acronym = team?.acronym as keyof typeof DISTRICTS_BY_CD | undefined
  return acronym && acronym in DISTRICTS_BY_CD ? DISTRICTS_BY_CD[acronym] : null
}
