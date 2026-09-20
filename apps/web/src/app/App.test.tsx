import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Booking } from "../lib/api";
import { accessTokenRefreshDelay } from "../lib/session";
import { App } from "./App";

const catalogResponse = [
  {
    id: "course-calisthenics",
    location_id: "location-roma",
    location_name: "Chiron Roma",
    title: "Calisthenics Foundation",
    description: "Forza, controllo e progressioni a corpo libero.",
    discipline: "Sala",
    image_url: "/uploads/calisthenics.jpg",
    requires_active_subscription: true,
    sessions: [
      {
        id: "session-calisthenics",
        occurs_on: "2026-08-31",
        weekday: 1,
        starts_at: "18:00:00",
        ends_at: "19:00:00",
        capacity: 10,
        available_spots: 4,
      },
      {
        id: "session-calisthenics",
        occurs_on: "2026-09-07",
        weekday: 1,
        starts_at: "18:00:00",
        ends_at: "19:00:00",
        capacity: 10,
        available_spots: 7,
      },
    ],
  },
  {
    id: "course-pole",
    location_id: "location-milano",
    location_name: "Chiron Milano",
    title: "Pole Flow",
    description: "Tecnica e transizioni fluide.",
    discipline: "Pole",
    image_url: null,
    requires_active_subscription: true,
    sessions: [
      {
        id: "session-pole",
        occurs_on: "2026-09-02",
        weekday: 3,
        starts_at: "20:00:00",
        ends_at: "21:00:00",
        capacity: 8,
        available_spots: 0,
      },
    ],
  },
];

