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
import { Discovery } from './components/Discovery';
import { Mission } from './components/Mission';
import { Architecture } from './components/Architecture';
import { Gallery } from './components/Gallery';
import { CtaStream } from './components/CtaStream';
import { Footer } from './components/Footer';
import { MemberPortal } from './components/MemberPortal';
import { WheelOfFortune } from './components/WheelOfFortune';
import { MinesGame } from './components/MinesGame';
import { VipSubscriptions } from './components/VipSubscriptions';
import { AdminConsole } from './components/AdminConsole';
import { NotFound } from './components/NotFound';

/**
 * Root Layout Component
 * Renders Navbar on all views except the full-screen member portal and staff consoles
 */
function RootComponent() {
  const location = useLocation();
  const hideNavbar = location.pathname === '/admin' || location.pathname === '/dev';

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
    >
      <Hero />
      <Discovery />
      <Mission />
      <Architecture />
      <Gallery />
      <CtaStream view404={false} />
      <Footer />
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
      <Footer />
    </motion.div>
  );
}

/**
 * Mines Game Route Component (/mines and /jeux)
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

const minesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/mines',
  component: MinesPage,
});

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jeux',
  component: MinesPage,
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
  minesRoute,
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
