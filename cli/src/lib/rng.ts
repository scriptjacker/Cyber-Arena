/**
 * Deterministic pseudo-randomness for seeding.
 *
 * The demo must look identical on every machine and every run: the same people,
 * the same departments, the same event history, the same numbers on the
 * dashboard. A rehearsed demo that shuffles its own data between run-throughs
 * is how teams end up narrating numbers that are not on the screen.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;

  constructor(seed = 20260317) {
    this.next = mulberry32(seed);
  }

  float(): number {
    return this.next();
  }

  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }

  /** True with the given probability. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Shuffle a copy, deterministically. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i];
      const b = out[j];
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
}

export const FIRST_NAMES = [
  'Priya', 'Rahul', 'Ananya', 'Vikram', 'Meera', 'Arjun', 'Kavya', 'Rohan',
  'Divya', 'Sanjay', 'Neha', 'Karthik', 'Aisha', 'Nikhil', 'Pooja', 'Aditya',
  'Shruti', 'Manish', 'Lakshmi', 'Imran', 'Sneha', 'Varun', 'Ritu', 'Harish',
  'Tanvi', 'Deepak', 'Fatima', 'Suresh', 'Anjali', 'Joseph', 'Nisha', 'Abhishek',
  'Swati', 'Rajesh', 'Aarti', 'Gaurav', 'Madhuri', 'Sameer', 'Ishita', 'Prakash',
];

export const LAST_NAMES = [
  'Sharma', 'Reddy', 'Iyer', 'Patel', 'Nair', 'Mehta', 'Desai', 'Rao',
  'Krishnan', 'Joshi', 'Kulkarni', 'Banerjee', 'Chatterjee', 'Menon', 'Gupta',
  'Shetty', 'Pillai', 'Bhat', 'Kapoor', 'Fernandes', 'Qureshi', 'Deshpande',
  'Agarwal', 'Thomas', 'Mukherjee', 'Saxena', 'Naidu', 'Verma',
];

/**
 * Department sizes. Legal (3) and Audit (2) are deliberately below the
 * k-anonymity threshold of 5, so the analytics guard has something real to
 * refuse on stage rather than a contrived example.
 */
export const DEPARTMENTS: { name: string; size: number; roles: string[] }[] = [
  { name: 'Operations', size: 68, roles: ['Dispatch Coordinator', 'Route Planner', 'Shift Supervisor'] },
  { name: 'Warehouse', size: 52, roles: ['Inventory Clerk', 'Forklift Operator', 'Stock Controller'] },
  { name: 'Customer Support', size: 40, roles: ['Support Agent', 'Escalations Lead'] },
  { name: 'Finance', size: 24, roles: ['Accounts Payable Clerk', 'Financial Analyst', 'Payroll Officer'] },
  { name: 'Engineering', size: 22, roles: ['Platform Engineer', 'Data Engineer', 'QA Engineer'] },
  { name: 'Facilities', size: 12, roles: ['Facilities Assistant', 'Site Technician'] },
  { name: 'People', size: 12, roles: ['HR Advisor', 'Recruiter'] },
  { name: 'Executive', size: 5, roles: ['Director', 'Chief of Staff'] },
  { name: 'Legal', size: 3, roles: ['Legal Counsel'] },
  { name: 'Internal Audit', size: 2, roles: ['Audit Manager'] },
];

export const TOTAL_PARTICIPANTS = DEPARTMENTS.reduce((n, d) => n + d.size, 0);
