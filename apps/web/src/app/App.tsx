import {
  Activity,
  Archive,
  ArrowRight,
  Bell,
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Dumbbell,
  Home,
  ImagePlus,
  ListChecks,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  UserX,
  XCircle,
} from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import {
  AdminCourse,
  AdminStats,
  AdminSubscriptionInfo,
  AdminUser,
  ApiError,
  Booking,
  CatalogCourse,
  CatalogSession,
  ChironApi,
  CourseDiscipline,
  CoursePayload,
  CourseSession,
  CourseStatus,
  Location,
  LocationPayload,
  SubscriptionInfo,
  TokenPair,
  User,
} from "../lib/api";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const api = new ChironApi(apiBaseUrl);
const sessionStorageKey = "chiron.user.session";

const weekdays = ["Domenica", "Lunedi", "Martedi", "Mercoledi", "Giovedi", "Venerdi", "Sabato"];

type LoadState = "idle" | "loading" | "ready" | "error";

type Filters = {
  locationId: string;
  weekday: string;
  availableOnly: boolean;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type AuthMode = "login" | "register";

type MobileView = "courses" | "calendar" | "bookings" | "profile";
type AdminTab = "dashboard" | "calendar" | "users" | "courses" | "locations";

const disciplineLabels: Record<CourseDiscipline, string> = {
  calisthenics: "Calisthenics",
  martial_arts: "Arti marziali",
  pole_dance: "Pole dance",
  mobility: "Mobilita",
  other: "Altro",
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

function absoluteImageUrl(imageUrl: string | null): string | null {
  if (imageUrl === null) {
    return null;
  }
  return imageUrl.startsWith("http://") || imageUrl.startsWith("https://")
    ? imageUrl
    : `${apiBaseUrl}${imageUrl}`;
}

function activeBookings(bookings: Booking[]): Booking[] {
  return bookings.filter((booking) => booking.status !== "cancelled");
}

function courseForSession(courses: CatalogCourse[], sessionId: string): CatalogCourse | undefined {
  return courses.find((course) => course.sessions.some((session) => session.id === sessionId));
}

function sessionForBooking(
  courses: CatalogCourse[],
  booking: Booking,
): CatalogSession | undefined {
  return courseForSession(courses, booking.course_session_id)?.sessions.find(
    (session) => session.id === booking.course_session_id,
  );
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Credenziali non valide o sessione scaduta.";
    }
    return error.message;
  }

  return "Non riesco a parlare con il server. Riprova tra poco.";
}

