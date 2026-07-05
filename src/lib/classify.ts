// M8 R1: best-effort auto-classification of a custom exercise's muscles from its name, over the
// 17-muscle catalog vocabulary (src/lib/muscles.ts). A keyword→muscles alias table, most-specific
// first (so "leg curl" hits hamstrings before the generic "curl"→biceps). The result only SEEDS the
// create form — the user edits it — so an imperfect guess is fine (AI inference is a later M9 step).

type Hit = { primary: string[]; secondary?: string[] }

const RULES: [RegExp, Hit][] = [
  [/hip\s*thrust|glute\s*bridge/, { primary: ['glutes'], secondary: ['hamstrings'] }],
  [/deadlift|\brdl\b|romanian/, { primary: ['hamstrings'], secondary: ['glutes', 'lower back'] }],
  [/squat|leg\s*press|lunge|split\s*squat/, { primary: ['quadriceps'], secondary: ['glutes', 'hamstrings'] }],
  [/leg\s*curl|hamstring\s*curl/, { primary: ['hamstrings'] }],
  [/leg\s*extension/, { primary: ['quadriceps'] }],
  [/calf|calve|toe\s*raise/, { primary: ['calves'] }],
  [/bench|chest\s*(press|fly|flye)|pec\s*deck|push[-\s]?up|\bdip/, { primary: ['chest'], secondary: ['triceps', 'shoulders'] }],
  [/lat\s*pulldown|pull[-\s]?up|chin[-\s]?up|\brow\b|pulldown/, { primary: ['lats'], secondary: ['biceps', 'middle back'] }],
  [/shrug/, { primary: ['traps'] }],
  [/lateral\s*raise|shoulder\s*press|overhead\s*press|\bohp\b|military\s*press|delt|arnold/, { primary: ['shoulders'] }],
  [/tricep|skull\s*crusher|pushdown|kickback|close[-\s]?grip/, { primary: ['triceps'] }],
  [/curl/, { primary: ['biceps'] }], // after leg curl
  [/wrist|forearm/, { primary: ['forearms'] }],
  [/adductor|inner\s*thigh/, { primary: ['adductors'] }],
  [/abductor|hip\s*abduction|outer\s*thigh/, { primary: ['abductors'] }],
  [/crunch|sit[-\s]?up|plank|oblique|\bab\b|\babs\b|core|leg\s*raise/, { primary: ['abdominals'] }],
  [/neck/, { primary: ['neck'] }],
]

/** Guess {primary, secondary} muscles from a free-text exercise name; empty arrays if no rule matches. */
export function classify(name: string): { primary: string[]; secondary: string[] } {
  const n = name.toLowerCase()
  for (const [re, hit] of RULES) {
    if (re.test(n)) return { primary: hit.primary, secondary: hit.secondary ?? [] }
  }
  return { primary: [], secondary: [] }
}