const bookingsResponse: Booking[] = [
  {
    id: "booking-existing",
    user_id: "user-1",
    course_session_id: "session-pole",
    occurs_on: "2026-09-02",
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

const adminDisciplinesResponse = [
  { id: "discipline-gym", name: "Sala", sort_order: 1, is_default: true },
  {
    id: "discipline-martial",
    name: "Arti marziali",
    sort_order: 2,
    is_default: true,
  },
  { id: "discipline-pole", name: "Pole", sort_order: 3, is_default: true },
  { id: "discipline-other", name: "Altro", sort_order: 4, is_default: true },
];

const adminCoursesResponse = [
  {
    id: "course-calisthenics",
    location_id: "location-roma",
    instructor_user_id: null,
    title: "Calisthenics Foundation",
    description: "Forza e controllo.",
    discipline: "Sala",
    image_url: "/uploads/calisthenics.jpg",
    requires_active_subscription: true,
    status: "published",
    sessions: [
      {
        id: "session-calisthenics",
        course_id: "course-calisthenics",
        weekday: 1,
        occurs_on: null,
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
  {
    id: "user-expired",
    email: "expired@example.com",
    role: "user",
    status: "active",
    first_name: "Elena",
    last_name: "Scaduta",
    phone: null,
    birth_date: null,
    subscription: {
      id: "subscription-expired",
      starts_on: "2026-06-01",
      duration_days: 30,
      expires_on: "2026-07-01",
      is_active: false,
    },
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

function installFetchMock(
  subscription = subscriptionResponse,
  bookings = bookingsResponse,
  catalog = catalogResponse,
) {
  let bookingState = bookings.map((booking) => ({ ...booking }));
  let catalogState = catalog.map((course) => ({
    ...course,
    sessions: course.sessions.map((session) => ({ ...session })),
  }));
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/auth/login") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as { email?: string };
      const isAdmin = body.email === "admin@example.com";
      const isNewCollaborator = body.email === "collaborator@example.com";
      const isUnverified = body.email === "unverified@example.com";

      if (isAdmin) {
        return jsonResponse(
          { requires_2fa: true, challenge_token: "challenge-token" },
          { status: 202 },
        );
      }

      if (isNewCollaborator) {
        return jsonResponse(
          { requires_2fa_setup: true, setup_token: "staff-setup-token" },
          { status: 403 },
        );
      }

      if (isUnverified) {
        return jsonResponse({ requires_email_verification: true }, { status: 403 });
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

    if (url.endsWith("/auth/2fa/setup") && method === "POST") {
      return jsonResponse({
        secret: "JBSWY3DPEHPK3PXP",
        otpauth_uri: "otpauth://totp/MAKA:collaborator@example.com?secret=JBSWY3DPEHPK3PXP",
      });
    }

    if (url.endsWith("/auth/2fa/confirm") && method === "POST") {
      return jsonResponse({
        access_token: "staff-access-token",
        refresh_token: "staff-refresh-token",
        token_type: "bearer",
        user: { id: "staff-1", email: "collaborator@example.com", role: "staff" },
      });
    }

    if (url.endsWith("/auth/register") && method === "POST") {
      return jsonResponse(
        { message: "Controlla la posta per confermare il tuo account." },
        { status: 202 },
      );
    }

    if (url.endsWith("/auth/email/verify") && method === "POST") {
      return jsonResponse({ message: "Email confermata. Ora puoi accedere." });
    }

    if (url.endsWith("/auth/email/resend") && method === "POST") {
      return jsonResponse(
        { message: "Se l'account richiede conferma, riceverai una nuova email." },
        { status: 202 },
      );
    }

    if (url.endsWith("/auth/password/forgot") && method === "POST") {
      return jsonResponse(
        { message: "Se esiste un account verificato, riceverai le istruzioni via email." },
        { status: 202 },
      );
    }

    if (url.endsWith("/auth/password/reset") && method === "POST") {
      return jsonResponse({ message: "Password aggiornata. Ora puoi accedere." });
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
      const authorization = new Headers(init?.headers).get("Authorization");
      if (authorization === "Bearer staff-access-token") {
        return jsonResponse({ id: "staff-1", email: "staff@example.com", role: "staff" });
      }
      return jsonResponse({ id: "user-1", email: "mattia@example.com", role: "user" });
    }

    if (url.endsWith("/courses") && !url.endsWith("/admin/courses") && method === "GET") {
      return jsonResponse(catalogState);
    }

    if (url.endsWith("/bookings/me")) {
      return jsonResponse(bookingState);
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

    if (url.endsWith("/admin/disciplines") && method === "GET") {
      return jsonResponse(adminDisciplinesResponse);
    }

    if (url.endsWith("/admin/disciplines") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as { name?: string };
      return jsonResponse(
        {
          id: "discipline-aerial",
          name: body.name?.trim() ?? "Danza aerea",
          sort_order: 5,
          is_default: false,
        },
        { status: 201 },
      );
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

    if (url.includes("/admin/calendar/availability?occurs_on=") && method === "GET") {
      const occursOn = new URL(url).searchParams.get("occurs_on");
      return jsonResponse([
        {
          course_session_id: "session-calisthenics",
          occurs_on: occursOn,
          capacity: 10,
          confirmed_count: 1,
          waitlisted_count: 1,
          available_spots: 9,
        },
      ]);
    }

    if (
      url.includes("/admin/course-sessions/session-calisthenics/attendees?occurs_on=") &&
      method === "GET"
    ) {
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
      const body = JSON.parse(init?.body?.toString() ?? "{}") as {
        role?: "admin" | "staff" | "user";
        status?: "active" | "disabled" | "deleted";
      };
      return jsonResponse({ ...adminUsersResponse[0], ...body });
    }

    if (url.endsWith("/admin/users/user-1") && method === "DELETE") {
      return new Response(null, { status: 204 });
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

    if (url.endsWith("/admin/locations/location-roma/deactivate") && method === "POST") {
      return jsonResponse({
        ...adminLocationsResponse[0],
        is_active: false,
        deleted_course_count: 1,
      });
    }

    if (url.endsWith("/admin/locations/location-roma") && method === "DELETE") {
      return jsonResponse({
        id: "location-roma",
        deleted: true,
        deleted_course_count: 1,
      });
    }

    if (url.endsWith("/admin/locations/location-roma") && method === "PATCH") {
      return jsonResponse({ ...adminLocationsResponse[0], name: "Chiron Roma aggiornata" });
    }

    if (url.endsWith("/admin/courses") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as {
        discipline?: string;
        requires_active_subscription?: boolean;
      };
      return jsonResponse(
        {
          id: "course-martial",
          location_id: "location-roma",
          instructor_user_id: null,
          title: "Martial Flow",
          description: "Tecnica e mobilita.",
          discipline: body.discipline ?? "Arti marziali",
          image_url: null,
          requires_active_subscription: body.requires_active_subscription ?? true,
          status: "published",
          sessions: [],
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/courses/course-calisthenics") && method === "PATCH") {
      return jsonResponse({ ...adminCoursesResponse[0], title: "Calisthenics Foundation aggiornato" });
    }

    if (url.endsWith("/admin/courses/course-calisthenics/archive") && method === "POST") {
      return jsonResponse({ ...adminCoursesResponse[0], status: "archived" });
    }

    if (url.endsWith("/admin/courses/course-calisthenics") && method === "DELETE") {
      return jsonResponse({ id: "course-calisthenics", deleted: true });
    }

    if (url.endsWith("/admin/courses/course-martial/image") && method === "POST") {
      return jsonResponse({
        ...adminCoursesResponse[0],
        id: "course-martial",
        title: "Martial Flow",
        discipline: "Arti marziali",
        image_url: "/uploads/martial-flow.jpg",
        requires_active_subscription: false,
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
            occurs_on: null,
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
            occurs_on: null,
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

    if (url.endsWith("/admin/courses/course-calisthenics/sessions") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as {
        occurs_on?: string;
        starts_at?: string;
        ends_at?: string;
        capacity?: number;
        cancellation_deadline_hours?: number;
      };
      return jsonResponse(
        {
          id: "session-single",
          course_id: "course-calisthenics",
          weekday: 0,
          occurs_on: body.occurs_on,
          starts_at: body.starts_at,
          ends_at: body.ends_at,
          capacity: body.capacity,
          cancellation_deadline_hours: body.cancellation_deadline_hours,
          is_active: true,
        },
        { status: 201 },
      );
    }

    if (url.endsWith("/admin/course-sessions/session-calisthenics") && method === "PATCH") {
      return jsonResponse({ ...adminCoursesResponse[0].sessions[0], capacity: 14 });
    }

    if (url.endsWith("/bookings") && method === "POST") {
      const body = JSON.parse(init?.body?.toString() ?? "{}") as {
        course_session_id?: string;
        occurs_on?: string;
      };
      let bookingStatus: "confirmed" | "waitlisted" = "waitlisted";
      catalogState = catalogState.map((course) => ({
        ...course,
        sessions: course.sessions.map((courseSession) => {
          if (
            courseSession.id !== body.course_session_id ||
            courseSession.occurs_on !== body.occurs_on ||
            courseSession.available_spots <= 0
          ) {
            return courseSession;
          }
          bookingStatus = "confirmed";
          return { ...courseSession, available_spots: courseSession.available_spots - 1 };
        }),
      }));
      const createdBooking: Booking = {
        id: "booking-new",
        user_id: "user-1",
        course_session_id: body.course_session_id ?? "session-calisthenics",
        occurs_on: body.occurs_on ?? "2026-08-31",
        status: bookingStatus,
        created_at: "2026-08-24T12:00:00Z",
        cancelled_at: null,
      };
      bookingState = [createdBooking, ...bookingState];
      return jsonResponse(createdBooking, { status: 201 });
    }

    if (url.includes("/bookings/") && method === "DELETE") {
      const bookingId = url.split("/bookings/")[1];
      const cancelledBooking = bookingState.find((booking) => booking.id === bookingId);
      if (cancelledBooking === undefined) {
        return jsonResponse({ detail: "Not found" }, { status: 404 });
      }
      bookingState = bookingState.filter((booking) => booking.id !== bookingId);
      if (cancelledBooking.status === "confirmed") {
        catalogState = catalogState.map((course) => ({
          ...course,
          sessions: course.sessions.map((courseSession) =>
            courseSession.id === cancelledBooking.course_session_id &&
            courseSession.occurs_on === cancelledBooking.occurs_on
              ? {
                  ...courseSession,
                  available_spots: Math.min(
                    courseSession.capacity,
                    courseSession.available_spots + 1,
                  ),
                }
              : courseSession,
          ),
        }));
      }
      return jsonResponse({
        ...cancelledBooking,
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

    await screen.findByRole("heading", { name: "Controlla la posta" });
    expect(screen.getByText(/nuovo@example.com/)).toBeInTheDocument();
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

  it("offers a verification resend after valid credentials for an unverified account", async () => {
    const fetchMock = installFetchMock();
    render(<App />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "unverified@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-segreta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entra nell'area utente" }));

    await screen.findByRole("heading", { name: "Controlla la posta" });
    fireEvent.click(screen.getByRole("button", { name: "Invia di nuovo" }));
    await screen.findByText(/riceverai una nuova email/i);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/email/resend",
      expect.objectContaining({
        body: JSON.stringify({ email: "unverified@example.com" }),
        method: "POST",
      }),
    );
  });

  it("confirms an email from the verification link", async () => {
    const fetchMock = installFetchMock();
    window.history.pushState({}, "", "/?auth=verify-email&token=verification-token-value");

    render(<App />);

    await screen.findByRole("heading", { name: "Email confermata" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/email/verify",
      expect.objectContaining({
        body: JSON.stringify({ token: "verification-token-value" }),
        method: "POST",
      }),
    );
  });

  it("requests password recovery without revealing whether the account exists", async () => {
    const fetchMock = installFetchMock();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Password dimenticata?" }));
    expect(screen.getByText(/l'email e il tuo identificativo di accesso/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "utente@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invia istruzioni" }));

    await screen.findByText(/riceverai le istruzioni via email/i);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/password/forgot",
      expect.objectContaining({
        body: JSON.stringify({ email: "utente@example.com" }),
        method: "POST",
      }),
    );
  });

  it("sets a new password from a recovery link", async () => {
    const fetchMock = installFetchMock();
    window.history.pushState({}, "", "/?auth=reset-password&token=password-reset-token-value");

    render(<App />);

    expect(screen.getByRole("heading", { name: "Scegli una nuova password" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "NuovaPassword123!" },
    });
    fireEvent.change(screen.getByLabelText("Conferma password"), {
      target: { value: "NuovaPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));

    await screen.findByText("Password aggiornata. Ora puoi accedere.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/password/reset",
      expect.objectContaining({
        body: JSON.stringify({
          token: "password-reset-token-value",
          password: "NuovaPassword123!",
        }),
        method: "POST",
      }),
    );
  });

  it("lets a new collaborator configure 2FA after entering credentials", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "collaborator@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password-segreta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entra nell'area utente" }));

    await screen.findByRole("heading", { name: "Configura il 2FA" });
    expect(
      screen.getByRole("img", { name: "QR Code per configurare il 2FA" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Chiave manuale 2FA")).toHaveValue("JBSWY3DPEHPK3PXP");
    fireEvent.change(screen.getByLabelText("Codice 2FA"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Attiva e accedi" }));

    await screen.findByRole("heading", { level: 2, name: "Corsi migliori" });
    expect(screen.getByRole("button", { name: "Vai all'area personale" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Utenti" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/auth/2fa/confirm",
      expect.objectContaining({
        body: JSON.stringify({ setup_token: "staff-setup-token", totp_code: "123456" }),
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

  it("keeps collaborators in course management without loading user data", async () => {
    const fetchMock = installFetchMock();
    localStorage.setItem(
      "chiron.user.session",
      JSON.stringify({
        access_token: "staff-access-token",
        refresh_token: "staff-refresh-token",
        token_type: "bearer",
        user: { id: "staff-1", email: "staff@example.com", role: "staff" },
      }),
    );

    render(<App />);

    await screen.findByRole("heading", { level: 2, name: "Corsi migliori" });
    expect(screen.queryByRole("button", { name: "Utenti" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:8000/admin/users",
      expect.anything(),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:8000/admin/subscriptions",
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Corsi" }));
    expect(screen.getByRole("heading", { name: "Corsi e sessioni" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nuova disciplina" })).not.toBeInTheDocument();
  });

  it("lets collaborators switch to their personal area and book a course", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-25T12:00:00"));
    const fetchMock = installFetchMock();
    localStorage.setItem(
      "chiron.user.session",
      JSON.stringify({
        access_token: "staff-access-token",
        refresh_token: "staff-refresh-token",
        token_type: "bearer",
        user: { id: "staff-1", email: "staff@example.com", role: "staff" },
      }),
    );

    render(<App />);

    await screen.findByRole("heading", { level: 2, name: "Corsi migliori" });
    fireEvent.click(screen.getByRole("button", { name: "Vai all'area personale" }));

    const catalog = await screen.findByRole("region", { name: "Prenota una sessione" });
    expect(screen.getByText("Area utente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vai al backoffice" })).toBeInTheDocument();
    fireEvent.click(within(catalog).getByRole("button", { name: "Prenota" }));

    expect(await screen.findByText("Prenotazione confermata.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Vai al backoffice" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Corsi migliori" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Utenti" })).not.toBeInTheDocument();
  });

  it("shows course session attendees from the admin calendar", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.click(screen.getByRole("button", { name: "Calendario" }));
    expect(await screen.findByText("9 su 10 posti liberi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prenotati" }));

    expect(await screen.findByText("Mario Rossi")).toBeInTheDocument();
    expect(screen.getByText("Anna Bianchi")).toBeInTheDocument();
    expect(screen.getByText("1 confermati")).toBeInTheDocument();
    expect(screen.getByText("1 in lista d'attesa")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^http:\/\/localhost:8000\/admin\/course-sessions\/session-calisthenics\/attendees\?occurs_on=\d{4}-\d{2}-\d{2}$/,
      ),
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
    fireEvent.click(screen.getByRole("button", { name: "Nuova sede" }));
    fireEvent.change(screen.getByLabelText("Nome sede"), { target: { value: "Chiron Milano" } });
    fireEvent.change(screen.getByLabelText("Indirizzo"), { target: { value: "Via Milano 2" } });
    fireEvent.change(screen.getByLabelText("Citta"), { target: { value: "Milano" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea sede" }));

    await screen.findByText("Sede creata.");
    const adminNotice = screen.getByRole("status");
    expect(adminNotice).toHaveClass("admin-notice");
    fireEvent.click(within(adminNotice).getByRole("button", { name: "Chiudi notifica" }));
    expect(screen.queryByText("Sede creata.")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /disattiva sede Chiron Roma/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tutti i corsi, le lezioni, le prenotazioni e le foto collegate verranno eliminati",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:8000/admin/locations/location-roma/deactivate",
      expect.objectContaining({ method: "POST" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferma disattivazione" }));

    await screen.findByText("Sede disattivata. Corsi eliminati: 1.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/locations/location-roma/deactivate",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Corsi" }));
    expect(screen.queryByRole("heading", { name: "Calisthenics Foundation" })).not.toBeInTheDocument();
  });

  it("permanently deletes a location and its courses after confirmation", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Sedi" }));
    fireEvent.click(
      screen.getByRole("button", { name: /elimina definitivamente sede Chiron Roma/i }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "La sede e tutti i corsi, le lezioni, le prenotazioni e le foto collegate",
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    await screen.findByText("Sede eliminata definitivamente. Corsi eliminati: 1.");
    expect(screen.queryByRole("heading", { name: "Chiron Roma" })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Nuovo corso" }));
    fireEvent.change(screen.getByLabelText("Titolo corso"), { target: { value: "Martial Flow" } });
    fireEvent.change(screen.getByLabelText("Descrizione corso"), {
      target: { value: "Tecnica e mobilita." },
    });
    fireEvent.change(screen.getByLabelText("Foto corso"), {
      target: { files: [new File(["image"], "martial-flow.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /richiede iscrizione attiva/i }));
    fireEvent.click(screen.getByRole("button", { name: "Crea corso" }));

    await screen.findByText("Corso creato.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses",
      expect.objectContaining({
        body: expect.stringContaining('"requires_active_subscription":false'),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-martial/image",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const imageUploadCall = fetchMock.mock.calls.find(([url]) =>
      url.toString().endsWith("/admin/courses/course-martial/image"),
    );
    const imageUploadBody = imageUploadCall?.[1]?.body;
    expect(imageUploadBody).toBeInstanceOf(FormData);
    expect((imageUploadBody as FormData).get("file")).toBeInstanceOf(File);
    expect((imageUploadBody as FormData).get("image")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Gestisci Calisthenics Foundation" }));
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
    fireEvent.change(screen.getByLabelText("Ora inizio"), {
      target: { value: "18:00" },
    });
    fireEvent.change(screen.getByLabelText("Ora fine"), {
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

    fireEvent.click(screen.getByRole("radio", { name: "Data singola" }));
    fireEvent.change(screen.getByLabelText("Data della lezione"), {
      target: { value: "2026-09-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi lezione" }));

    await screen.findByText("Lezione singola creata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-calisthenics/sessions",
      expect.objectContaining({
        body: expect.stringContaining('"occurs_on":"2026-09-20"'),
        method: "POST",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Modifica Lunedi 18:00" }));
    fireEvent.change(screen.getByLabelText("Capienza Lunedi 18:00"), {
      target: { value: "14" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva Lunedi 18:00" }));

    await screen.findByText("Lezione aggiornata.");
  });

  it("lets an admin add and immediately select a custom discipline", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Corsi" }));
    fireEvent.click(screen.getByRole("button", { name: "Nuovo corso" }));
    fireEvent.click(screen.getByRole("button", { name: "Nuova disciplina" }));
    fireEvent.change(screen.getByLabelText("Nome nuova disciplina"), {
      target: { value: "Danza aerea" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi disciplina" }));

    await screen.findByText("Disciplina “Danza aerea” aggiunta.");
    expect(screen.getByLabelText("Disciplina")).toHaveValue("Danza aerea");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/disciplines",
      expect.objectContaining({
        body: JSON.stringify({ name: "Danza aerea" }),
        method: "POST",
      }),
    );
  });

  it("requires confirmation and removes a permanently deleted course from the UI", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Corsi" }));
    fireEvent.click(screen.getByRole("button", { name: "Gestisci Calisthenics Foundation" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Elimina definitivamente Calisthenics Foundation",
      }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Verranno eliminate tutte le lezioni, le prenotazioni e le foto del corso.",
    );
    expect(screen.getByRole("heading", { name: "Calisthenics Foundation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    await screen.findByText(
      "Corso eliminato definitivamente insieme a lezioni e prenotazioni.",
    );
    expect(
      screen.queryByRole("heading", { name: "Calisthenics Foundation" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/courses/course-calisthenics",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("keeps course management compact and searchable", async () => {
    installFetchMock();

    render(<App />);
    await loginAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Corsi" }));

    expect(screen.queryByRole("button", { name: /modifica Calisthenics/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cerca corsi da gestire"), {
      target: { value: "pole" },
    });
    expect(screen.getByText("Nessun corso corrisponde alla ricerca.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancella ricerca" }));
    const manageButton = screen.getByRole("button", { name: "Gestisci Calisthenics Foundation" });
    expect(manageButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(manageButton);

    expect(manageButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /modifica Calisthenics/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Orari attivi Calisthenics Foundation")).toBeInTheDocument();
  });

  it("manages users and subscriptions from a dedicated backoffice tab", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();

    fireEvent.click(screen.getByRole("button", { name: "Utenti" }));
    expect(screen.getByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByText("Accesso amministratore senza scadenza")).toBeInTheDocument();
    expect(screen.getByText("Iscrizione scaduta il 01/07/2026")).toHaveClass(
      "expired-membership",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /modifica dati e permessi admin@example.com/i }),
    );
    expect(screen.queryByLabelText("Inizio iscrizione")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /aggiorna iscrizione admin@example.com/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /chiudi modifica admin@example.com/i }));
    fireEvent.click(screen.getByRole("button", { name: "Nuovo utente" }));
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

    fireEvent.click(screen.getByRole("button", { name: /modifica dati e iscrizione member@example.com/i }));
    fireEvent.change(screen.getByLabelText("Durata iscrizione"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /aggiorna iscrizione member@example.com/i }));

    await screen.findByText("Iscrizione aggiornata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/subscriptions/subscription-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /chiudi modifica member@example.com/i }));
    fireEvent.click(screen.getByRole("button", { name: /sospendi accesso member@example.com/i }));

    await screen.findByText(
      "Account disabilitato. Le prenotazioni attive sono state rilasciate.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/users/user-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("lets an admin appoint a user as course collaborator", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Utenti" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /modifica dati e iscrizione member@example.com/i,
      }),
    );
    fireEvent.change(screen.getByLabelText("Ruolo"), { target: { value: "staff" } });
    fireEvent.click(screen.getByRole("button", { name: /salva dati e permessi member@example.com/i }));

    await screen.findByText("Utente aggiornato.");
    expect(screen.getByText("Collaboratore")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/users/user-1",
      expect.objectContaining({
        body: expect.stringContaining('"role":"staff"'),
        method: "PATCH",
      }),
    );
  });

  it("explains account deletion before running it", async () => {
    const fetchMock = installFetchMock();

    render(<App />);
    await loginAdmin();
    fireEvent.click(screen.getByRole("button", { name: "Utenti" }));
    fireEvent.click(
      screen.getByRole("button", { name: /elimina account member@example.com/i }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Account, profilo, iscrizioni e prenotazioni saranno eliminati definitivamente",
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "http://localhost:8000/admin/users/user-1",
      expect.objectContaining({ method: "DELETE" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Conferma eliminazione" }));

    await screen.findByText("Utente eliminato.");
    expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/admin/users/user-1",
      expect.objectContaining({ method: "DELETE" }),
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

  it("searches courses instantly by name, discipline and location", async () => {
    installFetchMock();

    render(<App />);
    await login();

    const catalog = screen.getByRole("region", { name: "Prenota una sessione" });
    const search = within(catalog).getByRole("searchbox", { name: "Cerca corsi" });
    fireEvent.change(search, { target: { value: "pole milano" } });

    expect(within(catalog).getByText("Pole Flow")).toBeInTheDocument();
    expect(within(catalog).queryByText("Calisthenics Foundation")).not.toBeInTheDocument();
    expect(within(catalog).getByText("1 corso")).toBeInTheDocument();

    fireEvent.click(within(catalog).getByRole("button", { name: "Cancella ricerca" }));
    expect(within(catalog).getByText("Calisthenics Foundation")).toBeInTheDocument();
    expect(within(catalog).getByText("2 corsi")).toBeInTheDocument();
  });

  it("books and cancels a session with clear status feedback", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-25T12:00:00"));
    const fetchMock = installFetchMock();

    render(<App />);
    await login();

    const calisthenicsCard = screen.getByRole("article", { name: "Calisthenics Foundation" });
    fireEvent.click(within(calisthenicsCard).getByRole("button", { name: /prenota/i }));

    await screen.findByText("Prenotazione confermata.");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings",
      expect.objectContaining({
        body: JSON.stringify({
          course_session_id: "session-calisthenics",
          occurs_on: "2026-08-31",
        }),
        method: "POST",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /cancella Pole Flow/i }));

    await waitFor(() => {
      expect(screen.getByText("Prenotazione cancellata.")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings/booking-existing",
      expect.objectContaining({ method: "DELETE" }),
    );

    const bookingsPanel = screen.getByRole("region", { name: "Le tue prenotazioni" });
    expect(within(bookingsPanel).queryByRole("heading", { name: "Pole Flow" })).not.toBeInTheDocument();
    expect(within(bookingsPanel).queryByRole("button", { name: /cancella Pole Flow/i })).not.toBeInTheDocument();
  });

  it("hides cancelled bookings returned by the dashboard", async () => {
    installFetchMock(subscriptionResponse, [
      {
        ...bookingsResponse[0],
        status: "cancelled",
        cancelled_at: "2026-08-24T12:30:00Z",
      },
    ]);

    render(<App />);
    await login();

    const bookingsPanel = screen.getByRole("region", { name: "Le tue prenotazioni" });
    expect(within(bookingsPanel).getByText("Non hai prenotazioni attive.")).toBeInTheDocument();
    expect(within(bookingsPanel).queryByRole("heading", { name: "Pole Flow" })).not.toBeInTheDocument();
  });

  it("hides a booking after the lesson end time on the same day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-02T21:01:00"));
    installFetchMock();

    render(<App />);
    await login();

    const bookingsPanel = screen.getByRole("region", { name: "Le tue prenotazioni" });
    expect(within(bookingsPanel).getByText("Non hai prenotazioni attive.")).toBeInTheDocument();
    expect(within(bookingsPanel).queryByRole("heading", { name: "Pole Flow" })).not.toBeInTheDocument();
  });

  it("shows one compact booking action and switches the selected occurrence", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-25T12:00:00"));
    const fetchMock = installFetchMock({
      ...subscriptionResponse,
      duration_days: 60,
      expires_on: "2026-09-30",
    });

    render(<App />);
    await login();

    const courseCard = screen.getByRole("article", { name: "Calisthenics Foundation" });
    expect(within(courseCard).getAllByRole("button", { name: "Prenota" })).toHaveLength(1);

    fireEvent.change(within(courseCard).getByLabelText("Lezione Calisthenics Foundation"), {
      target: { value: "session-calisthenics:2026-09-07" },
    });
    expect(within(courseCard).getByText("7 posti liberi")).toBeInTheDocument();
    fireEvent.click(within(courseCard).getByRole("button", { name: "Prenota" }));

    await screen.findByText("Prenotazione confermata.");
    expect(within(courseCard).getByText(/6 posti liberi/)).toBeInTheDocument();
    expect(within(courseCard).getByRole("button", { name: "Prenotato" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings",
      expect.objectContaining({
        body: JSON.stringify({
          course_session_id: "session-calisthenics",
          occurs_on: "2026-09-07",
        }),
        method: "POST",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /cancella Calisthenics Foundation/i }));
    await screen.findByText("Prenotazione cancellata.");
    expect(within(courseCard).getByText("7 posti liberi")).toBeInTheDocument();
    expect(within(courseCard).getByRole("button", { name: "Prenota" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/bookings/booking-new",
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

  it("keeps courses open to non-members bookable", async () => {
    const openCatalog = catalogResponse.map((course) =>
      course.id === "course-calisthenics"
        ? { ...course, requires_active_subscription: false }
        : course,
    );
    installFetchMock(
      { ...subscriptionResponse, is_active: false },
      bookingsResponse,
      openCatalog,
    );

    render(<App />);
    await login();

    const calisthenicsCard = screen.getByRole("article", { name: "Calisthenics Foundation" });
    expect(within(calisthenicsCard).getByText("Aperto a tutti")).toBeInTheDocument();
    expect(within(calisthenicsCard).getByRole("button", { name: "Prenota" })).toBeEnabled();
  });

  it("disables lessons scheduled after the membership expires", async () => {
    installFetchMock();

    render(<App />);
    await login();

    const poleCard = screen.getByRole("article", { name: "Pole Flow" });
    expect(
      within(poleCard).getByRole("button", { name: "Iscrizione richiesta" }),
    ).toBeDisabled();
  });
});