function filteredCourses(courses: CatalogCourse[], filters: Filters): CatalogCourse[] {
  return courses
    .map((course) => {
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
    locationId: "all",
    weekday: "all",
    availableOnly: false,
  });
  const [loadState, setLoadState] = useState<LoadState>(session === null ? "idle" : "loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("courses");

  useEffect(() => {
    if (session === null) {
      return;
    }
    if (isBackofficeRole(session.user)) {
      setLoadState("ready");
      return;
    }

    let ignore = false;
    setLoadState("loading");

    api
      .dashboard(session.access_token)
      .then((dashboard) => {
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
        setNotice({ tone: "error", message: describeError(error) });
        setLoadState("error");
      });

    return () => {
      ignore = true;
    };
  }, [session]);

  const locations = useMemo(() => {
    const uniqueLocations = new Map<string, string>();
    for (const course of courses) {
      uniqueLocations.set(course.location_id, course.location_name);
    }
    return [...uniqueLocations.entries()];
  }, [courses]);

  const visibleCourses = useMemo(() => filteredCourses(courses, filters), [courses, filters]);
  const activeBookingCount = activeBookings(bookings).length;

  async function handleLogin(email: string, password: string): Promise<string | null> {
    setNotice(null);
    setLoadState("loading");

    try {
      const result = await api.login({ email, password });
      if ("requires_2fa" in result) {
        setLoadState("idle");
        return result.challenge_token;
      }
      if ("requires_2fa_setup" in result) {
        setLoadState("idle");
        setNotice({
          tone: "error",
          message: "Il 2FA admin deve essere configurato prima del primo accesso.",
        });
        return null;
      }
      const nextSession = result;
      saveSession(nextSession);
      setSession(nextSession);
      setUser(nextSession.user);
      return null;
    } catch (error) {
      setLoadState("idle");
      setNotice({ tone: "error", message: describeError(error) });
      return null;
    }
  }

  async function handleVerifyTwoFactor(challengeToken: string, totpCode: string): Promise<boolean> {
    setNotice(null);
    setLoadState("loading");
    try {
      const nextSession = await api.verifyTwoFactor(challengeToken, totpCode);
      saveSession(nextSession);
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

    setPendingSessionId(courseSession.id);
    setNotice(null);

    try {
      const booking = await api.createBooking(session.access_token, courseSession.id);
      setBookings((current) => [booking, ...current]);
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
      const cancelledBooking = await api.cancelBooking(session.access_token, booking.id);
      setBookings((current) =>
        current.map((item) => (item.id === cancelledBooking.id ? cancelledBooking : item)),
      );
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

  if (isBackofficeRole(session.user)) {
    return <BackofficeScreen session={session} user={user ?? session.user} onLogout={handleLogout} />;
  }

  return (
    <main className="app-shell" id="main-content">
      <div className={`workspace mobile-view-${mobileView}`}>
        <AppHeader user={user} onLogout={handleLogout} />

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
              courses={visibleCourses}
              pendingSessionId={pendingSessionId}
              onCreateBooking={handleCreateBooking}
            />
            <WeeklyCalendar
              courses={courses}
              pendingSessionId={pendingSessionId}
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
                />
                <CourseCatalog
                  courses={visibleCourses}
                  pendingSessionId={pendingSessionId}
                  onCreateBooking={handleCreateBooking}
                />
              </section>

              <aside className="side-stack" aria-label="Area personale">
                <SubscriptionPanel subscription={subscription} />
                <BookingsPanel
                  bookings={bookings}
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
}: {
  session: TokenPair;
  user: User;
  onLogout: () => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionInfo[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoadState("loading");

    api
      .adminDashboard(session.access_token)
      .then((dashboard) => {
        if (ignore) {
          return;
        }
        setLocations(dashboard.locations);
        setCourses(dashboard.courses);
        setSubscriptions(dashboard.subscriptions);
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
  }, [session.access_token]);

  const activeLocations = locations.filter((location) => location.is_active);
  const activeMembers = subscriptions.filter((subscription) => subscription.is_active).length;
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
          <div className="header-actions">
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
          <nav className="admin-tabs" aria-label="Sezioni backoffice">
            <button
              aria-current={activeTab === "dashboard" ? "page" : undefined}
              onClick={() => setActiveTab("dashboard")}
              type="button"
            >
              <Activity aria-hidden="true" />
              Dashboard
            </button>
            <button
              aria-current={activeTab === "calendar" ? "page" : undefined}
              onClick={() => setActiveTab("calendar")}
              type="button"
            >
              <CalendarDays aria-hidden="true" />
              Calendario
            </button>
            <button
              aria-current={activeTab === "users" ? "page" : undefined}
              onClick={() => setActiveTab("users")}
              type="button"
            >
              <UserRound aria-hidden="true" />
              Utenti
            </button>
            <button
              aria-current={activeTab === "courses" ? "page" : undefined}
              onClick={() => setActiveTab("courses")}
              type="button"
            >
              <Dumbbell aria-hidden="true" />
              Corsi
            </button>
            <button
              aria-current={activeTab === "locations" ? "page" : undefined}
              onClick={() => setActiveTab("locations")}
              type="button"
            >
              <MapPin aria-hidden="true" />
              Sedi
            </button>
          </nav>

          <div className="backoffice-content">
            {notice !== null ? (
              <div className={`notice notice-${notice.tone}`} role="status" aria-live="polite">
                {notice.tone === "success" ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <XCircle aria-hidden="true" />
                )}
                <span>{notice.message}</span>
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
                  <AdminCalendarPanel courses={courses} locations={locations} />
                ) : null}
                {activeTab === "users" ? (
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
                    locations={activeLocations}
                    onCourseChange={upsertCourse}
                    onNotice={setNotice}
                    token={session.access_token}
                  />
                ) : null}
                {activeTab === "locations" ? (
                  <LocationsManager
                    locations={locations}
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
  for (const course of courses) {
    const session = course.sessions.find((item) => item.available_spots > 0);
    if (session !== undefined) {
      return { course, session };
    }
  }

  return null;
}

function BookingFocus({
  courses,
  pendingSessionId,
  onCreateBooking,
}: {
  courses: CatalogCourse[];
  pendingSessionId: string | null;
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
  const isPending = pendingSessionId === session.id;

  return (
    <section className="booking-focus" aria-labelledby="booking-focus-title">
      <div className="booking-focus-copy">
        <p className="eyebrow">Prenotazione rapida</p>
        <h2 id="booking-focus-title">{course.title}</h2>
        <p>
          {weekdays[session.weekday]} · {formatTime(session.starts_at)} - {formatTime(session.ends_at)} ·{" "}
          {course.location_name}
        </p>
      </div>
      <div className="booking-focus-action">
        <span>{session.available_spots} posti liberi</span>
        <button
          className="primary-action"
          disabled={isPending}
          onClick={() => onCreateBooking(course, session)}
          type="button"
        >
          <CalendarCheck aria-hidden="true" />
          {isPending ? "Prenoto" : "Prenota ora"}
        </button>
      </div>
    </section>
  );
}

function WeekdayPicker({
  selectedWeekday,
  onChange,
}: {
  selectedWeekday: number;
  onChange: (weekday: number) => void;
}) {
  return (
    <div className="weekday-picker" role="group" aria-label="Giorno del calendario">
      {weekdays.map((weekday, index) => (
        <button
          aria-pressed={selectedWeekday === index}
          className={selectedWeekday === index ? "is-selected" : ""}
          key={weekday}
          onClick={() => onChange(index)}
          type="button"
        >
          <span>{weekday.slice(0, 3)}</span>
        </button>
      ))}
    </div>
  );
}

function WeeklyCalendar({
  courses,
  pendingSessionId,
  onCreateBooking,
}: {
  courses: CatalogCourse[];
  pendingSessionId: string | null;
  onCreateBooking: (course: CatalogCourse, courseSession: CatalogSession) => void;
}) {
  const [selectedWeekday, setSelectedWeekday] = useState(new Date().getDay());
  const entries = courses
    .flatMap((course) =>
      course.sessions
        .filter((session) => session.weekday === selectedWeekday)
        .map((session) => ({ course, session })),
    )
    .sort((left, right) => left.session.starts_at.localeCompare(right.session.starts_at));

  return (
    <section className="panel calendar-panel user-calendar" aria-labelledby="weekly-calendar-title">
      <SectionTitle
        icon={<CalendarDays aria-hidden="true" />}
        title="Calendario settimanale"
        id="weekly-calendar-title"
      />
      <WeekdayPicker selectedWeekday={selectedWeekday} onChange={setSelectedWeekday} />
      <div className="calendar-agenda">
        {entries.length === 0 ? (
          <p className="muted">Nessuna lezione programmata per {weekdays[selectedWeekday].toLowerCase()}.</p>
        ) : (
          entries.map(({ course, session }) => (
            <article className="calendar-entry" key={session.id}>
              <time>{formatTime(session.starts_at)}</time>
              <div>
                <h3>{course.title}</h3>
                <p>
                  {course.location_name} · {formatTime(session.starts_at)} - {formatTime(session.ends_at)}
                </p>
              </div>
              <button
                className="primary-action"
                disabled={pendingSessionId === session.id}
                onClick={() => onCreateBooking(course, session)}
                type="button"
              >
                {session.available_spots > 0 ? "Prenota" : "Lista attesa"}
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function AdminCalendarPanel({ courses, locations }: { courses: AdminCourse[]; locations: Location[] }) {
  const [selectedWeekday, setSelectedWeekday] = useState(new Date().getDay());
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  const entries = courses
    .filter((course) => course.status !== "archived")
    .flatMap((course) =>
      course.sessions
        .filter((session) => session.is_active && session.weekday === selectedWeekday)
        .map((session) => ({ course, session })),
    )
    .sort((left, right) => left.session.starts_at.localeCompare(right.session.starts_at));

  return (
    <section className="admin-panel calendar-panel" aria-labelledby="admin-calendar-title">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Programmazione</p>
          <h2 id="admin-calendar-title">Calendario corsi</h2>
        </div>
        <span>{entries.length} lezioni nel giorno selezionato</span>
      </div>
      <WeekdayPicker selectedWeekday={selectedWeekday} onChange={setSelectedWeekday} />
      <div className="calendar-agenda">
        {entries.length === 0 ? (
          <p className="muted">Nessuna ricorrenza attiva per {weekdays[selectedWeekday].toLowerCase()}.</p>
        ) : (
          entries.map(({ course, session }) => (
            <article className="calendar-entry" key={session.id}>
              <time>{formatTime(session.starts_at)}</time>
              <div>
                <h3>{course.title}</h3>
                <p>{locationNames.get(course.location_id) ?? "Sede non disponibile"}</p>
              </div>
              <span className="calendar-capacity">
                <UsersIcon />
                {session.capacity} posti
              </span>
            </article>
          ))
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
      onNotice({ tone: "success", message: "Utente disabilitato." });
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
    try {
      onUserChange(await api.deleteAdminUser(token, user.id));
      onNotice({ tone: "success", message: "Utente eliminato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  function handleEdit(user: AdminUser): void {
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
            <article className="admin-list-item" key={user.id}>
              <div>
                <h3>{user.email}</h3>
                <p>
                  {[user.first_name, user.last_name].filter(Boolean).join(" ") || "Profilo incompleto"}
                </p>
                <span className={user.status === "active" ? "admin-status" : "admin-status muted-status"}>
                  {user.status}
                </span>
                <p>
                  {user.subscription === null
                    ? "Nessuna iscrizione attiva"
                    : `Scadenza ${formatDate(user.subscription.expires_on)}`}
                </p>
                {editingUserId === user.id && userDraft !== null ? (
                  <div className="inline-edit-grid">
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
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Stato utente</span>
                      <select
                        value={userDraft.status}
                        onChange={(event) =>
                          setUserDraft({ ...userDraft, status: event.target.value as AdminUser["status"] })
                        }
                      >
                        <option value="active">Attivo</option>
                        <option value="disabled">Disabilitato</option>
                        <option value="deleted">Eliminato</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Inizio iscrizione</span>
                      <input
                        type="date"
                        value={userDraft.starts_on}
                        onChange={(event) => setUserDraft({ ...userDraft, starts_on: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span>Durata iscrizione</span>
                      <input
                        min="1"
                        type="number"
                        value={userDraft.duration_days}
                        onChange={(event) => setUserDraft({ ...userDraft, duration_days: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
              <div className="admin-row-actions">
                {editingUserId === user.id ? (
                  <>
                    <button
                      aria-label={`Salva utente ${user.email}`}
                      className="secondary-action"
                      onClick={() => handleSaveProfile(user)}
                      type="button"
                    >
                      <Save aria-hidden="true" />
                      Profilo
                    </button>
                    <button
                      aria-label={`Salva iscrizione ${user.email}`}
                      className="secondary-action"
                      onClick={() => handleSaveSubscription(user)}
                      type="button"
                    >
                      <CalendarCheck aria-hidden="true" />
                      Iscrizione
                    </button>
                    <button
                      aria-label={`Annulla modifica ${user.email}`}
                      className="secondary-action"
                      onClick={() => {
                        setEditingUserId(null);
                        setUserDraft(null);
                      }}
                      type="button"
                    >
                      <XCircle aria-hidden="true" />
                      Annulla
                    </button>
                  </>
                ) : (
                  <button
                    aria-label={`Gestisci utente e iscrizione ${user.email}`}
                    className="secondary-action"
                    onClick={() => handleEdit(user)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" />
                    Gestisci
                  </button>
                )}
                {user.status === "active" ? (
                  <button
                    aria-label={`Disabilita ${user.email}`}
                    className="secondary-action"
                    onClick={() => handleDisable(user)}
                    type="button"
                  >
                    <UserX aria-hidden="true" />
                    Disabilita
                  </button>
                ) : (
                  <button
                    aria-label={`Riattiva ${user.email}`}
                    className="secondary-action"
                    onClick={() => handleRestore(user)}
                    type="button"
                  >
                    <RotateCcw aria-hidden="true" />
                    Riattiva
                  </button>
                )}
                {user.status !== "deleted" ? (
                  <button
                    aria-label={`Elimina ${user.email}`}
                    className="secondary-action danger-action"
                    onClick={() => handleDelete(user)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                    Elimina
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function LocationsManager({
  locations,
  onLocationChange,
  onNotice,
  token,
}: {
  locations: Location[];
  onLocationChange: (location: Location) => void;
  onNotice: (notice: Notice) => void;
  token: string;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState<LocationPayload | null>(null);

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

  async function handleDeactivate(location: Location): Promise<void> {
    try {
      onLocationChange(await api.deactivateLocation(token, location.id));
      onNotice({ tone: "success", message: "Sede disattivata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  function handleEditLocation(location: Location): void {
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
            <article className="admin-list-item" key={location.id}>
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
              <div className="admin-row-actions">
                {editingLocationId === location.id ? (
                  <button
                    aria-label={`Salva sede ${location.name}`}
                    className="secondary-action"
                    onClick={() => handleSaveLocation(location)}
                    type="button"
                  >
                    <Save aria-hidden="true" />
                    Salva
                  </button>
                ) : (
                  <button
                    aria-label={`Modifica ${location.name}`}
                    className="secondary-action"
                    onClick={() => handleEditLocation(location)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" />
                    Modifica
                  </button>
                )}
                {location.is_active ? (
                  <button
                    aria-label={`Disattiva ${location.name}`}
                    className="secondary-action"
                    onClick={() => handleDeactivate(location)}
                    type="button"
                  >
                    <UserX aria-hidden="true" />
                    Disattiva
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CoursesManager({
  courses,
  locations,
  onCourseChange,
  onNotice,
  token,
}: {
  courses: AdminCourse[];
  locations: Location[];
  onCourseChange: (course: AdminCourse) => void;
  onNotice: (notice: Notice) => void;
  token: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState<CourseStatus>("published");
  const [discipline, setDiscipline] = useState<CourseDiscipline>("calisthenics");
  const [courseImage, setCourseImage] = useState<File | null>(null);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<CoursePayload | null>(null);
  const [schedulingCourseId, setSchedulingCourseId] = useState<string | null>(null);
  const [scheduleWeekdays, setScheduleWeekdays] = useState<number[]>([]);
  const [scheduleStartsAt, setScheduleStartsAt] = useState("18:00");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("19:00");
  const [scheduleCapacity, setScheduleCapacity] = useState("12");
  const [scheduleDeadline, setScheduleDeadline] = useState("24");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState<CourseSession | null>(null);

  const selectedLocationId = locationId || locations[0]?.id || "";

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
        status,
      });
      const savedCourse =
        courseImage === null ? course : await api.uploadCourseImage(token, course.id, courseImage);
      onCourseChange(savedCourse);
      setTitle("");
      setDescription("");
      setCourseImage(null);
      onNotice({ tone: "success", message: "Corso creato." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>, course: AdminCourse): Promise<void> {
    event.preventDefault();
    if (scheduleWeekdays.length === 0) {
      onNotice({ tone: "error", message: "Seleziona almeno un giorno." });
      return;
    }
    try {
      const sessions = await api.createCourseSchedule(token, course.id, {
        weekdays: scheduleWeekdays,
        starts_at: scheduleStartsAt,
        ends_at: scheduleEndsAt,
        capacity: Number(scheduleCapacity),
        cancellation_deadline_hours: Number(scheduleDeadline),
      });
      onCourseChange({ ...course, sessions: [...course.sessions, ...sessions] });
      setScheduleWeekdays([]);
      onNotice({ tone: "success", message: "Ricorrenze create." });
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
        weekday: sessionDraft.weekday,
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
      onNotice({ tone: "success", message: "Ricorrenza aggiornata." });
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
      onNotice({ tone: "success", message: "Ricorrenza disattivata." });
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

  function handleEditCourse(course: AdminCourse): void {
    setEditingCourseId(course.id);
    setCourseDraft({
      description: course.description,
      discipline: course.discipline,
      location_id: course.location_id,
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
      <form className="admin-form" onSubmit={handleCreateCourse}>
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
        <label className="field">
          <span>Disciplina</span>
          <select
            value={discipline}
            onChange={(event) => setDiscipline(event.target.value as CourseDiscipline)}
          >
            {Object.entries(disciplineLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
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

      <div className="admin-list">
        {courses.length === 0 ? (
          <p className="muted">Nessun corso presente.</p>
        ) : (
          courses.map((course, index) => (
            <article className="admin-list-item admin-course-item" key={`${course.id}-${index}`}>
              <CourseVisual discipline={course.discipline} imageUrl={course.image_url} />
              <div className="admin-course-body">
                <h3>{course.title}</h3>
                <p>{course.description ?? "Descrizione non inserita."}</p>
                {editingCourseId === course.id && courseDraft !== null ? (
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
                            discipline: event.target.value as CourseDiscipline,
                          })
                        }
                      >
                        {Object.entries(disciplineLabels).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
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
                  </div>
                ) : null}
                <span className="admin-status">{course.status}</span>
                <label className="secondary-action image-upload-action">
                  <ImagePlus aria-hidden="true" />
                  <span>Aggiorna foto</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => handleUploadImage(course, event.target.files?.[0])}
                    type="file"
                  />
                </label>
              </div>
              <div className="admin-row-actions">
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
                    className="secondary-action danger-action"
                    onClick={() => handleArchive(course)}
                    type="button"
                  >
                    <Archive aria-hidden="true" />
                    Archivia
                  </button>
                ) : null}
              </div>
              {schedulingCourseId === course.id ? (
                <form className="schedule-form" onSubmit={(event) => handleCreateSchedule(event, course)}>
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
                  <div className="schedule-fields">
                    <label className="field">
                      <span>Ora inizio ricorrenza</span>
                      <input
                        onChange={(event) => setScheduleStartsAt(event.target.value)}
                        required
                        type="time"
                        value={scheduleStartsAt}
                      />
                    </label>
                    <label className="field">
                      <span>Ora fine ricorrenza</span>
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
                    Salva ricorrenze
                  </button>
                </form>
              ) : null}
              <div className="course-session-admin-list">
                {course.sessions.filter((session) => session.is_active).map((session) => {
                  const sessionLabel = `${weekdays[session.weekday]} ${formatTime(session.starts_at)}`;
                  const isEditing = editingSessionId === session.id && sessionDraft !== null;
                  return (
                    <article className="course-session-admin" key={session.id}>
                      <div>
                        <strong>{sessionLabel}</strong>
                        <span>
                          {formatTime(session.starts_at)} - {formatTime(session.ends_at)} · {session.capacity} posti
                        </span>
                      </div>
                      {isEditing ? (
                        <div className="session-edit-fields">
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
  onLogin: (email: string, password: string) => Promise<string | null>;
  onRegister: (payload: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<void>;
  onVerifyTwoFactor: (challengeToken: string, totpCode: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    if (challengeToken !== null) {
      await onVerifyTwoFactor(challengeToken, totpCode);
    } else if (mode === "login") {
      const nextChallenge = await onLogin(email, password);
      setChallengeToken(nextChallenge);
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
              {challengeToken !== null ? "Verifica amministratore" : mode === "login" ? "Bentornato" : "Nuovo iscritto"}
            </p>
            <h2>
              {challengeToken !== null
                ? "Conferma accesso"
                : mode === "login"
                  ? "Entra nell'area utente"
                  : "Crea account utente"}
            </h2>
          </div>

          {challengeToken === null ? (
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

          {mode === "register" && challengeToken === null ? (
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

          {challengeToken === null ? <label className="field">
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

          {challengeToken === null ? <label className="field">
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

          {challengeToken !== null ? (
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
                : challengeToken !== null
                  ? "Conferma codice"
                : mode === "login"
                  ? "Entra nell'area utente"
                  : "Crea account"}
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
          {challengeToken !== null ? (
            <button
              className="secondary-action"
              onClick={() => {
                setChallengeToken(null);
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

function AppHeader({ user, onLogout }: { user: User | null; onLogout: () => void }) {
  return (
    <header className="app-header">
      <a className="skip-link" href="#catalog-title">
        Vai al catalogo
      </a>
      <BrandHeading context="Area utente" />
      <div className="header-actions">
        <a className="status-link" href={`${apiBaseUrl}/health`}>
          <Activity aria-hidden="true" />
          <span>API</span>
        </a>
        <button className="icon-button mobile-alert-button" type="button" aria-label="Notifiche">
          <Bell aria-hidden="true" />
        </button>
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
}: {
  filters: Filters;
  locations: Array<[string, string]>;
  onChange: (filters: Filters) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <form className={isOpen ? "filters filters-open" : "filters"} aria-label="Filtri catalogo">
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
            onClick={() => onChange({ locationId: "all", weekday: filters.weekday, availableOnly: false })}
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
  courses,
  pendingSessionId,
  onCreateBooking,
}: {
  courses: CatalogCourse[];
  pendingSessionId: string | null;
  onCreateBooking: (course: CatalogCourse, courseSession: CatalogSession) => void;
}) {
  if (courses.length === 0) {
    return (
      <div className="empty-state">
        <Search aria-hidden="true" />
        <h3>Nessun corso trovato</h3>
        <p>Cambia filtri o rimuovi "Solo posti disponibili" per vedere anche le liste attesa.</p>
      </div>
    );
  }

  return (
    <div className="course-list">
      {courses.map((course) => (
        <article className="course-card" key={course.id} aria-label={course.title}>
          <CourseVisual discipline={course.discipline} imageUrl={course.image_url} />
          <div className="course-card-header">
            <div>
              <h3>{course.title}</h3>
              <p>{course.description ?? "Sessione di movimento a corpo libero."}</p>
            </div>
            <div className="course-meta-row">
              <span className="location-badge">
                <MapPin aria-hidden="true" />
                {course.location_name}
              </span>
              <span className="spots">
                {course.sessions.reduce((total, session) => total + session.available_spots, 0)} posti totali
              </span>
            </div>
          </div>

          <div className="session-list">
            {course.sessions.map((session) => {
              const isFull = session.available_spots <= 0;
              const isPending = pendingSessionId === session.id;
              return (
                <div className="session-row" key={session.id}>
                  <div className="session-thumb" aria-hidden="true">
                    <Dumbbell />
                  </div>
                  <div>
                    <span className="session-day">{weekdays[session.weekday]}</span>
                    <span className="session-time">
                      <Clock3 aria-hidden="true" />
                      {formatTime(session.starts_at)} - {formatTime(session.ends_at)}
                    </span>
                  </div>
                  <div className="session-action">
                    <span className={isFull ? "spots is-full" : "spots"}>
                      {isFull ? "Completo" : `${session.available_spots} posti`}
                    </span>
                    <button
                      className={isFull ? "secondary-action" : "primary-action"}
                      disabled={isPending}
                      onClick={() => onCreateBooking(course, session)}
                      type="button"
                    >
                      {isPending ? "Invio" : isFull ? "Lista attesa" : "Prenota"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

function CourseVisual({
  discipline,
  imageUrl,
}: {
  discipline: CourseDiscipline;
  imageUrl: string | null;
}) {
  const variant =
    discipline === "pole_dance"
      ? "pole"
      : discipline === "martial_arts"
        ? "martial"
        : discipline === "calisthenics"
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
      <span>{disciplineLabels[discipline]}</span>
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
  return (
    <section className="panel compact-panel bookings-panel" aria-labelledby="bookings-title">
      <SectionTitle icon={<CalendarCheck aria-hidden="true" />} title="Le tue prenotazioni" id="bookings-title" />
      {bookings.length === 0 ? (
        <p className="muted">Non hai ancora prenotazioni.</p>
      ) : (
        <div className="booking-list">
          {bookings.map((booking) => {
            const course = courseForSession(courses, booking.course_session_id);
            const session = sessionForBooking(courses, booking);
            const isCancelled = booking.status === "cancelled";
            const title = course?.title ?? "Sessione";
            return (
              <article className="booking-item" key={booking.id}>
                <div>
                  <h3>{title}</h3>
                  <p>
                    {session !== undefined
                      ? `${weekdays[session.weekday]} ${formatTime(session.starts_at)}`
                      : "Orario non disponibile"}
                  </p>
                  <span className={isCancelled ? "booking-status cancelled" : "booking-status"}>
                    {isCancelled ? "Cancellata" : booking.status === "waitlisted" ? "Lista attesa" : "Confermata"}
                  </span>
                </div>
                {!isCancelled ? (
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
                ) : null}
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
