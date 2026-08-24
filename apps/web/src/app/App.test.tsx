import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const catalogResponse = [
  {
    id: "course-calisthenics",
    location_id: "location-roma",
    location_name: "Chiron Roma",
    title: "Calisthenics Foundation",
    description: "Forza, controllo e progressioni a corpo libero.",
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
    status: "published",
  },
];

const adminSubscriptionsResponse = [
  {
    user_id: "user-1",
    user_email: "member@example.com",
    starts_on: "2026-08-01",
    duration_days: 30,
    expires_on: "2026-08-31",
    is_active: true,
  },
];

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/auth/login") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as { email?: string };
      const isAdmin = body.email === "admin@example.com";

      return jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "bearer",
        user: {
          id: isAdmin ? "admin-1" : "user-1",
          email: body.email ?? "mattia@example.com",
          role: isAdmin ? "admin" : "user",
        },
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

    if (url.endsWith("/auth/me")) {
      return jsonResponse({ id: "user-1", email: "mattia@example.com", role: "user" });
    }

    if (url.endsWith("/courses")) {
      return jsonResponse(catalogResponse);
    }

    if (url.endsWith("/bookings/me")) {
      return jsonResponse(bookingsResponse);
    }

    if (url.endsWith("/subscriptions/me")) {
      return jsonResponse(subscriptionResponse);
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

    if (url.endsWith("/admin/courses") && method === "POST") {
      return jsonResponse(
        {
          id: "course-martial",
          location_id: "location-roma",
          instructor_user_id: null,
          title: "Martial Flow",
          description: "Tecnica e mobilita.",
          status: "published",
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/courses/course-calisthenics/sessions") && method === "POST") {
      return jsonResponse(
        {
          id: "session-new",
          course_id: "course-calisthenics",
          weekday: 2,
          starts_at: "18:00",
          ends_at: "19:00",
          capacity: 12,
          cancellation_deadline_hours: 24,
          is_active: true,
        },
        { status: 201 },
      );
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

  await screen.findByRole("heading", { level: 1, name: "Il tuo movimento, oggi" });
}

async function loginAdmin() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password-segreta" },
  });
  fireEvent.change(screen.getByLabelText("Codice 2FA"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entra nell'area utente" }));

  await screen.findByRole("heading", { level: 1, name: "Backoffice Chiron" });
}

describe("App", () => {
  beforeEach(() => {
    installStorageMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts with an accessible authenticated shell", () => {
    installFetchMock();

    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Chiron Project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("Codice 2FA")).toHaveAttribute("autocomplete", "one-time-code");
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

    await screen.findByRole("heading", { level: 1, name: "Il tuo movimento, oggi" });
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

    const catalog = screen.getByRole("region", { name: "Scegli il prossimo allenamento" });

    expect(screen.getByText("mattia@example.com")).toBeInTheDocument();
    expect(within(catalog).getByText("Calisthenics Foundation")).toBeInTheDocument();
    expect(within(catalog).getByText("Pole Flow")).toBeInTheDocument();
    expect(screen.getByText("Scade il 31/08/2026")).toBeInTheDocument();
    expect(screen.getByText("1 prenotazione")).toBeInTheDocument();
  });

  it("loads the backoffice dashboard for admins", async () => {
    installFetchMock();

    render(<App />);
    await loginAdmin();

    expect(screen.getByRole("heading", { level: 3, name: "Chiron Roma" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Calisthenics Foundation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("1 iscritto attivo")).toBeInTheDocument();
  });

  it("keeps regular users out of the backoffice shell", async () => {
    installFetchMock();

    render(<App />);
    await login();

    expect(screen.queryByRole("heading", { level: 1, name: "Backoffice Chiron" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Il tuo movimento, oggi" })).toBeInTheDocument();
  });

  it("creates and deactivates locations from the backoffice", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.change(screen.getByLabelText("Nome sede"), { target: { value: "Chiron Milano" } });
    fireEvent.change(screen.getByLabelText("Indirizzo"), { target: { value: "Via Milano 2" } });
    fireEvent.change(screen.getByLabelText("Citta"), { target: { value: "Milano" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea sede" }));

    await screen.findByText("Sede creata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/locations",
      expect.objectContaining({ method: "POST" }),
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

    fireEvent.change(screen.getByLabelText("Titolo corso"), { target: { value: "Martial Flow" } });
    fireEvent.change(screen.getByLabelText("Descrizione corso"), {
      target: { value: "Tecnica e mobilita." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crea corso" }));

    await screen.findByText("Corso creato.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /aggiungi sessione a Calisthenics/i }));

    await screen.findByText("Sessione creata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-calisthenics/sessions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("filters the catalog by location and availability", async () => {
    installFetchMock();

    render(<App />);
    await login();

    fireEvent.click(screen.getByRole("button", { name: "Filtra" }));
    fireEvent.change(screen.getByLabelText("Sede"), { target: { value: "location-roma" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Solo posti disponibili" }));

    const catalog = screen.getByRole("region", { name: "Scegli il prossimo allenamento" });
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
});
