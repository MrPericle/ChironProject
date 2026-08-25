import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { accessTokenRefreshDelay } from "../lib/session";
import { App } from "./App";

const catalogResponse = [
  {
    id: "course-calisthenics",
    location_id: "location-roma",
    location_name: "Chiron Roma",
    title: "Calisthenics Foundation",
    description: "Forza, controllo e progressioni a corpo libero.",
    discipline: "calisthenics",
    image_url: "/uploads/calisthenics.jpg",
    sessions: [
      {
        id: "session-calisthenics",
        weekday: 1,
        starts_at: "18:00:00",
        ends_at: "19:00:00",
        capacity: 10,
        available_spots: 4,
      },
    ],
  },
  {
    id: "course-pole",
    location_id: "location-milano",
    location_name: "Chiron Milano",
    title: "Pole Flow",
    description: "Tecnica e transizioni fluide.",
    discipline: "pole_dance",
    image_url: null,
    sessions: [
      {
        id: "session-pole",
        weekday: 3,
        starts_at: "20:00:00",
        ends_at: "21:00:00",
        capacity: 8,
        available_spots: 0,
      },
    ],
  },
];

const bookingsResponse = [
  {
    id: "booking-existing",
    user_id: "user-1",
    course_session_id: "session-pole",
    status: "confirmed",
    created_at: "2026-08-20T12:00:00Z",
    cancelled_at: null,
  },
];

const subscriptionResponse = {
  starts_on: "2026-08-01",
  duration_days: 30,
  expires_on: "2026-08-31",
  is_active: true,
};

const adminLocationsResponse = [
  {
    id: "location-roma",
    name: "Chiron Roma",
    address: "Via Roma 1",
    city: "Roma",
    is_active: true,
  },
];

const adminCoursesResponse = [
  {
    id: "course-calisthenics",
    location_id: "location-roma",
    instructor_user_id: null,
    title: "Calisthenics Foundation",
    description: "Forza e controllo.",
    discipline: "calisthenics",
    image_url: "/uploads/calisthenics.jpg",
    status: "published",
    sessions: [
      {
        id: "session-calisthenics",
        course_id: "course-calisthenics",
        weekday: 1,
        starts_at: "18:00:00",
        ends_at: "19:00:00",
        capacity: 10,
        cancellation_deadline_hours: 24,
        is_active: true,
      },
    ],
  },
];

const adminSubscriptionsResponse = [
  {
    id: "subscription-1",
    user_id: "user-1",
    user_email: "member@example.com",
    starts_on: "2026-08-01",
    duration_days: 30,
    expires_on: "2026-08-31",
    is_active: true,
  },
];

const adminUsersResponse = [
  {
    id: "user-1",
    email: "member@example.com",
    role: "user",
    status: "active",
    first_name: "Mario",
    last_name: "Rossi",
    phone: null,
    birth_date: null,
    subscription: {
      id: "subscription-1",
      starts_on: "2026-08-01",
      duration_days: 30,
      expires_on: "2026-08-31",
      is_active: true,
    },
  },
  {
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    status: "active",
    first_name: "Ada",
    last_name: "Admin",
    phone: null,
    birth_date: null,
    subscription: null,
  },
];

const adminStatsResponse = {
  active_members: 1,
  courses: [{ id: "course-calisthenics", name: "Calisthenics Foundation", member_count: 8 }],
  locations: [{ id: "location-roma", name: "Chiron Roma", member_count: 8 }],
};

