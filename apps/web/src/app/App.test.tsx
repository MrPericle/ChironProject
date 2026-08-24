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
      return jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        token_type: "bearer",
        user: { id: "user-1", email: "mattia@example.com", role: "user" },
      });
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

  it("filters the catalog by location and availability", async () => {
    installFetchMock();

    render(<App />);
    await login();

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
