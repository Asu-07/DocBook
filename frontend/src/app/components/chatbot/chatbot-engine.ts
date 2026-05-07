/**
 * Rule-based intent engine for the DocBook assistant.
 * No external APIs, no LLM. Pure keyword matching + entity extraction
 * against live data injected from ApiService.
 *
 * The bot never invents medical advice; it either restates known data or
 * hands the user off to an existing page.
 */

export type ChatRole = 'user' | 'bot';

export type ChatActionKind = 'route' | 'suggest' | 'external' | 'locate';

export interface ChatAction {
  /** Visible button label */
  label: string;
  kind: ChatActionKind;
  /** For 'route': '/doctors?region=Delhi'. For 'suggest': pre-canned user input. For 'external': URL. */
  payload: string;
}

export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
  actions?: ChatAction[];
  ts: number;
}

export interface BotContext {
  isLoggedIn: boolean;
  /** Live regions from /hospitals/regions */
  regions: string[];
  /** Live specialization list from doctor results */
  specializations: string[];
  /** Approximate counts to keep replies grounded in real seeded data */
  totals: { doctors: number; hospitals: number; appointments: number; regions: number } | null;
}

export interface BotReply {
  text: string;
  actions?: ChatAction[];
}

/** Local fallbacks if the API hasn't loaded yet — keeps the bot useful on first paint. */
export const FALLBACK_REGIONS = [
  'Ahmedabad', 'Bangalore', 'Chennai', 'Delhi', 'Hyderabad',
  'Jaipur', 'Kolkata', 'Lucknow', 'Mumbai', 'Pune',
];

export const FALLBACK_SPECIALIZATIONS = [
  'General Physician', 'Cardiologist', 'Dermatologist', 'Orthopedic Surgeon',
  'Neurologist', 'Pediatrician', 'Gynecologist', 'Dentist',
  'ENT Specialist', 'Ophthalmologist', 'Psychiatrist', 'Endocrinologist',
];

/** Words that should always trigger an emergency redirect, regardless of other context. */
const EMERGENCY_PATTERNS = [
  /\bemergency\b/, /\bambulance\b/, /\b911\b/, /\b112\b/, /\b118\b/,
  /\bchest\s*pain\b/, /\bheart\s*attack\b/, /\bstroke\b/,
  /\bbleeding\b/, /\bunconscious\b/, /\bdying\b/, /\bsuicid/,
  /\bcan'?t\s+breathe\b/, /\boverdose\b/, /\bseizure\b/,
];

/** Common informal terms → canonical specialization names. */
const SPECIALTY_SYNONYMS: Record<string, string> = {
  'heart': 'Cardiologist',
  'cardio': 'Cardiologist',
  'skin': 'Dermatologist',
  'derma': 'Dermatologist',
  'bone': 'Orthopedic Surgeon',
  'ortho': 'Orthopedic Surgeon',
  'joint': 'Orthopedic Surgeon',
  'brain': 'Neurologist',
  'nerve': 'Neurologist',
  'neuro': 'Neurologist',
  'kid': 'Pediatrician',
  'kids': 'Pediatrician',
  'child': 'Pediatrician',
  'baby': 'Pediatrician',
  'pediat': 'Pediatrician',
  'women': 'Gynecologist',
  "women's": 'Gynecologist',
  'gyn': 'Gynecologist',
  'tooth': 'Dentist',
  'teeth': 'Dentist',
  'dental': 'Dentist',
  'ent': 'ENT Specialist',
  'ear': 'ENT Specialist',
  'nose': 'ENT Specialist',
  'throat': 'ENT Specialist',
  'eye': 'Ophthalmologist',
  'vision': 'Ophthalmologist',
  'mind': 'Psychiatrist',
  'mental': 'Psychiatrist',
  'depress': 'Psychiatrist',
  'anxiety': 'Psychiatrist',
  'diabetes': 'Endocrinologist',
  'thyroid': 'Endocrinologist',
  'hormone': 'Endocrinologist',
  'lung': 'Pulmonologist',
  'asthma': 'Pulmonologist',
  'cough': 'Pulmonologist',
  'kidney': 'Nephrologist',
  'urin': 'Urologist',
  'stomach': 'Gastroenterologist',
  'gastric': 'Gastroenterologist',
  'liver': 'Gastroenterologist',
  'cancer': 'Oncologist',
  'tumor': 'Oncologist',
  'fever': 'General Physician',
  'cold': 'General Physician',
  'general': 'General Physician',
  'gp': 'General Physician',
};