const adminAttendeesResponse = [
  {
    booking_id: "booking-admin-1",
    user_id: "user-1",
    email: "member@example.com",
    first_name: "Mario",
    last_name: "Rossi",
    status: "confirmed",
  },
  {
    booking_id: "booking-admin-2",
    user_id: "user-2",
    email: "waitlist@example.com",
    first_name: "Anna",
    last_name: "Bianchi",
    status: "waitlisted",
  },
];

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function accessTokenExpiringAt(expiresAt: number): string {
  const encode = (value: string) =>
    btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode("{}")}.${encode(JSON.stringify({ exp: Math.floor(expiresAt / 1000) }))}.signature`;
}

function installFetchMock(subscription = subscriptionResponse) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/auth/login") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as { email?: string };
      const isAdmin = body.email === "admin@example.com";

      if (isAdmin) {
        return jsonResponse(
          { requires_2fa: true, challenge_token: "challenge-token" },
          { status: 202 },
        );
      }

      return jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "bearer",
        user: {
          id: "user-1",
          email: body.email ?? "mattia@example.com",
          role: "user",
        },
      });
    }

    if (url.endsWith("/auth/2fa/verify") && method === "POST") {
      return jsonResponse({
        access_token: "admin-access-token",
        refresh_token: "admin-refresh-token",
        token_type: "bearer",
        user: { id: "admin-1", email: "admin@example.com", role: "admin" },
      });
    }

    if (url.endsWith("/auth/register") && method === "POST") {
      return jsonResponse(
        {
          access_token: "register-access-token",
          refresh_token: "register-refresh-token",
          token_type: "bearer",
          user: { id: "user-2", email: "nuovo@example.com", role: "user" },
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/auth/refresh") && method === "POST") {
      return jsonResponse({
        access_token: "renewed-access-token",
        refresh_token: "renewed-refresh-token",
        token_type: "bearer",
        user: { id: "admin-1", email: "admin@example.com", role: "admin" },
      });
    }

    if (url.endsWith("/auth/me")) {
      return jsonResponse({ id: "user-1", email: "mattia@example.com", role: "user" });
    }

    if (url.endsWith("/courses") && !url.endsWith("/admin/courses") && method === "GET") {
      return jsonResponse(catalogResponse);
    }

    if (url.endsWith("/bookings/me")) {
      return jsonResponse(bookingsResponse);
    }

    if (url.endsWith("/subscriptions/me")) {
      return jsonResponse(subscription);
    }

    if (url.endsWith("/admin/locations") && method === "GET") {
      return jsonResponse(adminLocationsResponse);
    }

    if (url.endsWith("/admin/courses") && method === "GET") {
      return jsonResponse(adminCoursesResponse);
    }

    if (url.endsWith("/admin/subscriptions") && method === "GET") {
      return jsonResponse(adminSubscriptionsResponse);
    }

    if (url.endsWith("/admin/users") && method === "GET") {
      return jsonResponse(adminUsersResponse);
    }

    if (url.endsWith("/admin/stats") && method === "GET") {
      return jsonResponse(adminStatsResponse);
    }

    if (url.endsWith("/admin/course-sessions/session-calisthenics/attendees") && method === "GET") {
      return jsonResponse(adminAttendeesResponse);
    }

    if (url.endsWith("/admin/users") && method === "POST") {
      return jsonResponse(
        {
          id: "user-2",
          email: "new.member@example.com",
          role: "user",
          status: "active",
          first_name: "Nuovo",
          last_name: "Utente",
          phone: null,
          birth_date: null,
          subscription: null,
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/users/user-1") && method === "PATCH") {
      return jsonResponse({ ...adminUsersResponse[0], status: "disabled" });
    }

    if (url.endsWith("/admin/users/user-1") && method === "DELETE") {
      return jsonResponse({ ...adminUsersResponse[0], status: "deleted" });
    }

    if (url.endsWith("/admin/users/user-1/subscriptions") && method === "POST") {
      return jsonResponse(adminUsersResponse[0].subscription, { status: 201 });
    }

    if (url.endsWith("/admin/subscriptions/subscription-1") && method === "PATCH") {
      return jsonResponse({
        ...adminUsersResponse[0].subscription,
        duration_days: 60,
        expires_on: "2026-09-30",
      });
    }

    if (url.endsWith("/admin/locations") && method === "POST") {
      return jsonResponse(
        {
          id: "location-milano",
          name: "Chiron Milano",
          address: "Via Milano 2",
          city: "Milano",
          is_active: true,
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/locations/location-roma") && method === "DELETE") {
      return jsonResponse({ ...adminLocationsResponse[0], is_active: false });
    }

    if (url.endsWith("/admin/locations/location-roma") && method === "PATCH") {
      return jsonResponse({ ...adminLocationsResponse[0], name: "Chiron Roma aggiornata" });
    }

    if (url.endsWith("/admin/courses") && method === "POST") {
      return jsonResponse(
        {
          id: "course-martial",
          location_id: "location-roma",
          instructor_user_id: null,
          title: "Martial Flow",
          description: "Tecnica e mobilita.",
          discipline: "martial_arts",
          image_url: null,
          status: "published",
          sessions: [],
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/courses/course-calisthenics") && method === "PATCH") {
      return jsonResponse({ ...adminCoursesResponse[0], title: "Calisthenics Foundation aggiornato" });
    }

    if (url.endsWith("/admin/courses/course-martial/image") && method === "POST") {
      return jsonResponse({
        ...adminCoursesResponse[0],
        id: "course-martial",
        title: "Martial Flow",
        discipline: "martial_arts",
        image_url: "/uploads/martial-flow.jpg",
        sessions: [],
      });
    }

    if (url.endsWith("/admin/courses/course-calisthenics/schedule") && method === "POST") {
      return jsonResponse(
        [
          {
            id: "session-wednesday",
            course_id: "course-calisthenics",
            weekday: 3,
            starts_at: "18:00",
            ends_at: "19:00",
            capacity: 12,
            cancellation_deadline_hours: 24,
            is_active: true,
          },
          {
            id: "session-friday",
            course_id: "course-calisthenics",
            weekday: 5,
            starts_at: "18:00",
            ends_at: "19:00",
            capacity: 12,
            cancellation_deadline_hours: 24,
            is_active: true,
          },
        ],
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/course-sessions/session-calisthenics") && method === "PATCH") {
      return jsonResponse({ ...adminCoursesResponse[0].sessions[0], capacity: 14 });
    }

    if (url.endsWith("/bookings") && method === "POST") {
      return jsonResponse(
        {
          id: "booking-new",
          user_id: "user-1",
          course_session_id: "session-calisthenics",
          status: "confirmed",
          created_at: "2026-08-24T12:00:00Z",
          cancelled_at: null,
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/bookings/booking-existing") && method === "DELETE") {
      return jsonResponse({
        ...bookingsResponse[0],
        status: "cancelled",
        cancelled_at: "2026-08-24T12:30:00Z",
      });
    }

    return jsonResponse({ detail: "Not found" }, { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function installStorageMock() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  });
}

async function login() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "mattia@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password-segreta" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entra nell'area utente" }));

  await screen.findByRole("heading", { level: 1, name: "MAKA" });
}

async function loginAdmin() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password-segreta" },
  });
  expect(screen.queryByLabelText("Codice 2FA")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Entra nell'area utente" }));

  await screen.findByRole("heading", { level: 2, name: "Conferma accesso" });
  fireEvent.change(screen.getByLabelText("Codice 2FA"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Conferma codice" }));

  await screen.findByRole("heading", { level: 1, name: "MAKA" });
}

describe("App", () => {
  beforeEach(() => {
    installStorageMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calculates a refresh before the access token expires", () => {
    const now = new Date("2026-08-25T12:00:00Z").getTime();
    const accessToken = accessTokenExpiringAt(now + 30 * 60_000);

    expect(accessTokenRefreshDelay(accessToken, now)).toBe(29 * 60_000);
  });

  it("renews an admin session automatically", async () => {
    vi.useFakeTimers();
    const fetchMock = installFetchMock();
    const accessToken = accessTokenExpiringAt(Date.now() + 70_000);
    localStorage.setItem(
      "chiron.user.session",
      JSON.stringify({
        access_token: accessToken,
        refresh_token: "admin-refresh-token",
        token_type: "bearer",
        user: { id: "admin-1", email: "admin@example.com", role: "admin" },
      }),
    );

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({ refresh_token: "admin-refresh-token" }),
        method: "POST",
      }),
    );
  });

  it("starts with an accessible authenticated shell", () => {
    installFetchMock();

    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "MAKA" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.queryByLabelText("Codice 2FA")).not.toBeInTheDocument();
  });

  it("lets a new user register from the auth panel", async () => {
    const fetchMock = installFetchMock();

    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "Registrati" }));
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Mattia" } });
    fireEvent.change(screen.getByLabelText("Cognome"), { target: { value: "Rossi" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nuovo@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-segreta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crea account" }));

    await screen.findByRole("heading", { level: 1, name: "MAKA" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/register",
      expect.objectContaining({
        body: JSON.stringify({
          email: "nuovo@example.com",
          first_name: "Mattia",
          last_name: "Rossi",
          password: "password-segreta",
        }),
        method: "POST",
      }),
    );
  });

  it("loads catalog, bookings and subscription after login", async () => {
    installFetchMock();

    render(<App />);
    await login();

    const catalog = screen.getByRole("region", { name: "Prenota una sessione" });

    expect(screen.getByText("mattia@example.com")).toBeInTheDocument();
    expect(within(catalog).getByText("Calisthenics Foundation")).toBeInTheDocument();
    expect(within(catalog).getByText("Pole Flow")).toBeInTheDocument();
    expect(screen.getByText("Scade il 31/08/2026")).toBeInTheDocument();
    const overview = screen.getByRole("region", { name: "Riepilogo personale" });
    expect(within(overview).getByText("Prenotazioni")).toBeInTheDocument();
  });

  it("loads the backoffice dashboard for admins", async () => {
    installFetchMock();

    render(<App />);
    await loginAdmin();

    const overview = screen.getByRole("region", { name: "Riepilogo backoffice" });
    expect(within(overview).getByText("Iscritti attivi")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Corsi migliori" })).toBeInTheDocument();
    expect(screen.getAllByText("8 iscritti collegati")).toHaveLength(2);
  });

  it("shows course session attendees from the admin calendar", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.click(screen.getByRole("button", { name: "Calendario" }));
    fireEvent.click(screen.getByRole("button", { name: "Lun" }));
    fireEvent.click(screen.getByRole("button", { name: "Prenotati" }));

    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Anna Bianchi")).toBeInTheDocument();
    expect(screen.getByText("1 confermati")).toBeInTheDocument();
    expect(screen.getByText("1 in lista d'attesa")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/course-sessions/session-calisthenics/attendees",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps regular users out of the backoffice shell", async () => {
    installFetchMock();

    render(<App />);
    await login();

    expect(screen.getByText("Area utente")).toBeInTheDocument();
    expect(screen.queryByText("Backoffice")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "MAKA" })).toBeInTheDocument();
  });

  it("creates and deactivates locations from the backoffice", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.click(screen.getByRole("button", { name: "Sedi" }));
    fireEvent.change(screen.getByLabelText("Nome sede"), { target: { value: "Chiron Milano" } });
    fireEvent.change(screen.getByLabelText("Indirizzo"), { target: { value: "Via Milano 2" } });
    fireEvent.change(screen.getByLabelText("Citta"), { target: { value: "Milano" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea sede" }));

    await screen.findByText("Sede creata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/locations",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /modifica Chiron Roma/i }));
    fireEvent.click(screen.getByRole("button", { name: /salva sede Chiron Roma/i }));

    await screen.findByText("Sede aggiornata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/locations/location-roma",
      expect.objectContaining({ method: "PATCH" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /disattiva Chiron Roma/i }));

    await screen.findByText("Sede disattivata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/locations/location-roma",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates courses and sessions from the backoffice", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.click(screen.getByRole("button", { name: "Corsi" }));
    fireEvent.change(screen.getByLabelText("Titolo corso"), { target: { value: "Martial Flow" } });
    fireEvent.change(screen.getByLabelText("Descrizione corso"), {
      target: { value: "Tecnica e mobilita." },
    });
    fireEvent.change(screen.getByLabelText("Foto corso"), {
      target: { files: [new File(["image"], "martial-flow.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crea corso" }));

    await screen.findByText("Corso creato.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-martial/image",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );

    fireEvent.click(screen.getByRole("button", { name: /modifica Calisthenics/i }));
    fireEvent.click(screen.getByRole("button", { name: /salva corso Calisthenics/i }));

    await screen.findByText("Corso aggiornato.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-calisthenics",
      expect.objectContaining({ method: "PATCH" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /configura orari Calisthenics/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Mercoledi" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Venerdi" }));
    fireEvent.change(screen.getByLabelText("Ora inizio ricorrenza"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("Ora fine ricorrenza"), {
      target: { value: "19:00" },
    });
    fireEvent.change(screen.getByLabelText("Posti per lezione"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva ricorrenze" }));

    await screen.findByText("Ricorrenze create.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-calisthenics/schedule",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Modifica Lunedi 18:00" }));
    fireEvent.change(screen.getByLabelText("Capienza Lunedi 18:00"), {
      target: { value: "14" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva Lunedi 18:00" }));

    await screen.findByText("Ricorrenza aggiornata.");
  });

  it("manages users and subscriptions from a dedicated backoffice tab", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.click(screen.getByRole("button", { name: "Utenti" }));
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("Accesso amministrativo senza scadenza")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /gestisci account amministrativo admin@example.com/i }),
    );
    expect(screen.queryByLabelText("Inizio iscrizione")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /salva iscrizione admin@example.com/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /annulla modifica admin@example.com/i }));
    fireEvent.change(screen.getByLabelText("Email utente"), {
      target: { value: "new.member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Nome utente"), { target: { value: "Nuovo" } });
    fireEvent.change(screen.getByLabelText("Cognome utente"), { target: { value: "Utente" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea utente" }));

    await screen.findByText("Utente creato.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/users",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /gestisci utente e iscrizione member@example.com/i }));
    fireEvent.change(screen.getByLabelText("Durata iscrizione"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /salva iscrizione member@example.com/i }));

    await screen.findByText("Iscrizione aggiornata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/subscriptions/subscription-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /disabilita member@example.com/i }));

    await screen.findByText("Utente disabilitato.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/users/user-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("filters the catalog by location and availability", async () => {
    installFetchMock();

    render(<App />);
    await login();

    fireEvent.click(screen.getByRole("button", { name: "Filtra" }));
    fireEvent.change(screen.getByLabelText("Sede"), { target: { value: "location-roma" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Solo posti disponibili" }));

    const catalog = screen.getByRole("region", { name: "Prenota una sessione" });
    expect(within(catalog).getByText("Calisthenics Foundation")).toBeInTheDocument();
    expect(within(catalog).queryByText("Pole Flow")).not.toBeInTheDocument();
  });

  it("books and cancels a session with clear status feedback", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await login();

    const calisthenicsCard = screen.getByRole("article", { name: "Calisthenics Foundation" });
    fireEvent.click(within(calisthenicsCard).getByRole("button", { name: /prenota/i }));

    await screen.findByText("Prenotazione confermata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /cancella Pole Flow/i }));

    await waitFor(() => {
      expect(screen.getByText("Prenotazione cancellata.")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings/booking-existing",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("disables booking actions when the membership is not active", async () => {
    const fetchMock = installFetchMock({ ...subscriptionResponse, is_active: false });

    render(<App />);
    await login();

    const calisthenicsCard = screen.getByRole("article", { name: "Calisthenics Foundation" });
    const bookingButton = within(calisthenicsCard).getByRole("button", {
      name: "Iscrizione richiesta",
    });

    expect(bookingButton).toBeDisabled();
    expect(screen.getByText("Attiva l'iscrizione per prenotare.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:8000/bookings",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
