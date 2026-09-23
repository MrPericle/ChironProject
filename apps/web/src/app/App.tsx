import {
  Activity,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Eye,
  EyeOff,
  Home,
  History,
  ImagePlus,
  ListChecks,
  LockKeyhole,
  LogOut,
  MailCheck,
  MapPin,
  MoreHorizontal,
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
import { FormEvent, ReactNode, SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  AdminCourse,
  AdminCourseSessionAttendee,
  AdminCourseSessionAvailability,
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
  WorkoutDayPayload,
  WorkoutExercisePayload,
  WorkoutLog,
  WorkoutLogPayload,
  WorkoutPlan,
  WorkoutPlanPayload,
  WorkoutPlanStatus,
  WorkoutPlanSummary,
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
  tone: "success" | "error" | "info";
  message: string;
};

type AuthMode = "login" | "register" | "forgot" | "reset";
type TwoFactorStep =
  | { kind: "verify"; token: string }
  | { kind: "setup"; token: string; secret: string; otpauthUri: string };
type AuthStep = TwoFactorStep | { kind: "email"; email: string };

type MobileView = "courses" | "training" | "bookings" | "profile";
type AdminTab = "dashboard" | "workouts" | "calendar" | "users" | "courses";
type ScheduleMode = "weekly" | "single";
type WorkspaceMode = "backoffice" | "personal";
type WorkoutPlanSort = "updated" | "title" | "created";

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

function upcomingDates(days = 28): string[] {
  const today = new Date();
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return localIsoDate(date);
  });
}

type StepperHistoryOptions = {
  enabled: boolean;
  flowId: string;
  onClose: () => void;
  onStepChange: (step: number) => void;
  step: number;
};

