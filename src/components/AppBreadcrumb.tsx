import { useLocation, Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const routeNames: Record<string, string> = {
  '/': 'Dashboard',
  '/agent': 'AI Agent',
  '/suppliers': 'Supplier Directory',
  '/catalog': 'Procurement Catalog',
  '/requisitions': 'Purchase Requisitions',
  '/rfqs': 'RFQs & Bids',
  '/vendors': 'Vendor Portal',
  '/workflows': 'Workflows',
  '/knowledge-base': 'Knowledge Base',
  '/settings': 'Settings',
};

export function AppBreadcrumb() {
  const location = useLocation();
  // Routes are mounted under /app/*, so strip that prefix for lookups
  const pathname = location.pathname.replace(/^\/app/, '') || '/';

  const isTracker = pathname.startsWith('/tracker/');
  
  if (pathname === '/') {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink render={<Link to="/app" />}>
            Dashboard
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          {isTracker ? (
            <BreadcrumbPage>Request Tracker</BreadcrumbPage>
          ) : (
            <BreadcrumbPage>{routeNames[pathname] || 'Page'}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
