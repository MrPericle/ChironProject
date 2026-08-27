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

export type LoginResult = TokenPair | TwoFactorChallenge | TwoFactorSetupRequired;

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

export type CourseStatus = "draft" | "published" | "archived";
export type CourseDiscipline =
  | "calisthenics"
  | "martial_arts"
  | "pole_dance"
  | "mobility"
  | "other";

export type AdminCourse = {
  id: string;
  location_id: string;
  instructor_user_id: string | null;
  title: string;
  description: string | null;
  discipline: CourseDiscipline;
  image_url: string | null;
  status: CourseStatus;
  sessions: CourseSession[];
};

export type CoursePayload = {
  location_id: string;
  title: string;
  description: string | null;
  discipline: CourseDiscipline;
  status: CourseStatus;
};

export type CourseUpdatePayload = Partial<CoursePayload>;

export type CourseSessionPayload = {
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  cancellation_deadline_hours: number;
};

export type CourseSession = CourseSessionPayload & {
  id: string;
  course_id: string;
  is_active: boolean;
};

export type CourseSchedulePayload = Omit<CourseSessionPayload, "weekday"> & {
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

export type UserDashboard = {
  user: User;
  courses: CatalogCourse[];
  bookings: Booking[];
  subscription: SubscriptionInfo | null;
};

export type AdminDashboard = {
  locations: Location[];
  courses: AdminCourse[];
  subscriptions: AdminSubscriptionInfo[];
  users: AdminUser[];
  stats: AdminStats;
};

type RequestOptions = {
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

  async register(payload: RegisterPayload): Promise<TokenPair> {
    return this.request<TokenPair>("/auth/register", {
      method: "POST",
      body: payload,
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
      this.request<CatalogCourse[]>("/courses", { token }),
      this.request<Booking[]>("/bookings/me", { token }),
      this.request<SubscriptionInfo | null>("/subscriptions/me", { token }),
    ]);

    return { user, courses, bookings, subscription };
  }

  async adminDashboard(token: string): Promise<AdminDashboard> {
    const [locations, courses, subscriptions, users, stats] = await Promise.all([
      this.request<Location[]>("/admin/locations", { token }),
      this.request<AdminCourse[]>("/admin/courses", { token }),
      this.request<AdminSubscriptionInfo[]>("/admin/subscriptions", { token }),
      this.request<AdminUser[]>("/admin/users", { token }),
      this.request<AdminStats>("/admin/stats", { token }),
    ]);

    return { locations, courses, subscriptions, users, stats };
  }

  async createLocation(token: string, payload: LocationPayload): Promise<Location> {
    return this.request<Location>("/admin/locations", {
      method: "POST",
      token,
      body: payload,
    });
  }

  async deactivateLocation(token: string, locationId: string): Promise<Location> {
    return this.request<Location>(`/admin/locations/${locationId}`, {
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

  async deleteAdminUser(token: string, userId: string): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${userId}`, {
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
    return this.request<AdminCourse>(`/admin/courses/${courseId}`, {
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

  async uploadCourseImage(token: string, courseId: string, image: File): Promise<AdminCourse> {
    const body = new FormData();
    body.append("image", image);
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

    if (!response.ok) {
      throw new ApiError(await errorMessage(response), response.status);
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
