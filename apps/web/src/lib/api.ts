export type UserRole = "admin" | "staff" | "user";

export type User = {
  id: string;
  email: string;
  role: UserRole;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: User;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = LoginPayload & {
  first_name: string;
  last_name: string;
};

export type TwoFactorChallenge = {
  requires_2fa: true;
  challenge_token: string;
};

export type TwoFactorSetupRequired = {
  requires_2fa_setup: true;
  setup_token: string;
};

export type TwoFactorSetup = {
  secret: string;
  otpauth_uri: string;
};

export type EmailVerificationRequired = {
  requires_email_verification: true;
};

export type MessageResponse = {
  message: string;
};

export type LoginResult =
  | TokenPair
  | TwoFactorChallenge
  | TwoFactorSetupRequired
  | EmailVerificationRequired;

export type CatalogSession = {
  id: string;
  occurs_on: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  available_spots: number;
};

export type CatalogCourse = {
  id: string;
  location_id: string;
  location_name: string;
  title: string;
  description: string | null;
  discipline: CourseDiscipline;
  image_url: string | null;
  requires_active_subscription: boolean;
  sessions: CatalogSession[];
};

export type BookingStatus = "confirmed" | "cancelled" | "waitlisted";

export type Booking = {
  id: string;
  user_id: string;
  course_session_id: string;
  occurs_on: string;
  status: BookingStatus;
  created_at: string;
  cancelled_at: string | null;
};

export type SubscriptionInfo = {
  starts_on: string;
  duration_days: number;
  expires_on: string;
  is_active: boolean;
};

export type AdminSubscriptionInfo = SubscriptionInfo & {
  id: string;
  user_id: string;
  user_email: string;
};

export type UserStatus = "active" | "disabled" | "deleted";

export type AdminUserSubscription = SubscriptionInfo & {
  id: string;
};

export type AdminUser = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  birth_date: string | null;
  subscription: AdminUserSubscription | null;
};

export type AdminUserPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  birth_date?: string | null;
  role: UserRole;
};

export type AdminUserUpdatePayload = Partial<Omit<AdminUserPayload, "password">> & {
  status?: UserStatus;
};

export type AdminSubscriptionPayload = {
  starts_on: string;
  duration_days: number;
};

export type Location = {
  id: string;
  name: string;
  address: string;
  city: string;
  is_active: boolean;
};

export type LocationPayload = {
  name: string;
  address: string;
  city: string;
};

export type LocationUpdatePayload = Partial<LocationPayload> & {
  is_active?: boolean;
};

export type LocationCascadeResult = Location & {
  deleted_course_count: number;
};

export type LocationDeleteResult = {
  id: string;
  deleted: true;
  deleted_course_count: number;
};

export type CourseStatus = "draft" | "published" | "archived";
export type CourseDiscipline = string;

export type CourseDisciplineOption = {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
};

export type AdminCourse = {
  id: string;
  location_id: string;
  instructor_user_id: string | null;
  title: string;
  description: string | null;
  discipline: CourseDiscipline;
  image_url: string | null;
  requires_active_subscription: boolean;
  status: CourseStatus;
  sessions: CourseSession[];
};

export type CoursePayload = {
  location_id: string;
  title: string;
  description: string | null;
  discipline: CourseDiscipline;
  requires_active_subscription: boolean;
  status: CourseStatus;
};

export type CourseUpdatePayload = Partial<CoursePayload>;

export type CourseSessionPayload = {
  weekday?: number;
  occurs_on?: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  cancellation_deadline_hours: number;
};

export type CourseSession = Omit<CourseSessionPayload, "weekday" | "occurs_on"> & {
  id: string;
  course_id: string;
  weekday: number;
  occurs_on: string | null;
  is_active: boolean;
};

export type CourseSchedulePayload = Omit<CourseSessionPayload, "weekday" | "occurs_on"> & {
  weekdays: number[];
};

export type AdminStatsItem = {
  id: string;
  name: string;
  member_count: number;
};

export type AdminStats = {
  active_members: number;
  courses: AdminStatsItem[];
  locations: AdminStatsItem[];
};

export type AdminCourseSessionAttendee = {
  booking_id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: Exclude<BookingStatus, "cancelled">;
};

export type AdminCourseSessionAvailability = {
  course_session_id: string;
  occurs_on: string;
  capacity: number;
  confirmed_count: number;
  waitlisted_count: number;
  available_spots: number;
};

export type UserDashboard = {
  user: User;
  courses: CatalogCourse[];
  bookings: Booking[];
  subscription: SubscriptionInfo | null;
};

export type AdminDashboard = {
  locations: Location[];
  courses: AdminCourse[];
  disciplines: CourseDisciplineOption[];
  subscriptions: AdminSubscriptionInfo[];
  users: AdminUser[];
  stats: AdminStats;
};

