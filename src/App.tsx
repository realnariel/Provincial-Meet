import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { loadPublicData } from "./data";
import { isConfigured, supabase } from "./supabase";
import type { Coordinator, EventAward, MedalRow, MeetEvent, Team } from "./types";
import { HomePage, RankingsPage, EventsPage, TeamsPage } from "./PublicPages";

const ProvincialReportsPage = lazy(() =>
  import("./ProvincialReportsPage").then((m) => ({
    default: m.ProvincialReportsPage,
  })),
);
const LoginPage = lazy(() =>
  import("./StaffPages").then((m) => ({ default: m.LoginPage })),
);
const ManagePage = lazy(() =>
  import("./StaffPages").then((m) => ({ default: m.ManagePage })),
);
const OfficialScoringPage = lazy(() =>
  import("./WorkflowPages").then((m) => ({ default: m.OfficialScoringPage })),
);
const DelegationPage = lazy(() =>
  import("./WorkflowPages").then((m) => ({ default: m.DelegationPage })),
);

export interface AppData {
  teams: Team[];
  events: MeetEvent[];
  awards: EventAward[];
  tallies: MedalRow[];
}

const emptyData: AppData = { teams: [], events: [], awards: [], tallies: [] };

function currentPath() {
  if (
    typeof window !== "undefined" &&
    (window.location.hash.includes("access_token") ||
      window.location.search.includes("code="))
  ) {
    return "/login";
  }
  return window.location.pathname.replace(/\/$/, "") || "/";
}

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [data, setData] = useState<AppData>(emptyData);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Coordinator | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
  const desktopMenuCloseRef = useRef<HTMLButtonElement>(null);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setPath(currentPath());
    setReportOpen(false);
    setDesktopMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(`Sign-out failed: ${signOutError.message}`);
      return;
    }
    setSession(null);
    setProfile(null);
    setAuthNotice("You have signed out successfully.");
    navigate("/");
  }, [navigate]);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setError("");
    try {
      setData(await loadPublicData());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load meet data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void client.auth.getSession().then(({ data: result }) => {
      setSession(result.session);
      const hadAuthHash =
        window.location.hash.includes("access_token") ||
        window.location.search.includes("code=");
      if (hadAuthHash) {
        window.history.replaceState(null, "", "/login");
        setPath("/login");
      }
    });
    const { data: listener } = client.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_IN" && next?.user) {
        const hadAuthHash =
          window.location.hash.includes("access_token") ||
          window.location.search.includes("code=");
        if (hadAuthHash || window.location.pathname === "/login") {
          window.history.replaceState(null, "", "/login");
          setPath("/login");
        }
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Root-level auto-registration for pending coordinator requests
  useEffect(() => {
    if (!supabase || !session?.user || profile) return;
    const flow = sessionStorage.getItem("google_auth_flow");
    // If the user clicked "Sign in with Google", do not auto-register as pending sign-up!
    if (flow === "signin") return;

    const client = supabase;
    const email = session.user.email ?? "";
    const rawName =
      (session.user.user_metadata?.full_name as string | undefined) ||
      (session.user.user_metadata?.name as string | undefined) ||
      email.split("@")[0] ||
      "Coordinator";
    void Promise.resolve(
      client.from("prov_coordinator_requests").upsert(
        {
          auth_user_id: session.user.id,
          email,
          fullname: rawName,
          status: "pending",
        },
        { onConflict: "auth_user_id" },
      ),
    ).catch(() => {});
  }, [session, profile]);

  const reloadProfile = useCallback(async () => {
    if (!supabase || !session?.user) {
      setProfile(null);
      return;
    }
    const client = supabase;
    const { data: row, error: lookupError } = await client
      .from("prov_coordinators")
      .select("id,username,fullname,email,is_admin,auth_user_id,must_change_password")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    if (lookupError) {
      const { data: fallbackRow, error: fallbackError } = await client
        .from("prov_coordinators")
        .select("id,username,fullname,is_admin,auth_user_id,must_change_password")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (fallbackError) setError(fallbackError.message);
      setProfile(fallbackRow as Coordinator | null);
      return;
    }
    setProfile(row as Coordinator | null);
  }, [session]);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!authNotice) return;
    const timer = window.setTimeout(() => setAuthNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [authNotice]);

  useEffect(() => {
    if (!reportOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !mobileNavRef.current?.contains(event.target)
      )
        setReportOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReportOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [reportOpen]);

  useEffect(() => {
    if (!desktopMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    desktopMenuCloseRef.current?.focus();
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDesktopMenuOpen(false);
    };
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeEscape);
    };
  }, [desktopMenuOpen]);

  useEffect(() => {
    const item = mobileNavRef.current?.querySelector<HTMLElement>(
      ".mobile-nav-item.active",
    );
    item?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest",
    });
  }, [path]);

  const mobileLink = (
    to: string,
    label: string,
    icon: string,
    active = path === to,
  ) => (
    <a
      href={to}
      className={active ? "mobile-nav-item active" : "mobile-nav-item"}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      <i className={`bi ${icon}`} aria-hidden="true" />
      <span>{label}</span>
    </a>
  );

  const reportLink = (to: string, label: string) => (
    <a
      href={to}
      aria-current={path === to ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {label}
    </a>
  );

  const drawerLink = (
    to: string,
    label: string,
    icon: string,
    active = path === to,
  ) => (
    <a
      href={to}
      className={active ? "desktop-drawer-link active" : "desktop-drawer-link"}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      <i className={`bi ${icon}`} aria-hidden="true" />
      <span>{label}</span>
      <i className="bi bi-chevron-right drawer-chevron" aria-hidden="true" />
    </a>
  );

  const admin = Boolean(profile?.is_admin);
  const staff = Boolean(profile);
  const authRequired =
    path.startsWith("/manage") ||
    path.startsWith("/qualifiers") ||
    path.startsWith("/scoring") ||
    path.startsWith("/delegation") ||
    path.startsWith("/reports");

  let content: React.ReactNode;
  if (!isConfigured)
    content = (
      <section className="panel setup-panel">
        <h1>React app ready for the new database</h1>
        <p>
          The MVC site and its database are untouched. When your new Supabase
          project is ready, add its project URL and publishable key to{" "}
          <code>.env.local</code>.
        </p>
        <p>
          The matching <code>prov_*</code> schema is in{" "}
          <code>supabase/schema.sql</code>.
        </p>
      </section>
    );
  else if (loading)
    content = (
      <div className="panel state-message" role="status">
        Loading meet data…
      </div>
    );
  else if (authRequired && !staff)
    content = (
      <section className="panel state-message">
        <h1>Sign-in required</h1>
        <p>Sign in to manage events and view staff reports.</p>
        <button onClick={() => navigate("/login")}>Sign in</button>
      </section>
    );
  else if (path === "/") content = <HomePage data={data} navigate={navigate} />;
  else if (path === "/rankings")
    content = <RankingsPage data={data} refresh={refresh} />;
  else if (path === "/events")
    content = (
      <EventsPage
        data={data}
        profile={profile}
        admin={admin}
        navigate={navigate}
      />
    );
  else if (path.startsWith("/scoring/"))
    content = (
      <OfficialScoringPage
        data={data}
        eventId={Number(path.split("/")[2])}
        profile={profile!}
        refresh={refresh}
        navigate={navigate}
      />
    );
  else if (path.startsWith("/delegation/"))
    content = (
      <DelegationPage
        data={data}
        eventId={Number(path.split("/")[2])}
        profile={profile!}
        navigate={navigate}
      />
    );
  else if (path === "/teams" || path.startsWith("/teams/"))
    content = <TeamsPage data={data} path={path} navigate={navigate} />;
  else if (path === "/login")
    content = (
      <LoginPage
        profile={profile}
        session={session}
        navigate={navigate}
        onSignOut={signOut}
        onCheckStatus={reloadProfile}
      />
    );
  else if (
    path === "/manage" ||
    path === "/manage/coordinators" ||
    path === "/manage/assignments"
  )
    content = admin ? (
      <ManagePage
        data={data}
        profile={profile!}
        admin={admin}
        section={
          path.endsWith("/coordinators")
            ? "coordinators"
            : path.endsWith("/assignments")
              ? "assignments"
              : "events"
        }
        refresh={refresh}
        navigate={navigate}
      />
    ) : (
      <section className="panel state-message">
        <h1>Administrator access required</h1>
        <button onClick={() => navigate("/events")}>View events</button>
      </section>
    );
  else if (path.startsWith("/qualifiers/"))
    content = (
      <DelegationPage
        data={data}
        eventId={Number(path.split("/")[2])}
        profile={profile!}
        navigate={navigate}
      />
    );
  else if (path.startsWith("/reports"))
    content = (
      <ProvincialReportsPage
        data={data}
        path={path}
        admin={admin}
        navigate={navigate}
      />
    );
  else
    content = (
      <section className="panel state-message">
        <h1>Page not found</h1>
        <button onClick={() => navigate("/")}>Go home</button>
      </section>
    );

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            href="/"
            className="brand"
            onClick={(event) => {
              event.preventDefault();
              navigate("/");
            }}
          >
            <span className="brand-logos">
              <img
                src="/images/deped_logo.png"
                alt="DepEd"
                className="brand-logo-deped"
              />
              <img src="/images/r7_logo.png" alt="DepEd Region VII" />
              <img src="/images/bohol_logo.png" alt="Province of Bohol" />
              <img src="/images/sdobohol_logo.png" alt="SDO Bohol" />
              <img
                src="/images/candijay_logo.png"
                alt="Municipality of Candijay"
              />
              <img
                src="/images/candijay_district_logo.png"
                alt="Candijay District"
              />
            </span>
            <span className="brand-title">
              <strong>Bohol Provincial</strong>
              <small>Athletic Meet</small>
            </span>
          </a>
          <button
            type="button"
            className="desktop-menu-toggle"
            aria-label="Open menu"
            aria-expanded={desktopMenuOpen}
            aria-controls="desktopMenuDrawer"
            onClick={() => setDesktopMenuOpen(true)}
          >
            <i className="bi bi-list" aria-hidden="true" />
          </button>
        </div>
      </header>
      {desktopMenuOpen && (
        <div className="desktop-menu-layer">
          <button
            type="button"
            className="desktop-menu-scrim"
            aria-label="Close menu"
            onClick={() => setDesktopMenuOpen(false)}
          />
          <aside
            className="desktop-menu-drawer"
            id="desktopMenuDrawer"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
          >
            <div className="desktop-menu-heading">
              <h2>
                <i className="bi bi-grid-fill" aria-hidden="true" /> Menu
              </h2>
              <button
                type="button"
                ref={desktopMenuCloseRef}
                aria-label="Close menu"
                onClick={() => setDesktopMenuOpen(false)}
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>
            <nav className="desktop-drawer-nav" aria-label="Main menu links">
              {drawerLink("/", "Home", "bi-house-door-fill")}
              {drawerLink("/rankings", "Rankings", "bi-trophy-fill")}
              {drawerLink(
                "/events",
                "Events",
                "bi-calendar-event-fill",
                path === "/events" ||
                  path.startsWith("/scoring") ||
                  path.startsWith("/delegation"),
              )}
              {drawerLink(
                "/teams",
                "Teams",
                "bi-people-fill",
                path.startsWith("/teams"),
              )}

              <div className="desktop-menu-section">
                <span>
                  <i className="bi bi-shield-lock-fill" aria-hidden="true" />{" "}
                  Account
                </span>
                {profile && (
                  <p>
                    Logged in as:<strong>{profile.fullname}</strong>
                  </p>
                )}
              </div>

              {admin &&
                drawerLink(
                  "/manage/coordinators",
                  "Coordinators",
                  "bi-person-badge-fill",
                )}
              {admin &&
                drawerLink(
                  "/manage",
                  "Manage Events",
                  "bi-sliders",
                  path === "/manage" || path === "/manage/assignments",
                )}
              {staff && (
                <div className="desktop-report-group">
                  <div
                    className={
                      path.startsWith("/reports")
                        ? "desktop-drawer-link active desktop-report-label"
                        : "desktop-drawer-link desktop-report-label"
                    }
                  >
                    <i
                      className="bi bi-file-earmark-bar-graph-fill"
                      aria-hidden="true"
                    />
                    <span>Official Reports</span>
                    <i
                      className="bi bi-chevron-down drawer-chevron"
                      aria-hidden="true"
                    />
                  </div>
                  <div
                    className="desktop-report-links"
                    aria-label="Official report pages"
                  >
                    {admin &&
                      reportLink("/reports/general", "General Official Report")}
                    {admin &&
                      reportLink(
                        "/reports/results",
                        "All Events Results Report",
                      )}
                    {admin &&
                      reportLink("/reports/pending", "Pending Events Report")}
                    {reportLink(
                      "/reports/qualifiers",
                      "Regional Qualifier Report",
                    )}
                    {reportLink("/reports/players", "Player Medal Report")}
                    {reportLink(
                      "/reports/player-events",
                      "Player Event Report",
                    )}
                  </div>
                </div>
              )}
              {profile ? (
                <button
                  type="button"
                  className="desktop-drawer-link desktop-signout"
                  onClick={() => void signOut()}
                >
                  <i className="bi bi-box-arrow-right" aria-hidden="true" />
                  <span>Sign out</span>
                  <i
                    className="bi bi-chevron-right drawer-chevron"
                    aria-hidden="true"
                  />
                </button>
              ) : (
                drawerLink("/login", "Sign in", "bi-box-arrow-in-right")
              )}
            </nav>
          </aside>
        </div>
      )}
      <main className="main-container">
        {session?.user && !profile && path !== "/login" && (
          <aside className="pending-top-banner" role="status">
            <div>
              <i className="bi bi-hourglass-split" aria-hidden="true" />
              <span>
                Account Connected: <strong>{session.user.email}</strong> — Coordinator registration awaiting administrator approval.
              </span>
            </div>
            <div className="pending-top-banner-actions">
              <button
                type="button"
                className="banner-check-btn"
                onClick={() => navigate("/login")}
              >
                View Status
              </button>
              <button
                type="button"
                className="banner-signout-btn"
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          </aside>
        )}
        {authNotice && (
          <div className="alert success" role="status">
            {authNotice}
          </div>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error} <button onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        <Suspense
          fallback={
            <div className="panel state-message" role="status">
              Loading…
            </div>
          }
        >
          {content}
        </Suspense>
      </main>
      <footer className="site-footer">
        © 2026 Anthony Riel C. Diango CpE, LPT
      </footer>
      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile navigation"
        ref={mobileNavRef}
      >
        {staff && (
          <div
            className="mobile-report-panel"
            id="mobileReportPanel"
            aria-label="Official reports"
            hidden={!reportOpen}
          >
            <div className="mobile-report-heading">Official Reports</div>
            {admin && reportLink("/reports/general", "General Official Report")}
            {admin &&
              reportLink("/reports/results", "All Events Results Report")}
            {admin && reportLink("/reports/pending", "Pending Events Report")}
            {reportLink("/reports/qualifiers", "Regional Qualifier Report")}
            {reportLink("/reports/players", "Player Medal Report")}
            {reportLink("/reports/player-events", "Player Event Report")}
          </div>
        )}
        <div className="mobile-nav-container">
          {mobileLink("/", "Home", "bi-house-door-fill")}
          {mobileLink("/rankings", "Rankings", "bi-trophy-fill")}
          {mobileLink(
            "/events",
            "Events",
            "bi-calendar-event-fill",
            path === "/events" ||
              path.startsWith("/scoring") ||
              path.startsWith("/delegation"),
          )}
          {mobileLink(
            "/teams",
            "Teams",
            "bi-people-fill",
            path.startsWith("/teams"),
          )}
          {admin &&
            mobileLink(
              "/manage/coordinators",
              "Coordinators",
              "bi-person-badge-fill",
            )}
          {admin &&
            mobileLink(
              "/manage",
              "Manage",
              "bi-sliders",
              path === "/manage" || path === "/manage/assignments",
            )}
          {staff && (
            <button
              type="button"
              className={
                path.startsWith("/reports")
                  ? "mobile-nav-item active"
                  : "mobile-nav-item"
              }
              aria-expanded={reportOpen}
              aria-controls="mobileReportPanel"
              onClick={() => setReportOpen((open) => !open)}
            >
              <i
                className="bi bi-file-earmark-bar-graph-fill"
                aria-hidden="true"
              />
              <span>Report</span>
            </button>
          )}
          {profile ? (
            <button
              type="button"
              className="mobile-nav-item"
              onClick={() => void signOut()}
            >
              <i className="bi bi-box-arrow-right" aria-hidden="true" />
              <span>Logout</span>
            </button>
          ) : (
            mobileLink("/login", "Login", "bi-box-arrow-in-right")
          )}
        </div>
      </nav>
    </>
  );
}
