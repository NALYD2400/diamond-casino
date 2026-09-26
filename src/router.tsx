import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useLocation,
} from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Footer } from './components/Footer';
import { MemberPortal } from './components/MemberPortal';
import { WheelOfFortune } from './components/WheelOfFortune';
import { MinesGame } from './components/MinesGame';
import { DogHouseGame } from './components/doghouse/DogHouseGame';
import { WantedGame } from './components/wanted/WantedGame';
import { GamesHub } from './components/GamesHub';
import { VipSubscriptions } from './components/VipSubscriptions';
import { AdminConsole } from './components/AdminConsole';
import { NotFound } from './components/NotFound';

import { useCasinoUser } from './context/CasinoUserContext';

/**
 * Root Layout Component
 * Renders Navbar on all views except the standalone login view and staff consoles
 */
function RootComponent() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useCasinoUser();

  const isLoginPage = location.pathname === '/espace-membre' && (!isAuthenticated || isLoading);
  const hideNavbar = isLoginPage || location.pathname === '/admin' || location.pathname === '/dev';

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans">
      {!hideNavbar && <Navbar />}
      <Outlet />
    </div>
  );
}

/**
 * Landing Page Route Component (/)
 */
function LandingPage() {
  return (
    <motion.div
      key="landing-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="h-[100svh] overflow-hidden"
    >
      <Hero />
    </motion.div>
  );
}

/**
 * Member Portal Route Component (/espace-membre)
 */
function MemberPortalPage() {
  return (
    <motion.div
      key="member-portal-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <MemberPortal />
    </motion.div>
  );
}

/**
 * Fortune Wheel Route Component (/roue-de-la-fortune)
 */
function LuckyWheelPage() {
  return (
    <motion.div
      key="lucky-wheel-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <WheelOfFortune />
    </motion.div>
  );
}

/**
 * Mines Game Route Component (/mines)
 */
function MinesPage() {
  return (
    <motion.div
      key="mines-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <MinesGame />
    </motion.div>
  );
}

/**
 * Slots Casino Machine Route Component (/slots)
 */
function SlotsPage() {
  return (
    <motion.div
      key="slots-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <DogHouseGame />
    </motion.div>
  );
}

/**
 * Wanted Dead or a Wild Slot Route Component (/wanted)
 */
function WantedPage() {
  return (
    <motion.div
      key="wanted-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <WantedGame />
    </motion.div>
  );
}

/**
 * Games Catalog / Hub Route Component (/jeux)
 */
function GamesCatalogPage() {
  return (
    <motion.div
      key="games-catalog-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <GamesHub />
      <Footer />
    </motion.div>
  );
}

/**
 * VIP Subscriptions Route Component (/abonnements)
 */
function SubscriptionsPage() {
  return (
    <motion.div
      key="subscriptions-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <VipSubscriptions />
    </motion.div>
  );
}

/**
 * Admin Console Route Component (/admin)
 */
function AdminRoutePage() {
  return (
    <motion.div
      key="admin-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <AdminConsole />
    </motion.div>
  );
}

/**
 * Developer Console Route Component (/dev) — staff console opened on its Dev tab
 */
function DeveloperRoutePage() {
  return (
    <motion.div
      key="dev-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <AdminConsole initialTab="dev" />
    </motion.div>
  );
}

/**
 * 404 Route Component (/404)
 */
function NotFoundPage() {
  return <NotFound />;
}

// 1. Root route definition
const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
});

// 2. Child routes
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
});

const memberPortalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/espace-membre',
  component: MemberPortalPage,
});

const luckyWheelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roue-de-la-fortune',
  component: LuckyWheelPage,
});

const boostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boost',
  component: LuckyWheelPage,
});

const minesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mines',
  component: MinesPage,
});

const slotsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/slots',
  component: SlotsPage,
});

const wantedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wanted',
  component: WantedPage,
});

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jeux',
  component: GamesCatalogPage,
});

const subscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/abonnements',
  component: SubscriptionsPage,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminRoutePage,
});

const devRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dev',
  component: DeveloperRoutePage,
});

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/404',
  component: NotFoundPage,
});

// 3. Assemble route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  memberPortalRoute,
  luckyWheelRoute,
  boostRoute,
  minesRoute,
  slotsRoute,
  wantedRoute,
  gamesRoute,
  subscriptionsRoute,
  adminRoute,
  devRoute,
  notFoundRoute,
]);

// 4. Create TanStack router instance
export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundPage,
});

// 5. Register router type for strict type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