export function normalize(input: string): string {
  return input.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Try to find a city/region mentioned in the input, against live + fallback list. */
export function extractRegion(input: string, ctx: BotContext): string | null {
  const text = normalize(input);
  const pool = ctx.regions.length ? ctx.regions : FALLBACK_REGIONS;
  for (const r of pool) {
    const needle = r.toLowerCase();
    // Word-ish match (avoids matching "delhi" inside another word)
    const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(text)) return r;
  }
  // Common alternate spellings
  if (/\bbengaluru\b/.test(text)) return 'Bangalore';
  if (/\bbombay\b/.test(text)) return 'Mumbai';
  if (/\bcalcutta\b/.test(text)) return 'Kolkata';
  if (/\bmadras\b/.test(text)) return 'Chennai';
  return null;
}

/** Try to identify a specialization either by direct match or via synonym. */
export function extractSpecialization(input: string, ctx: BotContext): string | null {
  const text = normalize(input);
  const pool = ctx.specializations.length ? ctx.specializations : FALLBACK_SPECIALIZATIONS;

  for (const spec of pool) {
    if (text.includes(spec.toLowerCase())) return spec;
    // Match base word like "Cardiologist" → also "cardio"
    const head = spec.toLowerCase().split(' ')[0];
    if (head.length > 4 && text.includes(head)) return spec;
  }
  for (const [needle, canonical] of Object.entries(SPECIALTY_SYNONYMS)) {
    if (text.includes(needle)) {
      // Only return if the canonical form actually exists in our pool, otherwise use the synonym anyway
      const inPool = pool.find((s) => s === canonical);
      if (inPool) return inPool;
      // Fall through to canonical even if not in pool (back-end has it; the API filter still works)
      return canonical;
    }
  }
  return null;
}

interface IntentDef {
  /** Lower priority numbers run first */
  priority: number;
  match: (input: string, ctx: BotContext) => boolean;
  build: (input: string, ctx: BotContext) => BotReply;
}

