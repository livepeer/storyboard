import { create } from "zustand";
import type { Film, FilmListItem } from "./types";

const STORAGE_KEY = "storyboard:films";
const MAX_FILMS = 30;

function shortId(): string {
  return `film_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function ageLabel(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function load(): Film[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function save(films: Film[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(films.slice(0, MAX_FILMS))); }
  catch { /* quota */ }
}

interface FilmState {
  films: Film[];
  pendingFilmId: string | null;
  addFilm: (f: Omit<Film, "id" | "createdAt" | "status">) => Film;
  markApplied: (id: string) => void;
  setPending: (id: string | null) => void;
  getPending: () => Film | null;
  getById: (id: string) => Film | undefined;
  listRecent: (limit?: number) => FilmListItem[];
  remove: (id: string) => void;
}

export const useFilmStore = create<FilmState>((set, get) => ({
  films: load(),
  pendingFilmId: null,

  addFilm: (partial) => {
    const film: Film = { ...partial, id: shortId(), createdAt: Date.now(), status: "draft" };
    set((s) => {
      const next = [film, ...s.films.filter((f) => f.id !== film.id)];
      save(next);
      return { films: next, pendingFilmId: film.id };
    });
    return film;
  },

  markApplied: (id) => set((s) => {
    const next = s.films.map((f) => f.id === id ? { ...f, status: "applied" as const, appliedAt: Date.now() } : f);
    save(next);
    return { films: next };
  }),

  setPending: (id) => set({ pendingFilmId: id }),

  getPending: () => {
    const { films, pendingFilmId } = get();
    return pendingFilmId ? films.find((f) => f.id === pendingFilmId) ?? null : null;
  },

  getById: (id) => get().films.find((f) => f.id === id),

  listRecent: (limit = 10) => get().films.slice(0, limit).map((f) => ({
    id: f.id, title: f.title, status: f.status,
    createdAt: f.createdAt, shotCount: f.shots.length, ageLabel: ageLabel(f.createdAt),
  })),

  remove: (id) => set((s) => {
    const next = s.films.filter((f) => f.id !== id);
    save(next);
    return { films: next, pendingFilmId: s.pendingFilmId === id ? null : s.pendingFilmId };
  }),
}));
