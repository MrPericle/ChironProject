import {
  Activity,
  Archive,
  ArrowRight,
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  Home,
  ImagePlus,
  ListChecks,
  LockKeyhole,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import {
  AdminCourse,
  AdminCourseSessionAvailability,
  AdminCourseSessionAttendee,
  AdminStats,
  AdminUser,
  ApiError,
  Booking,
  CatalogCourse,
  CatalogSession,
  ChironApi,
  CourseDiscipline,
  CourseDisciplineOption,
  CoursePayload,
  CourseSession,
  CourseStatus,
  Location,
  LocationPayload,
  SubscriptionInfo,
  TokenPair,
  User,
} from "../lib/api";
import { accessTokenRefreshDelay } from "../lib/session";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const api = new ChironApi(apiBaseUrl);
const sessionStorageKey = "chiron.user.session";

const weekdays = ["Domenica", "Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato"];

type LoadState = "idle" | "loading" | "ready" | "error";

type Filters = {
  query: string;
  locationId: string;
  weekday: string;
  availableOnly: boolean;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type AuthMode = "login" | "register";
type TwoFactorStep =
  | { kind: "verify"; token: string }
  | { kind: "setup"; token: string; secret: string; otpauthUri: string };

type MobileView = "courses" | "calendar" | "bookings" | "profile";
type AdminTab = "dashboard" | "calendar" | "users" | "courses" | "locations";
type ScheduleMode = "weekly" | "single";
type WorkspaceMode = "backoffice" | "personal";

const legacyDisciplineLabels: Record<string, string> = {
  calisthenics: "Sala",
  martial_arts: "Arti marziali",
  mobility: "Sala",
  other: "Altro",
  pole_dance: "Pole",
};

function disciplineLabel(discipline: CourseDiscipline): string {
  return legacyDisciplineLabels[discipline] ?? discipline;
}

const userStatusLabels: Record<AdminUser["status"], string> = {
  active: "Account attivo",
  disabled: "Account disabilitato",
  deleted: "Account eliminato",
};

const userRoleLabels: Record<AdminUser["role"], string> = {
  admin: "Amministratore",
  staff: "Collaboratore",
  user: "Utente",
};

const courseStatusLabels: Record<CourseStatus, string> = {
  archived: "Archiviato",
  draft: "Bozza",
  published: "Pubblicato",
};

function isBackofficeRole(user: User | null): boolean {
  return user?.role === "admin" || user?.role === "staff";
}

function readStoredSession(): TokenPair | null {
  const raw = localStorage.getItem(sessionStorageKey);
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw) as TokenPair;
  } catch {
    localStorage.removeItem(sessionStorageKey);
    return null;
  }
}

function saveSession(session: TokenPair): void {
  localStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string): string {
  return value.slice(0, 5);
}

function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function upcomingDates(days = 14): string[] {
  const today = new Date();
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return localIsoDate(date);
  });
}

function occurrenceKey(session: Pick<CatalogSession, "id" | "occurs_on">): string {
  return `${session.id}:${session.occurs_on}`;
}

function bookingForOccurrence(
  bookings: Booking[],
  session: Pick<CatalogSession, "id" | "occurs_on">,
): Booking | undefined {
  return bookings.find(
    (booking) =>
      booking.status !== "cancelled" &&
      booking.course_session_id === session.id &&
      booking.occurs_on === session.occurs_on,
  );
}

function adjustAvailableSpots(
  courses: CatalogCourse[],
  target: Pick<CatalogSession, "id" | "occurs_on">,
  adjustment: number,
): CatalogCourse[] {
  return courses.map((course) => ({
    ...course,
    sessions: course.sessions.map((courseSession) =>
      occurrenceKey(courseSession) === occurrenceKey(target)
        ? {
            ...courseSession,
            available_spots: Math.min(
              courseSession.capacity,
              Math.max(0, courseSession.available_spots + adjustment),
            ),
          }
        : courseSession,
    ),
  }));
}

function bookedActionLabel(booking: Booking): string {
  return booking.status === "waitlisted" ? "In lista d’attesa" : "Prenotato";
}

function canBookOccurrence(
  subscription: SubscriptionInfo | null,
  session: CatalogSession,
  requiresActiveSubscription: boolean,
): boolean {
  if (!requiresActiveSubscription) {
    return true;
  }
  return (
    subscription?.is_active === true &&
    session.occurs_on >= subscription.starts_on &&
    session.occurs_on <= subscription.expires_on
  );
}

function absoluteImageUrl(imageUrl: string | null): string | null {
  if (imageUrl === null) {
    return null;
  }
  return imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
    ? imageUrl
    : `${apiBaseUrl}${imageUrl}`;
}

function courseForSession(courses: CatalogCourse[], sessionId: string): CatalogCourse | undefined {
  return courses.find((course) => course.sessions.some((session) => session.id === sessionId));
}

function sessionForBooking(
  courses: CatalogCourse[],
  booking: Booking,
): CatalogSession | undefined {
  return courseForSession(courses, booking.course_session_id)?.sessions.find(
    (session) =>
      session.id === booking.course_session_id && session.occurs_on === booking.occurs_on,
  );
}

function bookingEndsAt(courses: CatalogCourse[], booking: Booking): Date | null {
  const courseSession = sessionForBooking(courses, booking);
  if (courseSession === undefined) {
    return null;
  }

  const endsAt = new Date(`${booking.occurs_on}T${courseSession.ends_at}`);
  return Number.isNaN(endsAt.getTime()) ? null : endsAt;
}

function activeBookings(
  bookings: Booking[],
  courses: CatalogCourse[],
  now = new Date(),
): Booking[] {
  const today = localIsoDate(now);
  return bookings.filter((booking) => {
    if (booking.status === "cancelled") {
      return false;
    }

    const endsAt = bookingEndsAt(courses, booking);
    return endsAt === null ? booking.occurs_on >= today : endsAt.getTime() > now.getTime();
  });
}

function nextBookingExpiration(
  bookings: Booking[],
  courses: CatalogCourse[],
  now = new Date(),
): Date | null {
  return bookings.reduce<Date | null>((nextExpiration, booking) => {
    if (booking.status === "cancelled") {
      return nextExpiration;
    }

    const endsAt = bookingEndsAt(courses, booking);
    if (endsAt === null || endsAt.getTime() <= now.getTime()) {
      return nextExpiration;
    }
    return nextExpiration === null || endsAt.getTime() < nextExpiration.getTime()
      ? endsAt
      : nextExpiration;
  }, null);
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Credenziali non valide o sessione scaduta.";
    }
    if (error.message === "Active subscription required") {
      return "Serve un'iscrizione attiva per prenotare.";
    }
    return error.message;
  }

  return "Non riesco a parlare con il server. Riprova tra poco.";
}

function filteredCourses(courses: CatalogCourse[], filters: Filters): CatalogCourse[] {
  const queryTokens = filters.query
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("it-IT")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return courses
    .map((course) => {
      const searchableCourse = [
        course.title,
        course.discipline,
        course.location_name,
        course.description ?? "",
      ]
        .join(" ")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("it-IT");
      if (!queryTokens.every((token) => searchableCourse.includes(token))) {
        return null;
      }
      if (filters.locationId !== "all" && course.location_id !== filters.locationId) {
        return null;
      }

      const sessions = course.sessions.filter((session) => {
        const matchesWeekday = filters.weekday === "all" || String(session.weekday) === filters.weekday;
        const matchesAvailability = !filters.availableOnly || session.available_spots > 0;
        return matchesWeekday && matchesAvailability;
      });

      if (sessions.length === 0) {
        return null;
      }

      return { ...course, sessions };
    })
    .filter((course): course is CatalogCourse => course !== null);
}