export type CourseDeleteResult = {
  id: string;
  deleted: true;
};

type RequestOptions = {
  acceptedStatuses?: number[];
  token?: string;
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export class ChironApi {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher?: typeof fetch,
  ) {}

  async login(payload: LoginPayload): Promise<LoginResult> {
    return this.request<LoginResult>("/auth/login", {
      acceptedStatuses: [403],
      method: "POST",
      body: payload,
    });
  }

  async verifyTwoFactor(challengeToken: string, totpCode: string): Promise<TokenPair> {
    return this.request<TokenPair>("/auth/2fa/verify", {
      method: "POST",
      body: { challenge_token: challengeToken, totp_code: totpCode },
    });
  }

  async setupTwoFactor(setupToken: string): Promise<TwoFactorSetup> {
    return this.request<TwoFactorSetup>("/auth/2fa/setup", {
      method: "POST",
      body: { setup_token: setupToken },
    });
  }

  async confirmTwoFactor(setupToken: string, totpCode: string): Promise<TokenPair> {
    return this.request<TokenPair>("/auth/2fa/confirm", {
      method: "POST",
      body: { setup_token: setupToken, totp_code: totpCode },
    });
  }

  async register(payload: RegisterPayload): Promise<MessageResponse> {
    return this.request<MessageResponse>("/auth/register", {
      method: "POST",
      body: payload,
    });
  }

  async verifyEmail(token: string): Promise<MessageResponse> {
    return this.request<MessageResponse>("/auth/email/verify", {
      method: "POST",
      body: { token },
    });
  }

  async resendVerificationEmail(email: string): Promise<MessageResponse> {
    return this.request<MessageResponse>("/auth/email/resend", {
      method: "POST",
      body: { email },
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    return this.request<TokenPair>("/auth/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
  }

  async dashboard(token: string): Promise<UserDashboard> {
    const [user, courses, bookings, subscription] = await Promise.all([
      this.request<User>("/auth/me", { token }),
      this.catalog(token),
      this.request<Booking[]>("/bookings/me", { token }),
      this.request<SubscriptionInfo | null>("/subscriptions/me", { token }),
    ]);

    return { user, courses, bookings, subscription };
  }

  async catalog(token: string): Promise<CatalogCourse[]> {
    return this.request<CatalogCourse[]>("/courses", { token });
  }

  async adminDashboard(token: string, role: UserRole): Promise<AdminDashboard> {
    const [locations, courses, disciplines, stats] = await Promise.all([
      this.request<Location[]>("/admin/locations", { token }),
      this.request<AdminCourse[]>("/admin/courses", { token }),
      this.request<CourseDisciplineOption[]>("/admin/disciplines", { token }),
      this.request<AdminStats>("/admin/stats", { token }),
    ]);

    if (role !== "admin") {
      return { locations, courses, disciplines, subscriptions: [], users: [], stats };
    }

    const [subscriptions, users] = await Promise.all([
      this.request<AdminSubscriptionInfo[]>("/admin/subscriptions", { token }),
      this.request<AdminUser[]>("/admin/users", { token }),
    ]);

    return { locations, courses, disciplines, subscriptions, users, stats };
  }

  async adminStats(token: string): Promise<AdminStats> {
    return this.request<AdminStats>("/admin/stats", { token });
  }

  async createLocation(token: string, payload: LocationPayload): Promise<Location> {
    return this.request<Location>("/admin/locations", {
      method: "POST",
      token,
      body: payload,
    });
  }

  async deactivateLocation(token: string, locationId: string): Promise<LocationCascadeResult> {
    return this.request<LocationCascadeResult>(`/admin/locations/${locationId}/deactivate`, {
      method: "POST",
      token,
    });
  }

  async deleteLocation(token: string, locationId: string): Promise<LocationDeleteResult> {
    return this.request<LocationDeleteResult>(`/admin/locations/${locationId}`, {
      method: "DELETE",
      token,
    });
  }

  async updateLocation(
    token: string,
    locationId: string,
    payload: LocationUpdatePayload,
  ): Promise<Location> {
    return this.request<Location>(`/admin/locations/${locationId}`, {
      method: "PATCH",
      token,
      body: payload,
    });
  }

  async createAdminUser(token: string, payload: AdminUserPayload): Promise<AdminUser> {
    return this.request<AdminUser>("/admin/users", {
      method: "POST",
      token,
      body: payload,
    });
  }

  async updateAdminUser(
    token: string,
    userId: string,
    payload: AdminUserUpdatePayload,
  ): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${userId}`, {
      method: "PATCH",
      token,
      body: payload,
    });
  }

  async deleteAdminUser(token: string, userId: string): Promise<void> {
    return this.request<void>(`/admin/users/${userId}`, {
      method: "DELETE",
      token,
    });
  }

  async createAdminSubscription(
    token: string,
    userId: string,
    payload: AdminSubscriptionPayload,
  ): Promise<AdminUserSubscription> {
    return this.request<AdminUserSubscription>(`/admin/users/${userId}/subscriptions`, {
      method: "POST",
      token,
      body: payload,
    });
  }

  async updateAdminSubscription(
    token: string,
    subscriptionId: string,
    payload: Partial<AdminSubscriptionPayload>,
  ): Promise<AdminUserSubscription> {
    return this.request<AdminUserSubscription>(`/admin/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      token,
      body: payload,
    });
  }

  async createCourse(token: string, payload: CoursePayload): Promise<AdminCourse> {
    return this.request<AdminCourse>("/admin/courses", {
      method: "POST",
      token,
      body: payload,
    });
  }

  async createCourseDiscipline(
    token: string,
    name: string,
  ): Promise<CourseDisciplineOption> {
    return this.request<CourseDisciplineOption>("/admin/disciplines", {
      method: "POST",
      token,
      body: { name },
    });
  }

  async updateCourse(
    token: string,
    courseId: string,
    payload: CourseUpdatePayload,
  ): Promise<AdminCourse> {
    return this.request<AdminCourse>(`/admin/courses/${courseId}`, {
      method: "PATCH",
      token,
      body: payload,
    });
  }

  async archiveCourse(token: string, courseId: string): Promise<AdminCourse> {
    return this.request<AdminCourse>(`/admin/courses/${courseId}/archive`, {
      method: "POST",
      token,
    });
  }

  async deleteCourse(token: string, courseId: string): Promise<CourseDeleteResult> {
    return this.request<CourseDeleteResult>(`/admin/courses/${courseId}`, {
      method: "DELETE",
      token,
    });
  }

  async createCourseSession(
    token: string,
    courseId: string,
    payload: CourseSessionPayload,
  ): Promise<CourseSession> {
    return this.request<CourseSession>(`/admin/courses/${courseId}/sessions`, {
      method: "POST",
      token,
      body: payload,
    });
  }

  async createCourseSchedule(
    token: string,
    courseId: string,
    payload: CourseSchedulePayload,
  ): Promise<CourseSession[]> {
    return this.request<CourseSession[]>(`/admin/courses/${courseId}/schedule`, {
      method: "POST",
      token,
      body: payload,
    });
  }

  async updateCourseSession(
    token: string,
    sessionId: string,
    payload: Partial<CourseSessionPayload> & { is_active?: boolean },
  ): Promise<CourseSession> {
    return this.request<CourseSession>(`/admin/course-sessions/${sessionId}`, {
      method: "PATCH",
      token,
      body: payload,
    });
  }

  async deactivateCourseSession(token: string, sessionId: string): Promise<CourseSession> {
    return this.request<CourseSession>(`/admin/course-sessions/${sessionId}`, {
      method: "DELETE",
      token,
    });
  }

  async courseSessionAttendees(
    token: string,
    sessionId: string,
    occursOn: string,
  ): Promise<AdminCourseSessionAttendee[]> {
    return this.request<AdminCourseSessionAttendee[]>(
      `/admin/course-sessions/${sessionId}/attendees?occurs_on=${encodeURIComponent(occursOn)}`,
      { token },
    );
  }

  async adminCalendarAvailability(
    token: string,
    occursOn: string,
  ): Promise<AdminCourseSessionAvailability[]> {
    return this.request<AdminCourseSessionAvailability[]>(
      `/admin/calendar/availability?occurs_on=${encodeURIComponent(occursOn)}`,
      { token },
    );
  }

  async uploadCourseImage(token: string, courseId: string, image: File): Promise<AdminCourse> {
    const body = new FormData();
    body.append("file", image);
    return this.request<AdminCourse>(`/admin/courses/${courseId}/image`, {
      method: "POST",
      token,
      body,
    });
  }

  async createBooking(
    token: string,
    courseSessionId: string,
    occursOn: string,
  ): Promise<Booking> {
    return this.request<Booking>("/bookings", {
      method: "POST",
      token,
      body: { course_session_id: courseSessionId, occurs_on: occursOn },
    });
  }

  async cancelBooking(token: string, bookingId: string): Promise<Booking> {
    return this.request<Booking>(`/bookings/${bookingId}`, {
      method: "DELETE",
      token,
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const body =
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body);
    const response = await (this.fetcher ?? fetch)(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: this.headers(options),
      body,
    });

    if (!response.ok && !options.acceptedStatuses?.includes(response.status)) {
      throw new ApiError(await errorMessage(response), response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private headers(options: RequestOptions): HeadersInit {
    const headers: HeadersInit = {
      Accept: "application/json",
    };

    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    if (options.token !== undefined) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    return headers;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
  } catch {
    return "Servizio momentaneamente non disponibile.";
  }

  return "Operazione non riuscita.";
}
