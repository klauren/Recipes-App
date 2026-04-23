import { Platform } from 'react-native';

// Android emulators route 10.0.2.2 → the host machine's localhost.
// iOS simulators share the host network, so localhost works directly.
const BASE = Platform.OS === 'android'
  ? 'http://10.0.2.2:3001/api'
  : 'http://localhost:3001/api';

/**
 * Thin fetch wrapper that throws on non-2xx responses, forwarding the
 * server's `{ error: string }` message when available.
 */
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Recipes ───────────────────────────────────────────────────────────────────

export type Ingredient = { id?: number; amount: string; unit: string; name: string };
export type Instruction = { id?: number; step_num?: number; body: string };

export type Recipe = {
  id: number;
  title: string;
  description: string;
  image_url: string;
  source_url?: string;
  source_name?: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  category: string;
  /** SQLite stores booleans as integers — 0 = unsaved, 1 = saved. */
  is_saved: number;
  created_at: string;
  /** Only present on the detail endpoint (GET /recipes/:id). */
  ingredients?: Ingredient[];
  instructions?: Instruction[];
};

export const recipeApi = {
  /**
   * Lists recipes with optional filters.
   * @param params.saved  0 = unsaved only, 1 = saved only
   * @param params.q      Full-text search against title and description
   */
  list: (params?: { saved?: 0 | 1; category?: string; q?: string }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.entries(params)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : '';
    return req<Recipe[]>(`/recipes${qs}`);
  },
  get:    (id: number)                => req<Recipe>(`/recipes/${id}`),
  create: (body: Partial<Recipe> & { ingredients?: Ingredient[]; instructions?: Instruction[] }) =>
    req<Recipe>('/recipes', { method: 'POST', body: JSON.stringify(body) }),
  /**
   * Partial update — only include the fields you want to change.
   * When `ingredients` or `instructions` are supplied they fully replace the
   * existing lists (delete + re-insert) rather than being merged.
   */
  patch: (id: number, body: Partial<Recipe> & { ingredients?: Ingredient[]; instructions?: Instruction[] }) =>
    req<Recipe>(`/recipes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: number) =>
    req<{ deleted: boolean }>(`/recipes/${id}`, { method: 'DELETE' }),
  /**
   * Scrapes a recipe from a URL using JSON-LD structured data.
   * Returns a pre-filled recipe object — does NOT persist it automatically.
   */
  import: (url: string) =>
    req<Partial<Recipe> & { ingredients: Ingredient[]; instructions: Instruction[] }>(
      '/recipes/import', { method: 'POST', body: JSON.stringify({ url }) }
    ),
};

// ── Meals ─────────────────────────────────────────────────────────────────────

export type Meal = {
  id: number;
  recipe_id: number;
  /** ISO 8601 date string, e.g. "2024-04-21" */
  date: string;
  meal_type: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  servings: number;
  /** Joined from the recipes table */
  title: string;
  image_url: string;
  prep_time: number;
  cook_time: number;
  difficulty: string;
  category: string;
};

/** One day's entry in the Menu Builder grid. */
export type GridDay = {
  date: string;
  dayName: string;
  meals: Meal[];
};

export type WeekGrid = {
  weekStart: string;
  weekEnd: string;
  days: GridDay[];
};

export const mealApi = {
  /**
   * @param week  Any YYYY-MM-DD date; the server widens it to Mon–Sun of that week.
   *              Omit to get all meals across all weeks.
   */
  list:   (week?: string) => req<Meal[]>(`/meals${week ? `?week=${week}` : ''}`),
  /**
   * Returns a 7-element Mon–Sun grid with meals nested per day.
   * Used by the Menu Builder calendar view.
   */
  grid:   (week?: string) => req<WeekGrid>(`/meals/grid${week ? `?week=${week}` : ''}`),
  stats:  (week?: string) =>
    req<{ mealsPlanned: number; uniqueRecipes: number; totalCookMins: number }>(
      `/meals/stats${week ? `?week=${week}` : ''}`
    ),
  create: (body: { recipe_id: number; date: string; meal_type?: string; servings?: number }) =>
    req<Meal>('/meals', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: number) => req<{ deleted: boolean }>(`/meals/${id}`, { method: 'DELETE' }),
  /** Auto-fills every empty Breakfast/Lunch/Dinner slot for the week from saved recipes. */
  generate: (week?: string) =>
    req<{ weekStart: string; added: number }>(
      `/meals/generate${week ? `?week=${week}` : ''}`, { method: 'POST' }
    ),
};

// ── Cart ──────────────────────────────────────────────────────────────────────

export type CartItem = {
  id: number;
  name: string;
  amount: string;
  unit: string;
  category: string;
  /** 0 = unchecked, 1 = checked/purchased */
  is_checked: number;
  /** ISO week start (Monday) that scopes this item to its week */
  week_start: string;
  source_recipe: string;
};

export type CartResponse = {
  weekStart: string;
  /** Items grouped by store aisle category for section-list rendering */
  groups: Record<string, CartItem[]>;
  items: CartItem[];
};

export type MonthlyCartResponse = {
  month: string;
  weekStarts: string[];
  groups: Record<string, CartItem[]>;
  items: CartItem[];
  totalItems: number;
  checkedItems: number;
  weekCount: number;
};

export const cartApi = {
  get:      (week?: string) => req<CartResponse>(`/cart${week ? `?week=${week}` : ''}`),
  /**
   * Builds the shopping list from the week's meal plan.
   * Checked items are preserved; only unchecked items are replaced.
   */
  generate: (week?: string) =>
    req<{ weekStart: string; generated: number; items: CartItem[] }>(
      `/cart/generate${week ? `?week=${week}` : ''}`, { method: 'POST' }
    ),
  toggle:   (id: number, is_checked: boolean) =>
    req<CartItem>(`/cart/${id}`, { method: 'PATCH', body: JSON.stringify({ is_checked }) }),
  add:      (body: { name: string; amount?: string; unit?: string; category?: string; week?: string }) =>
    req<CartItem>('/cart', { method: 'POST', body: JSON.stringify(body) }),
  delete:   (id: number) => req<{ deleted: boolean }>(`/cart/${id}`, { method: 'DELETE' }),
  clear:    (week?: string) =>
    req<{ deleted: number }>(`/cart${week ? `?week=${week}` : ''}`, { method: 'DELETE' }),
  /** Returns aggregated items for all weeks within the given YYYY-MM month. */
  monthly:  (month?: string) =>
    req<MonthlyCartResponse>(`/cart/monthly${month ? `?month=${month}` : ''}`),
};

// ── Profile ───────────────────────────────────────────────────────────────────

export type Profile = {
  id: number;
  name: string;
  username: string;
  avatar_color: string;
  /** Live counts joined in by the server — not stored in user_profile table. */
  totalRecipes: number;
  savedRecipes: number;
  mealsPlanned: number;
};

export const profileApi = {
  get:   () => req<Profile>('/profile'),
  patch: (body: { name?: string; username?: string }) =>
    req<Profile>('/profile', { method: 'PATCH', body: JSON.stringify(body) }),
};