const INTENTS: IntentDef[] = [
  // 1. Emergency safety check — always wins
  {
    priority: 1,
    match: (input) => EMERGENCY_PATTERNS.some((re) => re.test(normalize(input))),
    build: () => ({
      text:
        "If this is a medical emergency, please call 118 or go to the nearest emergency room right away. " +
        'DocBook is for booking non-emergency appointments and cannot dispatch help.',
      actions: [
        { label: 'Call 118', kind: 'external', payload: 'tel:118' },
        { label: 'Find a doctor', kind: 'route', payload: '/doctors' },
      ],
    }),
  },

  // 2. Cancel / reschedule
  {
    priority: 10,
    match: (input) => /\bcancel\b|\breschedul/i.test(input),
    build: (_input, ctx) =>
      ctx.isLoggedIn
        ? {
            text:
              'You can cancel any pending or confirmed visit from your appointments page — open it, find the booking, and use the cancel button.',
            actions: [{ label: 'My appointments', kind: 'route', payload: '/my-appointments' }],
          }
        : {
            text: 'Sign in first and you\'ll see a cancel button next to every booking on your appointments page.',
            actions: [{ label: 'Sign in', kind: 'route', payload: '/login' }],
          },
  },

  // 3. Specialty + region together — most specific routing
  {
    priority: 20,
    match: (input, ctx) => !!extractSpecialization(input, ctx) && !!extractRegion(input, ctx),
    build: (input, ctx) => {
      const spec = extractSpecialization(input, ctx)!;
      const region = extractRegion(input, ctx)!;
      return {
        text: `Looking up ${spec} doctors in ${region}.`,
        actions: [
          {
            label: `Open ${spec} list in ${region}`,
            kind: 'route',
            payload: `/doctors?q=${encodeURIComponent(spec)}&region=${encodeURIComponent(region)}`,
          },
        ],
      };
    },
  },

  // 4. Specialty only
  {
    priority: 30,
    match: (input, ctx) => !!extractSpecialization(input, ctx),
    build: (input, ctx) => {
      const spec = extractSpecialization(input, ctx)!;
      return {
        text: `I can show you ${spec} doctors across all our partner hospitals. Want to narrow by city?`,
        actions: [
          { label: `Show ${spec} doctors`, kind: 'route', payload: `/doctors?q=${encodeURIComponent(spec)}` },
          { label: 'Pick a city first', kind: 'suggest', payload: 'list cities' },
        ],
      };
    },
  },

  // 4b. "Near me" / "around me" — trigger browser geolocation
  {
    priority: 35,
    match: (input) =>
      /\bnear\s+(?:me|by)\b|\bnearby\b|\baround\s+me\b|\b(?:current|my)\s+location\b|\bclose\s+to\s+me\b/i.test(input),
    build: (input, ctx) => {
      const spec = extractSpecialization(input, ctx);
      const label = spec ? `Find ${spec} doctors near me` : 'Find doctors near me';
      return {
        text: spec
          ? `I'll detect your city and pull up ${spec} doctors there. Allow location access when your browser asks.`
          : "I'll detect your city and show you doctors there. Allow location access when your browser asks.",
        actions: [
          { label, kind: 'locate', payload: spec ?? '' },
          { label: 'Pick a city instead', kind: 'suggest', payload: 'list cities' },
        ],
      };
    },
  },

  // 5. Region only — "doctors in Mumbai", "any doctor in Delhi"
  {
    priority: 40,
    match: (input, ctx) => !!extractRegion(input, ctx),
    build: (input, ctx) => {
      const region = extractRegion(input, ctx)!;
      return {
        text: `Showing doctors and partner hospitals in ${region}.`,
        actions: [
          { label: `Doctors in ${region}`, kind: 'route', payload: `/doctors?region=${encodeURIComponent(region)}` },
          { label: 'Book a visit', kind: 'route', payload: `/book-appointment?region=${encodeURIComponent(region)}` },
        ],
      };
    },
  },

  // 6. List cities / regions
  {
    priority: 50,
    match: (input) => /\bcit(?:y|ies)\b|\bregions?\b|\bwhere.*(?:operate|cover|available|serve)/i.test(input),
    build: (_input, ctx) => {
      const list = (ctx.regions.length ? ctx.regions : FALLBACK_REGIONS).join(', ');
      return {
        text: `DocBook currently has partner hospitals in ${list}. Tell me a city and I'll filter the doctor list for you.`,
        actions: (ctx.regions.length ? ctx.regions : FALLBACK_REGIONS)
          .slice(0, 4)
          .map((r) => ({ label: r, kind: 'suggest' as ChatActionKind, payload: `doctors in ${r}` })),
      };
    },
  },

  // 7. List specialties
  {
    priority: 60,
    match: (input) => /\bspecialt(?:y|ies)\b|\b(?:types?\s+of|kinds?\s+of)\s+doctors?\b|\bwhat.*doctors?\b/i.test(input),
    build: (_input, ctx) => {
      const pool = ctx.specializations.length ? ctx.specializations : FALLBACK_SPECIALIZATIONS;
      return {
        text: `We have ${pool.length} specializations on the platform — including ${pool.slice(0, 6).join(', ')} and more.`,
        actions: [{ label: 'Browse all doctors', kind: 'route', payload: '/doctors' }],
      };
    },
  },

  // 8. Book / schedule
  {
    priority: 70,
    match: (input) => /\bbook\b|\bschedul|\bappointment\b|\bvisit\b/i.test(input),
    build: (_input, ctx) =>
      ctx.isLoggedIn
        ? {
            text: 'Sure — I\'ll take you to the booking flow. Pick a city, hospital, doctor, then a slot.',
            actions: [{ label: 'Book a visit', kind: 'route', payload: '/book-appointment' }],
          }
        : {
            text: 'Booking needs a free patient account. Sign in or create one and I\'ll send you to the booking flow.',
            actions: [
              { label: 'Sign in', kind: 'route', payload: '/login' },
              { label: 'Create account', kind: 'route', payload: '/register' },
            ],
          },
  },

  // 9. My appointments / upcoming visits
  {
    priority: 80,
    match: (input) => /\bmy\b.*\bappointment|\bupcoming\b|\bmy\s+visits?\b|\bmy\s+bookings?\b/i.test(input),
    build: (_input, ctx) =>
      ctx.isLoggedIn
        ? {
            text: 'Here\'s your appointments page. You can see upcoming, past, and cancel anything still pending.',
            actions: [{ label: 'My appointments', kind: 'route', payload: '/my-appointments' }],
          }
        : {
            text: 'Sign in and you\'ll see a list of all your past and upcoming visits.',
            actions: [{ label: 'Sign in', kind: 'route', payload: '/login' }],
          },
  },

  // 10. Top doctors / best rated
  {
    priority: 90,
    match: (input) => /\btop[-\s]?(?:rated)?\b|\bbest\b|\bhighest\b.*\brat/i.test(input),
    build: () => ({
      text: 'Top-rated doctors are featured on the home page, sorted by patient ratings.',
      actions: [
        { label: 'Top doctors', kind: 'route', payload: '/#top-rated' },
        { label: 'Browse all', kind: 'route', payload: '/doctors' },
      ],
    }),
  },

  // 11. Login / register / account
  {
    priority: 100,
    match: (input) => /\b(?:log\s*in|sign\s*in|signin)\b/i.test(input),
    build: () => ({
      text: 'Pick the portal that matches your account — patients, doctors, and hospitals each have their own.',
      actions: [
        { label: 'Patient sign-in', kind: 'route', payload: '/login' },
        { label: 'Doctor portal', kind: 'route', payload: '/doctor/login' },
        { label: 'Hospital portal', kind: 'route', payload: '/hospital/login' },
      ],
    }),
  },
  {
    priority: 101,
    match: (input) => /\b(?:sign\s*up|register|create\s+account|new\s+account)\b/i.test(input),
    build: () => ({
      text:
        'Patient accounts are free. There are also separate sign-ups for doctors and hospitals — pick whichever fits.',
      actions: [
        { label: 'Patient sign-up', kind: 'route', payload: '/register' },
        { label: 'Doctor sign-up', kind: 'route', payload: '/doctor/register' },
        { label: 'Hospital portal', kind: 'route', payload: '/hospital/register' },
      ],
    }),
  },

  // 11b. Doctor portal mention
  {
    priority: 102,
    match: (input) => /\bdoctor\s+portal\b|\bdoctor\s+(?:sign[-\s]?in|login|account)\b/i.test(input),
    build: () => ({
      text: 'The doctor portal has its own sign-in — use it to manage your appointments and patient list.',
      actions: [
        { label: 'Doctor sign-in', kind: 'route', payload: '/doctor/login' },
        { label: 'Register as doctor', kind: 'route', payload: '/doctor/register' },
      ],
    }),
  },

  // 12. Pricing / cost
  {
    priority: 110,
    match: (input) => /\bcost\b|\bfee\b|\bprice\b|\bcharg|\bhow much|\bfree\b|\bpaid\b/i.test(input),
    build: () => ({
      text:
        'Using DocBook to find and book doctors is free. The actual consultation fee is set by each hospital and shown to you when you pick a slot.',
    }),
  },

  // 13. How does this work / help
  {
    priority: 120,
    match: (input) => /\bhow\b.*\b(?:work|book|use)|\bhelp\b|\bguide\b|\binstructions?\b/i.test(input),
    build: () => ({
      text:
        'Three steps: (1) pick a specialization or city, (2) choose a doctor and a time slot, (3) get a confirmation. Your appointments live on the dashboard once you sign in.',
      actions: [
        { label: 'Find a doctor', kind: 'route', payload: '/doctors' },
        { label: 'Book a visit', kind: 'route', payload: '/book-appointment' },
      ],
    }),
  },

  // 14. Stats / numbers
  {
    priority: 125,
    match: (input) => /\bhow many\b|\btotal\b|\bcount\b|\bnumbers?\b/i.test(input),
    build: (_input, ctx) => {
      if (!ctx.totals) {
        return { text: 'I\'m still loading the latest counts — try again in a second.' };
      }
      const t = ctx.totals;
      return {
        text: `Right now DocBook has ${t.doctors} doctors at ${t.hospitals} partner hospitals across ${t.regions} cities, with ${t.appointments} appointments booked through the platform.`,
        actions: [{ label: 'Browse doctors', kind: 'route', payload: '/doctors' }],
      };
    },
  },

  // 15. Hospitals
  {
    priority: 130,
    match: (input) => /\bhospitals?\b|\bclinics?\b|\bpartner/i.test(input),
    build: () => ({
      text: 'Partner hospitals are listed on the home page in the "Partner hospitals" section, and are filterable by city in the doctor browse.',
      actions: [
        { label: 'See partner hospitals', kind: 'route', payload: '/#partner-hospitals' },
        { label: 'Browse doctors', kind: 'route', payload: '/doctors' },
      ],
    }),
  },

  // 16. What can you do / capabilities
  {
    priority: 140,
    match: (input) =>
      /\bwho are you\b|\bwhat can you (?:do|help)\b|\bwhat do you do\b|\bhelp me\b$/i.test(input),
    build: () => ({
      text:
        'I\'m the DocBook assistant — I can find a doctor by specialty or city, walk you through booking, point you to your appointments, or list our partner hospitals. I won\'t give medical advice; for that you\'ll want to actually book a consultation.',
      actions: [
        { label: 'Find a doctor', kind: 'suggest', payload: 'find a cardiologist near me' },
        { label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' },
        { label: 'Book a visit', kind: 'suggest', payload: 'book an appointment' },
      ],
    }),
  },

  // 17. Greetings
  {
    priority: 200,
    match: (input) => /^(?:hi|hey|hello|yo|namaste|hola|good\s+(?:morning|afternoon|evening))\b/i.test(input.trim()),
    build: (_input, ctx) => ({
      text: ctx.isLoggedIn
        ? 'Hi — what would you like to do? I can help you book, find a doctor, or pull up your appointments.'
        : 'Hi — I\'m the DocBook assistant. Tell me what kind of doctor you\'re looking for, or what city you\'re in.',
      actions: [
        { label: 'Find a doctor', kind: 'suggest', payload: 'find a cardiologist' },
        { label: 'Cities you cover', kind: 'suggest', payload: 'what cities do you cover' },
        { label: 'Book a visit', kind: 'suggest', payload: 'book an appointment' },
      ],
    }),
  },

  // 18. Thanks
  {
    priority: 210,
    match: (input) => /\bthanks?\b|\bthank you\b|\bok\b|\bgreat\b/i.test(input.trim()),
    build: () => ({ text: 'Anytime. I\'m here whenever you need to find or book.' }),
  },

  // 19. Medical advice diversion (e.g. "what should I do for fever?")
  // — only triggers if we couldn't extract a specialty (otherwise fall through to specialty match)
  {
    priority: 250,
    match: (input, ctx) =>
      /\bwhat should i do\b|\bdiagnose\b|\btreat\b|\bcure\b|\bsymptom\b/i.test(input) &&
      !extractSpecialization(input, ctx),
    build: () => ({
      text:
        'I can\'t give medical advice — but I can quickly help you find the right specialist. Tell me what\'s wrong and I\'ll suggest a specialty.',
      actions: [
        { label: 'Browse all doctors', kind: 'route', payload: '/doctors' },
      ],
    }),
  },
];

/**
 * Resolve a user input into a bot reply. Always returns something — the fallback
 * routes the user to the doctor browse with a help nudge.
 */
export function generateReply(input: string, ctx: BotContext): BotReply {
  const sorted = [...INTENTS].sort((a, b) => a.priority - b.priority);
  for (const intent of sorted) {
    if (intent.match(input, ctx)) {
      return intent.build(input, ctx);
    }
  }

  // Fallback
  return {
    text:
      "I didn't catch that. Try asking for a specialty (\"cardiologist\"), a city (\"doctors in Pune\"), or use one of the shortcuts below.",
    actions: [
      { label: 'Find a doctor', kind: 'route', payload: '/doctors' },
      { label: 'Book a visit', kind: 'suggest', payload: 'book an appointment' },
      { label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' },
    ],
  };
}

export const DEFAULT_QUICK_REPLIES: ChatAction[] = [
  { label: 'Doctors near me', kind: 'locate', payload: '' },
  { label: 'Find a doctor', kind: 'suggest', payload: 'I want to find a doctor' },
  { label: 'Book a visit', kind: 'suggest', payload: 'book an appointment' },
  { label: 'Cities covered', kind: 'suggest', payload: 'what cities do you cover' },
];