export function App() {
  const [session, setSession] = useState<TokenPair | null>(() => readStoredSession());
  const [user, setUser] = useState<User | null>(session?.user ?? null);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [filters, setFilters] = useState<Filters>({
    query: "",
    locationId: "all",
    weekday: "all",
    availableOnly: false,
  });
  const [loadState, setLoadState] = useState<LoadState>(session === null ? "idle" : "loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("courses");
  const [bookingClockTick, setBookingClockTick] = useState(0);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("backoffice");

  useEffect(() => {
    if (session === null) {
      return;
    }
    const isPersonalWorkspace =
      session.user.role === "user" ||
      (session.user.role === "staff" && workspaceMode === "personal");
    if (!isPersonalWorkspace) {
      setLoadState("ready");
      return;
    }

    let ignore = false;

    const loadDashboard = (showLoading: boolean): void => {
      if (showLoading) {
        setLoadState("loading");
      }
      api.dashboard(session.access_token).then((dashboard) => {
        if (ignore) {
          return;
        }
        setUser(dashboard.user);
        setCourses(dashboard.courses);
        setBookings(dashboard.bookings);
        setSubscription(dashboard.subscription);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (ignore) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(sessionStorageKey);
          setSession(null);
          setUser(null);
          setCourses([]);
          setBookings([]);
          setSubscription(null);
          setLoadState("idle");
          setNotice({
            tone: "error",
            message: "Profilo o permessi aggiornati. Accedi di nuovo per continuare.",
          });
          return;
        }
        setNotice({ tone: "error", message: describeError(error) });
        setLoadState("error");
      });
    };

    loadDashboard(true);
    const refreshOnFocus = (): void => loadDashboard(false);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      ignore = true;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [session, workspaceMode]);

  useEffect(() => {
    if (session === null) {
      return;
    }

    let cancelled = false;
    let refreshTimer: number | undefined;

    const renewSession = async (): Promise<void> => {
      try {
        const renewedSession = await api.refresh(session.refresh_token);
        if (cancelled) {
          return;
        }
        saveSession(renewedSession);
        setSession(renewedSession);
        setUser(renewedSession.user);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          localStorage.removeItem(sessionStorageKey);
          setSession(null);
          setUser(null);
          setCourses([]);
          setBookings([]);
          setSubscription(null);
          setLoadState("idle");
          setNotice({
            tone: "error",
            message: "Sessione terminata. Accedi di nuovo per continuare.",
          });
          return;
        }
        refreshTimer = window.setTimeout(() => void renewSession(), 30_000);
      }
    };

    refreshTimer = window.setTimeout(
      () => void renewSession(),
      accessTokenRefreshDelay(session.access_token),
    );

    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }
    };
  }, [session]);

  useEffect(() => {
    const now = new Date();
    const nextExpiration = nextBookingExpiration(bookings, courses, now);
    if (nextExpiration === null) {
      return;
    }

    const millisecondsUntilExpiration = nextExpiration.getTime() - now.getTime() + 100;
    const timer = window.setTimeout(
      () => setBookingClockTick(bookingClockTick + 1),
      Math.min(Math.max(millisecondsUntilExpiration, 100), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [bookingClockTick, bookings, courses]);

  const locations = useMemo(() => {
    const uniqueLocations = new Map<string, string>();
    for (const course of courses) {
      uniqueLocations.set(course.location_id, course.location_name);
    }
    return [...uniqueLocations.entries()];
  }, [courses]);

  const visibleCourses = useMemo(() => filteredCourses(courses, filters), [courses, filters]);
  const currentBookings = activeBookings(bookings, courses);
  const activeBookingCount = currentBookings.length;

  async function handleLogin(email: string, password: string): Promise<TwoFactorStep | null> {
    setNotice(null);
    setLoadState("loading");

    try {
      const result = await api.login({ email, password });
      if ("requires_2fa" in result) {
        setLoadState("idle");
        return { kind: "verify", token: result.challenge_token };
      }
      if ("requires_2fa_setup" in result) {
        const setup = await api.setupTwoFactor(result.setup_token);
        setLoadState("idle");
        return {
          kind: "setup",
          token: result.setup_token,
          secret: setup.secret,
          otpauthUri: setup.otpauth_uri,
        };
      }
      const nextSession = result;
      saveSession(nextSession);
      setWorkspaceMode("backoffice");
      setSession(nextSession);
      setUser(nextSession.user);
      return null;
    } catch (error) {
      setLoadState("idle");
      setNotice({ tone: "error", message: describeError(error) });
      return null;
    }
  }

  async function handleVerifyTwoFactor(step: TwoFactorStep, totpCode: string): Promise<boolean> {
    setNotice(null);
    setLoadState("loading");
    try {
      const nextSession =
        step.kind === "setup"
          ? await api.confirmTwoFactor(step.token, totpCode)
          : await api.verifyTwoFactor(step.token, totpCode);
      saveSession(nextSession);
      setWorkspaceMode("backoffice");
      setSession(nextSession);
      setUser(nextSession.user);
      return true;
    } catch (error) {
      setLoadState("idle");
      setNotice({ tone: "error", message: describeError(error) });
      return false;
    }
  }

  async function handleRegister(payload: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<void> {
    setNotice(null);
    setLoadState("loading");

    try {
      const nextSession = await api.register({
        email: payload.email,
        first_name: payload.firstName,
        last_name: payload.lastName,
        password: payload.password,
      });
      saveSession(nextSession);
      setWorkspaceMode("backoffice");
      setSession(nextSession);
      setUser(nextSession.user);
    } catch (error) {
      setLoadState("idle");
      setNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleCreateBooking(course: CatalogCourse, courseSession: CatalogSession): Promise<void> {
    if (session === null) {
      return;
    }
    if (!canBookOccurrence(subscription, courseSession, course.requires_active_subscription)) {
      setNotice({
        tone: "error",
        message: "Serve un'iscrizione valida nella data della lezione per prenotare.",
      });
      return;
    }

    setPendingSessionId(occurrenceKey(courseSession));
    setNotice(null);

    try {
      const booking = await api.createBooking(
        session.access_token,
        courseSession.id,
        courseSession.occurs_on,
      );
      setBookings((current) => [
        booking,
        ...current.filter(
          (item) =>
            item.course_session_id !== booking.course_session_id ||
            item.occurs_on !== booking.occurs_on,
        ),
      ]);
      if (booking.status === "confirmed") {
        setCourses((current) => adjustAvailableSpots(current, courseSession, -1));
      }
      try {
        setCourses(await api.catalog(session.access_token));
      } catch {
        // The optimistic count remains valid for this user's completed action.
      }
      setNotice({
        tone: "success",
        message: booking.status === "waitlisted" ? "Sei in lista attesa." : "Prenotazione confermata.",
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: `${course.title}: ${describeError(error)}`,
      });
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleCancelBooking(booking: Booking): Promise<void> {
    if (session === null) {
      return;
    }

    setPendingBookingId(booking.id);
    setNotice(null);

    try {
      await api.cancelBooking(session.access_token, booking.id);
      setBookings((current) => current.filter((item) => item.id !== booking.id));
      if (booking.status === "confirmed") {
        setCourses((current) =>
          adjustAvailableSpots(
            current,
            { id: booking.course_session_id, occurs_on: booking.occurs_on },
            1,
          ),
        );
      }
      try {
        setCourses(await api.catalog(session.access_token));
      } catch {
        // Keep the immediate local update if catalog synchronization is unavailable.
      }
      setNotice({ tone: "success", message: "Prenotazione cancellata." });
    } catch (error) {
      setNotice({ tone: "error", message: describeError(error) });
    } finally {
      setPendingBookingId(null);
    }
  }

  function handleLogout(): void {
    localStorage.removeItem(sessionStorageKey);
    setSession(null);
    setUser(null);
    setCourses([]);
    setBookings([]);
    setSubscription(null);
    setNotice(null);
    setLoadState("idle");
    setWorkspaceMode("backoffice");
  }

  function handleOpenPersonalArea(): void {
    setNotice(null);
    setLoadState("loading");
    setWorkspaceMode("personal");
  }

  function handleOpenBackoffice(): void {
    setNotice(null);
    setWorkspaceMode("backoffice");
  }

  if (session === null) {
    return (
      <LoginScreen
        notice={notice}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerifyTwoFactor={handleVerifyTwoFactor}
      />
    );
  }

  if (
    isBackofficeRole(session.user) &&
    !(session.user.role === "staff" && workspaceMode === "personal")
  ) {
    return (
      <BackofficeScreen
        session={session}
        user={user ?? session.user}
        onLogout={handleLogout}
        onOpenPersonalArea={session.user.role === "staff" ? handleOpenPersonalArea : undefined}
      />
    );
  }

  return (
    <main className="app-shell" id="main-content">
      <div className={`workspace mobile-view-${mobileView}`}>
        <AppHeader
          user={user}
          onLogout={handleLogout}
          onOpenBackoffice={session.user.role === "staff" ? handleOpenBackoffice : undefined}
        />

        {notice !== null ? (
          <div className={`notice notice-${notice.tone}`} role="status" aria-live="polite">
            {notice.tone === "success" ? <CheckCircle2 aria-hidden="true" /> : <XCircle aria-hidden="true" />}
            <span>{notice.message}</span>
          </div>
        ) : null}

        {loadState === "loading" ? <LoadingDashboard /> : null}
        {loadState === "error" ? <ErrorPanel onRetry={() => setSession({ ...session })} /> : null}

        {loadState === "ready" ? (
          <>
            <OverviewPanel
              bookingsCount={activeBookingCount}
              coursesCount={courses.length}
              subscription={subscription}
            />
            <BookingFocus
              bookings={currentBookings}
              courses={visibleCourses}
              pendingSessionId={pendingSessionId}
              subscription={subscription}
              onCreateBooking={handleCreateBooking}
            />
            <WeeklyCalendar
              bookings={currentBookings}
              courses={courses}
              pendingSessionId={pendingSessionId}
              subscription={subscription}
              onCreateBooking={handleCreateBooking}
            />
            <div className="dashboard-grid">
              <section className="panel catalog-panel" aria-labelledby="catalog-title">
                <SectionHeading
                  icon={<Dumbbell aria-hidden="true" />}
                  eyebrow="Catalogo"
                  title="Prenota una sessione"
                />
                <CatalogFilters
                  filters={filters}
                  locations={locations}
                  onChange={setFilters}
                  resultCount={visibleCourses.length}
                />
                <CourseCatalog
                  bookings={currentBookings}
                  courses={visibleCourses}
                  pendingSessionId={pendingSessionId}
                  subscription={subscription}
                  onCreateBooking={handleCreateBooking}
                />
              </section>

              <aside className="side-stack" aria-label="Area personale">
                <SubscriptionPanel subscription={subscription} />
                <BookingsPanel
                  bookings={currentBookings}
                  courses={courses}
                  pendingBookingId={pendingBookingId}
                  onCancelBooking={handleCancelBooking}
                />
              </aside>
            </div>
            <MobileTabBar activeView={mobileView} onChange={setMobileView} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function BackofficeScreen({
  session,
  user,
  onLogout,
  onOpenPersonalArea,
}: {
  session: TokenPair;
  user: User;
  onLogout: () => void;
  onOpenPersonalArea?: () => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [disciplines, setDisciplines] = useState<CourseDisciplineOption[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const isAdmin = user.role === "admin";

  useEffect(() => {
    let ignore = false;
    setLoadState("loading");

    api
      .adminDashboard(session.access_token, user.role)
      .then((dashboard) => {
        if (ignore) {
          return;
        }
        setLocations(dashboard.locations);
        setCourses(dashboard.courses);
        setDisciplines(dashboard.disciplines);
        setUsers(dashboard.users);
        setStats(dashboard.stats);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (ignore) {
          return;
        }
        setNotice({ tone: "error", message: describeError(error) });
        setLoadState("error");
      });

    return () => {
      ignore = true;
    };
  }, [session.access_token, user.role]);

  useEffect(() => {
    if (!isAdmin && activeTab === "users") {
      setActiveTab("dashboard");
    }
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (notice?.tone !== "success") {
      return;
    }
    const timer = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current));
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activeLocations = locations.filter((location) => location.is_active);
  const activeMembers = stats?.active_members ?? 0;
  const publishedCourses = courses.filter((course) => course.status === "published").length;

  function upsertLocation(location: Location): void {
    setLocations((current) => {
      const existing = current.some((item) => item.id === location.id);
      if (!existing) {
        return [location, ...current];
      }
      return current.map((item) => (item.id === location.id ? location : item));
    });
  }

  function upsertCourse(course: AdminCourse): void {
    setCourses((current) => {
      const existing = current.some((item) => item.id === course.id);
      if (!existing) {
        return [course, ...current];
      }
      return current.map((item) => (item.id === course.id ? course : item));
    });
  }

  function removeCourse(courseId: string): void {
    setCourses((current) => current.filter((course) => course.id !== courseId));
    setStats((current) =>
      current === null
        ? current
        : { ...current, courses: current.courses.filter((course) => course.id !== courseId) },
    );
    void api.adminStats(session.access_token).then(setStats).catch(() => undefined);
  }

  function addDiscipline(discipline: CourseDisciplineOption): void {
    setDisciplines((current) =>
      [...current, discipline].sort(
        (left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name),
      ),
    );
  }

  function applyLocationCascade(locationId: string, nextLocation: Location | null): void {
    const removedCourseIds = new Set(
      courses.filter((course) => course.location_id === locationId).map((course) => course.id),
    );
    setCourses((current) => current.filter((course) => course.location_id !== locationId));
    if (nextLocation === null) {
      setLocations((current) => current.filter((location) => location.id !== locationId));
    } else {
      upsertLocation(nextLocation);
    }
    setStats((current) =>
      current === null
        ? current
        : {
            ...current,
            courses: current.courses.filter((course) => !removedCourseIds.has(course.id)),
            locations:
              nextLocation === null
                ? current.locations.filter((location) => location.id !== locationId)
                : current.locations,
          },
    );
    void api.adminStats(session.access_token).then(setStats).catch(() => undefined);
  }

  function upsertUser(user: AdminUser): void {
    setUsers((current) => {
      const existing = current.some((item) => item.id === user.id);
      if (!existing) {
        return [user, ...current];
      }
      return current.map((item) => (item.id === user.id ? user : item));
    });
  }

  return (
    <main className="backoffice-shell" id="main-content">
      <div className="backoffice-workspace">
        <header className="backoffice-header">
          <BrandHeading context="Backoffice" />
          <div className={onOpenPersonalArea ? "header-actions header-actions-workspace" : "header-actions"}>
            {onOpenPersonalArea ? (
              <button
                aria-label="Vai all'area personale"
                className="secondary-action workspace-switch"
                onClick={onOpenPersonalArea}
                title="Vai all'area personale"
                type="button"
              >
                <CalendarCheck aria-hidden="true" />
                <span className="workspace-switch-label">Area personale</span>
              </button>
            ) : null}
            <div className="user-chip">
              <UserRound aria-hidden="true" />
              <span>{user.email}</span>
            </div>
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Esci">
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="backoffice-layout">
          <nav
            className="admin-tabs"
            aria-label="Sezioni backoffice"
            data-tab-count={isAdmin ? "5" : "4"}
          >
            <button
              aria-label="Dashboard"
              aria-current={activeTab === "dashboard" ? "page" : undefined}
              onClick={() => setActiveTab("dashboard")}
              type="button"
            >
              <Activity aria-hidden="true" />
              <span className="admin-tab-label-full">Dashboard</span>
              <span className="admin-tab-label-mobile" aria-hidden="true">Home</span>
            </button>
            <button
              aria-label="Calendario"
              aria-current={activeTab === "calendar" ? "page" : undefined}
              onClick={() => setActiveTab("calendar")}
              type="button"
            >
              <CalendarDays aria-hidden="true" />
              <span className="admin-tab-label-full">Calendario</span>
              <span className="admin-tab-label-mobile" aria-hidden="true">Agenda</span>
            </button>
            {isAdmin ? (
              <button
                aria-label="Utenti"
                aria-current={activeTab === "users" ? "page" : undefined}
                onClick={() => setActiveTab("users")}
                type="button"
              >
                <UserRound aria-hidden="true" />
                <span className="admin-tab-label-full">Utenti</span>
                <span className="admin-tab-label-mobile" aria-hidden="true">Utenti</span>
              </button>
            ) : null}
            <button
              aria-label="Corsi"
              aria-current={activeTab === "courses" ? "page" : undefined}
              onClick={() => setActiveTab("courses")}
              type="button"
            >
              <Dumbbell aria-hidden="true" />
              <span className="admin-tab-label-full">Corsi</span>
              <span className="admin-tab-label-mobile" aria-hidden="true">Corsi</span>
            </button>
            <button
              aria-label="Sedi"
              aria-current={activeTab === "locations" ? "page" : undefined}
              onClick={() => setActiveTab("locations")}
              type="button"
            >
              <MapPin aria-hidden="true" />
              <span className="admin-tab-label-full">Sedi</span>
              <span className="admin-tab-label-mobile" aria-hidden="true">Sedi</span>
            </button>
          </nav>

          <div className="backoffice-content">
            {notice !== null ? (
              <div
                aria-atomic="true"
                aria-live={notice.tone === "error" ? "assertive" : "polite"}
                className={`notice admin-notice notice-${notice.tone}`}
                role={notice.tone === "error" ? "alert" : "status"}
              >
                {notice.tone === "success" ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <XCircle aria-hidden="true" />
                )}
                <span>{notice.message}</span>
                <button
                  aria-label="Chiudi notifica"
                  className="notice-dismiss"
                  onClick={() => setNotice(null)}
                  title="Chiudi notifica"
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            ) : null}

            {loadState === "loading" ? <LoadingDashboard /> : null}
            {loadState === "error" ? <ErrorPanel onRetry={() => setLoadState("loading")} /> : null}

            {loadState === "ready" ? (
              <>
                {activeTab === "dashboard" ? (
                  <AdminDashboardPanel
                    activeLocations={activeLocations.length}
                    activeMembers={activeMembers}
                    publishedCourses={publishedCourses}
                    stats={stats}
                  />
                ) : null}
                {activeTab === "calendar" ? (
                  <AdminCalendarPanel
                    courses={courses}
                    locations={locations}
                    token={session.access_token}
                  />
                ) : null}
                {isAdmin && activeTab === "users" ? (
                  <UsersManager
                    onNotice={setNotice}
                    onUserChange={upsertUser}
                    token={session.access_token}
                    users={users}
                  />
                ) : null}
                {activeTab === "courses" ? (
                  <CoursesManager
                    courses={courses}
                    disciplines={disciplines}
                    isAdmin={isAdmin}
                    locations={activeLocations}
                    onCourseChange={upsertCourse}
                    onCourseDelete={removeCourse}
                    onDisciplineCreate={addDiscipline}
                    onNotice={setNotice}
                    token={session.access_token}
                  />
                ) : null}
                {activeTab === "locations" ? (
                  <LocationsManager
                    locations={locations}
                    onLocationCascade={applyLocationCascade}
                    onNotice={setNotice}
                    onLocationChange={upsertLocation}
                    token={session.access_token}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function UsersIcon() {
  return <UserRound aria-hidden="true" />;
}

function availableBookingCandidate(courses: CatalogCourse[]): {
  course: CatalogCourse;
  session: CatalogSession;
} | null {
  return (
    courses
      .flatMap((course) =>
        course.sessions
          .filter((session) => session.available_spots > 0)
          .map((session) => ({ course, session })),
      )
      .sort((left, right) =>
        `${left.session.occurs_on}:${left.session.starts_at}`.localeCompare(
          `${right.session.occurs_on}:${right.session.starts_at}`,
        ),
      )[0] ?? null
  );
}

function BookingFocus({
  bookings,
  courses,
  pendingSessionId,
  subscription,
  onCreateBooking,
}: {
  bookings: Booking[];
  courses: CatalogCourse[];
  pendingSessionId: string | null;
  subscription: SubscriptionInfo | null;
  onCreateBooking: (course: CatalogCourse, courseSession: CatalogSession) => void;
}) {
  const candidate = availableBookingCandidate(courses);

  if (candidate === null) {
    return (
      <section className="booking-focus booking-focus-empty" aria-labelledby="booking-focus-title">
        <div>
          <p className="eyebrow">Prenotazione</p>
          <h2 id="booking-focus-title">Nessun posto libero con questi filtri</h2>
          <p>Apri i filtri o guarda le liste attesa nei corsi sotto.</p>
        </div>
        <Search aria-hidden="true" />
      </section>
    );
  }

  const { course, session } = candidate;
  const existingBooking = bookingForOccurrence(bookings, session);
  const hasValidSubscription = canBookOccurrence(
    subscription,
    session,
    course.requires_active_subscription,
  );
  const canBook = existingBooking === undefined && hasValidSubscription;
  const membershipMessage =
    subscription?.is_active === true
      ? "L'iscrizione non copre la data della lezione."
      : "Attiva l'iscrizione per prenotare.";
  const isPending = pendingSessionId === occurrenceKey(session);

  return (
    <section
      className={canBook ? "booking-focus" : "booking-focus is-booking-locked"}
      aria-labelledby="booking-focus-title"
    >
      <div className="booking-focus-copy">
        <p className="eyebrow">Prenotazione rapida</p>
        <h2 id="booking-focus-title">{course.title}</h2>
        <p>
          {weekdays[session.weekday]} {formatDate(session.occurs_on)} · {formatTime(session.starts_at)} -{" "}
          {formatTime(session.ends_at)} ·{" "}
          {course.location_name}
        </p>
        {!hasValidSubscription ? <p className="booking-lock-message">{membershipMessage}</p> : null}
      </div>
      <div className="booking-focus-action">
        <span>
          {existingBooking !== undefined
            ? existingBooking.status === "waitlisted"
              ? "Sei in lista d’attesa"
              : `Posto confermato · ${session.available_spots} posti liberi`
            : hasValidSubscription
              ? `${session.available_spots} posti liberi`
              : "Iscrizione non attiva"}
        </span>
        <button
          className="primary-action"
          disabled={!canBook || isPending}
          onClick={() => onCreateBooking(course, session)}
          type="button"
        >
          {hasValidSubscription ? <CalendarCheck aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
          {isPending
            ? "Prenoto"
            : existingBooking !== undefined
              ? bookedActionLabel(existingBooking)
              : canBook
                ? "Prenota ora"
                : "Iscrizione richiesta"}
        </button>
      </div>
    </section>
  );
}

function DatePicker({
  dates,
  selectedDate,
  onChange,
}: {
  dates: string[];
  selectedDate: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="date-picker" role="group" aria-label="Data del calendario">
      {dates.map((date) => {
        const parsedDate = dateFromIso(date);
        const weekday = weekdays[parsedDate.getDay()];
        const month = new Intl.DateTimeFormat("it-IT", { month: "short" })
          .format(parsedDate)
          .replace(".", "");
        return (
          <button
            aria-label={`${weekday} ${formatDate(date)}`}
            aria-pressed={selectedDate === date}
            className={selectedDate === date ? "is-selected" : ""}
            key={date}
            onClick={() => onChange(date)}
            type="button"
          >
            <span>{weekday.slice(0, 3)}</span>
            <strong>{parsedDate.getDate()}</strong>
            <small>{month}</small>
          </button>
        );
      })}
    </div>
  );
}

function WeeklyCalendar({
  bookings,
  courses,
  pendingSessionId,
  subscription,
  onCreateBooking,
}: {
  bookings: Booking[];
  courses: CatalogCourse[];
  pendingSessionId: string | null;
  subscription: SubscriptionInfo | null;
  onCreateBooking: (course: CatalogCourse, courseSession: CatalogSession) => void;
}) {
  const dates = useMemo(() => upcomingDates(), []);
  const firstOccurrenceDate = courses
    .flatMap((course) => course.sessions.map((session) => session.occurs_on))
    .sort()[0];
  const [selectedDate, setSelectedDate] = useState(firstOccurrenceDate ?? dates[0]);
  const entries = courses
    .flatMap((course) =>
      course.sessions
        .filter((session) => session.occurs_on === selectedDate)
        .map((session) => ({ course, session })),
    )
    .sort((left, right) => left.session.starts_at.localeCompare(right.session.starts_at));

  return (
    <section className="panel calendar-panel user-calendar" aria-labelledby="weekly-calendar-title">
      <SectionTitle
        icon={<CalendarDays aria-hidden="true" />}
        title="Calendario lezioni"
        id="weekly-calendar-title"
      />
      <DatePicker dates={dates} selectedDate={selectedDate} onChange={setSelectedDate} />
      <div className="calendar-agenda">
        {entries.length === 0 ? (
          <p className="muted">Nessuna lezione programmata per il {formatDate(selectedDate)}.</p>
        ) : (
          entries.map(({ course, session }) => {
            const existingBooking = bookingForOccurrence(bookings, session);
            const hasValidSubscription = canBookOccurrence(
              subscription,
              session,
              course.requires_active_subscription,
            );
            const canBook = existingBooking === undefined && hasValidSubscription;
            return (
              <article className="calendar-entry" key={occurrenceKey(session)}>
                <time>{formatTime(session.starts_at)}</time>
                <div>
                  <h3>{course.title}</h3>
                  <p>
                    {course.location_name} · {formatTime(session.starts_at)} -{" "}
                    {formatTime(session.ends_at)}
                  </p>
                </div>
                <button
                  className="primary-action"
                  disabled={!canBook || pendingSessionId === occurrenceKey(session)}
                  onClick={() => onCreateBooking(course, session)}
                  type="button"
                >
                  {!canBook
                    ? existingBooking !== undefined
                      ? bookedActionLabel(existingBooking)
                      : "Iscrizione richiesta"
                    : session.available_spots > 0
                      ? "Prenota"
                      : "Lista attesa"}
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function AdminCalendarPanel({
  courses,
  locations,
  token,
}: {
  courses: AdminCourse[];
  locations: Location[];
  token: string;
}) {
  const dates = useMemo(() => {
    const visibleDates = upcomingDates(28);
    const today = visibleDates[0];
    const singleDates = courses.flatMap((course) =>
      course.sessions
        .map((session) => session.occurs_on)
        .filter((occursOn): occursOn is string => occursOn !== null && occursOn >= today),
    );
    return [...new Set([...visibleDates, ...singleDates])].sort();
  }, [courses]);
  const firstScheduledDate = dates.find((date) => {
    const weekday = dateFromIso(date).getDay();
    return courses.some(
      (course) =>
        course.status !== "archived" &&
        course.sessions.some(
          (session) =>
            session.is_active &&
            (session.occurs_on === date ||
              (session.occurs_on === null && session.weekday === weekday)),
        ),
    );
  });
  const [selectedDate, setSelectedDate] = useState(firstScheduledDate ?? dates[0]);
  const selectedWeekday = dateFromIso(selectedDate).getDay();
  const [expandedOccurrenceKey, setExpandedOccurrenceKey] = useState<string | null>(null);
  const [loadingOccurrenceKey, setLoadingOccurrenceKey] = useState<string | null>(null);
  const [attendeesBySession, setAttendeesBySession] = useState<
    Record<string, AdminCourseSessionAttendee[]>
  >({});
  const [attendeeErrors, setAttendeeErrors] = useState<Record<string, string>>({});
  const [availabilityBySession, setAvailabilityBySession] = useState<
    Record<string, AdminCourseSessionAvailability>
  >({});
  const [availabilityState, setAvailabilityState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  const entries = courses
    .filter((course) => course.status !== "archived")
    .flatMap((course) =>
      course.sessions
        .filter(
          (session) =>
            session.is_active &&
            (session.occurs_on === selectedDate ||
              (session.occurs_on === null && session.weekday === selectedWeekday)),
        )
        .map((session) => ({ course, session })),
    )
    .sort((left, right) => left.session.starts_at.localeCompare(right.session.starts_at));

  useEffect(() => {
    let ignore = false;
    setAvailabilityState("loading");

    api
      .adminCalendarAvailability(token, selectedDate)
      .then((availability) => {
        if (ignore) {
          return;
        }
        setAvailabilityBySession(
          Object.fromEntries(
            availability.map((item) => [
              `${item.course_session_id}:${item.occurs_on}`,
              item,
            ]),
          ),
        );
        setAvailabilityState("ready");
      })
      .catch(() => {
        if (!ignore) {
          setAvailabilityState("error");
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedDate, token]);

  async function loadAttendees(
    sessionId: string,
    occursOn: string,
    entryKey: string,
  ): Promise<void> {
    setLoadingOccurrenceKey(entryKey);
    setAttendeeErrors((current) => {
      const next = { ...current };
      delete next[entryKey];
      return next;
    });

    try {
      const attendees = await api.courseSessionAttendees(token, sessionId, occursOn);
      setAttendeesBySession((current) => ({ ...current, [entryKey]: attendees }));
    } catch (error) {
      setAttendeeErrors((current) => ({ ...current, [entryKey]: describeError(error) }));
    } finally {
      setLoadingOccurrenceKey(null);
    }
  }

  function toggleAttendees(sessionId: string, entryKey: string): void {
    if (expandedOccurrenceKey === entryKey) {
      setExpandedOccurrenceKey(null);
      return;
    }

    setExpandedOccurrenceKey(entryKey);
    if (attendeesBySession[entryKey] === undefined) {
      void loadAttendees(sessionId, selectedDate, entryKey);
    }
  }

  function selectDate(date: string): void {
    setSelectedDate(date);
    setExpandedOccurrenceKey(null);
  }

  return (
    <section className="admin-panel calendar-panel" aria-labelledby="admin-calendar-title">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Programmazione</p>
          <h2 id="admin-calendar-title">Calendario corsi</h2>
        </div>
        <span>{entries.length} lezioni nel giorno selezionato</span>
      </div>
      <DatePicker dates={dates} selectedDate={selectedDate} onChange={selectDate} />
      <div className="calendar-agenda">
        {entries.length === 0 ? (
          <p className="muted">Nessuna lezione attiva per il {formatDate(selectedDate)}.</p>
        ) : (
          entries.map(({ course, session }) => {
            const entryKey = `${session.id}:${selectedDate}`;
            const isExpanded = expandedOccurrenceKey === entryKey;
            const attendees = attendeesBySession[entryKey];
            const availability = availabilityBySession[entryKey];
            const confirmedCount = attendees?.filter((item) => item.status === "confirmed").length ?? 0;
            const waitlistedCount = attendees?.filter((item) => item.status === "waitlisted").length ?? 0;
            const panelId = `session-attendees-${session.id}-${selectedDate}`;

            return (
              <article className="calendar-entry admin-calendar-entry" key={entryKey}>
                <time>{formatTime(session.starts_at)}</time>
                <div>
                  <h3>{course.title}</h3>
                  <p>
                    {locationNames.get(course.location_id) ?? "Sede non disponibile"} ·{" "}
                    {formatTime(session.starts_at)} - {formatTime(session.ends_at)}
                  </p>
                </div>
                <div className="calendar-entry-actions">
                  <span className="calendar-capacity" aria-live="polite">
                    <UsersIcon />
                    {availability !== undefined
                      ? `${availability.available_spots} su ${availability.capacity} posti liberi`
                      : availabilityState === "error"
                        ? `${session.capacity} posti totali`
                        : `– su ${session.capacity} posti liberi`}
                  </span>
                  <button
                    aria-controls={panelId}
                    aria-expanded={isExpanded}
                    className="secondary-action attendee-toggle"
                    onClick={() => toggleAttendees(session.id, entryKey)}
                    type="button"
                  >
                    Prenotati
                    <ChevronDown aria-hidden="true" />
                  </button>
                </div>

                {isExpanded ? (
                  <div className="attendee-panel" id={panelId} aria-live="polite">
                    {loadingOccurrenceKey === entryKey ? <p>Carico i partecipanti...</p> : null}
                    {attendeeErrors[entryKey] !== undefined ? (
                      <div className="attendee-error">
                        <p>{attendeeErrors[entryKey]}</p>
                        <button
                          className="secondary-action"
                          onClick={() => void loadAttendees(session.id, selectedDate, entryKey)}
                          type="button"
                        >
                          Riprova
                        </button>
                      </div>
                    ) : null}
                    {attendees !== undefined && attendees.length === 0 ? (
                      <p>Nessuna prenotazione attiva per questa lezione.</p>
                    ) : null}
                    {attendees !== undefined && attendees.length > 0 ? (
                      <>
                        <div className="attendee-summary">
                          <strong>{confirmedCount} confermati</strong>
                          {waitlistedCount > 0 ? <span>{waitlistedCount} in lista d'attesa</span> : null}
                        </div>
                        <ul className="attendee-list">
                          {attendees.map((attendee) => {
                            const fullName = [attendee.first_name, attendee.last_name]
                              .filter(Boolean)
                              .join(" ");
                            return (
                              <li key={attendee.booking_id}>
                                <div>
                                  <strong>{fullName || attendee.email}</strong>
                                  {fullName ? <span>{attendee.email}</span> : null}
                                </div>
                                <span
                                  className={
                                    attendee.status === "waitlisted"
                                      ? "booking-status waitlisted"
                                      : "booking-status"
                                  }
                                >
                                  {attendee.status === "waitlisted" ? "Lista attesa" : "Confermato"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function AdminDashboardPanel({
  activeLocations,
  activeMembers,
  publishedCourses,
  stats,
}: {
  activeLocations: number;
  activeMembers: number;
  publishedCourses: number;
  stats: AdminStats | null;
}) {
  return (
    <div className="backoffice-grid">
      <div className="admin-page-heading admin-panel-wide">
        <div>
          <p className="eyebrow">Oggi in MAKA</p>
          <h2>Panoramica attivita</h2>
        </div>
        <span>Aggiornata dai dati di corsi e iscrizioni</span>
      </div>
      <section className="admin-overview admin-panel-wide" aria-label="Riepilogo backoffice">
        <article>
          <UsersIcon />
          <span>Iscritti attivi</span>
          <strong>{activeMembers}</strong>
        </article>
        <article>
          <Dumbbell aria-hidden="true" />
          <span>Corsi pubblicati</span>
          <strong>{publishedCourses}</strong>
        </article>
        <article>
          <MapPin aria-hidden="true" />
          <span>Sedi attive</span>
          <strong>{activeLocations}</strong>
        </article>
      </section>
      <PerformancePanel title="Corsi migliori" items={stats?.courses ?? []} />
      <PerformancePanel title="Sedi migliori" items={stats?.locations ?? []} />
    </div>
  );
}

function PerformancePanel({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string; member_count: number }>;
}) {
  const highestCount = Math.max(...items.map((item) => item.member_count), 1);
  const headingId = `${title.toLowerCase().replace(/\s+/g, "-")}-title`;

  return (
    <section className="admin-panel" aria-labelledby={headingId}>
      <SectionTitle icon={<Activity aria-hidden="true" />} title={title} id={headingId} />
      <div className="performance-list">
        {items.length === 0 ? (
          <p className="muted">Appena arrivano prenotazioni, qui trovi i corsi e le sedi da spingere.</p>
        ) : (
          items.map((item) => (
            <article className="performance-item" key={item.id}>
              <div>
                <h3>{item.name}</h3>
                <p>{item.member_count} iscritti collegati</p>
                <div className="performance-track" aria-hidden="true">
                  <span style={{ width: `${(item.member_count / highestCount) * 100}%` }} />
                </div>
              </div>
              <strong>{item.member_count}</strong>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function UsersManager({
  onNotice,
  onUserChange,
  token,
  users,
}: {
  onNotice: (notice: Notice) => void;
  onUserChange: (user: AdminUser) => void;
  token: string;
  users: AdminUser[];
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("password-segreta");
  const [query, setQuery] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [confirmingDeleteUserId, setConfirmingDeleteUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState<{
    birth_date: string;
    duration_days: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    role: AdminUser["role"];
    starts_on: string;
    status: AdminUser["status"];
  } | null>(null);

  const visibleUsers = users.filter((user) =>
    `${user.email} ${user.first_name ?? ""} ${user.last_name ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      onUserChange(
        await api.createAdminUser(token, {
          email,
          first_name: firstName,
          last_name: lastName,
          password,
          role: "user",
        }),
      );
      setEmail("");
      setFirstName("");
      setLastName("");
      onNotice({ tone: "success", message: "Utente creato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleDisable(user: AdminUser): Promise<void> {
    try {
      onUserChange(await api.updateAdminUser(token, user.id, { status: "disabled" }));
      onNotice({
        tone: "success",
        message: "Account disabilitato. Le prenotazioni attive sono state rilasciate.",
      });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleRestore(user: AdminUser): Promise<void> {
    try {
      onUserChange(await api.updateAdminUser(token, user.id, { status: "active" }));
      onNotice({ tone: "success", message: "Utente riattivato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleDelete(user: AdminUser): Promise<void> {
    setDeletingUserId(user.id);
    try {
      onUserChange(await api.deleteAdminUser(token, user.id));
      setConfirmingDeleteUserId(null);
      onNotice({ tone: "success", message: "Utente eliminato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setDeletingUserId(null);
    }
  }

  function handleEdit(user: AdminUser): void {
    setConfirmingDeleteUserId(null);
    setEditingUserId(user.id);
    setUserDraft({
      birth_date: user.birth_date ?? "",
      duration_days: String(user.subscription?.duration_days ?? 30),
      email: user.email,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      phone: user.phone ?? "",
      role: user.role,
      starts_on: user.subscription?.starts_on ?? new Date().toISOString().slice(0, 10),
      status: user.status,
    });
  }

  async function handleSaveProfile(user: AdminUser): Promise<void> {
    if (userDraft === null) {
      return;
    }

    try {
      onUserChange(
        await api.updateAdminUser(token, user.id, {
          birth_date: userDraft.birth_date || null,
          email: userDraft.email,
          first_name: userDraft.first_name,
          last_name: userDraft.last_name,
          phone: userDraft.phone || null,
          role: userDraft.role,
          status: userDraft.status,
        }),
      );
      onNotice({ tone: "success", message: "Utente aggiornato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleSaveSubscription(user: AdminUser): Promise<void> {
    if (userDraft === null) {
      return;
    }

    const durationDays = Number.parseInt(userDraft.duration_days, 10);
    if (Number.isNaN(durationDays) || durationDays <= 0) {
      onNotice({ tone: "error", message: "Durata iscrizione non valida." });
      return;
    }

    try {
      const subscription =
        user.subscription === null
          ? await api.createAdminSubscription(token, user.id, {
              starts_on: userDraft.starts_on,
              duration_days: durationDays,
            })
          : await api.updateAdminSubscription(token, user.subscription.id, {
              starts_on: userDraft.starts_on,
              duration_days: durationDays,
            });
      onUserChange({ ...user, subscription });
      onNotice({ tone: "success", message: "Iscrizione aggiornata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  return (
    <section className="admin-panel admin-panel-wide" aria-labelledby="users-title">
      <SectionTitle icon={<UserRound aria-hidden="true" />} title="Utenti e iscrizioni" id="users-title" />
      <p className="muted">Crea account, aggiorna dati e mantieni sotto controllo le iscrizioni.</p>
      <form className="admin-form" onSubmit={handleCreate}>
        <label className="field">
          <span>Email utente</span>
          <input
            autoComplete="email"
            inputMode="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Nome utente</span>
          <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label className="field">
          <span>Cognome utente</span>
          <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
        <label className="field">
          <span>Password provvisoria</span>
          <input
            minLength={12}
            required
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary-action" type="submit">
          <Plus aria-hidden="true" />
          Crea utente
        </button>
      </form>

      <div className="admin-toolbar">
        <label className="field">
          <span>Cerca utente</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      <div className="admin-list">
        {visibleUsers.length === 0 ? (
          <p className="muted">Nessun utente trovato.</p>
        ) : (
          visibleUsers.map((user) => (
            <article
              className={
                editingUserId === user.id
                  ? "admin-list-item admin-user-item is-editing"
                  : "admin-list-item admin-user-item"
              }
              key={user.id}
            >
              <div>
                <h3>{user.email}</h3>
                <p>
                  {[user.first_name, user.last_name].filter(Boolean).join(" ") || "Profilo incompleto"}
                </p>
                <span className={user.status === "active" ? "admin-status" : "admin-status muted-status"}>
                  {userStatusLabels[user.status]}
                </span>
                <p
                  className={
                    user.role === "user" && user.subscription?.is_active !== true
                      ? "membership-state expired-membership"
                      : "membership-state"
                  }
                >
                  {user.role === "admin"
                    ? "Accesso amministratore senza scadenza"
                    : user.role === "staff"
                      ? "Collaboratore corsi · nessun accesso alla gestione utenti"
                    : user.subscription === null
                      ? "Nessuna iscrizione"
                      : user.subscription.is_active
                        ? `Iscrizione attiva · scade il ${formatDate(user.subscription.expires_on)}`
                        : `Iscrizione scaduta il ${formatDate(user.subscription.expires_on)}`}
                </p>
                <span className="admin-status role-status">{userRoleLabels[user.role]}</span>
                {editingUserId === user.id && userDraft !== null ? (
                  <div className="inline-edit-grid">
                    <div className="user-edit-heading">
                      <strong>Dati e permessi</strong>
                    </div>
                    <label className="field">
                      <span>Email profilo</span>
                      <input
                        type="email"
                        value={userDraft.email}
                        onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Nome profilo</span>
                      <input
                        value={userDraft.first_name}
                        onChange={(event) => setUserDraft({ ...userDraft, first_name: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Cognome profilo</span>
                      <input
                        value={userDraft.last_name}
                        onChange={(event) => setUserDraft({ ...userDraft, last_name: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Telefono</span>
                      <input
                        inputMode="tel"
                        value={userDraft.phone}
                        onChange={(event) => setUserDraft({ ...userDraft, phone: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Data nascita</span>
                      <input
                        type="date"
                        value={userDraft.birth_date}
                        onChange={(event) => setUserDraft({ ...userDraft, birth_date: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Ruolo</span>
                      <select
                        value={userDraft.role}
                        onChange={(event) =>
                          setUserDraft({ ...userDraft, role: event.target.value as AdminUser["role"] })
                        }
                      >
                        <option value="user">Utente</option>
                        <option value="staff">Collaboratore corsi</option>
                        <option value="admin">Amministratore</option>
                      </select>
                    </label>
                    <button
                      aria-label={`Salva dati e permessi ${user.email}`}
                      className="primary-action user-section-action"
                      onClick={() => handleSaveProfile(user)}
                      type="button"
                    >
                      <Save aria-hidden="true" />
                      Salva dati e permessi
                    </button>
                    {userDraft?.role === "user" ? (
                      <>
                        <div className="user-edit-heading">
                          <strong>Iscrizione palestra</strong>
                        </div>
                        <label className="field">
                          <span>Inizio iscrizione</span>
                          <input
                            type="date"
                            value={userDraft.starts_on}
                            onChange={(event) =>
                              setUserDraft({ ...userDraft, starts_on: event.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Durata iscrizione</span>
                          <input
                            min="1"
                            type="number"
                            value={userDraft.duration_days}
                            onChange={(event) =>
                              setUserDraft({ ...userDraft, duration_days: event.target.value })
                            }
                          />
                        </label>
                        <button
                          aria-label={`${
                            user.subscription === null ? "Crea" : "Aggiorna"
                          } iscrizione ${user.email}`}
                          className="primary-action user-section-action"
                          onClick={() => handleSaveSubscription(user)}
                          type="button"
                        >
                          <CalendarCheck aria-hidden="true" />
                          {user.subscription === null ? "Crea iscrizione" : "Aggiorna iscrizione"}
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="admin-row-actions admin-user-actions">
                {editingUserId === user.id ? (
                  <button
                    aria-label={`Chiudi modifica ${user.email}`}
                    className="secondary-action"
                    onClick={() => {
                      setEditingUserId(null);
                      setUserDraft(null);
                    }}
                    type="button"
                  >
                    <XCircle aria-hidden="true" />
                    Chiudi modifica
                  </button>
                ) : (
                  <>
                    <button
                      aria-label={
                        user.role === "user"
                          ? `Modifica dati e iscrizione ${user.email}`
                          : `Modifica dati e permessi ${user.email}`
                      }
                      className="primary-action user-edit-action"
                      onClick={() => handleEdit(user)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" />
                      {user.role === "user" ? "Modifica dati e iscrizione" : "Modifica dati e permessi"}
                    </button>
                    {user.status === "active" ? (
                      <button
                        aria-label={`Sospendi accesso ${user.email}`}
                        className="secondary-action"
                        onClick={() => handleDisable(user)}
                        type="button"
                      >
                        <UserX aria-hidden="true" />
                        Sospendi accesso
                      </button>
                    ) : user.status === "disabled" ? (
                      <button
                        aria-label={`Riattiva accesso ${user.email}`}
                        className="secondary-action"
                        onClick={() => handleRestore(user)}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" />
                        Riattiva accesso
                      </button>
                    ) : null}
                    {user.status !== "deleted" ? (
                      <button
                        aria-expanded={confirmingDeleteUserId === user.id}
                        aria-label={`Elimina account ${user.email}`}
                        className="secondary-action danger-action"
                        onClick={() => setConfirmingDeleteUserId(user.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" />
                        Elimina account
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              {confirmingDeleteUserId === user.id ? (
                <div className="destructive-confirmation" role="alert">
                  <div>
                    <strong>Eliminare l’account di {user.email}?</strong>
                    <p>
                      L’accesso verra revocato, l’email anonimizzata e tutte le prenotazioni
                      attive saranno rilasciate. L’operazione non puo essere annullata.
                    </p>
                  </div>
                  <div className="destructive-confirmation-actions">
                    <button
                      className="secondary-action"
                      disabled={deletingUserId === user.id}
                      onClick={() => setConfirmingDeleteUserId(null)}
                      type="button"
                    >
                      <XCircle aria-hidden="true" />
                      Mantieni account
                    </button>
                    <button
                      className="primary-action permanent-delete-action"
                      disabled={deletingUserId === user.id}
                      onClick={() => handleDelete(user)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                      {deletingUserId === user.id ? "Eliminazione" : "Conferma eliminazione"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function LocationsManager({
  locations,
  onLocationCascade,
  onLocationChange,
  onNotice,
  token,
}: {
  locations: Location[];
  onLocationCascade: (locationId: string, nextLocation: Location | null) => void;
  onLocationChange: (location: Location) => void;
  onNotice: (notice: Notice) => void;
  token: string;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState<LocationPayload | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<{
    locationId: string;
    type: "deactivate" | "delete";
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      const location = await api.createLocation(token, { name, address, city });
      onLocationChange(location);
      setName("");
      setAddress("");
      setCity("");
      onNotice({ tone: "success", message: "Sede creata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleDestructiveAction(
    location: Location,
    action: "deactivate" | "delete",
  ): Promise<void> {
    const actionKey = `${action}:${location.id}`;
    setPendingAction(actionKey);
    try {
      if (action === "deactivate") {
        const result = await api.deactivateLocation(token, location.id);
        onLocationCascade(location.id, result);
        onNotice({
          tone: "success",
          message: `Sede disattivata. Corsi eliminati: ${result.deleted_course_count}.`,
        });
      } else {
        const result = await api.deleteLocation(token, location.id);
        onLocationCascade(location.id, null);
        onNotice({
          tone: "success",
          message: `Sede eliminata definitivamente. Corsi eliminati: ${result.deleted_course_count}.`,
        });
      }
      setConfirmingAction(null);
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setPendingAction(null);
    }
  }

  function handleEditLocation(location: Location): void {
    setConfirmingAction(null);
    setEditingLocationId(location.id);
    setLocationDraft({
      address: location.address,
      city: location.city,
      name: location.name,
    });
  }

  async function handleSaveLocation(location: Location): Promise<void> {
    if (locationDraft === null) {
      return;
    }

    try {
      onLocationChange(
        await api.updateLocation(token, location.id, {
          address: locationDraft.address,
          city: locationDraft.city,
          name: locationDraft.name,
        }),
      );
      setEditingLocationId(null);
      setLocationDraft(null);
      onNotice({ tone: "success", message: "Sede aggiornata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="locations-title">
      <SectionTitle icon={<MapPin aria-hidden="true" />} title="Sedi" id="locations-title" />
      <p className="muted">Le sedi attive alimentano catalogo corsi e filtri utente.</p>
      <form className="admin-form" onSubmit={handleCreate}>
        <label className="field">
          <span>Nome sede</span>
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Indirizzo</span>
          <input required value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="field">
          <span>Citta</span>
          <input required value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <button className="primary-action" type="submit">
          <Plus aria-hidden="true" />
          Crea sede
        </button>
      </form>

      <div className="admin-list">
        {locations.length === 0 ? (
          <p className="muted">Nessuna sede presente.</p>
        ) : (
          locations.map((location) => (
            <article
              className={
                editingLocationId === location.id
                  ? "admin-list-item admin-location-item is-editing"
                  : "admin-list-item admin-location-item"
              }
              key={location.id}
            >
              <div>
                <h3>{location.name}</h3>
                <p>
                  {location.address}, {location.city}
                </p>
                {editingLocationId === location.id && locationDraft !== null ? (
                  <div className="inline-edit-grid">
                    <label className="field">
                      <span>Nome sede da modificare</span>
                      <input
                        value={locationDraft.name}
                        onChange={(event) => setLocationDraft({ ...locationDraft, name: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Indirizzo sede da modificare</span>
                      <input
                        value={locationDraft.address}
                        onChange={(event) =>
                          setLocationDraft({ ...locationDraft, address: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Citta sede da modificare</span>
                      <input
                        value={locationDraft.city}
                        onChange={(event) => setLocationDraft({ ...locationDraft, city: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
                <span className={location.is_active ? "admin-status" : "admin-status muted-status"}>
                  {location.is_active ? "Attiva" : "Disattivata"}
                </span>
              </div>
              <div className="admin-row-actions location-actions">
                {editingLocationId === location.id ? (
                  <>
                    <button
                      aria-label={`Salva sede ${location.name}`}
                      className="primary-action"
                      onClick={() => handleSaveLocation(location)}
                      type="button"
                    >
                      <Save aria-hidden="true" />
                      Salva modifiche
                    </button>
                    <button
                      aria-label={`Annulla modifica ${location.name}`}
                      className="secondary-action"
                      onClick={() => {
                        setEditingLocationId(null);
                        setLocationDraft(null);
                      }}
                      type="button"
                    >
                      <XCircle aria-hidden="true" />
                      Annulla
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      aria-label={`Modifica ${location.name}`}
                      className={
                        location.is_active
                          ? "secondary-action location-primary-action"
                          : "secondary-action"
                      }
                      onClick={() => handleEditLocation(location)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" />
                      Modifica sede
                    </button>
                    {location.is_active ? (
                      <button
                        aria-expanded={
                          confirmingAction?.locationId === location.id &&
                          confirmingAction.type === "deactivate"
                        }
                        aria-label={`Disattiva sede ${location.name}`}
                        className="secondary-action danger-action"
                        onClick={() =>
                          setConfirmingAction({ locationId: location.id, type: "deactivate" })
                        }
                        type="button"
                      >
                        <Power aria-hidden="true" />
                        Disattiva sede
                      </button>
                    ) : null}
                    <button
                      aria-expanded={
                        confirmingAction?.locationId === location.id &&
                        confirmingAction.type === "delete"
                      }
                      aria-label={`Elimina definitivamente sede ${location.name}`}
                      className="secondary-action danger-action"
                      onClick={() =>
                        setConfirmingAction({ locationId: location.id, type: "delete" })
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                      Elimina sede
                    </button>
                  </>
                )}
              </div>
              {confirmingAction?.locationId === location.id ? (
                <div className="destructive-confirmation" role="alert">
                  <div>
                    <strong>
                      {confirmingAction.type === "deactivate"
                        ? `Disattivare la sede “${location.name}”?`
                        : `Eliminare definitivamente la sede “${location.name}”?`}
                    </strong>
                    <p>
                      {confirmingAction.type === "deactivate"
                        ? "La sede restera nello storico come disattivata. Tutti i corsi, le lezioni, le prenotazioni e le foto collegate verranno eliminati definitivamente."
                        : "La sede e tutti i corsi, le lezioni, le prenotazioni e le foto collegate verranno eliminati definitivamente."}
                    </p>
                  </div>
                  <div className="destructive-confirmation-actions">
                    <button
                      className="secondary-action"
                      disabled={pendingAction !== null}
                      onClick={() => setConfirmingAction(null)}
                      type="button"
                    >
                      <XCircle aria-hidden="true" />
                      Annulla
                    </button>
                    <button
                      className="primary-action permanent-delete-action"
                      disabled={pendingAction !== null}
                      onClick={() => handleDestructiveAction(location, confirmingAction.type)}
                      type="button"
                    >
                      {confirmingAction.type === "deactivate" ? (
                        <Power aria-hidden="true" />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                      {pendingAction === `${confirmingAction.type}:${location.id}`
                        ? "Operazione in corso"
                        : confirmingAction.type === "deactivate"
                          ? "Conferma disattivazione"
                          : "Conferma eliminazione"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CoursesManager({
  courses,
  disciplines,
  isAdmin,
  locations,
  onCourseChange,
  onCourseDelete,
  onDisciplineCreate,
  onNotice,
  token,
}: {
  courses: AdminCourse[];
  disciplines: CourseDisciplineOption[];
  isAdmin: boolean;
  locations: Location[];
  onCourseChange: (course: AdminCourse) => void;
  onCourseDelete: (courseId: string) => void;
  onDisciplineCreate: (discipline: CourseDisciplineOption) => void;
  onNotice: (notice: Notice) => void;
  token: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState<CourseStatus>("published");
  const [discipline, setDiscipline] = useState<CourseDiscipline>("Sala");
  const [showDisciplineCreator, setShowDisciplineCreator] = useState(false);
  const [newDisciplineName, setNewDisciplineName] = useState("");
  const [isCreatingDiscipline, setIsCreatingDiscipline] = useState(false);
  const [requiresActiveSubscription, setRequiresActiveSubscription] = useState(true);
  const [courseImage, setCourseImage] = useState<File | null>(null);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CoursePayload | null>(null);
  const [schedulingCourseId, setSchedulingCourseId] = useState<string | null>(null);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("weekly");
  const [scheduleWeekdays, setScheduleWeekdays] = useState<number[]>([]);
  const [scheduleDate, setScheduleDate] = useState(localIsoDate());
  const [scheduleStartsAt, setScheduleStartsAt] = useState("18:00");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("19:00");
  const [scheduleCapacity, setScheduleCapacity] = useState("12");
  const [scheduleDeadline, setScheduleDeadline] = useState("24");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<CourseSession | null>(null);
  const [confirmingDeleteCourseId, setConfirmingDeleteCourseId] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [courseQuery, setCourseQuery] = useState("");
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  const selectedLocationId = locationId || locations[0]?.id || "";
  const visibleCourses = useMemo(() => {
    const queryTokens = courseQuery
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("it-IT")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (queryTokens.length === 0) {
      return courses;
    }

    return courses.filter((course) => {
      const locationName = locations.find((location) => location.id === course.location_id)?.name ?? "";
      const searchableCourse = [course.title, course.discipline, locationName, course.description ?? ""]
        .join(" ")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("it-IT");
      return queryTokens.every((token) => searchableCourse.includes(token));
    });
  }, [courseQuery, courses, locations]);

  function toggleCourseManagement(courseId: string): void {
    const nextCourseId = expandedCourseId === courseId ? null : courseId;
    setExpandedCourseId(nextCourseId);
    setEditingCourseId(null);
    setCourseDraft(null);
    setSchedulingCourseId(null);
    setEditingSessionId(null);
    setSessionDraft(null);
    setConfirmingDeleteCourseId(null);
  }

  async function handleCreateDiscipline(): Promise<void> {
    if (newDisciplineName.trim() === "") {
      onNotice({ tone: "error", message: "Inserisci il nome della nuova disciplina." });
      return;
    }

    setIsCreatingDiscipline(true);
    try {
      const created = await api.createCourseDiscipline(token, newDisciplineName);
      onDisciplineCreate(created);
      setDiscipline(created.name);
      setNewDisciplineName("");
      setShowDisciplineCreator(false);
      onNotice({ tone: "success", message: `Disciplina “${created.name}” aggiunta.` });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setIsCreatingDiscipline(false);
    }
  }

  async function handleCreateCourse(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selectedLocationId === "") {
      onNotice({ tone: "error", message: "Crea prima una sede attiva." });
      return;
    }

    try {
      const course = await api.createCourse(token, {
        location_id: selectedLocationId,
        title,
        description: description || null,
        discipline,
        requires_active_subscription: requiresActiveSubscription,
        status,
      });
      const savedCourse =
        courseImage === null ? course : await api.uploadCourseImage(token, course.id, courseImage);
      onCourseChange(savedCourse);
      setTitle("");
      setDescription("");
      setRequiresActiveSubscription(true);
      setCourseImage(null);
      setIsCreateFormOpen(false);
      setExpandedCourseId(savedCourse.id);
      onNotice({ tone: "success", message: "Corso creato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>, course: AdminCourse): Promise<void> {
    event.preventDefault();
    if (scheduleMode === "weekly" && scheduleWeekdays.length === 0) {
      onNotice({ tone: "error", message: "Seleziona almeno un giorno." });
      return;
    }
    if (scheduleMode === "single" && scheduleDate === "") {
      onNotice({ tone: "error", message: "Seleziona la data della lezione." });
      return;
    }
    try {
      const sessionDetails = {
        starts_at: scheduleStartsAt,
        ends_at: scheduleEndsAt,
        capacity: Number(scheduleCapacity),
        cancellation_deadline_hours: Number(scheduleDeadline),
      };
      const sessions =
        scheduleMode === "weekly"
          ? await api.createCourseSchedule(token, course.id, {
              ...sessionDetails,
              weekdays: scheduleWeekdays,
            })
          : [
              await api.createCourseSession(token, course.id, {
                ...sessionDetails,
                occurs_on: scheduleDate,
              }),
            ];
      onCourseChange({ ...course, sessions: [...course.sessions, ...sessions] });
      setScheduleWeekdays([]);
      onNotice({
        tone: "success",
        message: scheduleMode === "weekly" ? "Ricorrenze create." : "Lezione singola creata.",
      });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleUploadImage(course: AdminCourse, image: File | undefined): Promise<void> {
    if (image === undefined) {
      return;
    }
    try {
      onCourseChange(await api.uploadCourseImage(token, course.id, image));
      onNotice({ tone: "success", message: "Immagine corso aggiornata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  function toggleScheduleWeekday(weekday: number): void {
    setScheduleWeekdays((current) =>
      current.includes(weekday) ? current.filter((item) => item !== weekday) : [...current, weekday],
    );
  }

  function handleEditSession(session: CourseSession): void {
    setEditingSessionId(session.id);
    setSessionDraft({ ...session });
  }

  async function handleUpdateSession(course: AdminCourse): Promise<void> {
    if (sessionDraft === null) {
      return;
    }
    try {
      const updated = await api.updateCourseSession(token, sessionDraft.id, {
        ...(sessionDraft.occurs_on === null
          ? { weekday: sessionDraft.weekday }
          : { occurs_on: sessionDraft.occurs_on }),
        starts_at: sessionDraft.starts_at,
        ends_at: sessionDraft.ends_at,
        capacity: Number(sessionDraft.capacity),
        cancellation_deadline_hours: Number(sessionDraft.cancellation_deadline_hours),
      });
      onCourseChange({
        ...course,
        sessions: course.sessions.map((session) => (session.id === updated.id ? updated : session)),
      });
      setEditingSessionId(null);
      setSessionDraft(null);
      onNotice({ tone: "success", message: "Lezione aggiornata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleDeactivateSession(course: AdminCourse, session: CourseSession): Promise<void> {
    try {
      const updated = await api.deactivateCourseSession(token, session.id);
      onCourseChange({
        ...course,
        sessions: course.sessions.map((item) => (item.id === updated.id ? updated : item)),
      });
      onNotice({ tone: "success", message: "Lezione disattivata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleArchive(course: AdminCourse): Promise<void> {
    try {
      onCourseChange(await api.archiveCourse(token, course.id));
      onNotice({ tone: "success", message: "Corso archiviato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleDeleteCourse(course: AdminCourse): Promise<void> {
    setDeletingCourseId(course.id);
    try {
      await api.deleteCourse(token, course.id);
      onCourseDelete(course.id);
      setConfirmingDeleteCourseId(null);
      if (editingCourseId === course.id) {
        setEditingCourseId(null);
        setCourseDraft(null);
      }
      if (schedulingCourseId === course.id) {
        setSchedulingCourseId(null);
      }
      if (expandedCourseId === course.id) {
        setExpandedCourseId(null);
      }
      onNotice({
        tone: "success",
        message: "Corso eliminato definitivamente insieme a lezioni e prenotazioni.",
      });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setDeletingCourseId(null);
    }
  }

  function handleEditCourse(course: AdminCourse): void {
    setEditingCourseId(course.id);
    setCourseDraft({
      description: course.description,
      discipline: course.discipline,
      location_id: course.location_id,
      requires_active_subscription: course.requires_active_subscription,
      status: course.status,
      title: course.title,
    });
  }

  async function handleUpdateCourse(course: AdminCourse): Promise<void> {
    if (courseDraft === null) {
      return;
    }

    try {
      onCourseChange(await api.updateCourse(token, course.id, courseDraft));
      setEditingCourseId(null);
      setCourseDraft(null);
      onNotice({ tone: "success", message: "Corso aggiornato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="courses-title">
      <SectionTitle icon={<Dumbbell aria-hidden="true" />} title="Corsi e sessioni" id="courses-title" />
      <p className="muted">Prepara il catalogo prenotabile: titolo, sede, stato e sessioni operative.</p>
      <div className="admin-course-toolbar">
        <div className="admin-course-search-group">
          <label className="course-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Cerca corsi da gestire</span>
            <input
              onChange={(event) => setCourseQuery(event.target.value)}
              placeholder="Cerca corso, disciplina o sede"
              type="search"
              value={courseQuery}
            />
            {courseQuery !== "" ? (
              <button
                aria-label="Cancella ricerca corsi"
                className="course-search-clear"
                onClick={() => setCourseQuery("")}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <span className="catalog-result-count" aria-live="polite">
            {visibleCourses.length} {visibleCourses.length === 1 ? "corso" : "corsi"}
          </span>
        </div>
        <button
          aria-expanded={isCreateFormOpen}
          className="primary-action admin-new-course-trigger"
          onClick={() => setIsCreateFormOpen((current) => !current)}
          type="button"
        >
          {isCreateFormOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isCreateFormOpen ? "Chiudi" : "Nuovo corso"}
        </button>
      </div>
      {isCreateFormOpen ? (
        <form className="admin-form admin-course-create-form" onSubmit={handleCreateCourse}>
        <label className="field">
          <span>Titolo corso</span>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Descrizione corso</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="field">
          <span>Sede corso</span>
          <select value={selectedLocationId} onChange={(event) => setLocationId(event.target.value)}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Stato corso</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as CourseStatus)}>
            <option value="published">Pubblicato</option>
            <option value="draft">Bozza</option>
          </select>
        </label>
        <div className="discipline-control">
          <label className="field">
            <span>Disciplina</span>
            <select
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
            >
              {disciplines.map((item) => (
                <option key={item.id} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>
          {isAdmin ? (
            <button
              aria-expanded={showDisciplineCreator}
              className="secondary-action discipline-create-trigger"
              onClick={() => setShowDisciplineCreator((current) => !current)}
              type="button"
            >
              <Plus aria-hidden="true" />
              Nuova disciplina
            </button>
          ) : null}
        </div>
        {isAdmin && showDisciplineCreator ? (
          <div className="discipline-create-row">
            <label className="field">
              <span>Nome nuova disciplina</span>
              <input
                autoFocus
                maxLength={80}
                value={newDisciplineName}
                onChange={(event) => setNewDisciplineName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreateDiscipline();
                  }
                }}
              />
            </label>
            <button
              className="primary-action"
              disabled={isCreatingDiscipline}
              onClick={() => void handleCreateDiscipline()}
              type="button"
            >
              <Save aria-hidden="true" />
              {isCreatingDiscipline ? "Salvataggio" : "Aggiungi disciplina"}
            </button>
            <button
              aria-label="Annulla nuova disciplina"
              className="icon-button"
              disabled={isCreatingDiscipline}
              onClick={() => {
                setShowDisciplineCreator(false);
                setNewDisciplineName("");
              }}
              title="Annulla"
              type="button"
            >
              <XCircle aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <label className="course-access-toggle">
          <input
            checked={requiresActiveSubscription}
            onChange={(event) => setRequiresActiveSubscription(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Richiede iscrizione attiva</strong>
            <small>Disattiva per aprire le prenotazioni anche a chi non e iscritto.</small>
          </span>
        </label>
        <label className="field file-field">
          <span>Foto corso</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setCourseImage(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        <button className="primary-action" type="submit">
          <Plus aria-hidden="true" />
          Crea corso
        </button>
        </form>
      ) : null}

      <div className="admin-list">
        {courses.length === 0 ? (
          <p className="muted">Nessun corso presente.</p>
        ) : visibleCourses.length === 0 ? (
          <div className="admin-empty-search">
            <Search aria-hidden="true" />
            <strong>Nessun corso corrisponde alla ricerca.</strong>
            <button className="secondary-action" onClick={() => setCourseQuery("")} type="button">
              <X aria-hidden="true" />
              Cancella ricerca
            </button>
          </div>
        ) : (
          visibleCourses.map((course) => (
            <article
              className={`admin-list-item admin-course-item${
                expandedCourseId === course.id ? " is-expanded" : ""
              }`}
              key={course.id}
            >
              <CourseVisual discipline={course.discipline} imageUrl={course.image_url} />
              <div className="admin-course-body">
                <h3>{course.title}</h3>
                <p>{course.description ?? "Descrizione non inserita."}</p>
                {expandedCourseId === course.id && editingCourseId === course.id && courseDraft !== null ? (
                  <div className="inline-edit-grid">
                    <label className="field">
                      <span>Titolo corso da modificare</span>
                      <input
                        value={courseDraft.title}
                        onChange={(event) => setCourseDraft({ ...courseDraft, title: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Descrizione corso da modificare</span>
                      <input
                        value={courseDraft.description ?? ""}
                        onChange={(event) =>
                          setCourseDraft({
                            ...courseDraft,
                            description: event.target.value || null,
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Sede corso da modificare</span>
                      <select
                        value={courseDraft.location_id}
                        onChange={(event) =>
                          setCourseDraft({ ...courseDraft, location_id: event.target.value })
                        }
                      >
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Disciplina da modificare</span>
                      <select
                        value={courseDraft.discipline}
                        onChange={(event) =>
                          setCourseDraft({
                            ...courseDraft,
                            discipline: event.target.value,
                          })
                        }
                      >
                        {disciplines.map((item) => (
                          <option key={item.id} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Stato corso da modificare</span>
                      <select
                        value={courseDraft.status}
                        onChange={(event) =>
                          setCourseDraft({ ...courseDraft, status: event.target.value as CourseStatus })
                        }
                      >
                        <option value="published">Pubblicato</option>
                        <option value="draft">Bozza</option>
                        <option value="archived">Archiviato</option>
                      </select>
                    </label>
                    <label className="course-access-toggle">
                      <input
                        checked={courseDraft.requires_active_subscription}
                        onChange={(event) =>
                          setCourseDraft({
                            ...courseDraft,
                            requires_active_subscription: event.target.checked,
                          })
                        }
                        type="checkbox"
                      />
                      <span>
                        <strong>Richiede iscrizione attiva</strong>
                        <small>Disattiva per rendere il corso aperto a tutti.</small>
                      </span>
                    </label>
                  </div>
                ) : null}
                <div className="admin-course-flags">
                  <span className="admin-status">{courseStatusLabels[course.status]}</span>
                  <span
                    className={
                      course.requires_active_subscription
                        ? "admin-status muted-status"
                        : "admin-status open-course-status"
                    }
                  >
                    {course.requires_active_subscription ? "Iscrizione richiesta" : "Aperto a tutti"}
                  </span>
                </div>
                <button
                  aria-controls={`course-management-${course.id}`}
                  aria-expanded={expandedCourseId === course.id}
                  aria-label={`Gestisci ${course.title}`}
                  className="secondary-action course-manage-toggle"
                  onClick={() => toggleCourseManagement(course.id)}
                  type="button"
                >
                  <span>{expandedCourseId === course.id ? "Chiudi gestione" : "Gestisci"}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                {expandedCourseId === course.id ? (
                  <label className="secondary-action image-upload-action">
                    <ImagePlus aria-hidden="true" />
                    <span>Aggiorna foto</span>
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => handleUploadImage(course, event.target.files?.[0])}
                      type="file"
                    />
                  </label>
                ) : null}
              </div>
              {expandedCourseId === course.id ? (
                <div className="admin-row-actions" id={`course-management-${course.id}`}>
                {editingCourseId === course.id ? (
                  <button
                    aria-label={`Salva corso ${course.title}`}
                    className="secondary-action"
                    onClick={() => handleUpdateCourse(course)}
                    type="button"
                  >
                    <Save aria-hidden="true" />
                    Salva
                  </button>
                ) : (
                  <button
                    aria-label={`Modifica ${course.title}`}
                    className="secondary-action"
                    onClick={() => handleEditCourse(course)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" />
                    Modifica
                  </button>
                )}
                <button
                  aria-expanded={schedulingCourseId === course.id}
                  aria-label={`Configura orari ${course.title}`}
                  className="secondary-action"
                  onClick={() =>
                    setSchedulingCourseId((current) => (current === course.id ? null : course.id))
                  }
                  type="button"
                >
                  <CalendarPlus aria-hidden="true" />
                  Orari
                </button>
                {course.status !== "archived" ? (
                  <button
                    className="secondary-action"
                    onClick={() => handleArchive(course)}
                    type="button"
                  >
                    <Archive aria-hidden="true" />
                    Archivia
                  </button>
                ) : null}
                <button
                  aria-expanded={confirmingDeleteCourseId === course.id}
                  aria-label={`Elimina definitivamente ${course.title}`}
                  className="secondary-action danger-action permanent-delete-trigger"
                  onClick={() => setConfirmingDeleteCourseId(course.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                  Elimina definitivamente
                </button>
                </div>
              ) : null}
              {confirmingDeleteCourseId === course.id ? (
                <div
                  className="destructive-confirmation"
                  role="alert"
                  aria-labelledby={`delete-course-${course.id}`}
                >
                  <div>
                    <strong id={`delete-course-${course.id}`}>
                      Eliminare definitivamente “{course.title}”?
                    </strong>
                    <p>
                      Verranno eliminate tutte le lezioni, le prenotazioni e le foto del corso.
                      Questa operazione non puo essere annullata.
                    </p>
                  </div>
                  <div className="destructive-confirmation-actions">
                    <button
                      className="secondary-action"
                      disabled={deletingCourseId === course.id}
                      onClick={() => setConfirmingDeleteCourseId(null)}
                      type="button"
                    >
                      <XCircle aria-hidden="true" />
                      Annulla
                    </button>
                    <button
                      className="primary-action permanent-delete-action"
                      disabled={deletingCourseId === course.id}
                      onClick={() => handleDeleteCourse(course)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                      {deletingCourseId === course.id ? "Eliminazione" : "Conferma eliminazione"}
                    </button>
                  </div>
                </div>
              ) : null}
              {schedulingCourseId === course.id ? (
                <form className="schedule-form" onSubmit={(event) => handleCreateSchedule(event, course)}>
                  <fieldset className="schedule-mode-selector">
                    <legend>Tipo di pianificazione</legend>
                    <div>
                      <label>
                        <input
                          checked={scheduleMode === "weekly"}
                          name={`schedule-mode-${course.id}`}
                          onChange={() => setScheduleMode("weekly")}
                          type="radio"
                        />
                        <span>Ricorrenza settimanale</span>
                      </label>
                      <label>
                        <input
                          checked={scheduleMode === "single"}
                          name={`schedule-mode-${course.id}`}
                          onChange={() => setScheduleMode("single")}
                          type="radio"
                        />
                        <span>Data singola</span>
                      </label>
                    </div>
                  </fieldset>
                  {scheduleMode === "weekly" ? (
                    <fieldset className="weekday-checkboxes">
                      <legend>Giorni ricorrenti</legend>
                      {weekdays.map((weekday, weekdayIndex) => (
                        <label key={weekday}>
                          <input
                            checked={scheduleWeekdays.includes(weekdayIndex)}
                            onChange={() => toggleScheduleWeekday(weekdayIndex)}
                            type="checkbox"
                          />
                          <span>{weekday}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <label className="field single-date-field">
                      <span>Data della lezione</span>
                      <input
                        min={localIsoDate()}
                        onChange={(event) => setScheduleDate(event.target.value)}
                        required
                        type="date"
                        value={scheduleDate}
                      />
                    </label>
                  )}
                  <div className="schedule-fields">
                    <label className="field">
                      <span>Ora inizio</span>
                      <input
                        onChange={(event) => setScheduleStartsAt(event.target.value)}
                        required
                        type="time"
                        value={scheduleStartsAt}
                      />
                    </label>
                    <label className="field">
                      <span>Ora fine</span>
                      <input
                        onChange={(event) => setScheduleEndsAt(event.target.value)}
                        required
                        type="time"
                        value={scheduleEndsAt}
                      />
                    </label>
                    <label className="field">
                      <span>Posti per lezione</span>
                      <input
                        min="1"
                        onChange={(event) => setScheduleCapacity(event.target.value)}
                        required
                        type="number"
                        value={scheduleCapacity}
                      />
                    </label>
                    <label className="field">
                      <span>Ore limite cancellazione</span>
                      <input
                        min="0"
                        onChange={(event) => setScheduleDeadline(event.target.value)}
                        required
                        type="number"
                        value={scheduleDeadline}
                      />
                    </label>
                  </div>
                  <button className="primary-action" type="submit">
                    <CalendarPlus aria-hidden="true" />
                    {scheduleMode === "weekly" ? "Salva ricorrenze" : "Aggiungi lezione"}
                  </button>
                </form>
              ) : null}
              {expandedCourseId === course.id ? (
                <div className="course-session-admin-list" aria-label={`Orari attivi ${course.title}`}>
                {course.sessions.every((session) => !session.is_active) ? (
                  <p className="muted schedule-empty-state">
                    Nessuna lezione pianificata. Il corso puo restare senza ricorrenze.
                  </p>
                ) : null}
                {course.sessions.filter((session) => session.is_active).map((session) => {
                  const sessionLabel = session.occurs_on
                    ? `${formatDate(session.occurs_on)} ${formatTime(session.starts_at)}`
                    : `${weekdays[session.weekday]} ${formatTime(session.starts_at)}`;
                  const isEditing = editingSessionId === session.id && sessionDraft !== null;
                  return (
                    <article className="course-session-admin" key={session.id}>
                      <div>
                        <strong>{sessionLabel}</strong>
                        <span>
                          {formatTime(session.starts_at)} - {formatTime(session.ends_at)} · {session.capacity} posti
                        </span>
                        <small>{session.occurs_on ? "Data singola" : "Ricorrenza settimanale"}</small>
                      </div>
                      {isEditing ? (
                        <div className="session-edit-fields">
                          {sessionDraft.occurs_on === null ? (
                            <label className="field">
                              <span>{`Giorno ${sessionLabel}`}</span>
                              <select
                                onChange={(event) =>
                                  setSessionDraft({ ...sessionDraft, weekday: Number(event.target.value) })
                                }
                                value={sessionDraft.weekday}
                              >
                                {weekdays.map((weekday, weekdayIndex) => (
                                  <option key={weekday} value={weekdayIndex}>{weekday}</option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <label className="field">
                              <span>{`Data ${sessionLabel}`}</span>
                              <input
                                min={localIsoDate()}
                                onChange={(event) =>
                                  setSessionDraft({ ...sessionDraft, occurs_on: event.target.value })
                                }
                                type="date"
                                value={sessionDraft.occurs_on}
                              />
                            </label>
                          )}
                          <label className="field">
                            <span>{`Inizio ${sessionLabel}`}</span>
                            <input
                              onChange={(event) =>
                                setSessionDraft({ ...sessionDraft, starts_at: event.target.value })
                              }
                              type="time"
                              value={formatTime(sessionDraft.starts_at)}
                            />
                          </label>
                          <label className="field">
                            <span>{`Fine ${sessionLabel}`}</span>
                            <input
                              onChange={(event) =>
                                setSessionDraft({ ...sessionDraft, ends_at: event.target.value })
                              }
                              type="time"
                              value={formatTime(sessionDraft.ends_at)}
                            />
                          </label>
                          <label className="field">
                            <span>{`Capienza ${sessionLabel}`}</span>
                            <input
                              min="1"
                              onChange={(event) =>
                                setSessionDraft({ ...sessionDraft, capacity: Number(event.target.value) })
                              }
                              type="number"
                              value={sessionDraft.capacity}
                            />
                          </label>
                          <button
                            aria-label={`Salva ${sessionLabel}`}
                            className="primary-action"
                            onClick={() => handleUpdateSession(course)}
                            type="button"
                          >
                            <Save aria-hidden="true" />
                            Salva
                          </button>
                        </div>
                      ) : (
                        <div className="admin-row-actions">
                          <button
                            aria-label={`Modifica ${sessionLabel}`}
                            className="secondary-action"
                            onClick={() => handleEditSession(session)}
                            type="button"
                          >
                            <Pencil aria-hidden="true" />
                            Modifica
                          </button>
                          <button
                            aria-label={`Disattiva ${sessionLabel}`}
                            className="secondary-action danger-action"
                            onClick={() => handleDeactivateSession(course, session)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" />
                            Disattiva
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function LoginScreen({
  notice,
  onLogin,
  onRegister,
  onVerifyTwoFactor,
}: {
  notice: Notice | null;
  onLogin: (email: string, password: string) => Promise<TwoFactorStep | null>;
  onRegister: (payload: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<void>;
  onVerifyTwoFactor: (step: TwoFactorStep, totpCode: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [twoFactorStep, setTwoFactorStep] = useState<TwoFactorStep | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    if (twoFactorStep !== null) {
      await onVerifyTwoFactor(twoFactorStep, totpCode);
    } else if (mode === "login") {
      setTwoFactorStep(await onLogin(email, password));
    } else {
      await onRegister({ email, firstName, lastName, password });
    }
    setSubmitting(false);
  }

  return (
    <main className="login-shell" id="main-content">
      <a className="skip-link" href="#login-form">
        Vai al login
      </a>
      <section className="login-layout" aria-labelledby="login-title">
        <div className="login-copy">
          <BrandHeading className="brand-heading-login" context="ASD Corpo Libero" titleId="login-title" />
          <p className="login-lede">
            Area utente per corsi, prenotazioni e scadenza informativa
            dell'abbonamento.
          </p>
          <div className="discipline-strip" aria-label="Discipline">
            <span>Calisthenics</span>
            <span>Arti marziali</span>
            <span>Pole dance</span>
          </div>
        </div>

        <form className="login-card" id="login-form" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow">
              {twoFactorStep?.kind === "setup"
                ? "Proteggi il tuo accesso"
                : twoFactorStep?.kind === "verify"
                  ? "Verifica backoffice"
                  : mode === "login"
                    ? "Bentornato"
                    : "Nuovo iscritto"}
            </p>
            <h2>
              {twoFactorStep?.kind === "setup"
                ? "Configura il 2FA"
                : twoFactorStep?.kind === "verify"
                  ? "Conferma accesso"
                : mode === "login"
                  ? "Entra nell'area utente"
                  : "Crea account utente"}
            </h2>
          </div>

          {twoFactorStep === null ? (
          <div className="auth-switch" role="tablist" aria-label="Accesso area utente">
            <button
              aria-selected={mode === "login"}
              className={mode === "login" ? "is-selected" : ""}
              onClick={() => setMode("login")}
              role="tab"
              type="button"
            >
              Accedi
            </button>
            <button
              aria-selected={mode === "register"}
              className={mode === "register" ? "is-selected" : ""}
              onClick={() => setMode("register")}
              role="tab"
              type="button"
            >
              Registrati
            </button>
          </div>
          ) : null}

          {notice !== null ? (
            <div className={`notice notice-${notice.tone}`} role="alert">
              <XCircle aria-hidden="true" />
              <span>{notice.message}</span>
            </div>
          ) : null}

          {mode === "register" && twoFactorStep === null ? (
            <div className="name-grid">
              <label className="field">
                <span>Nome</span>
                <input
                  autoComplete="given-name"
                  name="firstName"
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  type="text"
                  value={firstName}
                />
              </label>

              <label className="field">
                <span>Cognome</span>
                <input
                  autoComplete="family-name"
                  name="lastName"
                  onChange={(event) => setLastName(event.target.value)}
                  required
                  type="text"
                  value={lastName}
                />
              </label>
            </div>
          ) : null}

          {twoFactorStep === null ? <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label> : null}

          {twoFactorStep === null ? <label className="field">
            <span>Password</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 12 : undefined}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label> : null}

          {twoFactorStep?.kind === "setup" ? (
            <div className="two-factor-setup">
              <p>Scansiona il QR nell'app autenticatore, poi inserisci il codice generato.</p>
              <figure className="two-factor-qr">
                <QRCodeSVG
                  aria-label="QR Code per configurare il 2FA"
                  bgColor="#ffffff"
                  fgColor="#111113"
                  level="M"
                  marginSize={2}
                  role="img"
                  size={184}
                  value={twoFactorStep.otpauthUri}
                />
                <figcaption>Inquadra il codice con l'app autenticatore.</figcaption>
              </figure>
              <label className="field">
                <span>Chiave manuale 2FA</span>
                <input
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={twoFactorStep.secret}
                />
              </label>
              <a className="secondary-action" href={twoFactorStep.otpauthUri}>
                <ShieldCheck aria-hidden="true" />
                Apri nell'autenticatore
              </a>
            </div>
          ) : null}

          {twoFactorStep !== null ? (
            <label className="field">
              <span>Codice 2FA</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="totpCode"
                onChange={(event) => setTotpCode(event.target.value)}
                pattern="[0-9]{6}"
                required
                type="text"
                value={totpCode}
              />
            </label>
          ) : null}

          <button className="primary-action" disabled={submitting} type="submit">
            <span>
              {submitting
                ? "Operazione in corso"
                : twoFactorStep?.kind === "setup"
                  ? "Attiva e accedi"
                  : twoFactorStep?.kind === "verify"
                    ? "Conferma codice"
                : mode === "login"
                  ? "Entra nell'area utente"
                  : "Crea account"}
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
          {twoFactorStep !== null ? (
            <button
              className="secondary-action"
              onClick={() => {
                setTwoFactorStep(null);
                setTotpCode("");
              }}
              type="button"
            >
              Torna alle credenziali
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}

function AppHeader({
  user,
  onLogout,
  onOpenBackoffice,
}: {
  user: User | null;
  onLogout: () => void;
  onOpenBackoffice?: () => void;
}) {
  return (
    <header className="app-header">
      <a className="skip-link" href="#catalog-title">
        Vai al catalogo
      </a>
      <BrandHeading context="Area utente" />
      <div className={onOpenBackoffice ? "header-actions header-actions-workspace" : "header-actions"}>
        {onOpenBackoffice ? (
          <button
            aria-label="Vai al backoffice"
            className="secondary-action workspace-switch"
            onClick={onOpenBackoffice}
            title="Vai al backoffice"
            type="button"
          >
            <Activity aria-hidden="true" />
            <span className="workspace-switch-label">Backoffice</span>
          </button>
        ) : null}
        <div className="user-chip">
          <UserRound aria-hidden="true" />
          <span>{user?.email ?? "Utente"}</span>
        </div>
        <button className="icon-button" type="button" onClick={onLogout} aria-label="Esci">
          <LogOut aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function BrandHeading({
  className = "",
  context,
  titleId,
}: {
  className?: string;
  context: string;
  titleId?: string;
}) {
  return (
    <div className={`brand-heading ${className}`.trim()}>
      <picture>
        <source media="(max-width: 619px)" srcSet="/brand/maka-mark-inverse.svg" />
        <img alt="" className="brand-mark" src="/brand/maka-mark.svg" />
      </picture>
      <div>
        <p className="eyebrow">{context}</p>
        <h1 id={titleId}>MAKA</h1>
        <p className="brand-tagline">Martial Arts &amp; Calisthenics</p>
      </div>
    </div>
  );
}

function OverviewPanel({
  bookingsCount,
  coursesCount,
  subscription,
}: {
  bookingsCount: number;
  coursesCount: number;
  subscription: SubscriptionInfo | null;
}) {
  return (
    <section className="overview" aria-label="Riepilogo personale">
      <article>
        <Dumbbell aria-hidden="true" />
        <span>Corsi attivi</span>
        <strong>{coursesCount}</strong>
      </article>
      <article>
        <CalendarCheck aria-hidden="true" />
        <span>Prenotazioni</span>
        <strong>{bookingsCount}</strong>
      </article>
      <article>
        <ShieldCheck aria-hidden="true" />
        <span>Abbonamento</span>
        <strong>{subscription?.is_active ? "Attivo" : "Da verificare"}</strong>
      </article>
    </section>
  );
}

function SectionHeading({
  icon,
  eyebrow,
  title,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="section-heading">
      <div className="section-icon">{icon}</div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="catalog-title">{title}</h2>
      </div>
    </div>
  );
}

function CatalogFilters({
  filters,
  locations,
  onChange,
  resultCount,
}: {
  filters: Filters;
  locations: Array<[string, string]>;
  onChange: (filters: Filters) => void;
  resultCount: number;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <form
      className={isOpen ? "filters filters-open" : "filters"}
      aria-label="Filtri catalogo"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="course-search-row">
        <label className="course-search">
          <Search aria-hidden="true" />
          <input
            aria-label="Cerca corsi"
            autoComplete="off"
            onChange={(event) => onChange({ ...filters, query: event.target.value })}
            placeholder="Cerca corso, disciplina o sede"
            type="search"
            value={filters.query}
          />
          {filters.query !== "" ? (
            <button
              aria-label="Cancella ricerca"
              className="course-search-clear"
              onClick={() => onChange({ ...filters, query: "" })}
              title="Cancella ricerca"
              type="button"
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <span className="catalog-result-count" aria-live="polite">
          {resultCount} {resultCount === 1 ? "corso" : "corsi"}
        </span>
      </div>

      <button
        aria-controls="catalog-filter-panel"
        aria-expanded={isOpen}
        className="filter-trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" />
        <span>Filtra</span>
      </button>

      <div className="filter-panel" id="catalog-filter-panel">
        <div className="quick-filters" role="group" aria-label="Filtri rapidi">
          <button
            className={filters.locationId === "all" && !filters.availableOnly ? "is-selected" : ""}
            onClick={() => onChange({ ...filters, locationId: "all", availableOnly: false })}
            type="button"
          >
            Tutti
            </button>
          <button
            className={filters.availableOnly ? "is-selected" : ""}
            onClick={() => onChange({ ...filters, availableOnly: !filters.availableOnly })}
            type="button"
          >
            Disponibili
          </button>
          {locations.map(([id, name]) => (
            <button
              className={filters.locationId === id ? "is-selected" : ""}
              key={id}
              onClick={() => onChange({ ...filters, locationId: id })}
              type="button"
            >
              {name.replace("Chiron ", "")}
            </button>
          ))}
        </div>

        <label className="field compact-field">
          <span>Sede</span>
          <select
            value={filters.locationId}
            onChange={(event) => onChange({ ...filters, locationId: event.target.value })}
          >
            <option value="all">Tutte le sedi</option>
            {locations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="field compact-field">
          <span>Giorno</span>
          <select
            value={filters.weekday}
            onChange={(event) => onChange({ ...filters, weekday: event.target.value })}
          >
            <option value="all">Tutti i giorni</option>
            {weekdays.map((weekday, index) => (
              <option key={weekday} value={index}>
                {weekday}
              </option>
            ))}
          </select>
        </label>

        <label className="availability-toggle">
          <input
            checked={filters.availableOnly}
            onChange={(event) => onChange({ ...filters, availableOnly: event.target.checked })}
            type="checkbox"
          />
          <span>Solo posti disponibili</span>
        </label>
      </div>
    </form>
  );
}

function CourseCatalog({
  bookings,
  courses,
  pendingSessionId,
  subscription,
  onCreateBooking,
}: {
  bookings: Booking[];
  courses: CatalogCourse[];
  pendingSessionId: string | null;
  subscription: SubscriptionInfo | null;
  onCreateBooking: (course: CatalogCourse, courseSession: CatalogSession) => void;
}) {
  if (courses.length === 0) {
    return (
      <div className="empty-state">
        <Search aria-hidden="true" />
        <h3>Nessun corso trovato</h3>
        <p>Modifica la ricerca o i filtri per visualizzare altri corsi.</p>
      </div>
    );
  }

  return (
    <div className="course-list">
      {courses.map((course) => (
        <CourseBookingCard
          bookings={bookings}
          course={course}
          key={course.id}
          onCreateBooking={onCreateBooking}
          pendingSessionId={pendingSessionId}
          subscription={subscription}
        />
      ))}
    </div>
  );
}

function CourseBookingCard({
  bookings,
  course,
  pendingSessionId,
  subscription,
  onCreateBooking,
}: {
  bookings: Booking[];
  course: CatalogCourse;
  pendingSessionId: string | null;
  subscription: SubscriptionInfo | null;
  onCreateBooking: (course: CatalogCourse, courseSession: CatalogSession) => void;
}) {
  const sessions = useMemo(
    () =>
      [...course.sessions].sort((left, right) =>
        `${left.occurs_on}:${left.starts_at}`.localeCompare(
          `${right.occurs_on}:${right.starts_at}`,
        ),
      ),
    [course.sessions],
  );
  const [selectedSessionKey, setSelectedSessionKey] = useState(
    sessions[0] === undefined ? "" : occurrenceKey(sessions[0]),
  );

  useEffect(() => {
    if (!sessions.some((session) => occurrenceKey(session) === selectedSessionKey)) {
      setSelectedSessionKey(sessions[0] === undefined ? "" : occurrenceKey(sessions[0]));
    }
  }, [selectedSessionKey, sessions]);

  const selectedSession =
    sessions.find((session) => occurrenceKey(session) === selectedSessionKey) ?? sessions[0];

  if (selectedSession === undefined) {
    return null;
  }

  const selectedDate = dateFromIso(selectedSession.occurs_on);
  const month = new Intl.DateTimeFormat("it-IT", { month: "short" })
    .format(selectedDate)
    .replace(".", "");
  const isFull = selectedSession.available_spots <= 0;
  const existingBooking = bookingForOccurrence(bookings, selectedSession);
  const hasValidSubscription = canBookOccurrence(
    subscription,
    selectedSession,
    course.requires_active_subscription,
  );
  const canBook = existingBooking === undefined && hasValidSubscription;
  const isPending = pendingSessionId === occurrenceKey(selectedSession);

  return (
    <article className="course-card" aria-label={course.title}>
      <CourseVisual discipline={course.discipline} imageUrl={course.image_url} />
      <div className="course-card-header">
        <div>
          <h3>{course.title}</h3>
          <p>{course.description ?? "Sessione di movimento a corpo libero."}</p>
        </div>
        <div className="course-meta-row">
          <div className="course-access-meta">
            <span className="location-badge">
              <MapPin aria-hidden="true" />
              {course.location_name}
            </span>
            {!course.requires_active_subscription ? (
              <span className="course-access-badge">Aperto a tutti</span>
            ) : null}
          </div>
          <span className="spots">{sessions.length} date disponibili</span>
        </div>
      </div>

      <div className="session-booking-control">
        <label className="session-picker">
          <span>
            <CalendarDays aria-hidden="true" />
            Scegli la lezione
          </span>
          <select
            aria-label={`Lezione ${course.title}`}
            onChange={(event) => setSelectedSessionKey(event.target.value)}
            value={occurrenceKey(selectedSession)}
          >
            {sessions.map((session) => {
              const sessionBooking = bookingForOccurrence(bookings, session);
              return (
                <option key={occurrenceKey(session)} value={occurrenceKey(session)}>
                  {weekdays[session.weekday].slice(0, 3)} {formatDate(session.occurs_on).slice(0, 5)} ·{" "}
                  {formatTime(session.starts_at)} ·{" "}
                  {sessionBooking !== undefined
                    ? bookedActionLabel(sessionBooking)
                    : session.available_spots > 0
                      ? `${session.available_spots} posti`
                      : "Lista attesa"}
                </option>
              );
            })}
          </select>
        </label>

        <div className="session-booking-dock" aria-live="polite">
          <time className="session-date-tile" dateTime={selectedSession.occurs_on}>
            <span>{weekdays[selectedSession.weekday].slice(0, 3)}</span>
            <strong>{selectedDate.getDate()}</strong>
            <small>{month}</small>
          </time>
          <div className="session-booking-details">
            <strong>{weekdays[selectedSession.weekday]}</strong>
            <span className="session-booking-time">
              <Clock3 aria-hidden="true" />
              {formatTime(selectedSession.starts_at)} - {formatTime(selectedSession.ends_at)}
            </span>
            <span className={isFull ? "session-availability is-full" : "session-availability"}>
              {existingBooking !== undefined
                ? existingBooking.status === "waitlisted"
                  ? "Sei in lista d’attesa"
                  : `Posto confermato · ${selectedSession.available_spots} posti liberi`
                : isFull
                  ? "Lista attesa disponibile"
                  : `${selectedSession.available_spots} posti liberi`}
            </span>
          </div>
          <button
            className={isFull || existingBooking !== undefined ? "secondary-action" : "primary-action"}
            disabled={!canBook || isPending}
            onClick={() => onCreateBooking(course, selectedSession)}
            type="button"
          >
            {isPending
              ? "Invio"
              : existingBooking !== undefined
                ? bookedActionLabel(existingBooking)
                : !hasValidSubscription
                  ? "Iscrizione richiesta"
                : isFull
                  ? "Lista attesa"
                  : "Prenota"}
          </button>
        </div>
      </div>
    </article>
  );
}

function CourseVisual({
  discipline,
  imageUrl,
}: {
  discipline: CourseDiscipline;
  imageUrl: string | null;
}) {
  const normalizedDiscipline = discipline.toLocaleLowerCase("it-IT");
  const variant =
    normalizedDiscipline.includes("pole")
      ? "pole"
      : normalizedDiscipline.includes("marzial") || normalizedDiscipline.includes("martial")
        ? "martial"
        : normalizedDiscipline === "sala" ||
            normalizedDiscipline.includes("calisthenics") ||
            normalizedDiscipline.includes("mobilit")
          ? "calisthenics"
          : "movement";
  const assets = {
    calisthenics: "/assets/course-calisthenics.jpg",
    martial: "/assets/course-martial-arts.jpg",
    movement: null,
    pole: "/assets/course-pole.jpg",
  } as const;
  const source = absoluteImageUrl(imageUrl) ?? assets[variant];

  return (
    <div className={`course-visual course-visual-${variant}`} aria-hidden="true">
      {source === null ? (
        <div className="course-visual-placeholder">
          <Dumbbell />
        </div>
      ) : (
        <img alt="" loading="lazy" src={source} />
      )}
      <span>{disciplineLabel(discipline)}</span>
    </div>
  );
}

function SubscriptionPanel({ subscription }: { subscription: SubscriptionInfo | null }) {
  return (
    <section className="panel compact-panel subscription-panel" aria-labelledby="subscription-title">
      <SectionTitle icon={<Sparkles aria-hidden="true" />} title="Abbonamento" id="subscription-title" />
      {subscription === null ? (
        <p className="muted">Nessuna scadenza registrata.</p>
      ) : (
        <div className="subscription-box">
          <span>{subscription.is_active ? "Informativo attivo" : "Da verificare in segreteria"}</span>
          <strong>Scade il {formatDate(subscription.expires_on)}</strong>
          <p>Inizio {formatDate(subscription.starts_on)} · durata {subscription.duration_days} giorni</p>
        </div>
      )}
    </section>
  );
}

function BookingsPanel({
  bookings,
  courses,
  pendingBookingId,
  onCancelBooking,
}: {
  bookings: Booking[];
  courses: CatalogCourse[];
  pendingBookingId: string | null;
  onCancelBooking: (booking: Booking) => void;
}) {
  const visibleBookings = bookings.filter((booking) => booking.status !== "cancelled");

  return (
    <section className="panel compact-panel bookings-panel" aria-labelledby="bookings-title">
      <SectionTitle icon={<CalendarCheck aria-hidden="true" />} title="Le tue prenotazioni" id="bookings-title" />
      {visibleBookings.length === 0 ? (
        <p className="muted">Non hai prenotazioni attive.</p>
      ) : (
        <div className="booking-list">
          {visibleBookings.map((booking) => {
            const course = courseForSession(courses, booking.course_session_id);
            const session = sessionForBooking(courses, booking);
            const title = course?.title ?? "Sessione";
            return (
              <article className="booking-item" key={booking.id}>
                <div>
                  <h3>{title}</h3>
                  <p>
                    {session !== undefined
                      ? `${weekdays[session.weekday]} ${formatDate(booking.occurs_on)} · ${formatTime(session.starts_at)}`
                      : `${formatDate(booking.occurs_on)} · Orario non disponibile`}
                  </p>
                  <span className="booking-status">
                    {booking.status === "waitlisted" ? "Lista attesa" : "Confermata"}
                  </span>
                </div>
                <button
                  aria-label={`Cancella ${title}`}
                  className="secondary-action"
                  disabled={pendingBookingId === booking.id}
                  onClick={() => onCancelBooking(booking)}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" />
                  {pendingBookingId === booking.id ? "Cancello" : "Cancella"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MobileTabBar({
  activeView,
  onChange,
}: {
  activeView: MobileView;
  onChange: (view: MobileView) => void;
}) {
  return (
    <nav className="mobile-tabbar" aria-label="Navigazione area utente">
      <button
        aria-current={activeView === "courses" ? "page" : undefined}
        onClick={() => onChange("courses")}
        type="button"
      >
        <Home aria-hidden="true" />
        <span>Corsi</span>
      </button>
      <button
        aria-current={activeView === "calendar" ? "page" : undefined}
        onClick={() => onChange("calendar")}
        type="button"
      >
        <CalendarDays aria-hidden="true" />
        <span>Calendario</span>
      </button>
      <button
        aria-current={activeView === "bookings" ? "page" : undefined}
        onClick={() => onChange("bookings")}
        type="button"
      >
        <ListChecks aria-hidden="true" />
        <span>Prenotazioni</span>
      </button>
      <button
        aria-current={activeView === "profile" ? "page" : undefined}
        onClick={() => onChange("profile")}
        type="button"
      >
        <UserRound aria-hidden="true" />
        <span>Profilo</span>
      </button>
    </nav>
  );
}

function SectionTitle({ icon, title, id }: { icon: ReactNode; title: string; id: string }) {
  return (
    <div className="section-title">
      <span>{icon}</span>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <section className="panel loading-panel" aria-live="polite" aria-label="Caricamento area utente">
      <span className="loader" />
      <p>Sto caricando corsi e prenotazioni.</p>
    </section>
  );
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="panel empty-state">
      <XCircle aria-hidden="true" />
      <h2>Area utente non disponibile</h2>
      <p>Puoi riprovare senza reinserire i dati.</p>
      <button className="primary-action" onClick={onRetry} type="button">
        Riprova
      </button>
    </section>
  );
}