function useStepperHistory({
  enabled,
  flowId,
  onClose,
  onStepChange,
  step,
}: StepperHistoryOptions): void {
  const initialized = useRef(false);
  const previousStep = useRef(step);
  const historyDepth = useRef(0);
  const closedFromPopState = useRef(false);
  const entryBeforeFlow = useRef<unknown>(undefined);
  const cleanupTimer = useRef<number | null>(null);

  useEffect(() => {
    if (cleanupTimer.current !== null) {
      window.clearTimeout(cleanupTimer.current);
      cleanupTimer.current = null;
    }
    if (!enabled || initialized.current) {
      return;
    }
    entryBeforeFlow.current = window.history.state;
    window.history.pushState(
      { ...(window.history.state ?? {}), makaStepper: { flowId, step } },
      "",
      window.location.href,
    );
    previousStep.current = step;
    historyDepth.current = 1;
    closedFromPopState.current = false;
    initialized.current = true;
  }, [enabled, flowId, step]);

  useEffect(() => {
    if (!enabled || !initialized.current || previousStep.current === step) {
      return;
    }
    if (
      step < previousStep.current &&
      historyDepth.current > 1 &&
      window.history.state?.makaStepper?.flowId === flowId
    ) {
      window.history.back();
      return;
    }
    window.history.pushState(
      { ...(window.history.state ?? {}), makaStepper: { flowId, step } },
      "",
      window.location.href,
    );
    historyDepth.current += 1;
    previousStep.current = step;
  }, [enabled, flowId, step]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const handlePopState = (event: PopStateEvent): void => {
      const next = event.state?.makaStepper;
      if (next?.flowId === flowId && typeof next.step === "number") {
        historyDepth.current = Math.max(0, historyDepth.current - 1);
        previousStep.current = next.step;
        onStepChange(next.step);
        return;
      }
      closedFromPopState.current = true;
      historyDepth.current = 0;
      onClose();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled, flowId, onClose, onStepChange]);

  useEffect(() => {
    return () => {
      cleanupTimer.current = window.setTimeout(() => {
        if (
          initialized.current &&
          window.history.state?.makaStepper?.flowId === flowId &&
          entryBeforeFlow.current !== undefined &&
          !closedFromPopState.current
        ) {
          window.history.go(-historyDepth.current);
        }
        initialized.current = false;
        cleanupTimer.current = null;
      }, 0);
    };
  }, [enabled, flowId]);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function monthKey(value: string): string {
  return value.slice(0, 7);
}

function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(dateFromIso(`${value}-01`));
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
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlan[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [workoutPlansLoadState, setWorkoutPlansLoadState] = useState<LoadState>(
    session === null ? "idle" : "loading",
  );
  const [workoutLogsLoadState, setWorkoutLogsLoadState] = useState<LoadState>(
    session === null ? "idle" : "loading",
  );
  const [workoutPlansError, setWorkoutPlansError] = useState<string | null>(null);
  const [workoutLogsError, setWorkoutLogsError] = useState<string | null>(null);
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
  const [requestedWorkoutLogId, setRequestedWorkoutLogId] = useState<string | null>(null);
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
      setWorkoutPlansLoadState("idle");
      setWorkoutLogsLoadState("idle");
      setLoadState("ready");
      return;
    }

    let ignore = false;

    const loadDashboard = (showLoading: boolean): void => {
      if (showLoading) {
        setLoadState("loading");
      }
      setWorkoutPlansLoadState("loading");
      setWorkoutLogsLoadState("loading");
      setWorkoutPlansError(null);
      setWorkoutLogsError(null);

      const loadResource = <T,>(
        request: Promise<T>,
        onSuccess: (value: T) => void,
        setResourceState: (state: LoadState) => void,
        setResourceError: (message: string | null) => void,
      ): void => {
        request
          .then((value) => {
            if (ignore) {
              return;
            }
            onSuccess(value);
            setResourceError(null);
            setResourceState("ready");
          })
          .catch((error: unknown) => {
            if (ignore) {
              return;
            }
            setResourceError(describeError(error));
            setResourceState("error");
          });
      };

      loadResource(
        api.workoutPlans(session.access_token),
        setWorkoutPlans,
        setWorkoutPlansLoadState,
        setWorkoutPlansError,
      );
      loadResource(
        api.workoutLogs(session.access_token),
        setWorkoutLogs,
        setWorkoutLogsLoadState,
        setWorkoutLogsError,
      );

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
          if (error instanceof ApiError && error.status === 401) {
            localStorage.removeItem(sessionStorageKey);
            setSession(null);
            setUser(null);
            setCourses([]);
            setBookings([]);
            setSubscription(null);
            setWorkoutPlans([]);
            setWorkoutLogs([]);
            setWorkoutPlansLoadState("idle");
            setWorkoutLogsLoadState("idle");
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
          setWorkoutPlans([]);
          setWorkoutLogs([]);
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

  async function handleLogin(email: string, password: string): Promise<AuthStep | null> {
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
      if ("requires_email_verification" in result) {
        setLoadState("idle");
        return { kind: "email", email };
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
  }): Promise<boolean> {
    setNotice(null);
    setLoadState("loading");

    try {
      await api.register({
        email: payload.email,
        first_name: payload.firstName,
        last_name: payload.lastName,
        password: payload.password,
      });
      setLoadState("idle");
      setNotice({ tone: "success", message: "Controlla la posta per confermare il tuo account." });
      return true;
    } catch (error) {
      setLoadState("idle");
      setNotice({ tone: "error", message: describeError(error) });
      return false;
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

  async function handleResendVerification(email: string): Promise<void> {
    const result = await api.resendVerificationEmail(email);
    setNotice({ tone: "success", message: result.message });
  }

  function handleLogout(): void {
    localStorage.removeItem(sessionStorageKey);
    setSession(null);
    setUser(null);
    setCourses([]);
    setBookings([]);
    setSubscription(null);
    setWorkoutPlans([]);
    setWorkoutLogs([]);
    setRequestedWorkoutLogId(null);
    setNotice(null);
    setLoadState("idle");
    setWorkspaceMode("backoffice");
  }

  function handlePasswordChanged(): void {
    handleLogout();
    setNotice({ tone: "success", message: "Password aggiornata. Accedi di nuovo per continuare." });
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

  const accountAction = new URLSearchParams(window.location.search).get("auth");
  if (session === null || accountAction === "verify-email" || accountAction === "verify-email-change" || accountAction === "reset-password") {
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
            {notice.tone === "success" ? (
              <CheckCircle2 aria-hidden="true" />
            ) : notice.tone === "info" ? (
              <MailCheck aria-hidden="true" />
            ) : (
              <XCircle aria-hidden="true" />
            )}
            <span>{notice.message}</span>
          </div>
        ) : null}

        {loadState === "loading" ? <LoadingDashboard /> : null}
        {loadState === "error" ? <ErrorPanel onRetry={() => setSession({ ...session })} /> : null}

        {loadState === "ready" ? (
          <>
            <BookingFocus
              bookings={currentBookings}
              courses={visibleCourses}
              pendingSessionId={pendingSessionId}
              subscription={subscription}
              onCreateBooking={handleCreateBooking}
            />
            <OverviewPanel
              bookingsCount={activeBookingCount}
              coursesCount={courses.length}
              subscription={subscription}
            />
            <WorkoutWorkspace
              editLogId={requestedWorkoutLogId}
              logs={workoutLogs}
              onLogsChange={setWorkoutLogs}
              onEditLogHandled={() => setRequestedWorkoutLogId(null)}
              onNotice={setNotice}
              onRetryPlans={() => setSession({ ...session })}
              plans={workoutPlans}
              plansError={workoutPlansError}
              plansLoadState={workoutPlansLoadState}
              token={session.access_token}
            />
            <div className="dashboard-grid">
              <section className="panel catalog-panel" aria-labelledby="catalog-title">
                <SectionHeading
                  icon={<Dumbbell aria-hidden="true" />}
                  eyebrow="Catalogo"
                  title="Prenota una lezione"
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
                {mobileView !== "bookings" ? (
                  <AccountSettingsPanel
                    onPasswordChanged={handlePasswordChanged}
                    onResendVerification={handleResendVerification}
                    token={session.access_token}
                    user={user ?? session.user}
                  />
                ) : null}
                <WorkoutHistoryPanel
                  logs={workoutLogs}
                  logsError={workoutLogsError}
                  logsLoadState={workoutLogsLoadState}
                  onEditLog={(log) => {
                    setRequestedWorkoutLogId(log.id);
                    setMobileView("training");
                  }}
                  onLogsChange={setWorkoutLogs}
                  onNotice={setNotice}
                  onRetryLogs={() => setSession({ ...session })}
                  plans={workoutPlans}
                  token={session.access_token}
                />
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
  const [workoutPlans, setWorkoutPlans] = useState<WorkoutPlanSummary[]>([]);
  const [workoutPlansLoadState, setWorkoutPlansLoadState] = useState<LoadState>("loading");
  const [workoutPlansError, setWorkoutPlansError] = useState<string | null>(null);
  const [workoutPlansRetry, setWorkoutPlansRetry] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const isAdmin = user.role === "admin";

  useEffect(() => {
    let ignore = false;
    setLoadState("loading");
    setWorkoutPlansLoadState(user.role === "admin" || user.role === "staff" ? "loading" : "idle");
    setWorkoutPlansError(null);

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
        if (user.role === "admin" || user.role === "staff") {
          api
            .adminWorkoutPlans(session.access_token)
            .then((plans) => {
              if (ignore) {
                return;
              }
              setWorkoutPlans(plans);
              setWorkoutPlansLoadState("ready");
            })
            .catch((error: unknown) => {
              if (ignore) {
                return;
              }
              setWorkoutPlansError(describeError(error));
              setWorkoutPlansLoadState("error");
            });
        } else {
          setWorkoutPlansLoadState("idle");
        }
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
  }, [session.access_token, user.role, workoutPlansRetry]);

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

  useEffect(() => {
    if (user.email_verified === false) {
      setNotice((current) =>
        current ?? {
          tone: "info",
          message: "Verifica il tuo indirizzo email dalla sezione Il tuo profilo.",
        },
      );
    }
  }, [user.email_verified]);

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

  function removeUser(userId: string): void {
    setUsers((current) => current.filter((user) => user.id !== userId));
    void api.adminStats(session.access_token).then(setStats).catch(() => undefined);
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
              aria-label="Allenamento"
              aria-current={activeTab === "workouts" ? "page" : undefined}
              onClick={() => setActiveTab("workouts")}
              type="button"
            >
              <ClipboardList aria-hidden="true" />
              <span className="admin-tab-label-full">Allenamento</span>
              <span className="admin-tab-label-mobile" aria-hidden="true">Schede</span>
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
              aria-label="Corsi e sedi"
              aria-current={activeTab === "courses" ? "page" : undefined}
              onClick={() => setActiveTab("courses")}
              type="button"
            >
              <Dumbbell aria-hidden="true" />
              <span className="admin-tab-label-full">Corsi e sedi</span>
              <span className="admin-tab-label-mobile" aria-hidden="true">Struttura</span>
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
                ) : notice.tone === "info" ? (
                  <MailCheck aria-hidden="true" />
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
                    accountSettings={
                      <AccountSettingsPanel
                        onPasswordChanged={onLogout}
                        onResendVerification={async (email) => {
                          const result = await api.resendVerificationEmail(email);
                          setNotice({ tone: "success", message: result.message });
                        }}
                        token={session.access_token}
                        user={user}
                      />
                    }
                    onNavigate={setActiveTab}
                    publishedCourses={publishedCourses}
                    stats={stats}
                  />
                ) : null}
                {activeTab === "calendar" ? (
                  <AdminCalendarPanel courses={courses} locations={locations} token={session.access_token} />
                ) : null}
                {activeTab === "workouts" ? (
                  <WorkoutPlansManager
                    isAdmin={isAdmin}
                    onNotice={setNotice}
                    onPlansChange={setWorkoutPlans}
                    onRetryPlans={() => setWorkoutPlansRetry((current) => current + 1)}
                    plans={workoutPlans}
                    plansError={workoutPlansError}
                    plansLoadState={workoutPlansLoadState}
                    token={session.access_token}
                    users={users}
                  />
                ) : null}
                {isAdmin && activeTab === "users" ? (
                  <UsersManager
                    onNotice={setNotice}
                    onUserChange={upsertUser}
                    onUserDelete={removeUser}
                    token={session.access_token}
                    users={users}
                  />
                ) : null}
                {activeTab === "courses" ? (
                  <div className="admin-organization-stack" aria-label="Corsi e sedi">
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
                    <LocationsManager
                      locations={locations}
                      onLocationCascade={applyLocationCascade}
                      onNotice={setNotice}
                      onLocationChange={upsertLocation}
                      token={session.access_token}
                    />
                  </div>
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
        <p className="eyebrow">Prossima lezione</p>
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

type WorkoutSetDraft = { repetitions: string; loadKg: string };
type WorkoutDraftValues = Record<string, WorkoutSetDraft[]>;

function emptyWorkoutPlanPayload(): WorkoutPlanPayload {
  return { title: "", description: null, status: "draft", days: [] };
}

type WorkoutValidationStage = 2 | 3 | 4;
type WorkoutValidationIssue = { fieldId: string; message: string };

function workoutPlanValidationIssues(
  draft: WorkoutPlanPayload,
  stage: WorkoutValidationStage = 4,
): WorkoutValidationIssue[] {
  const issues: WorkoutValidationIssue[] = [];
  if (draft.title.trim() === "") issues.push({ fieldId: "workout-title", message: "Inserisci il titolo della scheda." });
  if (stage === 2) return issues;
  if (draft.days.length === 0) {
    issues.push({ fieldId: "workout-add-day", message: "Aggiungi almeno un giorno alla scheda." });
    return issues;
  }

  for (const [dayIndex, day] of draft.days.entries()) {
    const dayNumber = dayIndex + 1;
    if (day.label.trim() === "") issues.push({ fieldId: `workout-day-${dayIndex}-label`, message: `Inserisci il nome breve del giorno ${dayNumber}.` });
    if (day.exercises.length === 0) {
      issues.push({ fieldId: `workout-day-${dayIndex}-add-exercise`, message: `Aggiungi almeno un esercizio al giorno ${dayNumber}.` });
      continue;
    }

    for (const [exerciseIndex, exercise] of day.exercises.entries()) {
      const exerciseNumber = exerciseIndex + 1;
      const reference = `giorno ${dayNumber}, esercizio ${exerciseNumber}`;
      if (exercise.name.trim() === "") issues.push({ fieldId: `workout-day-${dayIndex}-exercise-${exerciseIndex}-name`, message: `Inserisci il nome dell'esercizio (${reference}).` });
      if (!Number.isInteger(exercise.sets_planned) || exercise.sets_planned < 1 || exercise.sets_planned > 50) {
        issues.push({ fieldId: `workout-day-${dayIndex}-exercise-${exerciseIndex}-sets`, message: `Inserisci da 1 a 50 serie (${reference}).` });
      }
      if (exercise.reps_planned.trim() === "") issues.push({ fieldId: `workout-day-${dayIndex}-exercise-${exerciseIndex}-reps`, message: `Inserisci le ripetizioni (${reference}).` });
      if (
        stage === 4 &&
        exercise.rest_seconds !== null &&
        (!Number.isInteger(exercise.rest_seconds) || exercise.rest_seconds < 0 || exercise.rest_seconds > 3600)
      ) {
        issues.push({ fieldId: `workout-day-${dayIndex}-exercise-${exerciseIndex}-rest`, message: `Il recupero deve essere compreso tra 0 e 3600 secondi (${reference}).` });
      }
    }
  }

  return issues;
}

function workoutPlanValidationMessage(draft: WorkoutPlanPayload): string | null {
  return workoutPlanValidationIssues(draft)[0]?.message ?? null;
}

function focusWorkoutValidationIssue(issue: WorkoutValidationIssue | undefined): void {
  if (issue === undefined) return;
  window.requestAnimationFrame(() => document.getElementById(issue.fieldId)?.focus());
}

function planPayloadFromPlan(plan: WorkoutPlan): WorkoutPlanPayload {
  return {
    title: plan.title,
    description: plan.description,
    status: plan.status,
    days: plan.days.map((day) => ({
      id: day.id,
      label: day.label,
      title: day.title,
      position: day.position,
      exercises: day.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        sets_planned: exercise.sets_planned,
        reps_planned: exercise.reps_planned,
        rest_seconds: exercise.rest_seconds,
        notes: exercise.notes,
        position: exercise.position,
      })),
    })),
  };
}

function WorkoutWorkspace({
  editLogId,
  logs,
  onLogsChange,
  onEditLogHandled,
  onNotice,
  onRetryPlans,
  plans,
  plansError,
  plansLoadState,
  token,
}: {
  editLogId: string | null;
  logs: WorkoutLog[];
  onLogsChange: (logs: WorkoutLog[]) => void;
  onEditLogHandled: () => void;
  onNotice: (notice: Notice) => void;
  onRetryPlans: () => void;
  plans: WorkoutPlan[];
  plansError: string | null;
  plansLoadState: LoadState;
  token: string;
}) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [dayId, setDayId] = useState(plans[0]?.days[0]?.id ?? "");
  const [date, setDate] = useState(localIsoDate());
  const [note, setNote] = useState("");
  const [rating, setRating] = useState("");
  const [values, setValues] = useState<WorkoutDraftValues>({});
  const [draftState, setDraftState] = useState("Bozza salvata");
  const [editing, setEditing] = useState<WorkoutLog | null>(null);
  const [isLoggingOpen, setIsLoggingOpen] = useState(false);
  const [activeExerciseId, setActiveExerciseId] = useState(plans[0]?.days[0]?.exercises[0]?.id ?? "");
  const plan = plans.find((item) => item.id === planId) ?? plans[0];
  const day = plan?.days.find((item) => item.id === dayId) ?? plan?.days[0];

  useEffect(() => {
    if (plan === undefined) return;
    if (planId !== plan.id) setPlanId(plan.id);
    if (day === undefined || !plan.days.some((item) => item.id === dayId)) setDayId(plan.days[0]?.id ?? "");
  }, [day, dayId, plan, planId]);

  useEffect(() => {
    if (day === undefined || !day.exercises.some((exercise) => exercise.id === activeExerciseId)) {
      setActiveExerciseId(day?.exercises[0]?.id ?? "");
    }
  }, [activeExerciseId, day]);

  useEffect(() => {
    if (editLogId === null) return;
    const log = logs.find((item) => item.id === editLogId);
    const logPlan = log === undefined ? undefined : plans.find((item) => item.id === log.plan_id);
    const logDay = logPlan?.days.find((item) => item.id === log?.day_id);
    if (log === undefined || logPlan === undefined || logDay === undefined) {
      onNotice({ tone: "info", message: "Questa sessione appartiene a una scheda non più disponibile." });
      onEditLogHandled();
      return;
    }
    setPlanId(logPlan.id);
    setDayId(logDay.id);
    setEditing(log);
    setIsLoggingOpen(true);
    onEditLogHandled();
  }, [editLogId, logs, onEditLogHandled, onNotice, plans]);

  useEffect(() => {
    if (plan === undefined || day === undefined) return;
    if (editing !== null && editing.plan_id === plan.id && editing.day_id === day.id) {
      const next: WorkoutDraftValues = {};
      for (const exercise of day.exercises) {
        const entries = editing.entries.filter((entry) => entry.exercise_id === exercise.id).sort((a, b) => a.set_number - b.set_number);
        next[exercise.id] = Array.from({ length: exercise.sets_planned }, (_, index) => ({
          repetitions: entries[index] ? String(entries[index].repetitions) : "",
          loadKg: entries[index] ? String(entries[index].load_kg) : "",
        }));
      }
      setValues(next); setDate(editing.workout_date); setNote(editing.general_note ?? ""); setRating(editing.rating ? String(editing.rating) : "");
      return;
    }
    const key = `maka.workout-draft.${plan.id}.${day.id}.${date}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as { values?: WorkoutDraftValues; note?: string; rating?: string };
        setValues(parsed.values ?? {}); setNote(parsed.note ?? ""); setRating(parsed.rating ?? ""); setDraftState("Bozza salvata"); return;
      }
    } catch { setDraftState("Bozza non salvata"); }
    setNote("");
    setRating("");
    const latest = new Map((plan.latest_results ?? []).map((item) => [item.exercise_id, item]));
    setValues(Object.fromEntries(day.exercises.map((exercise) => {
      const result = latest.get(exercise.id);
      return [exercise.id, Array.from({ length: exercise.sets_planned }, () => ({ repetitions: result ? String(result.repetitions) : "", loadKg: result ? String(result.load_kg) : "" }))];
    })));
  }, [date, day, editing, plan]);

  useEffect(() => {
    if (plan === undefined || day === undefined || editing !== null) return;
    setDraftState("Salvataggio bozza…");
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(`maka.workout-draft.${plan.id}.${day.id}.${date}`, JSON.stringify({ values, note, rating }));
        setDraftState("Bozza salvata");
      } catch { setDraftState("Bozza non salvata"); }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [date, day, editing, note, plan, rating, values]);

  if (plansLoadState === "loading") {
    return <ResourceStatePanel loading title="Scheda di allenamento" message="Sto caricando la tua scheda." />;
  }
  if (plansLoadState === "error") {
    return (
      <ResourceStatePanel
        actionLabel="Riprova caricamento scheda"
        message={plansError ?? "La scheda non è disponibile in questo momento."}
        onRetry={onRetryPlans}
        title="Impossibile caricare la scheda"
      />
    );
  }
  if (plans.length === 0 || plan === undefined || day === undefined) {
    return <section className="panel training-panel training-empty" aria-labelledby="training-title"><SectionTitle icon={<Dumbbell aria-hidden="true" />} title="Allenamento" id="training-title" /><ClipboardList aria-hidden="true" /><h3>Nessuna scheda assegnata</h3><p className="muted">Quando il coach ti assegnerà una scheda pubblicata, la troverai qui.</p></section>;
  }

  function changeSet(exerciseId: string, index: number, field: keyof WorkoutSetDraft, value: string): void {
    setValues((current) => ({ ...current, [exerciseId]: (current[exerciseId] ?? []).map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }));
  }

  async function save(): Promise<void> {
    const entries = day.exercises.flatMap((exercise) => (values[exercise.id] ?? []).flatMap((item, index) => {
      if (!item.repetitions && !item.loadKg) return [];
      const repetitions = Number(item.repetitions); const loadKg = Number(item.loadKg);
      if (!Number.isInteger(repetitions) || repetitions < 1 || !Number.isFinite(loadKg) || loadKg < 0) return [];
      return [{ exercise_id: exercise.id, exercise_name_snapshot: exercise.name, set_number: index + 1, repetitions, load_kg: Number(loadKg.toFixed(2)), note: null }];
    }));
    if (entries.length === 0) { onNotice({ tone: "error", message: "Inserisci almeno una serie valida." }); return; }
    const payload: WorkoutLogPayload = { plan_id: plan.id, day_id: day.id, workout_date: date, general_note: note.trim() || null, rating: rating ? Number(rating) : null, entries };
    try {
      const saved = editing ? await api.updateWorkoutLog(token, editing.id, payload) : await api.createWorkoutLog(token, payload);
      onLogsChange(editing ? logs.map((item) => item.id === saved.id ? saved : item) : [saved, ...logs]);
      setEditing(null); setIsLoggingOpen(false); onNotice({ tone: "success", message: editing ? "Allenamento aggiornato." : "Allenamento salvato." });
    } catch (error) { onNotice({ tone: "error", message: describeError(error) }); }
  }

  return <><section className="panel training-panel" aria-labelledby="training-title">
    <div className="training-heading"><SectionTitle icon={<Dumbbell aria-hidden="true" />} title="Allenamento" id="training-title" /><span className="training-view-mode">Consulta scheda</span>{isLoggingOpen ? <span className="draft-status" role="status">{draftState}</span> : null}</div>
    <label className="field training-plan-picker"><span>Scheda</span><select value={plan.id} onChange={(event) => { setEditing(null); setIsLoggingOpen(false); setPlanId(event.target.value); }}><option value={plan.id}>{plan.title}</option>{plans.filter((item) => item.id !== plan.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <div className="training-day-tabs" role="tablist" aria-label="Giorni della scheda">{plan.days.map((item) => <button id={`training-day-tab-${item.id}`} key={item.id} type="button" role="tab" aria-controls={`training-day-panel-${item.id}`} aria-selected={day.id === item.id} onClick={() => { setEditing(null); setIsLoggingOpen(false); setDayId(item.id); }}><strong>{item.label}</strong><span>{item.title ?? "Allenamento"}</span></button>)}</div>
    <div className="training-exercise-stepper" aria-label="Avanzamento esercizi"><button type="button" aria-label="Esercizio precedente" disabled={day.exercises.findIndex((exercise) => exercise.id === activeExerciseId) <= 0} onClick={() => { const index = day.exercises.findIndex((exercise) => exercise.id === activeExerciseId); setActiveExerciseId(day.exercises[index - 1]?.id ?? activeExerciseId); }}><ChevronLeft aria-hidden="true" /></button><span><strong>Esercizio {Math.max(day.exercises.findIndex((exercise) => exercise.id === activeExerciseId) + 1, 1)} di {day.exercises.length}</strong><small>Scorri un esercizio alla volta</small></span><button type="button" aria-label="Esercizio successivo" disabled={day.exercises.findIndex((exercise) => exercise.id === activeExerciseId) >= day.exercises.length - 1} onClick={() => { const index = day.exercises.findIndex((exercise) => exercise.id === activeExerciseId); setActiveExerciseId(day.exercises[index + 1]?.id ?? activeExerciseId); }}><ChevronRight aria-hidden="true" /></button></div>
    <div id={`training-day-panel-${day.id}`} className="training-exercise-list" role="tabpanel" aria-labelledby={`training-day-tab-${day.id}`} tabIndex={0}>{day.exercises.map((exercise) => { const last = plan.latest_results?.find((item) => item.exercise_id === exercise.id); const isActive = exercise.id === activeExerciseId; return <article className={`training-exercise-card${isActive ? "" : " is-mobile-hidden"}`} key={exercise.id}><div className="training-exercise-heading"><div><h3>{exercise.name}</h3><p>{exercise.sets_planned} serie · {exercise.reps_planned} ripetizioni{exercise.rest_seconds ? ` · ${exercise.rest_seconds}s recupero` : ""}</p></div>{last ? <span className="last-result">Ultima volta: {last.load_kg} kg × {last.repetitions}</span> : null}</div>{isLoggingOpen ? <div className="training-set-grid">{(values[exercise.id] ?? []).map((item, index) => <div className="training-set-row" key={`${exercise.id}-${index}`}><span>Serie {index + 1}</span><label><span>Ripetizioni</span><input aria-label={`${exercise.name}, serie ${index + 1}, ripetizioni`} inputMode="numeric" min="1" placeholder={exercise.reps_planned} type="number" value={item.repetitions} onChange={(event) => changeSet(exercise.id, index, "repetitions", event.target.value)} /></label><label><span>Kg</span><input aria-label={`${exercise.name}, serie ${index + 1}, carico in kg`} inputMode="decimal" min="0" placeholder="0" step="0.25" type="number" value={item.loadKg} onChange={(event) => changeSet(exercise.id, index, "loadKg", event.target.value)} /></label></div>)}</div> : null}{exercise.notes ? <p className="training-exercise-note">{exercise.notes}</p> : null}</article>; })}</div>
    <button aria-controls="training-log-panel" aria-expanded={isLoggingOpen} className="secondary-action training-log-toggle" onClick={() => setIsLoggingOpen((current) => !current)} type="button">{isLoggingOpen ? "Chiudi registrazione" : editing ? "Modifica registrazione" : "Registra allenamento (opzionale)"}</button>
    {isLoggingOpen ? <div className="training-log-panel" id="training-log-panel"><p className="training-log-helper">Compila solo se vuoi registrare questa sessione. La nota è facoltativa.</p><div className="training-summary-fields"><label className="field"><span>Data allenamento</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="field"><span>Valutazione</span><select value={rating} onChange={(event) => setRating(event.target.value)}><option value="">Non indicata</option>{[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item}/5</option>)}</select></label><label className="field training-note-field"><span>Nota (facoltativa)</span><textarea maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Energia, difficoltà, sensazioni…" /></label></div><div className="training-save-bar"><button className="primary-action" type="button" onClick={() => void save()}><Save aria-hidden="true" />{editing ? "Aggiorna allenamento" : "Salva allenamento"}</button></div>{editing ? <button className="secondary-action training-cancel-edit" type="button" onClick={() => { setEditing(null); setIsLoggingOpen(false); }}>Annulla modifica</button> : null}</div> : null}
  </section></>;
}

function WorkoutHistoryPanel({
  logs,
  logsError,
  logsLoadState,
  onEditLog,
  onLogsChange,
  onNotice,
  onRetryLogs,
  plans,
  token,
}: {
  logs: WorkoutLog[];
  logsError: string | null;
  logsLoadState: LoadState;
  onEditLog: (log: WorkoutLog) => void;
  onLogsChange: (logs: WorkoutLog[]) => void;
  onNotice: (notice: Notice) => void;
  onRetryLogs: () => void;
  plans: WorkoutPlan[];
  token: string;
}) {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  async function removeLog(log: WorkoutLog): Promise<void> {
    if (!window.confirm("Eliminare questa sessione dallo storico?")) return;
    try {
      await api.deleteWorkoutLog(token, log.id);
      onLogsChange(logs.filter((item) => item.id !== log.id));
      onNotice({ tone: "success", message: "Sessione eliminata." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  if (logsLoadState === "loading") {
    return <ResourceStatePanel compact loading title="Storico allenamenti" message="Sto caricando lo storico." />;
  }
  if (logsLoadState === "error") {
    return (
      <ResourceStatePanel
        actionLabel="Riprova caricamento storico"
        compact
        message={logsError ?? "Lo storico non è disponibile in questo momento."}
        onRetry={onRetryLogs}
        title="Impossibile caricare lo storico"
      />
    );
  }

  return <div className="panel profile-workout-history"><WorkoutHistory logs={logs} expandedLog={expandedLog} onDeleteLog={(log) => void removeLog(log)} onEditLog={onEditLog} onExpandedLogChange={setExpandedLog} plans={plans} /></div>;
}

function ResourceStatePanel({
  actionLabel,
  compact = false,
  loading = false,
  message,
  onRetry,
  title,
}: {
  actionLabel?: string;
  compact?: boolean;
  loading?: boolean;
  message: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <section className={`panel resource-state-panel${compact ? " resource-state-panel-compact" : ""}`}>
      {loading ? <span className="loader" aria-hidden="true" /> : <XCircle aria-hidden="true" />}
      <h2>{title}</h2>
      <p className="muted">{message}</p>
      {onRetry !== undefined ? (
        <button className="primary-action" onClick={onRetry} type="button">
          <RotateCcw aria-hidden="true" />
          {actionLabel ?? "Riprova"}
        </button>
      ) : null}
    </section>
  );
}

function WorkoutHistory({
  expandedLog,
  logs,
  onDeleteLog,
  onEditLog,
  onExpandedLogChange,
  plans,
}: {
  expandedLog: string | null;
  logs: WorkoutLog[];
  onDeleteLog: (log: WorkoutLog) => void;
  onEditLog: (log: WorkoutLog) => void;
  onExpandedLogChange: (logId: string | null) => void;
  plans: WorkoutPlan[];
}) {
  const [selectedPlanId, setSelectedPlanId] = useState("all");
  const [selectedDayId, setSelectedDayId] = useState("all");
  const filterMenuRef = useRef<HTMLDetailsElement>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const dayOptions = useMemo(() => {
    const sourcePlans = selectedPlanId === "all" ? plans : plans.filter((plan) => plan.id === selectedPlanId);
    const options = new Map<string, string>();
    sourcePlans.forEach((plan) => plan.days.forEach((day) => options.set(day.id, `${day.label}${day.title ? ` · ${day.title}` : ""}`)));
    return Array.from(options, ([id, label]) => ({ id, label }));
  }, [plans, selectedPlanId]);
  const filteredLogs = logs.filter((log) => (
    (selectedPlanId === "all" || log.plan_id === selectedPlanId)
      && (selectedDayId === "all" || log.day_id === selectedDayId)
  ));
  const visibleLogs = filteredLogs.slice(0, visibleCount);
  const activeFilterCount = Number(selectedPlanId !== "all") + Number(selectedDayId !== "all");
  useEffect(() => {
    if (selectedDayId !== "all" && !dayOptions.some((day) => day.id === selectedDayId)) {
      setSelectedDayId("all");
    }
  }, [dayOptions, selectedDayId]);

  function resetFilters(): void {
    setSelectedPlanId("all");
    setSelectedDayId("all");
    setVisibleCount(6);
    onExpandedLogChange(null);
  }

  function updatePlanFilter(planId: string): void {
    setSelectedPlanId(planId);
    setSelectedDayId("all");
    setVisibleCount(6);
    onExpandedLogChange(null);
  }

  function updateDayFilter(dayId: string): void {
    setSelectedDayId(dayId);
    setVisibleCount(6);
    onExpandedLogChange(null);
  }

  function hideFilters(): void {
    filterMenuRef.current?.removeAttribute("open");
  }

  return <section className="training-history training-history-v2" aria-labelledby="training-history-v2-title">
    <details className="training-history-disclosure" open>
      <summary className="training-history-heading"><div className="section-title"><span><History aria-hidden="true" /></span><h2 id="training-history-v2-title">Storico allenamenti</h2></div><span className="training-history-count">{filteredLogs.length} session{filteredLogs.length === 1 ? "e" : "i"}</span><ChevronDown aria-hidden="true" /></summary>
    {logs.length > 0 ? <details ref={filterMenuRef} className="training-history-filter-menu"><summary><SlidersHorizontal aria-hidden="true" /><span>Filtri storico</span>{activeFilterCount > 0 ? <strong>{activeFilterCount}</strong> : null}</summary><div className="training-history-filter-panel"><label className="field"><span>Scheda</span><select value={selectedPlanId} onChange={(event) => updatePlanFilter(event.target.value)}><option value="all">Tutte le schede</option>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select></label><label className="field"><span>Giorno della scheda</span><select disabled={dayOptions.length === 0} value={selectedDayId} onChange={(event) => updateDayFilter(event.target.value)}><option value="all">Tutti i giorni</option>{dayOptions.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}</select></label><div className="training-history-filter-actions">{activeFilterCount > 0 ? <button className="secondary-action" type="button" onClick={resetFilters}>Azzera filtri</button> : null}<button className="secondary-action" type="button" onClick={hideFilters}>Nascondi filtri</button></div></div></details> : null}
    <div className="training-history-list-heading"><h3>Sessioni registrate</h3><p className="muted">Apri una sessione per vedere esercizi, note e azioni.</p></div>
    {visibleLogs.length === 0 ? <div className="training-history-empty"><p className="muted">{logs.length === 0 ? "Le sessioni salvate appariranno qui." : "Nessuna sessione corrisponde ai filtri selezionati."}</p>{activeFilterCount > 0 ? <button className="secondary-action" type="button" onClick={resetFilters}>Azzera filtri</button> : null}</div> : <div className="training-history-list">{visibleLogs.map((log) => { const plan = plans.find((item) => item.id === log.plan_id); const day = plan?.days.find((item) => item.id === log.day_id); return <article className="training-history-item" key={log.id}><button className="training-history-toggle" type="button" aria-expanded={expandedLog === log.id} onClick={() => onExpandedLogChange(expandedLog === log.id ? null : log.id)}><span className="training-history-date"><strong>{formatDate(log.workout_date)}</strong><small>{plan?.title ?? "Scheda archiviata"}{day ? ` · ${day.label}${day.title ? ` ${day.title}` : ""}` : ""}</small></span><span className="training-history-meta">{log.entries.length} serie{log.rating ? ` · ${log.rating}/5` : ""}</span><ChevronDown aria-hidden="true" /></button>{expandedLog === log.id ? <div className="training-history-detail"><p>{log.general_note || "Nessuna nota."}</p><ul>{log.entries.map((entry) => <li key={entry.id}><strong>{entry.exercise_name_snapshot}</strong>: {entry.load_kg} kg × {entry.repetitions}</li>)}</ul><div className="training-history-actions"><button className="secondary-action" type="button" onClick={() => onEditLog(log)}>Modifica sessione</button><button className="secondary-action danger-action" type="button" onClick={() => onDeleteLog(log)}>Elimina</button></div></div> : null}</article>; })}</div>}
    {visibleCount < filteredLogs.length ? <button className="secondary-action training-history-more" type="button" onClick={() => setVisibleCount((current) => current + 6)}>Mostra altre sessioni ({filteredLogs.length - visibleCount})</button> : null}
    </details>
  </section>;
}

function workoutStatusLabel(status: WorkoutPlanStatus): string {
  return status === "published" ? "Pubblicata" : status === "archived" ? "Archiviata" : "Bozza";
}

function workoutSummaryFromPlan(plan: WorkoutPlan): WorkoutPlanSummary {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    status: plan.status,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    day_count: plan.days.length,
  };
}

function positionWorkoutPlanActionsMenu(event: SyntheticEvent<HTMLDetailsElement>): void {
  const menu = event.currentTarget;
  if (!menu.open) {
    menu.removeAttribute("data-placement");
    return;
  }

  const menuHeight = 240;
  const menuRect = menu.getBoundingClientRect();
  const spaceBelow = window.innerHeight - menuRect.bottom;
  const spaceAbove = menuRect.top;
  menu.dataset.placement = spaceBelow < menuHeight && spaceAbove > spaceBelow ? "up" : "down";
}

function WorkoutPlansManager({
  isAdmin,
  onNotice,
  onPlansChange,
  onRetryPlans,
  plans,
  plansError,
  plansLoadState,
  token,
  users,
}: {
  isAdmin: boolean;
  onNotice: (notice: Notice) => void;
  onPlansChange: (plans: WorkoutPlanSummary[]) => void;
  onRetryPlans: () => void;
  plans: WorkoutPlanSummary[];
  plansError: string | null;
  plansLoadState: LoadState;
  token: string;
  users: AdminUser[];
}) {
  const [draft, setDraft] = useState<(WorkoutPlanPayload & { id?: string }) | null>(null);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ planId: string; canPublish: boolean } | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [planStatusFilter, setPlanStatusFilter] = useState<WorkoutPlanStatus | "all">("all");
  const [planSort, setPlanSort] = useState<WorkoutPlanSort>("updated");

  const planCounts = useMemo(() => ({
    all: plans.length,
    draft: plans.filter((plan) => plan.status === "draft").length,
    published: plans.filter((plan) => plan.status === "published").length,
    archived: plans.filter((plan) => plan.status === "archived").length,
  }), [plans]);
  const visiblePlans = useMemo(() => {
    const query = planQuery.trim().toLocaleLowerCase("it-IT");
    return plans
      .filter((plan) => planStatusFilter === "all" || plan.status === planStatusFilter)
      .filter((plan) => query === "" || plan.title.toLocaleLowerCase("it-IT").includes(query))
      .sort((left, right) => {
        if (planSort === "title") return left.title.localeCompare(right.title, "it");
        const leftValue = planSort === "created" ? left.created_at : left.updated_at;
        const rightValue = planSort === "created" ? right.created_at : right.updated_at;
        return rightValue.localeCompare(leftValue);
      });
  }, [planQuery, planSort, planStatusFilter, plans]);

  function revealEditor(): void {
    window.requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLElement>(".workout-editor-panel-v2");
      if (editor === null) return;
      editor.scrollIntoView?.({ behavior: "smooth", block: "start" });
      editor.querySelector<HTMLInputElement>("#workout-title")?.focus();
    });
  }

  function startNewPlan(): void {
    setSaveFeedback(null);
    setDraft(emptyWorkoutPlanPayload());
    setAssignedUserIds([]);
    revealEditor();
  }

  async function openPlan(planId: string): Promise<void> {
    setSaveFeedback(null);
    setLoadingId(planId);
    try {
      const [plan, assignments] = await Promise.all([
        api.adminWorkoutPlan(token, planId),
        isAdmin ? api.adminWorkoutPlanAssignments(token, planId) : Promise.resolve([]),
      ]);
      setDraft({ ...planPayloadFromPlan(plan), id: planId });
      setAssignedUserIds(assignments.map((assignment) => assignment.user_id));
      revealEditor();
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setLoadingId(null);
    }
  }

  function updateDraft(next: Partial<WorkoutPlanPayload>): void {
    setDraft((current) => current === null ? current : { ...current, ...next });
  }

  function updateDay(dayIndex: number, next: Partial<WorkoutDayPayload>): void {
    setDraft((current) => current === null ? current : {
      ...current,
      days: current.days.map((day, index) => index === dayIndex ? { ...day, ...next } : day),
    });
  }

  function updateExercise(dayIndex: number, exerciseIndex: number, next: Partial<WorkoutExercisePayload>): void {
    setDraft((current) => current === null ? current : {
      ...current,
      days: current.days.map((day, index) => index !== dayIndex ? day : {
        ...day,
        exercises: day.exercises.map((exercise, itemIndex) => itemIndex === exerciseIndex ? { ...exercise, ...next } : exercise),
      }),
    });
  }

  function moveItem(dayIndex: number, exerciseIndex: number | null, direction: -1 | 1): void {
    setDraft((current) => {
      if (current === null) return current;
      const days = [...current.days];
      if (exerciseIndex === null) {
        const nextIndex = dayIndex + direction;
        if (nextIndex < 0 || nextIndex >= days.length) return current;
        [days[dayIndex], days[nextIndex]] = [days[nextIndex], days[dayIndex]];
        return { ...current, days };
      }
      const exercises = [...days[dayIndex].exercises];
      const nextIndex = exerciseIndex + direction;
      if (nextIndex < 0 || nextIndex >= exercises.length) return current;
      [exercises[exerciseIndex], exercises[nextIndex]] = [exercises[nextIndex], exercises[exerciseIndex]];
      days[dayIndex] = { ...days[dayIndex], exercises };
      return { ...current, days };
    });
  }

  function removeDay(dayIndex: number): void {
    if (!window.confirm("Rimuovere questo giorno dalla scheda? Gli esercizi resteranno archiviati.")) return;
    setDraft((current) => current === null ? current : { ...current, days: current.days.filter((_, index) => index !== dayIndex) });
  }

  function removeExercise(dayIndex: number, exerciseIndex: number): void {
    if (!window.confirm("Rimuovere questo esercizio dalla scheda? Lo storico resterà intatto.")) return;
    updateDay(dayIndex, { exercises: draft?.days[dayIndex].exercises.filter((_, index) => index !== exerciseIndex) ?? [] });
  }

  function addDay(): void {
    setDraft((current) => current === null ? current : {
      ...current,
      days: [...current.days, { label: `Giorno ${String.fromCharCode(65 + current.days.length)}`, title: null, exercises: [] }],
    });
  }

  function addExercise(dayIndex: number): void {
    setDraft((current) => current === null ? current : {
      ...current,
      days: current.days.map((day, index) => index !== dayIndex ? day : {
        ...day,
        exercises: [...day.exercises, { name: "", sets_planned: 3, reps_planned: "8-10", rest_seconds: null, notes: null }],
      }),
    });
  }

  async function savePlan(): Promise<void> {
    if (saving) return;
    if (draft === null) {
      onNotice({ tone: "error", message: "Apri una scheda prima di salvarla." });
      return;
    }
    const validationMessage = workoutPlanValidationMessage(draft);
    if (validationMessage !== null) {
      onNotice({ tone: "error", message: validationMessage });
      return;
    }
    const payload: WorkoutPlanPayload = {
      title: draft.title.trim(),
      description: draft.description?.trim() || null,
      status: draft.status,
      days: draft.days.map((day, position) => ({
        ...day,
        label: day.label.trim(),
        title: day.title?.trim() || null,
        position,
        exercises: day.exercises.map((exercise, exercisePosition) => ({
          ...exercise,
          name: exercise.name.trim(),
          reps_planned: exercise.reps_planned.trim(),
          notes: exercise.notes?.trim() || null,
          position: exercisePosition,
        })),
      })),
    };
    setSaving(true);
    try {
      const saved = draft.id === undefined
        ? await api.createAdminWorkoutPlan(token, payload)
        : await api.updateAdminWorkoutPlan(token, draft.id, payload);
      if (isAdmin) {
        const existingAssignments = draft.id
          ? await api.adminWorkoutPlanAssignments(token, saved.id)
          : [];
        const existingIds = new Set(existingAssignments.map((assignment) => assignment.user_id));
        const selectedIds = new Set(assignedUserIds);
        await Promise.all(
          [...selectedIds]
            .filter((userId) => !existingIds.has(userId))
            .map((userId) => api.assignAdminWorkoutPlan(token, saved.id, userId)),
        );
        await Promise.all(
          [...existingIds]
            .filter((userId) => !selectedIds.has(userId))
            .map((userId) => api.unassignAdminWorkoutPlan(token, saved.id, userId)),
        );
      }
      setDraft({ ...planPayloadFromPlan(saved), id: saved.id });
      onPlansChange(plans.some((plan) => plan.id === saved.id) ? plans.map((plan) => plan.id === saved.id ? workoutSummaryFromPlan(saved) : plan) : [workoutSummaryFromPlan(saved), ...plans]);
      setSaveFeedback({ planId: saved.id, canPublish: saved.status === "draft" });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(plan: WorkoutPlanSummary, action: "publish" | "unpublish" | "archive"): Promise<boolean> {
    if (action === "archive" && !window.confirm("Archiviare la scheda? Lo storico degli utenti resterà disponibile.")) return false;
    try {
      const saved = action === "publish"
        ? await api.publishAdminWorkoutPlan(token, plan.id)
        : action === "unpublish"
          ? await api.unpublishAdminWorkoutPlan(token, plan.id)
          : await api.archiveAdminWorkoutPlan(token, plan.id);
      onPlansChange(plans.map((item) => item.id === saved.id ? workoutSummaryFromPlan(saved) : item));
      if (draft?.id === saved.id) setDraft({ ...planPayloadFromPlan(saved), id: saved.id });
      onNotice({ tone: "success", message: `Scheda ${action === "archive" ? "archiviata" : action === "publish" ? "pubblicata" : "riportata in bozza"}.` });
      return true;
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
      return false;
    }
  }

  async function deletePlan(plan: WorkoutPlanSummary): Promise<void> {
    const confirmed = window.confirm(
      "Eliminare definitivamente questa scheda? Verranno rimossi giorni, esercizi e assegnazioni. Lo storico degli allenamenti già compilati resterà disponibile senza collegamento alla scheda.",
    );
    if (!confirmed) return;

    setLoadingId(plan.id);
    try {
      await api.deleteAdminWorkoutPlan(token, plan.id);
      onPlansChange(plans.filter((item) => item.id !== plan.id));
      if (draft?.id === plan.id) {
        setSaveFeedback(null);
        setDraft(null);
        setAssignedUserIds([]);
      }
      onNotice({ tone: "success", message: "Scheda eliminata definitivamente." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    } finally {
      setLoadingId(null);
    }
  }

  async function duplicatePlan(planId: string): Promise<void> {
    try {
      const duplicate = await api.duplicateAdminWorkoutPlan(token, planId);
      onPlansChange([workoutSummaryFromPlan(duplicate), ...plans]);
      setSaveFeedback(null);
      setDraft({ ...planPayloadFromPlan(duplicate), id: duplicate.id });
      setAssignedUserIds([]);
      revealEditor();
      onNotice({ tone: "success", message: "Scheda duplicata come bozza." });
    } catch (error) {
      onNotice({ tone: "error", message: describeError(error) });
    }
  }

  async function publishSavedPlan(): Promise<void> {
    if (saveFeedback === null) return;
    const plan = plans.find((item) => item.id === saveFeedback.planId);
    if (plan === undefined) return;
    const published = await changeStatus(plan, "publish");
    if (!published) return;
    setSaveFeedback(null);
    setDraft(null);
    setAssignedUserIds([]);
  }

  return (
    <div className="backoffice-grid workout-admin-grid">
      {draft !== null ? (
        <WorkoutEditorPanel
          assignedUserIds={assignedUserIds}
          draft={draft}
          isAdmin={isAdmin}
          onAddDay={addDay}
          onAddExercise={addExercise}
          onAssignedUserIdsChange={(ids) => setAssignedUserIds(ids)}
          onClose={() => { setSaveFeedback(null); setDraft(null); }}
          onCreateAnother={startNewPlan}
          onMoveItem={moveItem}
          onRemoveDay={removeDay}
          onRemoveExercise={removeExercise}
          onSave={savePlan}
          onBackToPlans={() => { setSaveFeedback(null); setDraft(null); }}
          onContinueAfterSave={() => setSaveFeedback(null)}
          onPublishSaved={() => void publishSavedPlan()}
          saveFeedback={saveFeedback}
          isSaving={saving}
          onUpdateDay={updateDay}
          onUpdateDraft={updateDraft}
          onUpdateExercise={updateExercise}
          users={users}
        />
      ) : null}
      <div className="admin-page-heading admin-panel-wide"><div><p className="eyebrow">Programmazione</p><h2>Allenamento</h2></div><span>Pubblica schede e aggiorna gli esercizi senza perdere lo storico.</span></div>
      <section className="admin-panel workout-plan-list-panel" aria-labelledby="workout-plan-list-title">
        <div className="admin-page-heading"><div><h3 id="workout-plan-list-title">Schede</h3>{plansLoadState === "ready" && plans.length > 0 ? <p className="workout-plan-results" aria-live="polite">{visiblePlans.length} di {plans.length} schede visualizzate</p> : null}</div><button className="primary-action" type="button" onClick={startNewPlan}><Plus aria-hidden="true" />Nuova scheda</button></div>
        {plansLoadState === "loading" ? <ResourceStatePanel compact loading title="Schede" message="Sto caricando le schede." /> : null}
        {plansLoadState === "error" ? (
          <ResourceStatePanel
            actionLabel="Riprova caricamento schede"
            compact
            message={plansError ?? "Le schede non sono disponibili in questo momento."}
            onRetry={onRetryPlans}
            title="Impossibile caricare le schede"
          />
        ) : null}
        {plansLoadState === "ready" && plans.length === 0 ? <p className="muted">Non ci sono ancora schede.</p> : null}
        {plansLoadState === "ready" && plans.length > 0 ? <>
          <div className="workout-plan-toolbar">
            <label className="field workout-plan-search"><span>Cerca schede</span><div><Search aria-hidden="true" /><input aria-label="Cerca schede" onChange={(event) => setPlanQuery(event.target.value)} placeholder="Cerca per nome" type="search" value={planQuery} />{planQuery !== "" ? <button aria-label="Cancella ricerca schede" onClick={() => setPlanQuery("")} type="button"><X aria-hidden="true" /></button> : null}</div></label>
            <div className="workout-plan-status-filters" role="group" aria-label="Filtra schede per stato">
              {(["all", "published", "draft", "archived"] as const).map((status) => <button aria-pressed={planStatusFilter === status} className={planStatusFilter === status ? "is-selected" : ""} key={status} onClick={() => setPlanStatusFilter(status)} type="button">{status === "all" ? "Tutte" : status === "published" ? "Pubblicate" : status === "draft" ? "Bozze" : "Archiviate"} <span>{planCounts[status]}</span></button>)}
            </div>
            <label className="field workout-plan-sort"><span>Ordina</span><select aria-label="Ordina schede" onChange={(event) => setPlanSort(event.target.value as WorkoutPlanSort)} value={planSort}><option value="updated">Ultima modifica</option><option value="title">Nome A-Z</option><option value="created">Data creazione</option></select></label>
          </div>
          {visiblePlans.length === 0 ? <div className="workout-plan-empty-filter"><Search aria-hidden="true" /><strong>Nessuna scheda corrisponde ai filtri</strong><p>Prova a cambiare la ricerca o lo stato selezionato.</p><button className="secondary-action" onClick={() => { setPlanQuery(""); setPlanStatusFilter("all"); }} type="button">Azzera filtri</button></div> : <div aria-label="Elenco schede, scorri per vedere le altre" className="admin-list workout-plan-scroll-list" role="region" tabIndex={0}>{visiblePlans.map((plan) => <article className="admin-list-item workout-plan-admin-item" key={plan.id}><div className="workout-plan-row-content"><div className="workout-plan-row-heading"><h3>{plan.title}</h3><span className={`workout-status workout-status-${plan.status}`}>{workoutStatusLabel(plan.status)}</span></div><p>{plan.day_count} giorni · aggiornata {formatDate(plan.updated_at.slice(0, 10))}</p></div><div className="workout-plan-row-actions"><button className="primary-action" type="button" disabled={loadingId === plan.id} onClick={() => void openPlan(plan.id)}><Pencil aria-hidden="true" />Modifica</button><details className="workout-plan-actions-menu" onToggle={positionWorkoutPlanActionsMenu}><summary aria-label={`Altre azioni per ${plan.title}`}><MoreHorizontal aria-hidden="true" /><span className="sr-only">Altre azioni</span></summary><div className="workout-plan-actions-panel"><button className="secondary-action" type="button" disabled={loadingId === plan.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void duplicatePlan(plan.id); }}>Duplica</button>{plan.status === "published" ? <button className="secondary-action" type="button" disabled={loadingId === plan.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeStatus(plan, "unpublish"); }}>Depubblica</button> : plan.status !== "archived" ? <button className="secondary-action" type="button" disabled={loadingId === plan.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeStatus(plan, "publish"); }}>Pubblica</button> : null}{plan.status !== "archived" ? <button className="secondary-action danger-action" type="button" disabled={loadingId === plan.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void changeStatus(plan, "archive"); }}>Archivia</button> : null}{isAdmin ? <button className="secondary-action danger-action" type="button" disabled={loadingId === plan.id} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void deletePlan(plan); }}>Elimina</button> : null}</div></details></div></article>)}</div>}
        </> : null}
      </section>
    </div>
  );
}

type WorkoutEditorPanelProps = {
  assignedUserIds: string[];
  draft: WorkoutPlanPayload & { id?: string };
  isAdmin: boolean;
  onAddDay: () => void;
  onAddExercise: (dayIndex: number) => void;
  onAssignedUserIdsChange: (ids: string[]) => void;
  onBackToPlans: () => void;
  onClose: () => void;
  onCreateAnother: () => void;
  onContinueAfterSave: () => void;
  onMoveItem: (dayIndex: number, exerciseIndex: number | null, direction: -1 | 1) => void;
  onRemoveDay: (dayIndex: number) => void;
  onRemoveExercise: (dayIndex: number, exerciseIndex: number) => void;
  onSave: () => Promise<void>;
  onPublishSaved: () => void;
  isSaving: boolean;
  onUpdateDay: (dayIndex: number, next: Partial<WorkoutDayPayload>) => void;
  onUpdateDraft: (next: Partial<WorkoutPlanPayload>) => void;
  onUpdateExercise: (
    dayIndex: number,
    exerciseIndex: number,
    next: Partial<WorkoutExercisePayload>,
  ) => void;
  saveFeedback: { planId: string; canPublish: boolean } | null;
  users: AdminUser[];
};

type WorkoutEditorStep = 1 | 2 | 3 | 4;

function WorkoutEditorPanel({
  assignedUserIds,
  draft,
  isAdmin,
  onAddDay,
  onAddExercise,
  onAssignedUserIdsChange,
  onBackToPlans,
  onClose,
  onCreateAnother,
  onContinueAfterSave,
  onMoveItem,
  onRemoveDay,
  onRemoveExercise,
  onSave,
  onPublishSaved,
  isSaving,
  onUpdateDay,
  onUpdateDraft,
  onUpdateExercise,
  saveFeedback,
  users,
}: WorkoutEditorPanelProps) {
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [visibleAssignmentCount, setVisibleAssignmentCount] = useState(8);
  const [activeEditorStep, setActiveEditorStep] = useState<WorkoutEditorStep>(1);
  const [validationStage, setValidationStage] = useState<WorkoutValidationStage | null>(null);
  const saveFeedbackRef = useRef<HTMLDivElement>(null);
  const isCreationFlow = draft.id === undefined;
  const activeUsers = useMemo(
    () => users.filter((user) => user.role === "user" && user.status === "active"),
    [users],
  );
  const matchingUsers = useMemo(() => {
    const query = assignmentQuery.trim().toLowerCase();
    return activeUsers
      .filter((user) =>
        `${user.first_name ?? ""} ${user.last_name ?? ""} ${user.email}`
          .toLowerCase()
          .includes(query),
      );
  }, [activeUsers, assignmentQuery]);
  const visibleMatchingUsers = matchingUsers.slice(0, visibleAssignmentCount);

  useEffect(() => {
    setVisibleAssignmentCount(8);
  }, [assignmentQuery, activeUsers.length]);
  useStepperHistory({
    enabled: isCreationFlow,
    flowId: "workout-editor",
    onClose,
    onStepChange: (nextStep) => {
      if (nextStep >= 1 && nextStep <= 4) {
        setActiveEditorStep(nextStep as WorkoutEditorStep);
      }
    },
    step: activeEditorStep,
  });

  useEffect(() => {
    setActiveDayIndex((current) => Math.min(current, Math.max(draft.days.length - 1, 0)));
  }, [draft.days.length]);

  useEffect(() => {
    if (saveFeedback === null) return;
    window.requestAnimationFrame(() => saveFeedbackRef.current?.focus());
  }, [saveFeedback]);

  function toggleAssignment(userId: string): void {
    onAssignedUserIdsChange(
      assignedUserIds.includes(userId)
        ? assignedUserIds.filter((id) => id !== userId)
        : [...assignedUserIds, userId],
    );
  }

  function removeActiveDay(): void {
    onRemoveDay(activeDayIndex);
    setActiveDayIndex((current) => Math.max(0, Math.min(current, draft.days.length - 2)));
  }

  function addNewDay(): void {
    onAddDay();
    setActiveDayIndex(draft.days.length);
  }

  function showEditorStep(step: WorkoutEditorStep): boolean {
    return !isCreationFlow || activeEditorStep === step;
  }

  const validationIssues = validationStage === null ? [] : workoutPlanValidationIssues(draft, validationStage);
  const validationIssueByField = new Map(validationIssues.map((issue) => [issue.fieldId, issue]));
  const firstValidationIssue = validationIssues[0];

  function focusEditorValidationIssue(issue: WorkoutValidationIssue | undefined): void {
    const dayMatch = issue?.fieldId.match(/^workout-day-(\d+)/);
    if (dayMatch !== undefined && dayMatch !== null) setActiveDayIndex(Number(dayMatch[1]));
    focusWorkoutValidationIssue(issue);
  }

  function goToEditorStep(step: WorkoutEditorStep): void {
    const targetStage: WorkoutValidationStage | null = step === 2 ? 2 : step === 3 ? 3 : step === 4 ? 4 : null;
    if (targetStage !== null && step > activeEditorStep) {
      const issues = workoutPlanValidationIssues(draft, targetStage);
      if (issues.length > 0) {
        setValidationStage(targetStage);
        focusEditorValidationIssue(issues[0]);
        return;
      }
    }
    setValidationStage(null);
    setActiveEditorStep(step);
    window.requestAnimationFrame(() => {
      const editor = document.querySelector<HTMLElement>(".workout-editor-panel-v2");
      editor?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  }

  function saveFromEditor(): void {
    const issues = workoutPlanValidationIssues(draft);
    if (issues.length > 0) {
      setValidationStage(4);
      focusEditorValidationIssue(issues[0]);
      return;
    }
    void onSave();
  }

  const editorNextLabel = activeEditorStep === 2
    ? "Ho finito gli esercizi"
    : activeEditorStep === 3
      ? "Vai al riepilogo"
      : "Continua";

  return (
    <section className="admin-panel workout-editor-panel workout-editor-panel-v2" aria-labelledby="workout-editor-title-v2">
      <div className="workout-editor-topbar">
        <div>
          <p className="eyebrow">Editor scheda</p>
          <h3 id="workout-editor-title-v2">{draft.id === undefined ? "Nuova scheda" : draft.title || "Scheda senza titolo"}</h3>
          <p className="workout-editor-helper">Costruisci il programma per blocchi: prima i giorni, poi gli esercizi, infine i destinatari.</p>
        </div>
        <button className="secondary-action" type="button" onClick={onClose}>Chiudi</button>
      </div>

      {saveFeedback !== null ? <div ref={saveFeedbackRef} className="workout-save-feedback" role="status" tabIndex={-1}>
        <div>
          <strong>Scheda salvata.</strong>
          <p>Scegli se continuare a modificarla, pubblicarla o tornare all’elenco.</p>
        </div>
        <div className="workout-save-feedback-actions">
          <button className={saveFeedback.canPublish ? "secondary-action" : "primary-action"} type="button" onClick={onContinueAfterSave}>Continua modifica</button>
          {saveFeedback.canPublish ? <button className="primary-action" type="button" onClick={onPublishSaved}>Pubblica scheda</button> : null}
          <button className="secondary-action" type="button" onClick={onCreateAnother}>Crea un'altra scheda</button>
          <button className="secondary-action" type="button" onClick={onBackToPlans}>Torna alle schede</button>
        </div>
      </div> : null}

      <div className="workout-editor-overview" aria-label="Riepilogo scheda">
        <span><strong>{draft.days.length}</strong> giorni</span>
        <span><strong>{draft.days.reduce((total, day) => total + day.exercises.length, 0)}</strong> esercizi</span>
        {isAdmin ? <span><strong>{assignedUserIds.length}</strong> destinatari</span> : null}
      </div>

      {firstValidationIssue !== undefined ? <p className="workout-editor-validation" role="alert">Completa i campi evidenziati prima di continuare: {firstValidationIssue.message}</p> : null}

      {isCreationFlow ? <nav className="admin-stepper workout-stepper" aria-label="Creazione scheda">
        {(["Dati base", "Giorni ed esercizi", "Destinatari", "Riepilogo"] as const).map((label, index) => { const step = (index + 1) as WorkoutEditorStep; return <button className={activeEditorStep === step ? "is-active" : ""} type="button" aria-current={activeEditorStep === step ? "step" : undefined} onClick={() => goToEditorStep(step)} key={label}><span>{step}</span><strong>{label}</strong></button>; })}
      </nav> : null}

      <div className="admin-form workout-editor-form" hidden={!showEditorStep(1)}>
        <label className={`field${validationIssueByField.has("workout-title") ? " has-error" : ""}`}><span>Titolo scheda</span><input aria-describedby={validationIssueByField.has("workout-title") ? "workout-title-error" : undefined} aria-invalid={validationIssueByField.has("workout-title")} id="workout-title" maxLength={180} value={draft.title} onChange={(event) => onUpdateDraft({ title: event.target.value })} />{validationIssueByField.has("workout-title") ? <span className="workout-field-error" id="workout-title-error">{validationIssueByField.get("workout-title")?.message}</span> : null}</label>
        <label className="field"><span>Descrizione <small>(opzionale)</small></span><textarea maxLength={4000} value={draft.description ?? ""} onChange={(event) => onUpdateDraft({ description: event.target.value || null })} placeholder="Obiettivo, periodo o indicazioni generali" /></label>
      </div>

      {isAdmin ? (
        <details className="workout-assignment-panel workout-assignment-panel-v2" hidden={!showEditorStep(3)} open={isCreationFlow ? activeEditorStep === 3 : undefined}>
          <summary><span><UserRound aria-hidden="true" /> Destinatari</span><strong>{assignedUserIds.length} selezionati</strong></summary>
          <p className="muted">La scheda sarà visibile solo agli utenti selezionati. Usa “Seleziona tutti” per i programmi standard.</p>
          <div className="workout-assignment-toolbar">
            <label className="field"><span>Cerca nome o email</span><input type="search" value={assignmentQuery} onChange={(event) => setAssignmentQuery(event.target.value)} placeholder="Es. Mario o mario@email.it" /></label>
            <div className="workout-assignment-bulk-actions"><button className="secondary-action" type="button" onClick={() => onAssignedUserIdsChange(activeUsers.map((user) => user.id))}>Seleziona tutti ({activeUsers.length})</button><button className="secondary-action" type="button" onClick={() => onAssignedUserIdsChange([])}>Svuota</button></div>
          </div>
          <div className="workout-assignment-list workout-assignment-list-v2" role="group" aria-label="Utenti attivi">
            {visibleMatchingUsers.map((user) => { const displayName = [user.first_name, user.last_name].filter(Boolean).join(" "); const isSelected = assignedUserIds.includes(user.id); return <label className={`workout-assignment-option${isSelected ? " is-selected" : ""}`} key={user.id}><input checked={isSelected} onChange={() => toggleAssignment(user.id)} type="checkbox" /><span><strong>{displayName || user.email}</strong>{displayName ? <small>{user.email}</small> : null}</span></label>; })}
          </div>
          {matchingUsers.length === 0 ? <p className="muted">Nessun utente trovato. Prova con un altro nome o email.</p> : null}
          {visibleMatchingUsers.length < matchingUsers.length ? <button className="secondary-action workout-assignment-load-more" onClick={() => setVisibleAssignmentCount((current) => current + 8)} type="button">Mostra altri utenti ({matchingUsers.length - visibleMatchingUsers.length})</button> : null}
          {matchingUsers.length > 0 ? <p className="workout-assignment-hint">{visibleMatchingUsers.length} di {matchingUsers.length} utenti mostrati.</p> : null}
        </details>
      ) : <section className="workout-assignment-panel workout-assignment-panel-v2" hidden={!showEditorStep(3)}><h4>Destinatari</h4><p className="muted">La scheda sarà assegnata dall’amministratore dopo la pubblicazione.</p></section>}

      <WorkoutDayBuilder
        activeDayIndex={activeDayIndex}
        draft={draft}
        hidden={!showEditorStep(2)}
        validationIssues={validationIssues}
        onAddDay={addNewDay}
        onAddExercise={onAddExercise}
        onMoveItem={onMoveItem}
        onRemoveDay={removeActiveDay}
        onRemoveExercise={onRemoveExercise}
        onSelectDay={setActiveDayIndex}
        onUpdateDay={onUpdateDay}
        onUpdateExercise={onUpdateExercise}
      />


      {isCreationFlow && activeEditorStep === 4 ? <section className="workout-review-panel" aria-labelledby="workout-review-title"><div className="workout-section-heading"><div><p className="eyebrow">Ultimo controllo</p><h4 id="workout-review-title">Riepilogo scheda</h4></div><span className="muted">Verifica prima di salvare</span></div><dl className="workout-review-summary"><div><dt>Titolo</dt><dd>{draft.title || "Da completare"}</dd></div><div><dt>Giorni</dt><dd>{draft.days.length}</dd></div><div><dt>Esercizi</dt><dd>{draft.days.reduce((total, day) => total + day.exercises.length, 0)}</dd></div>{isAdmin ? <div><dt>Destinatari</dt><dd>{assignedUserIds.length}</dd></div> : null}</dl><div className="workout-review-days">{draft.days.map((day, index) => <div key={day.id ?? `review-${index}`}><strong>{day.label || `Giorno ${index + 1}`}{day.title ? ` · ${day.title}` : ""}</strong><span>{day.exercises.length} esercizi{day.exercises.length > 0 ? ` · ${day.exercises.map((exercise) => exercise.name || "Senza nome").join(", ")}` : ""}</span></div>)}</div></section> : null}

      {isCreationFlow ? <div className="workout-editor-actions workout-editor-actions-v2 workout-stepper-actions">
        {activeEditorStep > 1 ? <button className="secondary-action" type="button" onClick={() => goToEditorStep((activeEditorStep - 1) as WorkoutEditorStep)}>Indietro</button> : <span />}
        {activeEditorStep < 4 ? <button className="primary-action" type="button" onClick={() => goToEditorStep((activeEditorStep + 1) as WorkoutEditorStep)}>{editorNextLabel}</button> : <button className="primary-action" disabled={isSaving} type="button" onClick={saveFromEditor}><Save aria-hidden="true" />{isSaving ? "Salvataggio…" : "Salva scheda"}</button>}
      </div> : <div className="workout-editor-actions workout-editor-actions-v2"><button className="secondary-action" type="button" onClick={addNewDay}><Plus aria-hidden="true" />Aggiungi giorno</button><button className="primary-action" type="button" onClick={saveFromEditor}><Save aria-hidden="true" />Salva scheda</button></div>}
    </section>
  );
}

type WorkoutDayBuilderProps = {
  activeDayIndex: number;
  draft: WorkoutPlanPayload & { id?: string };
  hidden: boolean;
  validationIssues: WorkoutValidationIssue[];
  onAddDay: () => void;
  onAddExercise: (dayIndex: number) => void;
  onMoveItem: (dayIndex: number, exerciseIndex: number | null, direction: -1 | 1) => void;
  onRemoveDay: () => void;
  onRemoveExercise: (dayIndex: number, exerciseIndex: number) => void;
  onSelectDay: (dayIndex: number) => void;
  onUpdateDay: (dayIndex: number, next: Partial<WorkoutDayPayload>) => void;
  onUpdateExercise: (
    dayIndex: number,
    exerciseIndex: number,
    next: Partial<WorkoutExercisePayload>,
  ) => void;
};

function WorkoutDayBuilder({
  activeDayIndex,
  draft,
  hidden,
  validationIssues,
  onAddDay: addDay,
  onAddExercise: addExercise,
  onMoveItem,
  onRemoveDay,
  onRemoveExercise,
  onSelectDay,
  onUpdateDay,
  onUpdateExercise,
}: WorkoutDayBuilderProps) {
  const activeDay = draft.days[activeDayIndex];
  const validationIssueByField = new Map(validationIssues.map((issue) => [issue.fieldId, issue]));

  function addNewDayAndFocus(): void {
    const nextDayIndex = draft.days.length;
    addDay();
    window.requestAnimationFrame(() => {
      const newDay = document.querySelector(`[data-workout-day="${nextDayIndex}"]`);
      (newDay?.querySelector("input") as HTMLInputElement | null)?.focus();
    });
  }

  function addExerciseAndFocus(): void {
    if (activeDay === undefined) return;
    const nextExerciseIndex = activeDay.exercises.length;
    addExercise(activeDayIndex);
    window.requestAnimationFrame(() => {
      const newExercise = document.querySelectorAll(".workout-exercise-card-v3")[nextExerciseIndex];
      (newExercise?.querySelector("input") as HTMLInputElement | null)?.focus();
    });
  }

  function onAddDay(): void {
    addNewDayAndFocus();
  }

  function onAddExercise(dayIndex: number): void {
    if (dayIndex !== activeDayIndex) {
      addExercise(dayIndex);
      return;
    }
    addExerciseAndFocus();
  }

  return (
    <section className="workout-editor-days-v3" aria-labelledby="workout-days-title-v3" hidden={hidden}>
      <div className="workout-structure-heading">
        <div>
          <p className="eyebrow">Struttura della scheda</p>
          <h4 id="workout-days-title-v3">Giorni della scheda</h4>
          <p className="workout-structure-helper">Ogni giorno è un blocco indipendente: puoi aggiungerlo, riordinarlo e lavorarci senza perdere il contesto.</p>
        </div>
        <button className="secondary-action" type="button" onClick={addNewDayAndFocus}><Plus aria-hidden="true" />Nuovo giorno</button>
      </div>

      <div className="workout-structure-layout">
        <aside className="workout-day-list" role="tablist" aria-label="Giorni della scheda">
          <div className="workout-day-list-heading"><span>Giorni</span><strong>{draft.days.length}</strong></div>
          {draft.days.length === 0 ? <div className="workout-day-list-empty"><CalendarDays aria-hidden="true" /><p>Inizia creando il primo giorno della scheda.</p><button id="workout-add-day" className="primary-action" type="button" onClick={addNewDayAndFocus}><Plus aria-hidden="true" />Crea giorno</button></div> : draft.days.map((day, index) => <button id={`workout-editor-v3-day-tab-${index}`} className={`workout-day-list-item${activeDayIndex === index ? " is-active" : ""}`} type="button" role="tab" aria-controls={`workout-editor-v3-day-panel-${index}`} aria-selected={activeDayIndex === index} onClick={() => onSelectDay(index)} key={day.id ?? `day-${index}`} data-workout-day={index}><span className="workout-day-list-number">{String(index + 1).padStart(2, "0")}</span><span className="workout-day-list-copy"><strong>{day.label || `Giorno ${index + 1}`}</strong><small>{day.title || "Senza obiettivo"}</small><em>{day.exercises.length} {day.exercises.length === 1 ? "esercizio" : "esercizi"}</em></span><ChevronRight aria-hidden="true" /></button>)}
          {draft.days.length > 0 ? <button className="workout-day-list-add" type="button" onClick={addNewDayAndFocus}><Plus aria-hidden="true" />Aggiungi giorno</button> : null}
        </aside>

        {activeDay ? <div id={`workout-editor-v3-day-panel-${activeDayIndex}`} className="workout-active-day" role="tabpanel" aria-labelledby={`workout-editor-v3-day-tab-${activeDayIndex}`} tabIndex={0}>
          <div className="workout-active-day-heading">
            <div><span className="workout-active-day-kicker">Giorno {activeDayIndex + 1} di {draft.days.length}</span><h5>{activeDay.label || `Giorno ${activeDayIndex + 1}`}{activeDay.title ? <span> · {activeDay.title}</span> : null}</h5><p>Definisci il focus del giorno e aggiungi gli esercizi in ordine.</p></div>
            <div className="workout-day-actions-v3"><button className="icon-button" aria-label="Sposta giorno su" type="button" onClick={() => onMoveItem(activeDayIndex, null, -1)}><ArrowUp aria-hidden="true" /></button><button className="icon-button" aria-label="Sposta giorno giù" type="button" onClick={() => onMoveItem(activeDayIndex, null, 1)}><ArrowDown aria-hidden="true" /></button><button className="secondary-action danger-action" type="button" onClick={onRemoveDay}>Rimuovi giorno</button></div>
          </div>
          <div className="workout-day-fields-v3"><label className={`field${validationIssueByField.has(`workout-day-${activeDayIndex}-label`) ? " has-error" : ""}`}><span>Nome breve</span><input aria-describedby={validationIssueByField.has(`workout-day-${activeDayIndex}-label`) ? `workout-day-${activeDayIndex}-label-error` : undefined} aria-invalid={validationIssueByField.has(`workout-day-${activeDayIndex}-label`)} id={`workout-day-${activeDayIndex}-label`} maxLength={80} value={activeDay.label} onChange={(event) => onUpdateDay(activeDayIndex, { label: event.target.value })} placeholder="Es. Giorno 1" />{validationIssueByField.has(`workout-day-${activeDayIndex}-label`) ? <span className="workout-field-error" id={`workout-day-${activeDayIndex}-label-error`}>{validationIssueByField.get(`workout-day-${activeDayIndex}-label`)?.message}</span> : null}</label><label className="field"><span>Focus del giorno</span><input maxLength={180} value={activeDay.title ?? ""} onChange={(event) => onUpdateDay(activeDayIndex, { title: event.target.value || null })} placeholder="Es. Spinta" /></label></div>
          <div className="workout-exercise-heading-v3"><div><span className="workout-active-day-kicker">Secondo blocco</span><h5>Esercizi <em>{activeDay.exercises.length}</em></h5><p>Inserisci prima i fondamentali, poi completa volume e recuperi.</p></div><button className="primary-action" type="button" onClick={() => onAddExercise(activeDayIndex)}><Plus aria-hidden="true" />Aggiungi esercizio</button></div>
          {activeDay.exercises.length === 0 ? <div className="workout-exercise-empty-v3"><Dumbbell aria-hidden="true" /><strong>Nessun esercizio in questo giorno</strong><span>Aggiungi il primo esercizio per iniziare la scheda.</span><button id={`workout-day-${activeDayIndex}-add-exercise`} className={`secondary-action${validationIssueByField.has(`workout-day-${activeDayIndex}-add-exercise`) ? " has-error" : ""}`} type="button" onClick={() => onAddExercise(activeDayIndex)}><Plus aria-hidden="true" />Aggiungi il primo esercizio</button>{validationIssueByField.has(`workout-day-${activeDayIndex}-add-exercise`) ? <span className="workout-field-error">{validationIssueByField.get(`workout-day-${activeDayIndex}-add-exercise`)?.message}</span> : null}</div> : <div className="workout-exercise-list-v3">{activeDay.exercises.map((exercise, exerciseIndex) => { const nameFieldId = `workout-day-${activeDayIndex}-exercise-${exerciseIndex}-name`; const setsFieldId = `workout-day-${activeDayIndex}-exercise-${exerciseIndex}-sets`; const repsFieldId = `workout-day-${activeDayIndex}-exercise-${exerciseIndex}-reps`; const restFieldId = `workout-day-${activeDayIndex}-exercise-${exerciseIndex}-rest`; return <article className="workout-exercise-card-v3" key={exercise.id ?? `exercise-${exerciseIndex}`}><div className="workout-exercise-card-top"><span className="workout-exercise-number-v3">{String(exerciseIndex + 1).padStart(2, "0")}</span><div><strong>{exercise.name || "Nuovo esercizio"}</strong><span>{exercise.sets_planned} serie · {exercise.reps_planned || "Ripetizioni da definire"}</span></div><div className="workout-exercise-actions-v3"><button className="icon-button" aria-label="Sposta esercizio su" type="button" onClick={() => onMoveItem(activeDayIndex, exerciseIndex, -1)}><ArrowUp aria-hidden="true" /></button><button className="icon-button" aria-label="Sposta esercizio giù" type="button" onClick={() => onMoveItem(activeDayIndex, exerciseIndex, 1)}><ArrowDown aria-hidden="true" /></button><button className="icon-button danger-action" aria-label="Rimuovi esercizio" type="button" onClick={() => onRemoveExercise(activeDayIndex, exerciseIndex)}><Trash2 aria-hidden="true" /></button></div></div><div className="workout-exercise-fields-v3"><label className={`field workout-exercise-name-v3${validationIssueByField.has(nameFieldId) ? " has-error" : ""}`}><span>Nome esercizio</span><input aria-describedby={validationIssueByField.has(nameFieldId) ? `${nameFieldId}-error` : undefined} aria-invalid={validationIssueByField.has(nameFieldId)} id={nameFieldId} maxLength={180} value={exercise.name} onChange={(event) => onUpdateExercise(activeDayIndex, exerciseIndex, { name: event.target.value })} placeholder="Es. Dips" />{validationIssueByField.has(nameFieldId) ? <span className="workout-field-error" id={`${nameFieldId}-error`}>{validationIssueByField.get(nameFieldId)?.message}</span> : null}</label><label className={`field${validationIssueByField.has(setsFieldId) ? " has-error" : ""}`}><span>Serie</span><input aria-describedby={validationIssueByField.has(setsFieldId) ? `${setsFieldId}-error` : undefined} aria-invalid={validationIssueByField.has(setsFieldId)} id={setsFieldId} inputMode="numeric" min="1" max="50" type="number" value={exercise.sets_planned} onChange={(event) => onUpdateExercise(activeDayIndex, exerciseIndex, { sets_planned: Number(event.target.value) })} />{validationIssueByField.has(setsFieldId) ? <span className="workout-field-error" id={`${setsFieldId}-error`}>{validationIssueByField.get(setsFieldId)?.message}</span> : null}</label><label className={`field${validationIssueByField.has(repsFieldId) ? " has-error" : ""}`}><span>Ripetizioni</span><input aria-describedby={validationIssueByField.has(repsFieldId) ? `${repsFieldId}-error` : undefined} aria-invalid={validationIssueByField.has(repsFieldId)} id={repsFieldId} maxLength={40} value={exercise.reps_planned} onChange={(event) => onUpdateExercise(activeDayIndex, exerciseIndex, { reps_planned: event.target.value })} placeholder="Es. 8-10" />{validationIssueByField.has(repsFieldId) ? <span className="workout-field-error" id={`${repsFieldId}-error`}>{validationIssueByField.get(repsFieldId)?.message}</span> : null}</label><label className={`field${validationIssueByField.has(restFieldId) ? " has-error" : ""}`}><span>Recupero (sec.)</span><input aria-describedby={validationIssueByField.has(restFieldId) ? `${restFieldId}-error` : undefined} aria-invalid={validationIssueByField.has(restFieldId)} id={restFieldId} inputMode="numeric" min="0" max="3600" type="number" value={exercise.rest_seconds ?? ""} onChange={(event) => onUpdateExercise(activeDayIndex, exerciseIndex, { rest_seconds: event.target.value === "" ? null : Number(event.target.value) })} placeholder="60" />{validationIssueByField.has(restFieldId) ? <span className="workout-field-error" id={`${restFieldId}-error`}>{validationIssueByField.get(restFieldId)?.message}</span> : null}</label><label className="field workout-exercise-note-v3"><span>Nota tecnica <small>(opzionale)</small></span><input maxLength={500} value={exercise.notes ?? ""} onChange={(event) => onUpdateExercise(activeDayIndex, exerciseIndex, { notes: event.target.value || null })} placeholder="Indicazione tecnica" /></label></div></article>; })}</div>}
        </div> : <div className="workout-active-day-empty"><CalendarDays aria-hidden="true" /><h5>Il primo giorno parte da qui</h5><p>Usa “Nuovo giorno” per impostare il primo blocco della scheda.</p><button className="primary-action" type="button" onClick={onAddDay}><Plus aria-hidden="true" />Crea il primo giorno</button></div>}
      </div>
      {activeDay ? <div className="workout-builder-bottom-actions"><button className="secondary-action" type="button" onClick={() => onAddExercise(activeDayIndex)}><Plus aria-hidden="true" />Aggiungi esercizio in fondo</button><button className="secondary-action" type="button" onClick={onAddDay}><Plus aria-hidden="true" />Aggiungi un altro giorno</button></div> : null}
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
  const pickerRef = useRef<HTMLDivElement>(null);

  function moveDates(direction: number): void {
    pickerRef.current?.scrollBy({ behavior: "smooth", left: direction * 220 });
  }

  return (
    <div className="date-picker-shell">
      <div className="date-picker-toolbar">
        <span>Seleziona una data</span>
        <div className="date-picker-actions">
          <button aria-label="Date precedenti" className="date-picker-nav" onClick={() => moveDates(-1)} type="button">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button aria-label="Date successive" className="date-picker-nav" onClick={() => moveDates(1)} type="button">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={pickerRef} className="date-picker" role="group" aria-label="Data del calendario">
        {dates.map((date) => {
          const parsedDate = dateFromIso(date);
          const month = new Intl.DateTimeFormat("it-IT", { month: "short" })
            .format(parsedDate)
            .replace(".", "");
          return (
            <button
              aria-label={`${weekdays[parsedDate.getDay()]} ${formatDate(date)}`}
              aria-pressed={selectedDate === date}
              className={selectedDate === date ? "is-selected" : ""}
              key={date}
              onClick={() => onChange(date)}
              type="button"
            >
              <span>{weekdays[parsedDate.getDay()].slice(0, 3)}</span>
              <strong>{parsedDate.getDate()}</strong>
              <small>{month}</small>
            </button>
          );
        })}
      </div>
    </div>
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
    const singleDates = courses
      .flatMap((course) => course.sessions.map((session) => session.occurs_on))
      .filter((occursOn): occursOn is string => occursOn !== null && occursOn >= today);
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
            (session.occurs_on === date || (session.occurs_on === null && session.weekday === weekday)),
        ),
    );
  });
  const [selectedDate, setSelectedDate] = useState(firstScheduledDate ?? dates[0] ?? localIsoDate());
  const [isAgendaExpanded, setIsAgendaExpanded] = useState(false);
  const [expandedOccurrenceKey, setExpandedOccurrenceKey] = useState<string | null>(null);
  const [loadingOccurrenceKey, setLoadingOccurrenceKey] = useState<string | null>(null);
  const [attendeesBySession, setAttendeesBySession] = useState<Record<string, AdminCourseSessionAttendee[]>>({});
  const [attendeeErrors, setAttendeeErrors] = useState<Record<string, string>>({});
  const [availabilityBySession, setAvailabilityBySession] = useState<Record<string, AdminCourseSessionAvailability>>({});
  const [availabilityState, setAvailabilityState] = useState<"loading" | "ready" | "error">("loading");
  const locationNames = new Map(locations.map((location) => [location.id, location.name]));
  const selectedWeekday = dateFromIso(selectedDate).getDay();
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
        if (ignore) return;
        setAvailabilityBySession(
          Object.fromEntries(availability.map((item) => [`${item.course_session_id}:${item.occurs_on}`, item])),
        );
        setAvailabilityState("ready");
      })
      .catch(() => {
        if (!ignore) setAvailabilityState("error");
      });
    return () => {
      ignore = true;
    };
  }, [selectedDate, token]);

  async function loadAttendees(sessionId: string, entryKey: string): Promise<void> {
    setLoadingOccurrenceKey(entryKey);
    setAttendeeErrors((current) => {
      const next = { ...current };
      delete next[entryKey];
      return next;
    });
    try {
      const attendees = await api.courseSessionAttendees(token, sessionId, selectedDate);
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
    if (attendeesBySession[entryKey] === undefined) void loadAttendees(sessionId, entryKey);
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
      <DatePicker
        dates={dates}
        selectedDate={selectedDate}
        onChange={(date) => {
          setSelectedDate(date);
          setExpandedOccurrenceKey(null);
          setIsAgendaExpanded(false);
        }}
      />
      <div className={isAgendaExpanded ? "calendar-agenda is-expanded" : "calendar-agenda"} id="admin-calendar-agenda">
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
                  <p>{locationNames.get(course.location_id) ?? "Sede non disponibile"} · {formatTime(session.starts_at)} - {formatTime(session.ends_at)}</p>
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
                  <button aria-controls={panelId} aria-expanded={isExpanded} className="secondary-action attendee-toggle" onClick={() => toggleAttendees(session.id, entryKey)} type="button">
                    Prenotati <ChevronDown aria-hidden="true" />
                  </button>
                </div>
                {isExpanded ? (
                  <div className="attendee-panel" id={panelId} aria-live="polite">
                    {loadingOccurrenceKey === entryKey ? <p>Carico i partecipanti...</p> : null}
                    {attendeeErrors[entryKey] !== undefined ? (
                      <div className="attendee-error"><p>{attendeeErrors[entryKey]}</p><button className="secondary-action" onClick={() => void loadAttendees(session.id, entryKey)} type="button">Riprova</button></div>
                    ) : null}
                    {attendees !== undefined && attendees.length === 0 ? <p>Nessuna prenotazione attiva per questa lezione.</p> : null}
                    {attendees !== undefined && attendees.length > 0 ? (
                      <>
                        <div className="attendee-summary"><strong>{confirmedCount} confermati</strong>{waitlistedCount > 0 ? <span>{waitlistedCount} in lista d'attesa</span> : null}</div>
                        <ul className="attendee-list">{attendees.map((attendee) => { const fullName = [attendee.first_name, attendee.last_name].filter(Boolean).join(" "); return <li key={attendee.booking_id}><div><strong>{fullName || attendee.email}</strong>{fullName ? <span>{attendee.email}</span> : null}</div><span className={attendee.status === "waitlisted" ? "booking-status waitlisted" : "booking-status"}>{attendee.status === "waitlisted" ? "Lista attesa" : "Confermato"}</span></li>; })}</ul>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
        {entries.length > 5 ? <button aria-controls="admin-calendar-agenda" aria-expanded={isAgendaExpanded} className="secondary-action calendar-more-toggle" onClick={() => setIsAgendaExpanded((current) => !current)} type="button"><ChevronDown aria-hidden="true" />{isAgendaExpanded ? "Mostra meno" : `Mostra altre ${entries.length - 5} lezioni`}</button> : null}
      </div>
    </section>
  );
}

function AdminDashboardPanel({
  activeLocations,
  activeMembers,
  accountSettings,
  onNavigate,
  publishedCourses,
  stats,
}: {
  activeLocations: number;
  activeMembers: number;
  accountSettings: ReactNode;
  onNavigate: (tab: AdminTab) => void;
  publishedCourses: number;
  stats: AdminStats | null;
}) {
  const hasCoursePerformance = (stats?.courses.length ?? 0) > 0;
  const recommendedAction = hasCoursePerformance
      ? {
        description: "Verifica gli iscritti e gli orari delle prossime sessioni.",
        label: "Apri calendario e iscritti",
        title: "Controlla la prossima attività",
      }
    : {
        description: "Crea un corso e pianifica la prima lezione per iniziare.",
        label: "Configura un corso",
        title: "Completa la configurazione",
      };

  return (
    <div className="backoffice-grid">
      <div className="admin-page-heading admin-panel-wide">
        <div>
          <p className="eyebrow">Oggi in MAKA</p>
          <h2>Panoramica attivita</h2>
        </div>
        <span>Aggiornata dai dati di corsi e iscrizioni</span>
      </div>
      <section className="admin-recommended-action admin-panel-wide" aria-labelledby="admin-recommended-action-title">
        <div>
          <p className="eyebrow">Azione consigliata</p>
          <h3 id="admin-recommended-action-title">{recommendedAction.title}</h3>
          <p>{recommendedAction.description}</p>
        </div>
        <button className="primary-action" onClick={() => onNavigate("calendar")} type="button">
          <CalendarDays aria-hidden="true" />
          {recommendedAction.label}
        </button>
      </section>
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
      {accountSettings}
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
  onUserDelete,
  token,
  users,
}: {
  onNotice: (notice: Notice) => void;
  onUserChange: (user: AdminUser) => void;
  onUserDelete: (userId: string) => void;
  token: string;
  users: AdminUser[];
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("password-segreta");
  const [query, setQuery] = useState("");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
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
      setIsCreateFormOpen(false);
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
      await api.deleteAdminUser(token, user.id);
      onUserDelete(user.id);
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
      <button
        aria-expanded={isCreateFormOpen}
        className="primary-action admin-create-trigger"
        onClick={() => setIsCreateFormOpen((current) => !current)}
        type="button"
      >
        {isCreateFormOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {isCreateFormOpen ? "Chiudi creazione" : "Nuovo utente"}
      </button>
      {isCreateFormOpen ? (
        <form className="admin-form admin-progressive-form" onSubmit={handleCreate}>
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
      ) : null}

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
                      Account, profilo, iscrizioni e prenotazioni saranno eliminati
                      definitivamente. Tutti i posti prenotati verranno liberati.
                      L’operazione non puo essere annullata.
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
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
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
      setIsCreateFormOpen(false);
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
      <button
        aria-expanded={isCreateFormOpen}
        className="primary-action admin-create-trigger"
        onClick={() => setIsCreateFormOpen((current) => !current)}
        type="button"
      >
        {isCreateFormOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {isCreateFormOpen ? "Chiudi creazione" : "Nuova sede"}
      </button>
      {isCreateFormOpen ? (
        <form className="admin-form admin-progressive-form" onSubmit={handleCreate}>
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
      ) : null}

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

type CourseCreateStep = 1 | 2 | 3;

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
  const [courseCreateStep, setCourseCreateStep] = useState<CourseCreateStep>(1);
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

  useStepperHistory({
    enabled: isCreateFormOpen,
    flowId: "course-create",
    onClose: () => setIsCreateFormOpen(false),
    onStepChange: (nextStep) => {
      if (nextStep >= 1 && nextStep <= 3) {
        setCourseCreateStep(nextStep as CourseCreateStep);
      }
    },
    step: courseCreateStep,
  });

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

  function toggleCourseCreateForm(): void {
    setIsCreateFormOpen((current) => !current);
    setCourseCreateStep(1);
    setShowDisciplineCreator(false);
  }

  function goToCourseCreateStep(step: CourseCreateStep): void {
    setCourseCreateStep(step);
    window.requestAnimationFrame(() => {
      const courseForm = document.querySelector<HTMLElement>(".admin-course-create-form");
      courseForm?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
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
    if (title.trim() === "") {
      onNotice({ tone: "error", message: "Inserisci il titolo del corso." });
      setCourseCreateStep(1);
      return;
    }
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
      setSchedulingCourseId(savedCourse.id);
      window.requestAnimationFrame(() => {
        const scheduleForm = document.querySelector(`[data-schedule-course="${savedCourse.id}"]`);
        if (typeof scheduleForm?.scrollIntoView === "function") {
          scheduleForm.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
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
          onClick={toggleCourseCreateForm}
          type="button"
        >
          {isCreateFormOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isCreateFormOpen ? "Chiudi" : "Nuovo corso"}
        </button>
      </div>
      {isCreateFormOpen ? (
        <form className="admin-form admin-course-create-form" onSubmit={handleCreateCourse}>
        <nav className="admin-stepper course-stepper" aria-label="Creazione corso">
          {(["Dati del corso", "Sede e accesso", "Riepilogo"] as const).map((label, index) => { const step = (index + 1) as CourseCreateStep; return <button className={courseCreateStep === step ? "is-active" : ""} type="button" aria-current={courseCreateStep === step ? "step" : undefined} onClick={() => goToCourseCreateStep(step)} key={label}><span>{step}</span><strong>{label}</strong></button>; })}
        </nav>
        <label className="field" hidden={courseCreateStep !== 1}>
          <span>Titolo corso</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field" hidden={courseCreateStep !== 1}>
          <span>Descrizione corso</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="field" hidden={courseCreateStep !== 2}>
          <span>Sede corso</span>
          <select value={selectedLocationId} onChange={(event) => setLocationId(event.target.value)}>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" hidden={courseCreateStep !== 2}>
          <span>Stato corso</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as CourseStatus)}>
            <option value="published">Pubblicato</option>
            <option value="draft">Bozza</option>
          </select>
        </label>
        <div className="discipline-control" hidden={courseCreateStep !== 1}>
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
          <div className="discipline-create-row" hidden={courseCreateStep !== 1}>
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
        <label className="course-access-toggle" hidden={courseCreateStep !== 2}>
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
        <label className="field file-field" hidden={courseCreateStep !== 3}>
          <span>Foto corso</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setCourseImage(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
        {courseCreateStep === 3 ? <div className="course-create-review"><p className="eyebrow">Ultimo controllo</p><strong>{title || "Corso senza titolo"}</strong><span>{discipline} · {locations.find((location) => location.id === selectedLocationId)?.name ?? "Sede da scegliere"} · {status === "published" ? "Pubblicato" : "Bozza"}</span></div> : null}
        <div className="course-stepper-actions">
          {courseCreateStep > 1 ? <button className="secondary-action" type="button" onClick={() => goToCourseCreateStep((courseCreateStep - 1) as CourseCreateStep)}>Indietro</button> : <span />}
          {courseCreateStep < 3 ? <button className="primary-action" type="button" onClick={() => goToCourseCreateStep((courseCreateStep + 1) as CourseCreateStep)}>Continua</button> : <button className="primary-action" type="submit"><Plus aria-hidden="true" />Crea corso</button>}
        </div>
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
                <form
                  className="schedule-form"
                  data-schedule-course={course.id}
                  onSubmit={(event) => handleCreateSchedule(event, course)}
                >
                  <p className="schedule-next-step">Ora pianifica la prima lezione.</p>
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
  onLogin: (email: string, password: string) => Promise<AuthStep | null>;
  onRegister: (payload: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<boolean>;
  onVerifyTwoFactor: (step: TwoFactorStep, totpCode: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<AuthMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("auth") === "reset-password" ? "reset" : "login";
  });
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [twoFactorStep, setTwoFactorStep] = useState<AuthStep | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [verificationKind] = useState<"email" | "email-change" | null>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "verify-email") {
      return "email";
    }
    return params.get("auth") === "verify-email-change" ? "email-change" : null;
  });
  const [verificationToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return verificationKind === null ? null : params.get("token");
  });
  const [verificationState, setVerificationState] = useState<
    "checking" | "success" | "error" | null
  >(verificationToken === null ? null : "checking");
  const [resetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("auth") === "reset-password" ? params.get("token") : null;
  });

  useEffect(() => {
    if (verificationToken === null) {
      return;
    }
    let ignore = false;
    window.history.replaceState({}, "", window.location.pathname);
    const confirmation =
      verificationKind === "email-change"
        ? api.confirmEmailChange(verificationToken)
        : api.verifyEmail(verificationToken);
    confirmation
      .then(() => {
        if (!ignore) {
          setVerificationState("success");
        }
      })
      .catch(() => {
        if (!ignore) {
          setVerificationState("error");
        }
      });
    return () => {
      ignore = true;
    };
  }, [verificationKind, verificationToken]);

  useEffect(() => {
    if (resetToken !== null) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [resetToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    if (mode === "forgot" || mode === "reset") {
      setEmailMessage(null);
    }
    if (twoFactorStep?.kind === "setup" || twoFactorStep?.kind === "verify") {
      await onVerifyTwoFactor(twoFactorStep, totpCode);
    } else if (mode === "login") {
      setTwoFactorStep(await onLogin(email, password));
    } else if (mode === "register") {
      const registered = await onRegister({ email, firstName, lastName, password });
      if (registered) {
        setMode("login");
        setPassword("");
      }
    } else if (mode === "forgot") {
      try {
        const result = await api.forgotPassword(email);
        setEmailMessage(result.message);
        setRecoverySent(true);
      } catch (error) {
        setEmailMessage(describeError(error));
      }
    } else if (password !== confirmPassword) {
      setEmailMessage("Le password non coincidono.");
    } else if (resetToken === null) {
      setEmailMessage("Il link di recupero non e valido.");
    } else {
      try {
        const result = await api.resetPassword(resetToken, password);
        setEmailMessage(result.message);
        setResetComplete(true);
      } catch (error) {
        setEmailMessage(describeError(error));
      }
    }
    setSubmitting(false);
  }

  async function handleResendVerification(): Promise<void> {
    if (twoFactorStep?.kind !== "email") {
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.resendVerificationEmail(twoFactorStep.email);
      setEmailMessage(result.message);
    } catch (error) {
      setEmailMessage(describeError(error));
    } finally {
      setSubmitting(false);
    }
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
                  : twoFactorStep?.kind === "email" || verificationState !== null
                    ? "Verifica email"
                    : mode === "forgot" || mode === "reset"
                      ? "Recupera accesso"
                      : mode === "login"
                        ? "Bentornato"
                        : "Nuovo iscritto"}
            </p>
            <h2>
              {twoFactorStep?.kind === "setup"
                ? "Configura il 2FA"
                : twoFactorStep?.kind === "verify"
                  ? "Conferma accesso"
                  : twoFactorStep?.kind === "email"
                    ? "Controlla la posta"
                    : verificationState === "checking"
                      ? "Verifica in corso"
                      : verificationState === "success"
                        ? verificationKind === "email-change"
                          ? "Indirizzo aggiornato"
                          : "Email confermata"
                        : verificationState === "error"
                          ? "Link non valido"
                          : mode === "forgot"
                            ? "Recupera la password"
                            : mode === "reset"
                              ? "Scegli una nuova password"
                              : mode === "login"
                                ? "Entra nell'area utente"
                                : "Crea account utente"}
            </h2>
            {mode === "forgot" && twoFactorStep === null ? (
              <p className="muted">
                L'email e il tuo identificativo di accesso. Se non la ricordi, contatta la
                segreteria MAKA.
              </p>
            ) : null}
          </div>

          {twoFactorStep === null &&
          verificationState === null &&
          (mode === "login" || mode === "register") ? (
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
              {notice.tone === "success" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : notice.tone === "info" ? (
                <MailCheck aria-hidden="true" />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              <span>{notice.message}</span>
            </div>
          ) : null}

          {emailMessage !== null &&
          ((mode === "forgot" && !recoverySent) ||
            (mode === "reset" && !resetComplete)) ? (
            <div className="notice notice-error" role="alert">
              <XCircle aria-hidden="true" />
              <span>{emailMessage}</span>
            </div>
          ) : null}

          {verificationState !== null ? (
            <div className="two-factor-setup" role="status" aria-live="polite">
              {verificationState === "checking" ? <p>Stiamo verificando il link.</p> : null}
              {verificationState === "success" ? (
                <>
                  <CheckCircle2 aria-hidden="true" />
                  <p>
                    {verificationKind === "email-change"
                      ? "Il nuovo indirizzo email e confermato. Accedi di nuovo per continuare."
                      : "Il tuo indirizzo email e confermato. Ora puoi usare l'app normalmente."}
                  </p>
                  <button
                    className="secondary-action"
                    onClick={() => window.location.assign(window.location.pathname)}
                    type="button"
                  >
                    Continua
                  </button>
                </>
              ) : null}
              {verificationState === "error" ? (
                <>
                  <XCircle aria-hidden="true" />
                  <p>Il link e scaduto o e gia stato utilizzato.</p>
                  <button
                    className="secondary-action"
                    onClick={() => window.location.assign(window.location.pathname)}
                    type="button"
                  >
                    Torna al login
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {twoFactorStep?.kind === "email" ? (
            <div className="two-factor-setup" role="status" aria-live="polite">
              <CheckCircle2 aria-hidden="true" />
              <p>Abbiamo inviato il link di conferma a {twoFactorStep.email}.</p>
              {emailMessage !== null ? <p>{emailMessage}</p> : null}
              <button
                className="secondary-action"
                disabled={submitting}
                onClick={handleResendVerification}
                type="button"
              >
                Invia di nuovo
              </button>
            </div>
          ) : null}

          {mode === "forgot" && recoverySent ? (
            <div className="two-factor-setup" role="status" aria-live="polite">
              <CheckCircle2 aria-hidden="true" />
              <p>{emailMessage}</p>
            </div>
          ) : null}

          {mode === "reset" && resetComplete ? (
            <div className="two-factor-setup" role="status" aria-live="polite">
              <CheckCircle2 aria-hidden="true" />
              <p>{emailMessage}</p>
            </div>
          ) : null}

          {mode === "register" && twoFactorStep === null && verificationState === null ? (
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

          {twoFactorStep === null &&
          verificationState === null &&
          mode !== "reset" &&
          !recoverySent ? (
            <label className="field">
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
            </label>
          ) : null}

          {twoFactorStep === null &&
          verificationState === null &&
          mode !== "forgot" &&
          !resetComplete ? (
            <PasswordField
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              id="auth-password"
              label="Password"
              minLength={mode === "register" || mode === "reset" ? 12 : undefined}
              name="password"
              onChange={setPassword}
              value={password}
            />
          ) : null}

          {mode === "reset" && !resetComplete ? (
            <PasswordField
              autoComplete="new-password"
              id="auth-confirm-password"
              label="Conferma password"
              minLength={12}
              name="confirmPassword"
              onChange={setConfirmPassword}
              value={confirmPassword}
            />
          ) : null}

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

          {twoFactorStep?.kind === "setup" || twoFactorStep?.kind === "verify" ? (
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

          {twoFactorStep?.kind !== "email" &&
          verificationState === null &&
          !recoverySent &&
          !resetComplete ? (
            <button className="primary-action" disabled={submitting} type="submit">
              <span>
                {submitting
                  ? "Operazione in corso"
                  : twoFactorStep?.kind === "setup"
                    ? "Attiva e accedi"
                  : twoFactorStep?.kind === "verify"
                    ? "Conferma codice"
                    : mode === "forgot"
                      ? "Invia istruzioni"
                      : mode === "reset"
                        ? "Aggiorna password"
                        : mode === "login"
                          ? "Entra nell'area utente"
                          : "Crea account"}
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
          {mode === "login" && twoFactorStep === null && verificationState === null ? (
            <button
              className="secondary-action"
              onClick={() => {
                setMode("forgot");
                setEmailMessage(null);
              }}
              type="button"
            >
              Password dimenticata?
            </button>
          ) : null}
          {(mode === "forgot" || mode === "reset") && twoFactorStep === null ? (
            <button
              className="secondary-action"
              onClick={() => {
                setMode("login");
                setRecoverySent(false);
                setResetComplete(false);
                setEmailMessage(null);
                setPassword("");
                setConfirmPassword("");
              }}
              type="button"
            >
              Torna al login
            </button>
          ) : null}
          {twoFactorStep !== null ? (
            <button
              className="secondary-action"
              onClick={() => {
                setTwoFactorStep(null);
                setTotpCode("");
                setEmailMessage(null);
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
          <span className="mobile-action-label">Esci</span>
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

function PasswordField({
  autoComplete,
  id,
  label,
  minLength,
  name,
  onChange,
  value,
}: {
  autoComplete: string;
  id: string;
  label: string;
  minLength?: number;
  name?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? `Nascondi ${label.toLowerCase()}` : `Mostra ${label.toLowerCase()}`;

  return (
    <div className="field password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input-wrap">
        <input
          autoComplete={autoComplete}
          id={id}
          minLength={minLength}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={toggleLabel}
          aria-pressed={visible}
          className="password-visibility-toggle"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
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

  const sessionMonthKeys = [...new Set(sessions.map((session) => monthKey(session.occurs_on)))];
  const selectedMonthKey = monthKey(selectedSession.occurs_on);
  const sessionsInSelectedMonth = sessions.filter(
    (session) => monthKey(session.occurs_on) === selectedMonthKey,
  );
  const datesInSelectedMonth = [...new Set(
    sessionsInSelectedMonth.map((session) => session.occurs_on),
  )];
  const sessionsOnSelectedDate = sessionsInSelectedMonth.filter(
    (session) => session.occurs_on === selectedSession.occurs_on,
  );

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

      <details className="course-booking-disclosure">
        <summary aria-label={`Apri menu Prenota per ${course.title}`}>
          <CalendarCheck aria-hidden="true" />
          <span>Prenota</span>
          <small>Scegli data e orario</small>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="course-booking-panel">
        <div className="session-booking-control">
        <label className="session-picker session-picker-native">
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

        <div
          aria-label={`Scegli la lezione ${course.title}`}
          className="session-picker session-picker-mobile"
          role="group"
        >
          <span>
            <CalendarDays aria-hidden="true" />
            Scegli data e orario
          </span>
          <label className="session-month-picker">
            <span>Mese</span>
            <select
              aria-label={`Mese delle lezioni ${course.title}`}
              onChange={(event) => {
                const nextSession = sessions.find(
                  (session) => monthKey(session.occurs_on) === event.target.value,
                );
                if (nextSession !== undefined) {
                  setSelectedSessionKey(occurrenceKey(nextSession));
                }
              }}
              value={selectedMonthKey}
            >
              {sessionMonthKeys.map((availableMonth) => (
                <option key={availableMonth} value={availableMonth}>
                  {formatMonth(availableMonth)}
                </option>
              ))}
            </select>
          </label>
          <div
            aria-label={`Date disponibili per ${formatMonth(selectedMonthKey)}`}
            className="session-date-strip"
            role="group"
          >
            {datesInSelectedMonth.map((date) => {
              const dateValue = dateFromIso(date);
              const isSelected = date === selectedSession.occurs_on;
              const firstSessionOnDate = sessionsInSelectedMonth.find(
                (session) => session.occurs_on === date,
              );
              return (
                <button
                  aria-label={`${weekdays[dateValue.getDay()]} ${formatDate(date)}`}
                  aria-pressed={isSelected}
                  className={isSelected ? "session-date-option is-selected" : "session-date-option"}
                  key={date}
                  onClick={() => {
                    if (firstSessionOnDate !== undefined) {
                      setSelectedSessionKey(occurrenceKey(firstSessionOnDate));
                    }
                  }}
                  type="button"
                >
                  <span>{weekdays[dateValue.getDay()].slice(0, 3)}</span>
                  <strong>{dateValue.getDate()}</strong>
                </button>
              );
            })}
          </div>
          <div
            aria-label={`Orari del ${formatDate(selectedSession.occurs_on)}`}
            className="session-time-list"
            role="group"
          >
            <span className="session-subheading">Orario</span>
            <div
              className={
                sessionsOnSelectedDate.length > 4
                  ? "session-time-options is-scrollable"
                  : "session-time-options"
              }
            >
              {sessionsOnSelectedDate.map((session) => {
                const sessionBooking = bookingForOccurrence(bookings, session);
                const isSelected = occurrenceKey(session) === selectedSessionKey;
                const availability =
                  sessionBooking !== undefined
                    ? bookedActionLabel(sessionBooking)
                    : session.available_spots > 0
                      ? `${session.available_spots} posti liberi`
                      : "Lista d’attesa";
                return (
                  <button
                    aria-pressed={isSelected}
                    className={isSelected ? "session-option is-selected" : "session-option"}
                    key={occurrenceKey(session)}
                    onClick={() => setSelectedSessionKey(occurrenceKey(session))}
                    type="button"
                  >
                    <span className="session-option-main">
                      <strong>{formatTime(session.starts_at)} - {formatTime(session.ends_at)}</strong>
                      <span>{availability}</span>
                    </span>
                    {isSelected ? <span className="session-option-status">Selezionato</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

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
        </div>
      </details>
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

function AccountSettingsPanel({
  onPasswordChanged,
  onResendVerification,
  token,
  user,
}: {
  onPasswordChanged: () => void;
  onResendVerification: (email: string) => Promise<void>;
  token: string;
  user: User;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState<"email" | "password" | "verify" | null>(null);
  const isVerified = user.email_verified !== false;

  async function handleEmailChange(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    setSending("email");
    try {
      const result = await api.requestEmailChange(user.email, emailPassword, newEmail);
      setMessage(result.message);
      setEmailPassword("");
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setSending(null);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("Le nuove password non coincidono.");
      return;
    }
    setMessage(null);
    setSending("password");
    try {
      const result = await api.changePassword(token, currentPassword, newPassword);
      setMessage(result.message);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onPasswordChanged();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setSending(null);
    }
  }

  async function handleResend(): Promise<void> {
    setMessage(null);
    setSending("verify");
    try {
      await onResendVerification(user.email);
      setMessage("Ti abbiamo inviato un nuovo link di conferma.");
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setSending(null);
    }
  }

  return (
    <section className="panel compact-panel account-settings-panel" aria-labelledby="account-settings-title">
      <SectionTitle icon={<UserRound aria-hidden="true" />} title="Il tuo profilo" id="account-settings-title" />
      <div className={isVerified ? "email-verification is-verified" : "email-verification"}>
        <div>
          <strong>{isVerified ? "Email verificata" : "Email da verificare"}</strong>
          <p>{user.email}</p>
        </div>
        {isVerified ? <ShieldCheck aria-hidden="true" /> : <MailCheck aria-hidden="true" />}
      </div>
      {!isVerified ? (
        <button
          className="secondary-action"
          disabled={sending !== null}
          onClick={() => void handleResend()}
          type="button"
        >
          <MailCheck aria-hidden="true" />
          {sending === "verify" ? "Invio in corso" : "Invia link di conferma"}
        </button>
      ) : null}

      <details className="account-settings-disclosure">
        <summary>Modifica indirizzo email</summary>
        <form onSubmit={handleEmailChange}>
          <label className="field">
            <span>Nuovo indirizzo email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setNewEmail(event.target.value)}
              required
              type="email"
              value={newEmail}
            />
          </label>
          <PasswordField
            autoComplete="current-password"
            id="account-email-password"
            label="Password attuale"
            onChange={setEmailPassword}
            value={emailPassword}
          />
          <button className="primary-action" disabled={sending !== null} type="submit">
            <MailCheck aria-hidden="true" />
            {sending === "email" ? "Invio in corso" : "Conferma nuovo indirizzo"}
          </button>
        </form>
      </details>

      <details className="account-settings-disclosure">
        <summary>Modifica password</summary>
        <form onSubmit={handlePasswordChange}>
          <PasswordField
            autoComplete="current-password"
            id="account-current-password"
            label="Password attuale"
            onChange={setCurrentPassword}
            value={currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            id="account-new-password"
            label="Nuova password"
            minLength={12}
            onChange={setNewPassword}
            value={newPassword}
          />
          <PasswordField
            autoComplete="new-password"
            id="account-confirm-password"
            label="Conferma nuova password"
            minLength={12}
            onChange={setConfirmPassword}
            value={confirmPassword}
          />
          <button className="primary-action" disabled={sending !== null} type="submit">
            <LockKeyhole aria-hidden="true" />
            {sending === "password" ? "Aggiornamento in corso" : "Aggiorna password"}
          </button>
        </form>
      </details>
      {message !== null ? <p className="account-settings-message" role="status">{message}</p> : null}
    </section>
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
        aria-current={activeView === "training" ? "page" : undefined}
        onClick={() => onChange("training")}
        type="button"
      >
        <Dumbbell aria-hidden="true" />
        <span>Allenamento</span>
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
