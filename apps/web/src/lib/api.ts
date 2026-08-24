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

export type CatalogSession = {
  id: string;
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
  sessions: CatalogSession[];
};

export type BookingStatus = "confirmed" | "cancelled" | "waitlisted";

export type Booking = {
  id: string;
  user_id: string;
  course_session_id: string;
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

export type UserDashboard = {
  user: User;
  courses: CatalogCourse[];
  bookings: Booking[];
  subscription: SubscriptionInfo | null;
};

type RequestOptions = {
  token?: string;
  body?: unknown;
  method?: "GET" | "POST" | "DELETE";
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

  async login(payload: LoginPayload): Promise<TokenPair> {
    return this.request<TokenPair>("/auth/login", {
      method: "POST",
      body: payload,
    });
  }

  async register(payload: RegisterPayload): Promise<TokenPair> {
    return this.request<TokenPair>("/auth/register", {
      method: "POST",
      body: payload,
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

  async createBooking(token: string, courseSessionId: string): Promise<Booking> {
    return this.request<Booking>("/bookings", {
      method: "POST",
      token,
      body: { course_session_id: courseSessionId },
    });
  }

  async cancelBooking(token: string, bookingId: string): Promise<Booking> {
    return this.request<Booking>(`/bookings/${bookingId}`, {
      method: "DELETE",
      token,
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await (this.fetcher ?? fetch)(`${this.baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: this.headers(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
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

    if (options.body !== undefined) {
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
